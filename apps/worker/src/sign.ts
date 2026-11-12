import { MediaError } from "./errors";

export interface DownloadTokenPayload {
  /** Target media URL. */
  u: string;
  /** Download filename. */
  fn: string;
  /** Expiry as unix seconds. */
  exp: number;
}

export const DOWNLOAD_TOKEN_TTL_SECONDS = 15 * 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Constant-time comparison that also hides length by hashing both inputs. */
export async function timingSafeEqualStrings(
  a: string,
  b: string,
): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);

  return timingSafeEqualBytes(
    new Uint8Array(digestA),
    new Uint8Array(digestB),
  );
}

export async function signToken(
  payload: DownloadTokenPayload,
  secret: string,
): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );

  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Verifies signature + expiry and returns the payload, or throws UNAUTHORIZED. */
export async function verifyToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<DownloadTokenPayload> {
  const parts = token.split(".");
  const [body, signature] = parts;

  if (parts.length !== 2 || !body || !signature) {
    throw new MediaError("UNAUTHORIZED", "Token unduhan tidak valid.");
  }

  const provided = fromBase64Url(signature);
  const key = await importHmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body)),
  );

  if (!provided || !timingSafeEqualBytes(expected, provided)) {
    throw new MediaError("UNAUTHORIZED", "Token unduhan tidak valid.");
  }

  const payloadBytes = fromBase64Url(body);
  if (!payloadBytes) {
    throw new MediaError("UNAUTHORIZED", "Token unduhan tidak valid.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    throw new MediaError("UNAUTHORIZED", "Token unduhan tidak valid.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new MediaError("UNAUTHORIZED", "Token unduhan tidak valid.");
  }

  const { u, fn, exp } = parsed as Record<string, unknown>;
  if (
    typeof u !== "string" ||
    typeof fn !== "string" ||
    u.length === 0 ||
    fn.length === 0 ||
    typeof exp !== "number" ||
    !Number.isFinite(exp)
  ) {
    throw new MediaError("UNAUTHORIZED", "Token unduhan tidak valid.");
  }

  if (exp <= nowSeconds) {
    throw new MediaError("UNAUTHORIZED", "Tautan unduhan sudah kedaluwarsa.");
  }

  return { u, fn, exp };
}
