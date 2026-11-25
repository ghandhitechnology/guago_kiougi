/**
 * Client requests for item and currency operations, independent of the transport (PLAN §21):
 * the HTTP route and the WorldRoom both hand messages here. A request is checked against its
 * schema, limited per type and character, and run by the executor under the character the
 * session belongs to. Every request gets exactly one `OpResult` with its id.
 */
import {
  type InventorySnapshot,
  OP_RATE,
  type OpMessage,
  type OpName,
  type OpResult,
  parseOpMessage,
} from "@guago/shared";
import type { Db } from "../db/index.ts";
import type { Executor } from "./executor.ts";
import { readInventory } from "./reads.ts";

interface Bucket {
  tokens: number;
  at: number;
}

export interface OpHandlerOptions {
  db: Db;
  executor: Executor;
  now?: () => number;
  /** The live Page (see `ExecutorOptions.page`). */
  page?: () => number;
}

const KIT_OP = "kit";

export function createOpHandler({
  db,
  executor,
  now = Date.now,
  page = () => 1,
}: OpHandlerOptions) {
  const buckets = new Map<string, Bucket>();
  let sweptAt = 0;

  /** Token bucket per character and operation: 0 when it may go ahead, else ms to wait. */
  function take(characterId: string, op: OpName, at: number): number {
    const { burst, perSecond } = OP_RATE[op] ?? OP_RATE.default;
    const key = `${characterId}\u0000${op}`;
    const bucket = buckets.get(key) ?? { tokens: burst, at };
    bucket.tokens = Math.min(burst, bucket.tokens + ((at - bucket.at) / 1000) * perSecond);
    bucket.at = at;
    buckets.set(key, bucket);
    if (at - sweptAt > 60_000) sweep(at);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - bucket.tokens) / perSecond) * 1000);
  }

  /** Drops buckets that have refilled: they hold nothing a fresh one would not. */
  function sweep(at: number): void {
    sweptAt = at;
    for (const [key, b] of buckets) if (at - b.at > 60_000) buckets.delete(key);
  }

  /** A message that already passed its schema. */
  async function run(characterId: string, message: OpMessage): Promise<OpResult> {
    const retryMs = take(characterId, message.op, now());
    if (retryMs > 0) {
      return { id: message.id, op: message.op, ok: false, error: "rate_limited", retryMs };
    }
    try {
      // Only client operations parse, so the result names one.
      return (await executor.execute(characterId, message.id, message.op, message.req)) as OpResult;
    } catch {
      // Logged by the executor. Nothing was recorded, so a retry of the same id may still land.
      return { id: message.id, op: message.op, ok: false, error: "server_error" };
    }
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

    /**
     * The login read. A character made before items existed gets its starter kit first, under
     * the same operation id character creation uses, so it can only ever be given once.
     */
    async snapshot(characterId: string): Promise<InventorySnapshot | null> {
      const read = () => readInventory(db, characterId, new Date(now()), page());
      const snapshot = await read();
      if (snapshot) return snapshot;
      const kit = await executor.execute(characterId, KIT_OP, "kit", {});
      return kit.ok ? read() : null;
    },
  };
}

export type OpHandler = ReturnType<typeof createOpHandler>;

/** Character creation runs this inside its own transaction. */
export const KIT_OPERATION_ID = KIT_OP;
