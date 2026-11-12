import { describe, expect, it } from "vitest";
import { MediaError } from "../src/errors";
import {
  DOWNLOAD_TOKEN_TTL_SECONDS,
  signToken,
  timingSafeEqualStrings,
  verifyToken,
} from "../src/sign";

const SECRET = "test-signing-secret";
const NOW = 1_800_000_000;

function base64UrlBody(token: string): string {
  const body = token.split(".")[0];
  if (!body) throw new Error("token has no payload");
  return body;
}

describe("signToken / verifyToken", () => {
  it("round-trips a payload", async () => {
    const payload = {
      u: "https://video.twimg.com/amplify_video/1/vid/avc1/720x1280/a.mp4",
      fn: "nasa-1.mp4",
      exp: NOW + DOWNLOAD_TOKEN_TTL_SECONDS,
    };

    const token = await signToken(payload, SECRET);
    const verified = await verifyToken(token, SECRET, NOW);

    expect(verified).toEqual(payload);
  });

  it("produces base64url without padding or reserved characters", async () => {
    const token = await signToken(
      { u: "https://pbs.twimg.com/media/a.jpg", fn: "foto.jpg", exp: NOW + 60 },
      SECRET,
    );

    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("=");
  });

  it("rejects a tampered payload", async () => {
    const token = await signToken(
      { u: "https://pbs.twimg.com/media/a.jpg", fn: "foto.jpg", exp: NOW + 60 },
      SECRET,
    );
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({
        u: "https://evil.test/a.jpg",
        fn: "evil.jpg",
        exp: NOW + 60,
      }),
    )
      .toString("base64url");

    await expect(
      verifyToken(`${forgedBody}.${signature ?? ""}`, SECRET, NOW),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a tampered signature", async () => {
    const token = await signToken(
      { u: "https://pbs.twimg.com/media/a.jpg", fn: "foto.jpg", exp: NOW + 60 },
      SECRET,
    );
    const body = base64UrlBody(token);
    const tampered = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    await expect(verifyToken(tampered, SECRET, NOW)).rejects.toBeInstanceOf(
      MediaError,
    );
  });

  it("rejects an expired token", async () => {
    const token = await signToken(
      { u: "https://pbs.twimg.com/media/a.jpg", fn: "foto.jpg", exp: NOW - 1 },
      SECRET,
    );

    await expect(verifyToken(token, SECRET, NOW)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Tautan unduhan sudah kedaluwarsa.",
    });
  });

  it("rejects a different secret", async () => {
    const token = await signToken(
      { u: "https://pbs.twimg.com/media/a.jpg", fn: "foto.jpg", exp: NOW + 60 },
      SECRET,
    );

    await expect(verifyToken(token, "other-secret", NOW)).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });

  it("rejects malformed tokens", async () => {
    await expect(verifyToken("bogus", SECRET, NOW)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(verifyToken("a.b.c", SECRET, NOW)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("timingSafeEqualStrings", () => {
  it("compares equal and unequal values", async () => {
    expect(await timingSafeEqualStrings("token", "token")).toBe(true);
    expect(await timingSafeEqualStrings("token", "tokeN")).toBe(false);
    expect(await timingSafeEqualStrings("token", "token-longer")).toBe(false);
  });
});
