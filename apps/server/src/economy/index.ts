/**
 * The persistent inventory and wallet (PLAN §8, §13, §19 to §22): one executor every change
 * goes through, the client request handler on top of it, batched combat grants and the reads.
 */
import { sql } from "drizzle-orm";
import type { ApiRoute } from "../auth/http.ts";
import type { AuthService } from "../auth/service.ts";
import type { Db } from "../db/index.ts";
import {
  createExecutor,
  type ExecutorOptions,
  OPERATION_DAYS,
  type Queryable,
} from "./executor.ts";
import { GrantBuffer } from "./grants.ts";
import { createOpHandler, KIT_OPERATION_ID } from "./handler.ts";
import { economyRoutes } from "./routes.ts";

export function createEconomy(db: Db, options: ExecutorOptions = {}) {
  const executor = createExecutor(db, options);
  const ops = createOpHandler({
    db,
    executor,
    ...(options.page ? { page: options.page } : {}),
    ...(options.now ? { now: () => (options.now as () => Date)().getTime() } : {}),
  });
  const grants = new GrantBuffer(executor);
  return {
    executor,
    ops,
    grants,

    /** For `createAuthService({ onCharacterCreated })`: the 신입생 kit, inside creation. */
    async giveKit(tx: Queryable, characterId: string): Promise<void> {
      const result = await executor.execute(characterId, KIT_OPERATION_ID, "kit", {}, { tx });
      if (!result.ok) throw new Error(`starter kit refused: ${result.error}`);
    },

    routes(auth: AuthService): ApiRoute[] {
      return [economyRoutes(auth, ops)];
    },

    /** Forgets operation ids past `OPERATION_DAYS`. The kit's id is kept for good. */
    async prune(): Promise<void> {
      await db.execute(sql`
        delete from operations
        where at < now() - make_interval(days => ${OPERATION_DAYS}) and op_id <> ${KIT_OPERATION_ID}`);
    },
  };
}

export type Economy = ReturnType<typeof createEconomy>;
