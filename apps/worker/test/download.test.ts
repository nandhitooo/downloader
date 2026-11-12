import { describe, expect, it } from "vitest";
import { isDownloadTargetAllowed } from "../src/download";

describe("isDownloadTargetAllowed", () => {
  it("allows an exact UPSTREAM_URL origin over http (local cobalt tunnel)", () => {
    expect(
      isDownloadTargetAllowed(
        new URL("http://localhost:9000/tunnel?id=abc"),
        "http://localhost:9000",
      ),
    ).toBe(true);
  });

  it("matches origin including the port, not just the hostname", () => {
    expect(
      isDownloadTargetAllowed(
        new URL("http://localhost:9001/tunnel?id=abc"),
        "http://localhost:9000",
      ),
    ).toBe(false);
  });

  it("does not treat another host on the upstream port as the upstream", () => {
    expect(
      isDownloadTargetAllowed(
        new URL("http://127.0.0.1:9000/tunnel?id=abc"),
        "http://localhost:9000",
      ),
    ).toBe(false);
  });

  it("does not allow a different scheme on the upstream host", () => {
    expect(
      isDownloadTargetAllowed(
        new URL("https://localhost:9000/tunnel?id=abc"),
        "http://localhost:9000",
      ),
    ).toBe(false);
  });

  it("keeps the https-only rule for allowlisted CDN hosts", () => {
    expect(
      isDownloadTargetAllowed(
        new URL("http://v16.tiktokcdn.com/video.mp4"),
        "http://localhost:9000",
      ),
    ).toBe(false);
  });

  it("allows https media on allowlisted CDN hosts", () => {
    expect(
      isDownloadTargetAllowed(
        new URL("https://v16.tiktokcdn.com/video.mp4"),
        "http://localhost:9000",
      ),
    ).toBe(true);
  });

  it("rejects an unlisted origin when UPSTREAM_URL is unset", () => {
    expect(
      isDownloadTargetAllowed(new URL("http://localhost:9000/tunnel"), undefined),
    ).toBe(false);
  });
});
