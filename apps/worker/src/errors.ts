import type { ApiErrorCode, ApiErrorResponse } from "@app/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  INVALID_URL: "URL tidak valid. Tempel tautan https ke post publik.",
  UNSUPPORTED: "Platform atau tautan ini belum didukung.",
  PRIVATE_CONTENT: "Konten ini privat atau memerlukan login.",
  UPSTREAM_FAILED: "Layanan pengambil media gagal merespons. Coba lagi nanti.",
  RATE_LIMITED: "Terlalu banyak permintaan. Coba lagi beberapa menit lagi.",
  UNAUTHORIZED: "Token akses tidak valid atau tidak dikirim.",
};

const STATUS_BY_CODE: Record<ApiErrorCode, ContentfulStatusCode> = {
  INVALID_URL: 400,
  UNSUPPORTED: 422,
  PRIVATE_CONTENT: 403,
  UPSTREAM_FAILED: 502,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
};

/** Error that is safe to expose to the client as `{ error: { code, message } }`. */
export class MediaError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "MediaError";
    this.code = code;
  }
}

export function statusFor(code: ApiErrorCode): ContentfulStatusCode {
  return STATUS_BY_CODE[code];
}

export function toErrorResponse(
  code: ApiErrorCode,
  message?: string,
): ApiErrorResponse {
  return { error: { code, message: message ?? DEFAULT_MESSAGES[code] } };
}
