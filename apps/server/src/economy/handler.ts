/**
 * Client requests for item and currency operations, independent of the transport (PLAN §21):
 * the HTTP route and the WorldRoom both hand messages here. A request is checked against its
 * schema, limited per type and character, and run by the executor under the character the
 * session belongs to. Every request gets exactly one `OpResult` with its id.
 */
import {
  INVENTORY_RATE,
  type InventorySnapshot,
  isFinalResult,
  OP_RATE,
  OP_REFUSAL_RATE,
  OP_TOTAL_RATE,
  type OpMessage,
  type OpResult,
  parseOpMessage,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { Buckets } from "./buckets.ts";
import { type Executor, livePage } from "./executor.ts";
import { readInventory } from "./reads.ts";

export interface OpHandlerOptions {
  db: Db;
  executor: Executor;
  now?: () => number;
  /** The live Page; the executor's `page` must be the same function. */
  page?: () => number;
}

const KIT_OP = "kit";

export function createOpHandler({
  db,
  executor,
  now = Date.now,
  page = livePage,
}: OpHandlerOptions) {
  const buckets = new Buckets();

  /**
   * A message that already passed its schema. It waits for three budgets of its character: its
   * type's, all types' together, and recorded refusals'. Over any of them it is answered
   * `rate_limited` and neither run nor recorded.
   */
  async function run(characterId: string, message: OpMessage): Promise<OpResult> {
    const at = now();
    const rate = OP_RATE[message.op] ?? OP_RATE.default;
    const keys = {
      type: `${characterId}\u0000${message.op}`,
      all: `${characterId}\u0000*`,
      refused: `${characterId}\u0000refused`,
    };
    const retryMs = Math.max(
      buckets.wait(keys.type, rate, at),
      buckets.wait(keys.all, OP_TOTAL_RATE, at),
      buckets.wait(keys.refused, OP_REFUSAL_RATE, at),
    );
    if (retryMs > 0) {
      return { id: message.id, op: message.op, ok: false, error: "rate_limited", retryMs };
    }
    buckets.spend(keys.type, rate, at);
    buckets.spend(keys.all, OP_TOTAL_RATE, at);
    let result: OpResult;
    try {
      // Only client operations parse, so the result names one.
      result = (await executor.execute(
        characterId,
        message.id,
        message.op,
        message.req,
      )) as OpResult;
    } catch {
      // Logged by the executor. Nothing was recorded, so a retry of the same id may still land.
      return { id: message.id, op: message.op, ok: false, error: "server_error" };
    }
    if (!result.ok && isFinalResult(result)) buckets.spend(keys.refused, OP_REFUSAL_RATE, now());
    return result;
  }

  return {
    run,

    /** A raw body: anything malformed is answered `bad_request`. */
    async handle(characterId: string, raw: unknown): Promise<OpResult> {
      const message = parseOpMessage(raw);
      if (message) return run(characterId, message);
      const id = (raw as { id?: unknown } | null)?.id;
      return {
        id: typeof id === "string" ? id.slice(0, 64) : "",
        op: null,
        ok: false,
        error: "bad_request",
      };
    },

    /** Milliseconds until the character may read its inventory again; 0 now, and it counts. */
    inventoryWait(characterId: string): number {
      return buckets.take(`${characterId}\u0000inventory`, INVENTORY_RATE, now());
    },

    /**
     * The login read. A character made before items existed gets its starter kit first, under
     * the same operation id character creation uses, so it can only ever be given once.
     */
    async snapshot(characterId: string): Promise<InventorySnapshot | null> {
      const given = await db.execute(
        sql`select 1 from operations where character_id = ${characterId} and op_id = ${KIT_OP}`,
      );
      if (given.rows.length === 0) {
        const kit = await executor.execute(characterId, KIT_OP, "kit", {});
        if (!kit.ok) return null;
      }
      return readInventory(db, characterId, new Date(now()), page());
    },
  };
}

export type OpHandler = ReturnType<typeof createOpHandler>;

/** Character creation runs this inside its own transaction. */
export const KIT_OPERATION_ID = KIT_OP;
