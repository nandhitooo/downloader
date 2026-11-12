import type { VideoQuality } from "@app/shared";
import type { Env } from "../env";
import { PLATFORM_HOSTS, isHostAllowed } from "../detect";
import { resolveWithUpstream } from "./upstream";
import type { Adapter, MediaResult } from "./types";

export const tiktokAdapter: Adapter = {
  name: "tiktok",
  match: (url) => isHostAllowed(url.hostname, PLATFORM_HOSTS.tiktok),
  cdnHosts: [
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokv.com",
    "tiktok.com",
  ],
  async resolve(
    url: URL,
    env: Env,
    quality?: VideoQuality,
    audioOnly?: boolean,
  ): Promise<MediaResult> {
    // TODO(verify): a native extractor needs a verified response shape. As of
    // 2026-11 the public video page answers with a ~1.4 kB JS-only shell that
    // contains no playable media data, and the oEmbed endpoint
    // (https://www.tiktok.com/oembed?url=...) returns no media URL, so this
    // adapter delegates to the upstream fallback.
    return resolveWithUpstream(url, env, "tiktok", quality, audioOnly);
  },
};
