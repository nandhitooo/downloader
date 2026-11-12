import { Hono } from "hono";
import {
  ResolveRequestSchema,
  ResolveResponseSchema,
  type MediaItem,
  type ResolveResponse,
} from "@app/shared";
import { resolveMedia } from "./adapters";
import type { MediaResult, MediaSource } from "./adapters/types";
import { requireAccessToken } from "./auth";
import { detectPlatform } from "./detect";
import { downloadRoute } from "./download";
import type { Env } from "./env";
import { MediaError, statusFor, toErrorResponse } from "./errors";
import { ensureExtension, extensionFromUrl, sanitizeFilename } from "./filename";
import { DOWNLOAD_TOKEN_TTL_SECONDS, signToken } from "./sign";

const RESOLVE_CACHE_TTL_SECONDS = 10 * 60;
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

const app = new Hono<{ Bindings: Env }>();

app.onError((error, c) => {
  if (error instanceof MediaError) {
    return c.json(
      toErrorResponse(error.code, error.message),
      statusFor(error.code),
    );
  }

  console.error(
    "unhandled worker error:",
    error instanceof Error ? error.message : "unknown",
  );
  return c.json(
    toErrorResponse("UPSTREAM_FAILED", "Terjadi kesalahan internal."),
    500,
  );
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json(
      toErrorResponse("UNSUPPORTED", "Rute API tidak ditemukan."),
      404,
    );
  }
  return c.text("Not Found", 404);
});

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    upstream: c.env.UPSTREAM_URL?.trim() ? "configured" : "unset",
  }),
);

app.post("/api/resolve", requireAccessToken, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new MediaError("INVALID_URL", "Body permintaan harus JSON.");
  }

  const parsed = ResolveRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new MediaError("INVALID_URL");
  }

  const ip = c.req.header("cf-connecting-ip")?.trim() || "local";
  await enforceResolveRateLimit(c.env.CACHE, ip);

  const { url, platform } = detectPlatform(parsed.data.url);
  const { quality, audioOnly } = parsed.data;
  // Quality and mode are part of the key: the same post resolves to different files.
  const cacheKey = `resolve:${platform}:${quality ?? "default"}:${
    audioOnly ? "audio" : "video"
  }:${url.href}`;

  const cached = await readCachedResult(c.env.CACHE, cacheKey);
  const result =
    cached ?? (await resolveMedia(url, platform, c.env, quality, audioOnly));

  if (!cached) {
    await writeCachedResult(c.env.CACHE, cacheKey, result);
  }

  return c.json(await buildResolveResponse(result, c.env));
});

app.get("/api/download", downloadRoute);

async function enforceResolveRateLimit(
  kv: KVNamespace,
  ip: string,
): Promise<void> {
  const key = `rate:resolve:${ip}`;
  const current = Number(await kv.get(key)) || 0;

  if (current >= RATE_LIMIT_MAX) {
    throw new MediaError("RATE_LIMITED");
  }

  await kv.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
  });
}

async function readCachedResult(
  kv: KVNamespace,
  key: string,
): Promise<MediaResult | null> {
  try {
    const cached = (await kv.get(key, "json")) as MediaResult | null;
    if (
      cached &&
      typeof cached === "object" &&
      Array.isArray(cached.items) &&
      cached.items.length > 0
    ) {
      return cached;
    }
  } catch {
    // A broken cache entry must not break the request.
  }
  return null;
}

async function writeCachedResult(
  kv: KVNamespace,
  key: string,
  result: MediaResult,
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(result), {
      expirationTtl: RESOLVE_CACHE_TTL_SECONDS,
    });
  } catch {
    // Caching is best-effort.
  }
}

async function buildResolveResponse(
  result: MediaResult,
  env: Env,
): Promise<ResolveResponse> {
  const secret = env.SIGNING_SECRET?.trim();
  if (!secret) {
    throw new MediaError(
      "UPSTREAM_FAILED",
      "SIGNING_SECRET belum dikonfigurasi di Worker.",
    );
  }

  const expiresAt = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_TTL_SECONDS;

  const items: MediaItem[] = [];
  for (const [index, item] of result.items.entries()) {
    items.push(await buildMediaItem(result.platform, item, index, expiresAt, secret));
  }

  const response = ResolveResponseSchema.safeParse({
    platform: result.platform,
    title: result.title,
    author: result.author,
    thumbnail: result.thumbnail,
    duration: result.duration,
    items,
  });

  if (!response.success) {
    throw new MediaError(
      "UPSTREAM_FAILED",
      "Data media dari sumber tidak lengkap.",
    );
  }

  return response.data;
}

async function buildMediaItem(
  platform: MediaResult["platform"],
  item: MediaSource,
  index: number,
  expiresAt: number,
  secret: string,
): Promise<MediaItem> {
  const ext = item.ext?.trim() || extensionFromUrl(item.url);
  const filename = ensureExtension(
    sanitizeFilename(item.filename ?? `${platform}-${index + 1}`),
    ext,
  );

  const token = await signToken({ u: item.url, fn: filename, exp: expiresAt }, secret);

  const mediaItem: MediaItem = {
    type: item.type,
    ext,
    downloadUrl: `/api/download?token=${encodeURIComponent(token)}`,
  };

  if (item.quality) mediaItem.quality = item.quality;
  if (item.size !== undefined) mediaItem.size = item.size;

  return mediaItem;
}

export default app;
