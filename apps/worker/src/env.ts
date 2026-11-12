/**
 * Bindings available to the Worker. Secret values are injected by Wrangler
 * (`wrangler secret put <NAME>` in production, `.dev.vars` in local dev).
 */
export interface Env {
  /** Static assets binding declared in wrangler.jsonc. */
  ASSETS: Fetcher;
  /** KV namespace used for resolve caching and per-IP rate limiting. */
  CACHE: KVNamespace;
  /** Bearer token required by /api/resolve. */
  ACCESS_TOKEN?: string;
  /** HMAC key for signed download links. */
  SIGNING_SECRET?: string;
  /** Base URL of a cobalt-compatible instance used as fallback. */
  UPSTREAM_URL?: string;
  /** Optional API key for the upstream instance. */
  UPSTREAM_API_KEY?: string;
}
