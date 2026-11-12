import type { VideoQuality } from "@app/shared";
import type { Env } from "../env";
import { PLATFORM_HOSTS, isHostAllowed } from "../detect";
import { resolveWithUpstream } from "./upstream";
import type { Adapter, MediaResult } from "./types";

export const instagramAdapter: Adapter = {
  name: "instagram",
  match: (url) => isHostAllowed(url.hostname, PLATFORM_HOSTS.instagram),
  cdnHosts: ["cdninstagram.com", "fbcdn.net"],
  async resolve(
    url: URL,
    env: Env,
    quality?: VideoQuality,
    audioOnly?: boolean,
  ): Promise<MediaResult> {
    // TODO(verify): native extraction of public /p/ and /reel/ pages was not
    // verified by an actual fetch (public pages are login/CAPTCHA gated), so
    // this adapter delegates to the upstream fallback.
    return resolveWithUpstream(url, env, "instagram", quality, audioOnly);
  },
};
