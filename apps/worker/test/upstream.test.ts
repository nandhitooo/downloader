import { afterEach, describe, expect, it, vi } from "vitest";
import { facebookAdapter } from "../src/adapters/facebook";
import { resolveWithUpstream } from "../src/adapters/upstream";
import type { Env } from "../src/env";

const env = { UPSTREAM_URL: "http://localhost:9000" } as Env;

function stubCobalt(filename = "clip.mp4") {
  const bodies: Array<Record<string, unknown>> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          status: "tunnel",
          url: "http://localhost:9000/tunnel?id=abc",
          filename,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );

  return bodies;
}

describe("resolveWithUpstream video quality", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the chosen quality to the upstream request", async () => {
    const bodies = stubCobalt();

    const result = await resolveWithUpstream(
      new URL("https://www.facebook.com/watch/?v=1"),
      env,
      "facebook",
      "480",
    );

    expect(bodies[0]?.videoQuality).toBe("480");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.filename).toBe("clip.mp4");
  });

  it("keeps 1080 as the default when no quality is chosen", async () => {
    const bodies = stubCobalt();

    await resolveWithUpstream(
      new URL("https://www.facebook.com/watch/?v=1"),
      env,
      "facebook",
    );

    expect(bodies[0]?.videoQuality).toBe("1080");
  });
});

describe("resolveWithUpstream audio-only", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks cobalt for an mp3 and maps the result as audio", async () => {
    const bodies = stubCobalt("clip_audio.mp3");

    const result = await resolveWithUpstream(
      new URL("https://www.facebook.com/watch/?v=1"),
      env,
      "facebook",
      "1080",
      true,
    );

    expect(bodies[0]).toMatchObject({
      downloadMode: "audio",
      audioFormat: "mp3",
      audioBitrate: "128",
    });
    expect(result.items[0]).toMatchObject({
      type: "audio",
      ext: "mp3",
      filename: "clip_audio.mp3",
    });
  });

  it("forwards audio mode through delegating adapters", async () => {
    const bodies = stubCobalt();

    await facebookAdapter.resolve(
      new URL("https://www.facebook.com/watch/?v=1"),
      env,
      "480",
      true,
    );

    expect(bodies[0]).toMatchObject({
      videoQuality: "480",
      downloadMode: "audio",
    });
  });
});
