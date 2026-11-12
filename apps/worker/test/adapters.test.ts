import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { MediaError } from "../src/errors";
import { adapters, allCdnHosts } from "../src/adapters";
import { facebookAdapter } from "../src/adapters/facebook";
import { instagramAdapter } from "../src/adapters/instagram";
import { threadsAdapter } from "../src/adapters/threads";
import { tiktokAdapter } from "../src/adapters/tiktok";
import { twitterAdapter } from "../src/adapters/twitter";

const FIXTURES = [
  {
    adapter: tiktokAdapter,
    sample: "https://www.tiktok.com/@scout2015/video/6718335390845095173",
    foreign: "https://x.com/jack/status/20",
  },
  {
    adapter: twitterAdapter,
    sample: "https://x.com/NASAJohnson/status/2120221298534019269",
    foreign: "https://www.instagram.com/p/CqQFyPtpQpF/",
  },
  {
    adapter: instagramAdapter,
    sample: "https://www.instagram.com/reel/CqQFyPtpQpF/",
    foreign: "https://www.tiktok.com/@scout2015/video/6718335390845095173",
  },
  {
    adapter: facebookAdapter,
    sample: "https://www.facebook.com/watch/?v=1234567890",
    foreign: "https://www.threads.net/@nasa/post/abc",
  },
  {
    adapter: threadsAdapter,
    sample: "https://www.threads.com/@nasa/post/CqQFyPtpQpF",
    foreign: "https://fb.watch/abcdef/",
  },
];

describe("adapter URL matching", () => {
  for (const { adapter, sample, foreign } of FIXTURES) {
    it(`${adapter.name} matches its fixture and rejects others`, () => {
      expect(adapter.match(new URL(sample))).toBe(true);
      expect(adapter.match(new URL(foreign))).toBe(false);
      expect(adapter.cdnHosts.length).toBeGreaterThan(0);
      expect(adapter.cdnHosts.every((host) => !host.includes("://"))).toBe(true);
    });
  }

  it("registers exactly the five supported platforms", () => {
    expect(adapters.map((adapter) => adapter.name).sort()).toEqual([
      "facebook",
      "instagram",
      "threads",
      "tiktok",
      "x",
    ]);
  });

  it("exposes a combined CDN allowlist", () => {
    const hosts = allCdnHosts();
    expect(hosts).toContain("video.twimg.com");
    expect(hosts).toContain("tiktokcdn.com");
  });
});

describe("twitter native adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const env = {} as Env;

  const videoTweet = {
    text: "We are searching for the next generation of explorers",
    user: { name: "NASA's Johnson Space Center", screen_name: "NASAJohnson" },
    video: { durationMs: 40656 },
    mediaDetails: [
      {
        type: "video",
        media_url_https:
          "https://pbs.twimg.com/amplify_video_thumb/2120221034724909056/img/vZ_QjTjQLpwJhji-.jpg",
        video_info: {
          duration_millis: 40656,
          variants: [
            {
              content_type: "application/x-mpegURL",
              url: "https://video.twimg.com/amplify_video/1/pl/playlist.m3u8",
            },
            {
              content_type: "video/mp4",
              bitrate: 950000,
              url: "https://video.twimg.com/amplify_video/1/vid/avc1/480x852/low.mp4",
            },
            {
              content_type: "video/mp4",
              bitrate: 2176000,
              url: "https://video.twimg.com/amplify_video/1/vid/avc1/720x1280/high.mp4",
            },
          ],
        },
      },
    ],
  };

  function stubFetch(body: unknown, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );
  }

  it("maps a verified video payload into mp4 items (highest bitrate first)", async () => {
    stubFetch(videoTweet);

    const result = await twitterAdapter.resolve(
      new URL("https://x.com/NASAJohnson/status/2120221298534019269"),
      env,
    );

    expect(result.platform).toBe("x");
    expect(result.duration).toBe(41);
    expect(result.author).toBe("NASA's Johnson Space Center (@NASAJohnson)");
    expect(result.thumbnail).toContain("pbs.twimg.com");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      type: "video",
      ext: "mp4",
      quality: "720x1280",
      filename: "NASAJohnson-2120221298534019269-1-1.mp4",
    });
    expect(result.items[1]?.quality).toBe("480x852");
  });

  it("maps photo media into image items", async () => {
    stubFetch({
      text: "A photo",
      user: { name: "NASA", screen_name: "NASA" },
      mediaDetails: [
        {
          type: "photo",
          media_url_https: "https://pbs.twimg.com/media/photo.jpg",
        },
      ],
    });

    const result = await twitterAdapter.resolve(
      new URL("https://x.com/NASA/status/20"),
      env,
    );

    expect(result.items).toEqual([
      expect.objectContaining({ type: "image", ext: "jpg" }),
    ]);
  });

  it("falls back to upstream for a post without media", async () => {
    stubFetch({ text: "just setting up my twttr", user: { screen_name: "jack" } });

    await expect(
      twitterAdapter.resolve(new URL("https://x.com/jack/status/20"), env),
    ).rejects.toMatchObject({ code: "UPSTREAM_FAILED" });
  });

  it("rejects non-post URLs and unreadable tweets", async () => {
    await expect(
      twitterAdapter.resolve(new URL("https://x.com/jack"), env),
    ).rejects.toBeInstanceOf(MediaError);

    stubFetch({ message: "not found" }, 404);
    await expect(
      twitterAdapter.resolve(new URL("https://x.com/jack/status/20"), env),
    ).rejects.toMatchObject({ code: "UPSTREAM_FAILED" });
  });
});
