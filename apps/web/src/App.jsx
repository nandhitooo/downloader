import { useEffect, useRef, useState } from "react";
import { VIDEO_QUALITIES } from "@app/shared";
import {
  ApiError,
  clearStoredToken,
  getStoredToken,
  resolveUrl,
  storeToken,
} from "./api";
import "./App.css";

const PLATFORMS = [
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { id: "x", label: "X", hosts: ["x.com", "twitter.com"] },
  { id: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.watch"] },
  { id: "threads", label: "Threads", hosts: ["threads.net", "threads.com"] },
];

const QUALITY_HINTS = {
  240: "Hemat kuota",
  360: "Ringan",
  480: "Standar",
  720: "HD",
  1080: "Full HD",
};

const DEFAULT_QUALITY = "1080";
const QUALITIES_DESC = [...VIDEO_QUALITIES].reverse();
const AUTO_LOAD_DELAY_MS = 600;

function platformLabel(id) {
  return PLATFORMS.find((entry) => entry.id === id)?.label ?? id;
}

function detectPlatform(text) {
  try {
    const host = new URL(text).hostname.toLowerCase();
    return (
      PLATFORMS.find((entry) =>
        entry.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
      )?.id ?? null
    );
  } catch {
    return null;
  }
}

function isValidUrl(text) {
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function filenameFromDisposition(header) {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // fall through to the plain filename
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
}

/**
 * Downloads through fetch so a JSON error from the server is shown as a message
 * instead of being saved as "download.json". Returns an error string or null.
 */
async function saveFile(item) {
  let response;
  try {
    response = await fetch(item.downloadUrl);
  } catch {
    return "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.";
  }

  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || type.includes("json")) {
    try {
      const error = (await response.json())?.error;
      if (error?.message) return `${error.code ?? "ERROR"}: ${error.message}`;
    } catch {
      // not JSON; use the generic message below
    }
    return `Server menolak unduhan (HTTP ${response.status}).`;
  }

  let blob;
  try {
    blob = await response.blob();
  } catch {
    return "Unduhan terputus sebelum selesai. Coba lagi.";
  }

  const name =
    filenameFromDisposition(response.headers.get("content-disposition")) ??
    `unduhan.${item.ext || "bin"}`;
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return null;
}

function formatDuration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatSize(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function explainMediaError(url) {
  const controller = new AbortController();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json")) {
      const payload = await response.json();
      const error = payload?.error;
      if (error?.message) {
        return `${error.code ?? "ERROR"}: ${error.message}`;
      }
    }
    return `Browser gagal memutar media ini (HTTP ${response.status}, ${type || "tipe tidak diketahui"}).`;
  } catch {
    return "Tidak bisa menghubungi server untuk memuat pratinjau.";
  } finally {
    controller.abort(); // never pull the whole file just to read headers
  }
}

/* ---------- icons ---------- */

function Icon({ children }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ClipboardIcon = () => (
  <Icon>
    <rect x="8" y="3" width="8" height="4" rx="1" />
    <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
  </Icon>
);

const CloseIcon = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

const DownloadIcon = () => (
  <Icon>
    <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
  </Icon>
);

const MusicIcon = () => (
  <Icon>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Icon>
);

/* ---------- token gate ---------- */

function TokenGate({ notice, onSubmit }) {
  const [value, setValue] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const token = value.trim();
    if (token) onSubmit(token);
  }

  return (
    <form className="gate" onSubmit={handleSubmit}>
      <h1 className="brand brand--large">Pengunduh Media Sosial</h1>
      <p className="gate__text">
        Masukkan token akses pribadi. Token disimpan di browser ini saja.
      </p>

      {notice ? (
        <p className="alert" role="alert">
          {notice}
        </p>
      ) : null}

      <label className="field">
        <span className="field__label">Token akses</span>
        <input
          className="field__input"
          type="password"
          name="token"
          autoComplete="current-password"
          placeholder="Tempel token di sini"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
        />
      </label>

      <button className="btn btn--primary" type="submit">
        Simpan token
      </button>
    </form>
  );
}

