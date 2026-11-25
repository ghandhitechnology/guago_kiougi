/**
 * `GET /api/inventory` and `POST /api/op` (shared `API`): the same handler the WorldRoom uses,
 * over HTTP, for tools and tests.
 */
import { API } from "@guago/shared";
import type { ApiRoute } from "../auth/http.ts";
import type { AuthService } from "../auth/service.ts";
import type { OpHandler } from "./handler.ts";

export function economyRoutes(auth: AuthService, ops: OpHandler): ApiRoute {
  return async (ctx) => {
    const inventory = ctx.method === "GET" && ctx.path === API.inventory;
    const op = ctx.method === "POST" && ctx.path === API.op;
    if (!inventory && !op) return false;
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
      const snapshot = await ops.snapshot(character.id);
      if (snapshot) ctx.send(200, snapshot);
      else ctx.error("server_error");
      return true;
    }
    ctx.send(200, await ops.handle(character.id, await ctx.readJson()));
    return true;
  };
}
