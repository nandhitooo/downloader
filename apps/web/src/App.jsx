import { useState } from 'react'
import {
  ApiError,
  clearStoredToken,
  getStoredToken,
  resolveUrl,
  storeToken,
} from './api'
import './App.css'

const PLATFORM_LABELS = {
  tiktok: 'TikTok',
  x: 'X / Twitter',
  instagram: 'Instagram',
  facebook: 'Facebook',
  threads: 'Threads',
}

const TYPE_LABELS = {
  video: 'Video',
  audio: 'Audio',
  image: 'Gambar',
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = String(total % 60).padStart(2, '0')
  return `${minutes}:${rest}`
}

function formatSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return null
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function TokenGate({ notice, onSubmit }) {
  const [value, setValue] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const token = value.trim()
    if (token) onSubmit(token)
  }

  return (
    <form className="gate" onSubmit={handleSubmit}>
      <h1 className="app__title">Pengunduh Media Sosial</h1>
      <p className="app__subtitle">
        Masukkan token akses pribadi untuk mulai mengunduh.
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

      <button className="button button--primary" type="submit">
        Simpan dan lanjut
      </button>
    </form>
  )
}

function ResultCard({ result }) {
  const duration = formatDuration(result.duration)

  return (
    <article className="card" aria-label="Hasil pengambilan media">
      {result.thumbnail ? (
        <img
          className="card__thumb"
          src={result.thumbnail}
          alt=""
          loading="lazy"
        />
      ) : null}

      <div className="card__body">
        <p className="card__platform">
          {PLATFORM_LABELS[result.platform] ?? result.platform}
        </p>
        {result.title ? <h2 className="card__title">{result.title}</h2> : null}
        {result.author ? (
          <p className="card__meta">Oleh {result.author}</p>
        ) : null}
        {duration ? <p className="card__meta">Durasi {duration}</p> : null}

        <ul className="downloads">
          {result.items.map((item, index) => {
            const details = [
              item.quality,
              item.ext ? item.ext.toUpperCase() : null,
              formatSize(item.size),
            ].filter(Boolean)

            const label = `${TYPE_LABELS[item.type] ?? item.type}${
              details.length > 0 ? ` ${details.join(', ')}` : ''
            }`

            return (
              <li key={`${item.downloadUrl}-${index}`}>
                <a
                  className="downloads__button"
                  href={item.downloadUrl}
                  download
                  aria-label={`Unduh ${label}`}
                >
                  <span className="downloads__type">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                  <span className="downloads__details">
                    {details.length > 0 ? details.join(' · ') : 'Unduh'}
                  </span>
                  <span className="downloads__icon" aria-hidden="true">
                    ↓
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </article>
  )
}

function MainScreen({ token, onUnauthorized }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [pasteMessage, setPasteMessage] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = url.trim()

    if (!trimmed) {
      setResult(null)
      setError('Tempel tautan post publik terlebih dahulu.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setError(null)
    setPasteMessage(null)

    try {
      const data = await resolveUrl(trimmed, token)
      setResult(data)
      setStatus('done')
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'UNAUTHORIZED') {
        onUnauthorized()
        return
      }
      setResult(null)
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Terjadi kesalahan tak terduga. Coba lagi.',
      )
      setStatus('error')
    }
  }

  async function handlePaste() {
    setPasteMessage(null)
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) {
        setUrl(text.trim())
      } else {
        setPasteMessage('Clipboard kosong.')
      }
    } catch {
      setPasteMessage('Tidak bisa membaca clipboard. Tempel manual saja.')
    }
  }

  const isLoading = status === 'loading'

  return (
    <div className="main">
      <h1 className="app__title">Pengunduh Media Sosial</h1>
      <p className="app__subtitle">
        Tempel tautan post publik dari TikTok, X, Instagram, Facebook, atau
        Threads.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Tautan post</span>
          <input
            className="field__input"
            type="url"
            name="url"
            inputMode="url"
            autoComplete="off"
            spellCheck="false"
            placeholder="https://www.tiktok.com/@akun/video/..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
        </label>

        <div className="form__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={handlePaste}
          >
            Tempel
          </button>
          <button
            className="button button--primary"
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Mengunduh…' : 'Unduh'}
          </button>
        </div>
        {pasteMessage ? (
          <p className="hint" role="status">
            {pasteMessage}
          </p>
        ) : null}
      </form>

      <div className="status" role="status" aria-live="polite">
        {isLoading ? <p className="hint">Mengambil media, mohon tunggu…</p> : null}
      </div>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      {result ? <ResultCard result={result} /> : null}

      {status === 'idle' ? (
        <p className="hint hint--empty">
          Hanya konten publik. Video dan foto privat atau perlu login tidak
          didukung.
        </p>
      ) : null}
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState(() => getStoredToken())
  const [gateNotice, setGateNotice] = useState(null)

  function handleTokenSubmit(value) {
    storeToken(value)
    setToken(value)
    setGateNotice(null)
  }

  function handleUnauthorized() {
    clearStoredToken()
    setToken('')
    setGateNotice('Token ditolak atau sudah berubah. Masukkan token lagi.')
  }

  return (
    <div className="app">
      {token ? (
        <MainScreen token={token} onUnauthorized={handleUnauthorized} />
      ) : (
        <TokenGate notice={gateNotice} onSubmit={handleTokenSubmit} />
      )}
    </div>
  )
}
