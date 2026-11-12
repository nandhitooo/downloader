import type { Platform, VideoQuality } from "@app/shared";
import type { Env } from "../env";
import { MediaError } from "../errors";
import { facebookAdapter } from "./facebook";
import { instagramAdapter } from "./instagram";
import { threadsAdapter } from "./threads";
import { tiktokAdapter } from "./tiktok";
import { twitterAdapter } from "./twitter";
import { resolveWithUpstream } from "./upstream";
import type { Adapter, MediaResult } from "./types";

export const adapters: readonly Adapter[] = [
  tiktokAdapter,
  twitterAdapter,
  instagramAdapter,
  facebookAdapter,
  threadsAdapter,
];

export function adapterFor(platform: Platform): Adapter | undefined {
  return adapters.find((adapter) => adapter.name === platform);
}

/** Every CDN host declared by the adapters (download proxy allowlist). */
export function allCdnHosts(): string[] {
  return adapters.flatMap((adapter) => adapter.cdnHosts);
}

/**
 * Native adapter first, then the upstream fallback, then a structured error.
 * Adapter failures intentionally fall through so the fallback gets a chance.
 */
export async function resolveMedia(
  url: URL,
  platform: Platform,
  env: Env,
  quality?: VideoQuality,
  audioOnly?: boolean,
): Promise<MediaResult> {
  const adapter = adapterFor(platform);

  if (adapter?.match(url)) {
    try {
      const native = await adapter.resolve(url, env, quality, audioOnly);
      if (native.items.length > 0) return native;
    } catch (error) {
      const code = error instanceof MediaError ? error.code : "UNKNOWN";
      console.warn(`adapter ${platform} failed (${code}), falling back`);
    }
  }

  return resolveWithUpstream(url, env, platform, quality, audioOnly);
}
