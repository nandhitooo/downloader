import { createMiddleware } from "hono/factory";
import type { Env } from "./env";
import { MediaError } from "./errors";
import { timingSafeEqualStrings } from "./sign";

/** Requires `Authorization: Bearer <ACCESS_TOKEN>`; fails closed if unset. */
export const requireAccessToken = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const expected = c.env.ACCESS_TOKEN?.trim();
    if (!expected) {
      throw new MediaError(
        "UNAUTHORIZED",
        "ACCESS_TOKEN belum dikonfigurasi di Worker.",
      );
    }

    const header = (c.req.header("Authorization") ?? "").trim();
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const provided = match?.[1]?.trim() ?? "";

    if (!provided || !(await timingSafeEqualStrings(provided, expected))) {
      throw new MediaError("UNAUTHORIZED");
    }

    await next();
  },
);
