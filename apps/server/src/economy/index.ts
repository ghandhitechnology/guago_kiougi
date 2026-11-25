/**
 * The persistent inventory and wallet (PLAN §8, §13, §19 to §22): one executor every change
 * goes through, the client request handler on top of it, batched combat grants and the reads.
 */
import type { ChangeNotice } from "@guago/shared";
import { sql } from "drizzle-orm";
import type { ApiRoute } from "../auth/http.ts";
import type { AuthService } from "../auth/service.ts";
import type { Db } from "../db/index.ts";
import {
  createExecutor,
  type ExecutorOptions,
  livePage,
  OPERATION_RETENTION_MINUTES,
  type Queryable,
} from "./executor.ts";
import { GrantBuffer, type GrantBufferOptions } from "./grants.ts";
import { createOpHandler, KIT_OPERATION_ID } from "./handler.ts";
import { economyRoutes } from "./routes.ts";

/**
 * Forgets operation ids past `OPERATION_RETENTION_MINUTES`, except the kit's and `keep` (grant
 * batches still in flight). Returns how many were forgotten.
 */
export async function pruneOperations(db: Db, keep: readonly string[]): Promise<number> {
  const { rowCount } = await db.execute(sql`
    delete from operations
    where at < now() - make_interval(mins => ${OPERATION_RETENTION_MINUTES})
      and op_id <> ${KIT_OPERATION_ID}
      and not (op_id = any(${sql.param([...keep])}::text[]))`);
  return rowCount ?? 0;
}

export interface EconomyOptions extends ExecutorOptions {
  /** A change the player did not ask for landed (a combat grant): its notice, for the client. */
  onChange?(characterId: string, change: ChangeNotice): void;
  /** Combat credit accepted (`GrantBufferOptions.onCredit`). */
  onCredit?: GrantBufferOptions["onCredit"];
}

export function createEconomy(db: Db, options: EconomyOptions = {}) {
  // One live Page for the rules and the reads.
  const page = options.page ?? livePage;
  const executor = createExecutor(db, { ...options, page });
  const ops = createOpHandler({
    db,
    executor,
    page,
    ...(options.now ? { now: () => (options.now as () => Date)().getTime() } : {}),
  });
  const grants = new GrantBuffer(executor, {
    ...(options.onChange ? { onLanded: options.onChange } : {}),
    ...(options.onCredit ? { onCredit: options.onCredit } : {}),
  });
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

    /**
     * Forgets old operation ids; see `pruneOperations`. Run every few minutes. `keep` adds the
     * in-flight ids of other batching buffers (the living world's quest progress).
     */
    prune(keep: readonly string[] = []): Promise<number> {
      return pruneOperations(db, [...grants.inflightIds(), ...keep]);
    },
  };
}

export type Economy = ReturnType<typeof createEconomy>;