/* ---------- result ---------- */

function Preview({ result, busy, onSave }) {
  const videos = result.items.filter((item) => item.type === "video");
  const images = result.items.filter((item) => item.type === "image");
  const previewVideo = videos[0];
  const previewUrl = (item) => `${item.downloadUrl}&inline=1`;
  const [previewError, setPreviewError] = useState(null);

  async function handlePreviewError(item) {
    setPreviewError(await explainMediaError(previewUrl(item)));
  }

  let media = null;
  if (previewVideo) {
    media = (
      <video
        key={previewUrl(previewVideo)}
        className="media media--video"
        src={previewUrl(previewVideo)}
        poster={result.thumbnail}
        controls
        playsInline
        preload="metadata"
        onError={() => void handlePreviewError(previewVideo)}
      >
        Browser ini tidak bisa memutar video. Gunakan tombol Unduh.
      </video>
    );
  } else if (images.length === 1) {
    media = (
      <img
        key={previewUrl(images[0])}
        className="media media--image"
        src={previewUrl(images[0])}
        alt={result.title ? `Pratinjau: ${result.title}` : "Pratinjau foto"}
        onError={() => void handlePreviewError(images[0])}
      />
    );
  } else if (images.length > 1) {
    media = (
      <div className="gallery" role="list">
        {images.map((item, index) => (
          <button
            key={`${item.downloadUrl}-${index}`}
            type="button"
            className="gallery__item"
            onClick={() => void onSave(item)}
            role="listitem"
            aria-label={`Unduh foto ${index + 1}`}
          >
            <img
              className="gallery__img"
              src={previewUrl(item)}
              alt={`Foto ${index + 1}`}
              loading="lazy"
            />
            <span className="gallery__badge">
              <DownloadIcon />
              {index + 1}
            </span>
          </button>
        ))}
      </div>
    );
  } else if (result.thumbnail) {
    media = (
      <img className="media media--image" src={result.thumbnail} alt="" />
    );
  }

  return (
    <div className={`preview${busy ? " is-busy" : ""}`}>
      {media}
      {previewError ? (
        <p className="alert" role="alert">
          Pratinjau gagal. {previewError}
        </p>
      ) : null}
    </div>
  );
}

