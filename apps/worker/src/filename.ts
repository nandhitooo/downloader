const MAX_LENGTH = 120;
const FALLBACK_NAME = "unduhan";

/** Strips path separators, control characters and other unsafe filename input. */
export function sanitizeFilename(input: string): string {
  const cleaned = input
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+/, "");

  const trimmed = cleaned.slice(0, MAX_LENGTH).trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_NAME;
}

/** Best-effort extension from a media URL path, without inventing one. */
export function extensionFromUrl(rawUrl: string, fallback = "bin"): string {
  try {
    const path = new URL(rawUrl).pathname;
    const match = /\.([a-z0-9]{2,5})$/i.exec(path);
    return match?.[1] ? match[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

/** Ensures the filename carries the media extension (unless it already has one). */
export function ensureExtension(filename: string, extension: string): string {
  const safe = sanitizeFilename(filename);
  const ext = extension.replace(/^\./, "").toLowerCase();

  if (!ext) return safe;
  if (safe.toLowerCase().endsWith(`.${ext}`)) return safe;
  if (/\.[a-z0-9]{2,5}$/i.test(safe)) return safe;
  return `${safe}.${ext}`;
}

/** RFC 6266 attachment header with an ASCII fallback plus UTF-8 filename*. */
export function contentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
