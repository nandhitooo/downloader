import type { Platform } from "@app/shared";
import { MediaError } from "./errors";

/** Public hosts accepted per platform (subdomains are allowed). */
export const PLATFORM_HOSTS: Record<Platform, readonly string[]> = {
  tiktok: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  x: ["x.com", "twitter.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.watch"],
  threads: ["threads.net", "threads.com"],
};

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

/** Exact host or any subdomain of an allowlisted entry. */
export function isHostAllowed(
  hostname: string,
  allowlist: readonly string[],
): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;

  return allowlist.some((entry) => {
    const allowed = normalizeHost(entry);
    return (
      allowed.length > 0 && (host === allowed || host.endsWith(`.${allowed}`))
    );
  });
}

/** Rejects IP literals, localhost and single-label (intranet) hostnames. */
export function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host.startsWith("[") || host.includes(":") || host.includes("%")) {
    return true; // IPv6 literal or zone id
  }
  if (IPV4.test(host)) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (!host.includes(".")) return true;
  return false;
}

/** Parses a user-supplied URL and enforces https plus the SSRF guards. */
export function parseTargetUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new MediaError("INVALID_URL");
  }

  if (url.protocol !== "https:") throw new MediaError("INVALID_URL");
  if (url.username || url.password) throw new MediaError("INVALID_URL");
  if (isBlockedHostname(url.hostname)) throw new MediaError("INVALID_URL");

  return url;
}

/** Detects the platform for a public post URL. */
export function detectPlatform(input: string): {
  url: URL;
  platform: Platform;
} {
  const url = parseTargetUrl(input);

  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS)) {
    if (isHostAllowed(url.hostname, hosts)) {
      return { url, platform: platform as Platform };
    }
  }

  throw new MediaError("UNSUPPORTED");
}
