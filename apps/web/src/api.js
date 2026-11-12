import { ResolveRequestSchema } from '@app/shared'

const TOKEN_KEY = 'downloader.token'

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function storeToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // localStorage can be unavailable (private mode); the session still works.
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore.
  }
}

export async function resolveUrl(url, token, quality) {
  const parsed = ResolveRequestSchema.safeParse(
    quality ? { url, quality } : { url },
  )
  if (!parsed.success) {
    throw new ApiError(
      'INVALID_URL',
      'Tautan tidak valid. Pastikan diawali dengan https://',
    )
  }

  let response
  try {
    response = await fetch('/api/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(parsed.data),
    })
  } catch {
    throw new ApiError(
      'UPSTREAM_FAILED',
      'Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.',
    )
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = payload?.error
    throw new ApiError(
      error?.code ?? 'UPSTREAM_FAILED',
      error?.message ?? `Server menolak permintaan (${response.status}).`,
      response.status,
    )
  }

  return payload
}
