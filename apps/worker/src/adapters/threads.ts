import type { VideoQuality } from "@app/shared";
import type { Env } from "../env";
import { PLATFORM_HOSTS, isHostAllowed } from "../detect";
import { resolveWithUpstream } from "./upstream";
import type { Adapter, MediaResult } from "./types";

export const threadsAdapter: Adapter = {
  name: "threads",
  match: (url) => isHostAllowed(url.hostname, PLATFORM_HOSTS.threads),
  cdnHosts: ["cdninstagram.com", "fbcdn.net"],
  async resolve(
    url: URL,
    env: Env,
    quality?: VideoQuality,
    audioOnly?: boolean,
  ): Promise<MediaResult> {
    // TODO(verify): native extraction from public Threads posts was not
    // verified by an actual fetch, so this adapter delegates to the upstream
    // fallback.
    return resolveWithUpstream(url, env, "threads", quality, audioOnly);
  },
};
