import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  ensureExtension,
  extensionFromUrl,
  sanitizeFilename,
} from "../src/filename";

describe("sanitizeFilename", () => {
  it("removes path separators and control characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeFilename("a\\b/c:d*e?f\"g<h>i|j")).toBe("a-b-c-d-e-f-g-h-i-j");
    expect(sanitizeFilename("vid\u0000eo\nname")).toBe("videoname");
  });

  it("keeps unicode and collapses whitespace", () => {
    expect(sanitizeFilename("  video   TikTok  ")).toBe("video TikTok");
    expect(sanitizeFilename("unduhan musik")).toBe("unduhan musik");
  });

  it("falls back for empty/unsafe-only input", () => {
    expect(sanitizeFilename("")).toBe("unduhan");
    expect(sanitizeFilename("...")).toBe("unduhan");
    expect(sanitizeFilename("////")).toBe("unduhan");
  });

  it("truncates very long names", () => {
    expect(sanitizeFilename("a".repeat(500)).length).toBe(120);
  });
});

describe("ensureExtension", () => {
  it("appends a missing extension", () => {
    expect(ensureExtension("video", "mp4")).toBe("video.mp4");
    expect(ensureExtension("video", ".MP4")).toBe("video.mp4");
  });

  it("does not duplicate the extension", () => {
    expect(ensureExtension("video.mp4", "mp4")).toBe("video.mp4");
  });

  it("keeps an existing different extension", () => {
    expect(ensureExtension("audio.webm", "mp4")).toBe("audio.webm");
  });

  it("sanitizes while building the name", () => {
    expect(ensureExtension("../../secret", "jpg")).toBe("secret.jpg");
  });
});

describe("extensionFromUrl", () => {
  it("reads the extension from the path", () => {
    expect(extensionFromUrl("https://video.twimg.com/a/b.mp4?tag=1")).toBe("mp4");
    expect(extensionFromUrl("https://pbs.twimg.com/media/x.JPG")).toBe("jpg");
  });

  it("falls back when there is no extension", () => {
    expect(extensionFromUrl("https://cdn.test/stream/abc")).toBe("bin");
    expect(extensionFromUrl("not a url", "jpg")).toBe("jpg");
  });
});

describe("contentDisposition", () => {
  it("emits an ascii filename plus a utf-8 filename*", () => {
    const header = contentDisposition("video tiktok.mp4");
    expect(header).toBe(
      'attachment; filename="video tiktok.mp4"; filename*=UTF-8\'\'video%20tiktok.mp4',
    );
  });

  it("replaces non-ascii characters in the fallback", () => {
    const header = contentDisposition("musik.mp3");
    expect(header).toContain('filename="musik.mp3"');
  });

  it("serves previews inline instead of as an attachment", () => {
    const header = contentDisposition("video.mp4", "inline");
    expect(header.startsWith('inline; filename="video.mp4"')).toBe(true);
  });
});
