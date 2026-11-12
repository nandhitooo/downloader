import type { Context } from "hono";
import { allCdnHosts } from "./adapters";
import { isHostAllowed } from "./detect";
import type { Env } from "./env";
import { MediaError } from "./errors";
import { contentDisposition } from "./filename";
import { verifyToken } from "./sign";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Some CDNs reject requests without a matching Referer. */
const REFERER_BY_CDN: ReadonlyArray<readonly [string, string]> = [
  ["tiktokcdn.com", "https://www.tiktok.com/"],
  ["tiktokcdn-us.com", "https://www.tiktok.com/"],
  ["tiktokv.com", "https://www.tiktok.com/"],
  ["cdninstagram.com", "https://www.instagram.com/"],
  ["fbcdn.net", "https://www.facebook.com/"],
  ["twimg.com", "https://x.com/"],
];

function refererFor(hostname: string): string | undefined {
  return REFERER_BY_CDN.find(([domain]) =>
    isHostAllowed(hostname, [domain]),
  )?.[1];
}

function upstreamOrigin(rawUrl: string | undefined): string | undefined {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).origin;
  } catch {
    return undefined;
  }
}

/**
 * The signed target is allowed when it is HTTPS on an allowlisted CDN host, or
 * when its origin (scheme + host + port) exactly matches UPSTREAM_URL. The
 * origin exception exists because a self-hosted cobalt instance tunnels media
 * through itself (e.g. http://localhost:9000/tunnel?...).
 */
export function isDownloadTargetAllowed(
  target: URL,
  rawUpstreamUrl: string | undefined,
): boolean {
  const upstream = upstreamOrigin(rawUpstreamUrl);
  if (upstream !== undefined && target.origin === upstream) return true;

  if (target.protocol !== "https:") return false;
  return isHostAllowed(target.hostname, allCdnHosts());
}

/**
 * GET /api/download?token=...
 * The signed token replaces the Bearer header; the media is streamed through
 * without buffering and the target host is re-checked against the CDN
 * allowlist so the endpoint cannot act as an open proxy.
 */
export async function downloadRoute(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const token = c.req.query("token");
  if (!token) {
    throw new MediaError("UNAUTHORIZED", "Token unduhan tidak ada.");
  }

  const secret = c.env.SIGNING_SECRET?.trim();
  if (!secret) {
    throw new MediaError(
      "UPSTREAM_FAILED",
      "SIGNING_SECRET belum dikonfigurasi di Worker.",
    );
  }

  const payload = await verifyToken(token, secret);

  let target: URL;
  try {
    target = new URL(payload.u);
  } catch {
    throw new MediaError("UNAUTHORIZED", "Token unduhan tidak valid.");
  }

  if (!isDownloadTargetAllowed(target, c.env.UPSTREAM_URL)) {
    throw new MediaError(
      "UNSUPPORTED",
      "Host media tidak ada di allowlist unduhan.",
    );
  }

  const headers = new Headers({
    "User-Agent": USER_AGENT,
    Accept: "*/*",
  });

  // `inline=1` serves the same signed file for the in-page <video>/<img>
  // preview instead of forcing a save.
  const inline = c.req.query("inline") === "1";

  const range = c.req.header("Range");
  if (range) headers.set("Range", range);

  const referer = refererFor(target.hostname);
  if (referer) headers.set("Referer", referer);

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers });
  } catch {
    throw new MediaError("UPSTREAM_FAILED", "Gagal mengambil media.");
  }

  if (!upstream.ok) {
    if (upstream.status === 416) {
      return new Response(null, { status: 416 });
    }
    throw new MediaError(
      upstream.status === 429 ? "RATE_LIMITED" : "UPSTREAM_FAILED",
      `Sumber media menolak permintaan (${upstream.status}).`,
    );
  }

  const responseHeaders = new Headers({
    "Content-Type":
      upstream.headers.get("content-type") ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(
      payload.fn,
      inline ? "inline" : "attachment",
    ),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });

  for (const header of [
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ]) {
    const value = upstream.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  // Stream straight through: no buffering in Worker memory.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
