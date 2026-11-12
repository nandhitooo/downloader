import { describe, expect, it } from "vitest";
import {
  PLATFORM_HOSTS,
  detectPlatform,
  isBlockedHostname,
  isHostAllowed,
  parseTargetUrl,
} from "../src/detect";
import { MediaError } from "../src/errors";

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(MediaError);
    return (error as MediaError).code;
  }
  throw new Error("expected the call to throw");
}

describe("detectPlatform", () => {
  it.each([
    ["https://www.tiktok.com/@scout2015/video/6718335390845095173", "tiktok"],
    ["https://vm.tiktok.com/ZMabc123/", "tiktok"],
    ["https://vt.tiktok.com/ZSabc123/", "tiktok"],
    ["https://x.com/jack/status/20", "x"],
    ["https://twitter.com/jack/status/20", "x"],
    ["https://www.instagram.com/p/CqQFyPtpQpF/", "instagram"],
    ["https://m.facebook.com/watch/?v=123", "facebook"],
    ["https://fb.watch/abcdef/", "facebook"],
    ["https://www.threads.net/@nasa/post/abc", "threads"],
    ["https://www.threads.com/@nasa/post/abc", "threads"],
  ])("maps %s to %s", (input, platform) => {
    const result = detectPlatform(input);
    expect(result.platform).toBe(platform);
    expect(result.url.protocol).toBe("https:");
  });

  it("rejects non-https URLs", () => {
    expect(errorCode(() => detectPlatform("http://x.com/jack/status/20"))).toBe(
      "INVALID_URL",
    );
  });

  it("rejects IP literals, localhost and intranet hosts", () => {
    expect(
      errorCode(() => detectPlatform("https://127.0.0.1/x.com/status/20")),
    ).toBe("INVALID_URL");
    expect(
      errorCode(() => detectPlatform("https://[::1]/jack/status/20")),
    ).toBe("INVALID_URL");
    expect(errorCode(() => detectPlatform("https://localhost/x"))).toBe(
      "INVALID_URL",
    );
    expect(errorCode(() => detectPlatform("https://internal/x"))).toBe(
      "INVALID_URL",
    );
  });

  it("rejects credentials in the URL", () => {
    expect(
      errorCode(() =>
        detectPlatform("https://user:pass@x.com/jack/status/20"),
      ),
    ).toBe("INVALID_URL");
  });

  it("rejects malformed input", () => {
    expect(errorCode(() => detectPlatform("not a url"))).toBe("INVALID_URL");
  });

  it("rejects hosts outside the allowlist", () => {
    expect(errorCode(() => detectPlatform("https://youtube.com/watch?v=1"))).toBe(
      "UNSUPPORTED",
    );
    expect(
      errorCode(() => detectPlatform("https://evil-tiktok.com/@a/video/1")),
    ).toBe("UNSUPPORTED");
  });
});

describe("host allowlist helpers", () => {
  it("allows exact hosts and subdomains only", () => {
    expect(isHostAllowed("tiktok.com", PLATFORM_HOSTS.tiktok)).toBe(true);
    expect(isHostAllowed("www.tiktok.com", PLATFORM_HOSTS.tiktok)).toBe(true);
    expect(isHostAllowed("not-tiktok.com", PLATFORM_HOSTS.tiktok)).toBe(false);
    expect(isHostAllowed("tiktok.com.evil.test", PLATFORM_HOSTS.tiktok)).toBe(
      false,
    );
    expect(isHostAllowed("video.twimg.com", ["video.twimg.com"])).toBe(true);
    expect(isHostAllowed("twimg.com", ["video.twimg.com"])).toBe(false);
  });

  it("normalizes case and trailing dots", () => {
    expect(isHostAllowed("WWW.TikTok.com.", PLATFORM_HOSTS.tiktok)).toBe(true);
  });

  it("blocks IPv4, IPv6 and single-label hosts", () => {
    expect(isBlockedHostname("192.168.0.1")).toBe(true);
    expect(isBlockedHostname("[::1]")).toBe(true);
    expect(isBlockedHostname("printer")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
  });

  it("requires https in parseTargetUrl", () => {
    expect(parseTargetUrl("https://x.com/a").hostname).toBe("x.com");
    expect(errorCode(() => parseTargetUrl("ftp://x.com/a"))).toBe(
      "INVALID_URL",
    );
  });
});
