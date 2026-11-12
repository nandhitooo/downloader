import { z } from "zod";

/** Social platforms this app can resolve. */
export const PlatformSchema = z.enum([
  "tiktok",
  "x",
  "instagram",
  "facebook",
  "threads",
]);
export type Platform = z.infer<typeof PlatformSchema>;

export const MediaTypeSchema = z.enum(["video", "audio", "image"]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MediaItemSchema = z.object({
  type: MediaTypeSchema,
  quality: z.string().min(1).optional(),
  ext: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  downloadUrl: z.string().min(1),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

/** Video qualities offered to the user, ordered lowest to highest (HD). */
export const VIDEO_QUALITIES = ["240", "360", "480", "720", "1080"] as const;
export const VideoQualitySchema = z.enum(VIDEO_QUALITIES);
export type VideoQuality = z.infer<typeof VideoQualitySchema>;

export const ResolveRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  /** Requested maximum video height (`240` … `1080`); omitted means best. */
  quality: VideoQualitySchema.optional(),
  /** Ask the upstream for the audio track as an MP3 instead of the video. */
  audioOnly: z.boolean().optional(),
});
export type ResolveRequest = z.infer<typeof ResolveRequestSchema>;

export const ResolveResponseSchema = z.object({
  platform: PlatformSchema,
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  thumbnail: z.string().min(1).optional(),
  duration: z.number().nonnegative().optional(),
  items: z.array(MediaItemSchema).min(1),
});
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;

export const ApiErrorCodeSchema = z.enum([
  "INVALID_URL",
  "UNSUPPORTED",
  "PRIVATE_CONTENT",
  "UPSTREAM_FAILED",
  "RATE_LIMITED",
  "UNAUTHORIZED",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Envelope used by every JSON error response (`{ error: { code, message } }`). */
export const ApiErrorResponseSchema = z.object({ error: ApiErrorSchema });
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
