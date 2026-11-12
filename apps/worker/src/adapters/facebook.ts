import type { VideoQuality } from "@app/shared";
import type { Env } from "../env";
import { PLATFORM_HOSTS, isHostAllowed } from "../detect";
import { resolveWithUpstream } from "./upstream";
import type { Adapter, MediaResult } from "./types";

export const facebookAdapter: Adapter = {
  name: "facebook",
  match: (url) => isHostAllowed(url.hostname, PLATFORM_HOSTS.facebook),
  cdnHosts: ["fbcdn.net", "fbsbx.com"],
  async resolve(
    url: URL,
    env: Env,
    quality?: VideoQuality,
    audioOnly?: boolean,
  ): Promise<MediaResult> {
    // TODO(verify): native extraction from public video pages / fb.watch was
    // not verified by an actual fetch (login gated), so this adapter delegates
    // to the upstream fallback.
    return resolveWithUpstream(url, env, "facebook", quality, audioOnly);
  },
};
