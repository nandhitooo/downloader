import { z } from "zod";
import type { MediaType, Platform } from "@app/shared";
import type { Env } from "../env";
import { MediaError } from "../errors";
import { extensionFromUrl } from "../filename";
import type { MediaResult, MediaSource } from "./types";

/**
 * Request and response shapes follow the cobalt API documentation
 * (https://github.com/imputnet/cobalt/blob/main/docs/api.md): `POST /` with
 * `Accept`/`Content-Type: application/json` and a discriminated `status`.
 */
const TunnelSchema = z.object({
  status: z.enum(["tunnel", "redirect"]),
  url: z.string().min(1),
  filename: z.string().min(1),
});

const PickerSchema = z.object({
  status: z.literal("picker"),
  picker: z
    .array(
      z.object({
        type: z.enum(["photo", "video", "gif"]),
        url: z.string().min(1),
        thumb: z.string().min(1).optional(),
      }),
    )
    .min(1),
  audio: z.string().min(1).optional(),
  audioFilename: z.string().min(1).optional(),
});

const LocalProcessingSchema = z.object({
  status: z.literal("local-processing"),
  tunnel: z.array(z.string().min(1)).min(1),
  output: z.object({
    type: z.string().min(1),
    filename: z.string().min(1),
    metadata: z
      .object({
        title: z.string().min(1).optional(),
        artist: z.string().min(1).optional(),
      })
      .optional(),
  }),
});

const UpstreamErrorSchema = z.object({
  status: z.literal("error"),
  error: z.object({ code: z.string().min(1) }),
});

const UpstreamResponseSchema = z.discriminatedUnion("status", [
  TunnelSchema,
  PickerSchema,
  LocalProcessingSchema,
  UpstreamErrorSchema,
]);

type UpstreamResponse = z.infer<typeof UpstreamResponseSchema>;

function mapUpstreamError(code: string): MediaError {
  const normalized = code.toLowerCase();

  if (normalized.includes("rate") || normalized.includes("limit")) {
    return new MediaError(
      "RATE_LIMITED",
      "Layanan upstream sedang membatasi permintaan.",
    );
  }
  if (
    normalized.includes("private") ||
    normalized.includes("login") ||
    normalized.includes("auth") ||
    normalized.includes("age")
  ) {
    return new MediaError("PRIVATE_CONTENT");
  }
  if (
    normalized.includes("unsupported") ||
    normalized.includes("link") ||
    normalized.includes("service")
  ) {
    return new MediaError("UNSUPPORTED");
  }

  return new MediaError("UPSTREAM_FAILED", `Upstream gagal: ${code}`);
}

function typeFromMime(mime: string): MediaType {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return "video";
}

function mapUpstreamResult(
  data: UpstreamResponse,
  platform: Platform,
): MediaResult {
  switch (data.status) {
    case "tunnel":
    case "redirect":
      return {
        platform,
        items: [
          {
            type: "video",
            url: data.url,
            ext: extensionFromUrl(data.filename, "mp4"),
            filename: data.filename,
          },
        ],
      };

    case "picker": {
      const items: MediaSource[] = data.picker.map((entry) => ({
        type: entry.type === "photo" ? "image" : "video",
        url: entry.url,
        ext: extensionFromUrl(
          entry.url,
          entry.type === "photo"
            ? "jpg"
            : entry.type === "gif"
              ? "gif"
              : "mp4",
        ),
      }));

      if (data.audio) {
        items.push({
          type: "audio",
          url: data.audio,
          ext: extensionFromUrl(data.audio, "mp3"),
          filename: data.audioFilename,
        });
      }

      const thumbnail = data.picker.find((entry) => entry.thumb)?.thumb;

      return { platform, thumbnail, items };
    }

    // local-processing: cobalt tunnels the source streams, output describes the
    // file the client would have produced after remuxing.
    case "local-processing": {
      const mediaType = typeFromMime(data.output.type);
      const metadata = data.output.metadata;

      return {
        platform,
        title: metadata?.title,
        author: metadata?.artist,
        items: data.tunnel.map((url) => ({
          type: mediaType,
          url,
          ext: extensionFromUrl(
            data.output.filename,
            mediaType === "audio" ? "mp3" : "mp4",
          ),
          filename: data.output.filename,
        })),
      };
    }

    case "error":
      throw mapUpstreamError(data.error.code);
  }
}

/** Resolves a post URL through a self-hosted cobalt-compatible instance. */
export async function resolveWithUpstream(
  url: URL,
  env: Env,
  platform: Platform,
): Promise<MediaResult> {
  const base = env.UPSTREAM_URL?.trim();
  if (!base) {
    throw new MediaError(
      "UPSTREAM_FAILED",
      "UPSTREAM_URL belum dikonfigurasi, jadi tautan ini belum bisa diunduh.",
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(`${base.replace(/\/+$/, "")}/`);
  } catch {
    throw new MediaError("UPSTREAM_FAILED", "UPSTREAM_URL tidak valid.");
  }

  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  const apiKey = env.UPSTREAM_API_KEY?.trim();
  if (apiKey) headers.set("Authorization", `Api-Key ${apiKey}`);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: url.toString(),
        videoQuality: "1080",
        downloadMode: "auto",
        filenameStyle: "basic",
        alwaysProxy: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new MediaError(
      "UPSTREAM_FAILED",
      "Tidak bisa menghubungi layanan upstream.",
    );
  }

  if (response.status === 429) {
    throw new MediaError(
      "RATE_LIMITED",
      "Layanan upstream sedang membatasi permintaan.",
    );
  }
  if (!response.ok) {
    throw new MediaError(
      "UPSTREAM_FAILED",
      `Upstream menolak permintaan (${response.status}). Periksa UPSTREAM_API_KEY.`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new MediaError("UPSTREAM_FAILED", "Respons upstream bukan JSON.");
  }

  const parsed = UpstreamResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new MediaError(
      "UPSTREAM_FAILED",
      "Format respons upstream tidak dikenali.",
    );
  }

  return mapUpstreamResult(parsed.data, platform);
}
