/**
 * `GET /api/inventory` and `POST /api/op` (shared `API`): the same handler the WorldRoom uses,
 * over HTTP, for tools and tests. Both are limited per address before the session is looked up,
 * and per character after.
 */
import { API, type OpRate } from "@guago/shared";
import type { ApiRoute } from "../auth/http.ts";
import type { AuthService } from "../auth/service.ts";
import { Buckets } from "./buckets.ts";
import type { OpHandler } from "./handler.ts";

/** Requests per address to these two routes: room for a school network behind one IP. */
export const ECONOMY_HTTP_FLOOD: OpRate = { burst: 60, perSecond: 30 };

export function economyRoutes(auth: AuthService, ops: OpHandler): ApiRoute {
  const flood = new Buckets();
  return async (ctx) => {
    const inventory = ctx.method === "GET" && ctx.path === API.inventory;
    const op = ctx.method === "POST" && ctx.path === API.op;
    if (!inventory && !op) return false;
    if (flood.take(ctx.ip, ECONOMY_HTTP_FLOOD, Date.now()) > 0) {
      ctx.error("rate_limited");
      return true;
    }
    const me = await ctx.account();
    if (!me) {
      ctx.error("unauthorized");
      return true;
    }
    const character = await auth.characterOf(me.account.id);
    if (!character) {
      ctx.error("forbidden");
      return true;
    }
    if (inventory) {
      if (ops.inventoryWait(character.id) > 0) {
        ctx.error("rate_limited");
        return true;
      }
      const snapshot = await ops.snapshot(character.id);
      if (snapshot) ctx.send(200, snapshot);
      else ctx.error("server_error");
      return true;
    }
    ctx.send(200, await ops.handle(character.id, await ctx.readJson()));
    return true;
  };
}
