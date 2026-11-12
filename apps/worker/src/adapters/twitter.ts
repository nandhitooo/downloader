import type { VideoQuality } from "@app/shared";
import type { Env } from "../env";
import { PLATFORM_HOSTS, isHostAllowed } from "../detect";
import { MediaError } from "../errors";
import { extensionFromUrl } from "../filename";
import { resolveWithUpstream } from "./upstream";
import type { Adapter, MediaResult, MediaSource } from "./types";

/**
 * Verified 2026-11 by fetching
 * https://cdn.syndication.twimg.com/tweet-result?id=2120221298534019269&lang=en&token=a
 * The `token` value is ignored by the endpoint; `id` is the tweet id.
 */
const SYNDICATION_ENDPOINT = "https://cdn.syndication.twimg.com/tweet-result";
const TWEET_ID = /\/(?:status|statuses)\/(\d+)/;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Subset of the syndication payload this adapter consumes. */
interface SyndicationVariant {
  content_type?: string;
  bitrate?: number;
  url?: string;
}

interface SyndicationMedia {
  type?: string;
  media_url_https?: string;
  video_info?: {
    duration_millis?: number;
    variants?: SyndicationVariant[];
  };
}

interface SyndicationTweet {
  text?: string;
  user?: { name?: string; screen_name?: string };
  mediaDetails?: SyndicationMedia[];
  video?: { durationMs?: number };
}

async function fetchTweet(id: string): Promise<SyndicationTweet | null> {
  const endpoint = new URL(SYNDICATION_ENDPOINT);
  endpoint.searchParams.set("id", id);
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("token", "a");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    return (await response.json()) as SyndicationTweet;
  } catch {
    return null;
  }
}

function qualityLabel(variantUrl: string, bitrate: number | undefined): string | undefined {
  const resolution = /\/(\d{2,4})x(\d{2,4})\//.exec(variantUrl);
  if (resolution?.[1] && resolution[2]) return `${resolution[1]}x${resolution[2]}`;
  if (bitrate && bitrate > 0) return `${Math.round(bitrate / 1000)}kbps`;
  return undefined;
}

/** Short side of a variant resolution (`720x1280` → 720p). */
function variantHeight(variantUrl: string): number | undefined {
  const match = /\/(\d{2,4})x(\d{2,4})\//.exec(variantUrl);
  if (!match?.[1] || !match[2]) return undefined;
  return Math.min(Number(match[1]), Number(match[2]));
}

/** Picks the best variant at or below the requested height. */
function pickVariant(
  variants: SyndicationVariant[],
  quality: VideoQuality,
): SyndicationVariant[] {
  const target = Number(quality);
  const within = variants.find((variant) => {
    const height = variant.url ? variantHeight(variant.url) : undefined;
    return height !== undefined && height <= target;
  });
  if (within) return [within];
  // Nothing at or below the request: the smallest available stream is closest.
  const smallest = variants[variants.length - 1];
  return smallest ? [smallest] : [];
}

function mediaItemsFromTweet(
  tweet: SyndicationTweet,
  tweetId: string,
  quality?: VideoQuality,
): MediaSource[] {
  const items: MediaSource[] = [];
  const base = `${tweet.user?.screen_name ?? "x"}-${tweetId}`;

  for (const [mediaIndex, media] of (tweet.mediaDetails ?? []).entries()) {
    const position = mediaIndex + 1;
    const variants = media.video_info?.variants ?? [];
    const mp4Variants = variants
      .filter(
        (variant) =>
          variant.content_type === "video/mp4" && typeof variant.url === "string",
      )
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    if (mp4Variants.length > 0) {
      const selected = quality ? pickVariant(mp4Variants, quality) : mp4Variants;

      for (const [variantIndex, variant] of selected.entries()) {
        const variantUrl = variant.url;
        if (!variantUrl) continue;
        items.push({
          type: "video",
          url: variantUrl,
          ext: "mp4",
          quality: qualityLabel(variantUrl, variant.bitrate),
          filename: quality
            ? `${base}-${position}.mp4`
            : `${base}-${position}-${variantIndex + 1}.mp4`,
        });
      }
      continue;
    }

    if (media.media_url_https) {
      items.push({
        type: "image",
        url: media.media_url_https,
        ext: extensionFromUrl(media.media_url_https, "jpg"),
        filename: `${base}-${position}.jpg`,
      });
    }
  }

  return items;
}

export const twitterAdapter: Adapter = {
  name: "x",
  match: (url) => isHostAllowed(url.hostname, PLATFORM_HOSTS.x),
  cdnHosts: ["video.twimg.com", "pbs.twimg.com"],
  async resolve(
    url: URL,
    env: Env,
    quality?: VideoQuality,
  ): Promise<MediaResult> {
    const tweetId = TWEET_ID.exec(url.pathname)?.[1];
    if (!tweetId) {
      throw new MediaError(
        "UNSUPPORTED",
        "Tautan ini bukan tautan post X/Twitter.",
      );
    }

    const tweet = await fetchTweet(tweetId);
    if (!tweet) {
      throw new MediaError(
        "UPSTREAM_FAILED",
        "Post X/Twitter tidak bisa dibaca tanpa login.",
      );
    }

    const items = mediaItemsFromTweet(tweet, tweetId, quality);
    if (items.length === 0) {
      // Delegating through the registry keeps the fallback able to try.
      return resolveWithUpstream(url, env, "x", quality);
    }

    const author =
      tweet.user?.name && tweet.user.screen_name
        ? `${tweet.user.name} (@${tweet.user.screen_name})`
        : tweet.user?.screen_name;

    const durationMs =
      tweet.video?.durationMs ?? tweet.mediaDetails?.[0]?.video_info?.duration_millis;

    return {
      platform: "x",
      title: tweet.text?.trim().slice(0, 200) || undefined,
      author,
      thumbnail: tweet.mediaDetails?.[0]?.media_url_https,
      duration:
        typeof durationMs === "number" ? Math.round(durationMs / 1000) : undefined,
      items,
    };
  },
};
