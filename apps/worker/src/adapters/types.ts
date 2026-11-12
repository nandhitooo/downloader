import type { MediaType, Platform, VideoQuality } from "@app/shared";
import type { Env } from "../env";

/** A single downloadable media stream before it is signed. */
export interface MediaSource {
  type: MediaType;
  url: string;
  ext: string;
  quality?: string;
  size?: number;
  /** Preferred filename; generated from the platform when absent. */
  filename?: string;
}

/** Normalized resolve output shared by native adapters and the fallback. */
export interface MediaResult {
  platform: Platform;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  items: MediaSource[];
}

export interface Adapter {
  name: Platform;
  match(url: URL): boolean;
  /** CDN hosts this adapter's media URLs may point at (download proxy allowlist). */
  cdnHosts: string[];
  resolve(url: URL, env: Env, quality?: VideoQuality): Promise<MediaResult>;
}