function QualityDownloads({ rows, onPick, disabled }) {
  return (
    <div className="qdl">
      <p className="qdl__title">Unduh video MP4</p>
      <ul className="qdl__list">
        {QUALITIES_DESC.map((value) => {
          const row = rows[value] ?? { status: "idle" };
          const loading = row.status === "loading" || row.status === "saving";
          const size = formatSize(row.item?.size);

          return (
            <li key={value}>
              <button
                className="qrow"
                type="button"
                onClick={() => onPick(value)}
                disabled={disabled || loading}
                aria-busy={loading}
                aria-label={`Unduh video ${value}p`}
              >
                <span className="qrow__quality">{value}p</span>
                <span className="qrow__hint">{QUALITY_HINTS[value]}</span>
                {size ? <span className="qrow__size">{size}</span> : null}
                <span className="qrow__state">
                  {row.status === "loading" ? (
                    "Menyiapkan…"
                  ) : row.status === "saving" ? (
                    "Mengunduh…"
                  ) : (
                    <DownloadIcon />
                  )}
                </span>
              </button>
              {row.status === "error" ? (
                <p className="qrow__error" role="alert">
                  {row.message}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Panel({
  result,
  rows,
  onPickQuality,
  audio,
  onDownload,
  onDownloadAudio,
  onSaveAudio,
  onSave,
  busy,
}) {
  const videos = result.items.filter((item) => item.type === "video");
  const images = result.items.filter((item) => item.type === "image");
  const imagesOnly = images.length > 0 && videos.length === 0;

  const facts = [
    ["Durasi", formatDuration(result.duration)],
    [
      "Jumlah foto",
      imagesOnly && images.length > 1 ? String(images.length) : null,
    ],
  ].filter(([, value]) => value);

  const downloadLabel =
    images.length > 1 ? `Unduh ${images.length} foto` : "Unduh foto";

  const showAudio = result.platform !== "x" && videos.length > 0;

  return (
    <div className={`panel${busy ? " is-busy" : ""}`}>
      <div className="meta">
        <p className="meta__platform">{platformLabel(result.platform)}</p>
        <h2 className="meta__title">{result.title || "Tanpa judul"}</h2>
        {result.author ? (
          <p className="meta__author">Oleh {result.author}</p>
        ) : null}
      </div>

      {facts.length > 0 ? (
        <dl className="facts">
          {facts.map(([label, value]) => (
            <div className="facts__row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {videos.length > 0 ? (
        <QualityDownloads rows={rows} onPick={onPickQuality} disabled={busy} />
      ) : null}

      <div className={`actions${imagesOnly ? " actions--sticky" : ""}`}>
        {imagesOnly ? (
          <button
            className="btn btn--primary"
            type="button"
            onClick={onDownload}
            disabled={busy}
          >
            <DownloadIcon />
            {busy ? "Memperbarui…" : downloadLabel}
          </button>
        ) : null}

        {showAudio ? (
          audio.status === "ready" || audio.status === "saving" ? (
            <button
              className="btn btn--quiet"
              type="button"
              onClick={onSaveAudio}
              disabled={audio.status === "saving"}
            >
              <MusicIcon />
              {audio.status === "saving"
                ? "Mengunduh audio…"
                : "Unduh audio MP3"}
            </button>
          ) : (
            <button
              className="btn btn--quiet"
              type="button"
              onClick={onDownloadAudio}
              disabled={audio.status === "loading"}
              aria-busy={audio.status === "loading"}
            >
              <MusicIcon />
              {audio.status === "loading"
                ? "Menyiapkan audio…"
                : "Siapkan audio MP3"}
            </button>
          )
        ) : null}
      </div>

      {audio.status === "error" ? (
        <p className="alert" role="alert">
          {audio.message}
        </p>
      ) : null}

      {videos.length > 1 ? (
        <ul className="files">
          {videos.map((item, index) => (
            <li key={`${item.downloadUrl}-${index}`}>
              <button
                className="files__link"
                type="button"
                onClick={() => void onSave(item)}
              >
                Berkas video {index + 1}
                {item.ext ? ` (${item.ext.toUpperCase()})` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="stage__grid" aria-hidden="true">
      <div className="preview">
        <div className="skeleton skeleton--media" />
      </div>
      <div className="panel">
        <div className="skeleton skeleton--line skeleton--short" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line skeleton--mid" />
        <div className="skeleton skeleton--block" />
      </div>
    </div>
  );
}

/* ---------- main screen ---------- */

function MainScreen({ token, onUnauthorized }) {
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState({});
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [audio, setAudio] = useState({ status: "idle" });
  const [error, setError] = useState(null);
  const [pasteMessage, setPasteMessage] = useState(null);

  const timerRef = useRef(null);
  const requestRef = useRef(0);
  const loadedKeyRef = useRef("");
  const inputRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function load(targetUrl) {
    clearTimeout(timerRef.current);
    const requestId = ++requestRef.current;
    loadedKeyRef.current = targetUrl;

    setStatus("loading");
    setError(null);
    setPasteMessage(null);
    setAudio({ status: "idle" });
    setRows({});

    try {
      const data = await resolveUrl(targetUrl, token, DEFAULT_QUALITY);
      if (requestId !== requestRef.current) return;
      const video = data.items.find((item) => item.type === "video");
      // The preview file is the default quality: its row can download at once.
      if (video) {
        setRows({ [DEFAULT_QUALITY]: { status: "ready", item: video } });
      }
      setResult(data);
      setStatus("done");
    } catch (caught) {
      if (requestId !== requestRef.current) return;
      if (caught instanceof ApiError && caught.code === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      loadedKeyRef.current = "";
      setResult(null);
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Terjadi kesalahan tak terduga. Coba lagi.",
      );
      setStatus("error");
    }
  }

  function scheduleLoad(value, delay) {
    clearTimeout(timerRef.current);
    const trimmed = value.trim();
    if (!isValidUrl(trimmed)) return;
    if (loadedKeyRef.current === trimmed) return;
    timerRef.current = setTimeout(() => void load(trimmed), delay);
  }

  function resetForNewUrl() {
    requestRef.current += 1;
    loadedKeyRef.current = "";
    setResult(null);
    setError(null);
    setAudio({ status: "idle" });
    setRows({});
    setStatus("idle");
  }

  function handleUrlChange(event) {
    const next = event.target.value;
    setUrl(next);
    setPasteMessage(null);
    resetForNewUrl();
    scheduleLoad(next, AUTO_LOAD_DELAY_MS);
  }

  function handleInputPaste(event) {
    const text = event.clipboardData?.getData("text")?.trim();
    if (text && isValidUrl(text)) {
      event.preventDefault();
      setUrl(text);
      resetForNewUrl();
      scheduleLoad(text, 0);
    }
  }

  async function handlePasteButton() {
    setPasteMessage(null);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setPasteMessage("Clipboard kosong. Salin tautan post dulu.");
        return;
      }
      setUrl(text);
      resetForNewUrl();
      scheduleLoad(text, 0);
    } catch {
      setPasteMessage(
        "Browser tidak mengizinkan membaca clipboard. Tempel manual dengan Ctrl+V.",
      );
      inputRef.current?.focus();
    }
  }

  function handleClear() {
    clearTimeout(timerRef.current);
    setUrl("");
    setPasteMessage(null);
    resetForNewUrl();
    inputRef.current?.focus();
  }

  async function saveItem(item) {
    setError(null);
    const message = await saveFile(item);
    if (message) setError(message);
  }

  async function handlePickQuality(value) {
    const requestId = requestRef.current;
    const fail = (message) =>
      setRows((current) => ({
        ...current,
        [value]: { status: "error", message },
      }));

    setRows((current) => ({ ...current, [value]: { status: "loading" } }));

    try {
      // Always resolve again: the upstream's media links are short-lived, so a
      // link from the preview (or an older click) may already be dead.
      const data = await resolveUrl(url.trim(), token, value);
      if (requestId !== requestRef.current) return;
      const item =
        data.items.find((entry) => entry.type === "video") ?? data.items[0];

      setRows((current) => ({
        ...current,
        [value]: { status: "saving", item },
      }));
      const message = await saveFile(item);
      if (requestId !== requestRef.current) return;

      if (message) {
        fail(message);
      } else {
        setRows((current) => ({
          ...current,
          [value]: { status: "ready", item },
        }));
      }
    } catch (caught) {
      if (requestId !== requestRef.current) return;
      if (caught instanceof ApiError && caught.code === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      fail(
        caught instanceof ApiError
          ? caught.message
          : `Gagal menyiapkan video ${value}p. Coba lagi.`,
      );
    }
  }

  async function handleDownloadAudio() {
    if (!result || !url.trim()) return;

    setAudio({ status: "loading" });
    try {
      const data = await resolveUrl(url.trim(), token, DEFAULT_QUALITY, true);
      const item =
        data.items.find((entry) => entry.type === "audio") ?? data.items[0];
      setAudio({ status: "ready", item });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      setAudio({
        status: "error",
        message:
          caught instanceof ApiError
            ? caught.message
            : "Gagal menyiapkan audio. Coba lagi.",
      });
    }
  }

  async function handleSaveAudio() {
    if (audio.status !== "ready") return;
    const item = audio.item;
    setAudio({ status: "saving", item });
    const message = await saveFile(item);
    setAudio(
      message ? { status: "error", message } : { status: "ready", item },
    );
  }

  async function handleDownload() {
    if (!result) return;
    const images = result.items.filter((item) => item.type === "image");
    const files = images.length > 0 ? images : result.items.slice(0, 1);
    setError(null);
    for (const item of files) {
      const message = await saveFile(item);
      if (message) {
        setError(message);
        return;
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) {
      setResult(null);
      setError("Tempel tautan post publik terlebih dahulu.");
      setStatus("error");
      return;
    }

    await load(trimmed);
  }

  const isLoading = status === "loading";
  const detected = detectPlatform(url.trim());

  return (
    <div className="main">
      <header className="top">
        <h1 className="brand">Pengunduh Media Sosial</h1>
        <ul className="platforms" aria-label="Platform yang didukung">
          {PLATFORMS.map((entry) => (
            <li
              key={entry.id}
              className={`platforms__item${
                detected === entry.id ? " is-detected" : ""
              }`}
              aria-current={detected === entry.id ? "true" : undefined}
            >
              {entry.label}
            </li>
          ))}
        </ul>
      </header>

      <form className="slot" onSubmit={handleSubmit}>
        <label className="slot__label" htmlFor="post-url">
          Tautan post
        </label>
        <div className="slot__field">
          <input
            id="post-url"
            ref={inputRef}
            className="slot__input"
            type="url"
            name="url"
            inputMode="url"
            autoComplete="off"
            autoFocus
            spellCheck="false"
            placeholder="Tempel tautan post publik di sini"
            value={url}
            onChange={handleUrlChange}
            onPaste={handleInputPaste}
            required
          />
          {url ? (
            <button
              className="slot__action"
              type="button"
              onClick={handleClear}
              aria-label="Hapus tautan"
            >
              <CloseIcon />
            </button>
          ) : (
            <button
              className="slot__action slot__action--text"
              type="button"
              onClick={handlePasteButton}
            >
              <ClipboardIcon />
              Tempel
            </button>
          )}
        </div>
        {pasteMessage ? (
          <p className="slot__note" role="status">
            {pasteMessage}
          </p>
        ) : null}
      </form>

      <div className="sr-only" role="status" aria-live="polite">
        {isLoading ? "Mengambil pratinjau" : ""}
      </div>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      <section className="stage" aria-label="Pratinjau">
        {result ? (
          <div className="stage__grid">
            <Preview
              key={result.items[0]?.downloadUrl}
              result={result}
              busy={isLoading}
              onSave={saveItem}
            />
            <Panel
              result={result}
              rows={rows}
              onPickQuality={handlePickQuality}
              audio={audio}
              onDownload={handleDownload}
              onDownloadAudio={handleDownloadAudio}
              onSaveAudio={handleSaveAudio}
              onSave={saveItem}
              busy={isLoading}
            />
          </div>
        ) : isLoading ? (
          <Skeleton />
        ) : !error && !url ? (
          <div className="empty">
            <p className="empty__title">Belum ada tautan</p>
            <p className="empty__text">
              Pratinjau dan pilihan kualitas muncul di sini setelah tautan
              ditempel. Post privat atau yang perlu login tidak didukung.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [gateNotice, setGateNotice] = useState(null);

  function handleTokenSubmit(value) {
    storeToken(value);
    setToken(value);
    setGateNotice(null);
  }

  function handleUnauthorized() {
    clearStoredToken();
    setToken("");
    setGateNotice("Token ditolak atau sudah berubah. Masukkan token lagi.");
  }

  return (
    <div className="app">
      {token ? (
        <MainScreen token={token} onUnauthorized={handleUnauthorized} />
      ) : (
        <TokenGate notice={gateNotice} onSubmit={handleTokenSubmit} />
      )}
    </div>
  );
}
