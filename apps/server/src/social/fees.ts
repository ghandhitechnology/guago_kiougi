/**
 * The 동아리 founding fee (PLAN §12, §13). Every 솔방울 change goes through the item executor
 * (branch `feat/item-operations`): the fee is one executor operation run inside the founding
 * transaction, so the fee and the new club commit together or not at all, and a retry under the
 * same operation id charges nothing. Nothing here touches a wallet outside that path.
 *
 * Until the executor is on main, `MemoryWallet` stands in for tests and the scripted run. Wiring
 * the real one is these lines once both branches meet:
 *
 *   // economy/ops.ts: InternalRequests gains `"club.found": Record<string, never>`, and OPS:
 *   "club.found": {
 *     client: false,
 *     rows: () => ({}),
 *     currencies: () => ["pinecone"],
 *     apply(l, _req, env) {
 *       const r = payClubFee(l.purse, env.page);
 *       return r.ok ? ok({ purse: r.purse, ledger: r.ledger }) : no(r.error);
 *     },
 *   },
 *
 *   // index.ts: createSocial({ ..., fees: executorFees(db, economy.executor) })
 *   export function executorFees(db: Db, executor: Executor): FeePath {
 *     return {
 *       withFee: (characterId, opId, work) =>
 *         db.transaction(async (tx) => {
 *           const paid = await executor.execute(characterId, opId, "club.found", {}, { tx });
 *           if (!paid.ok) return { ok: false, error: paid.error === "op_id_reused" ? "op_id_reused" : "insufficient" };
 *           return { ok: true, value: await work(tx) };
 *         }),
 *     };
 *   }
 */
import { type LedgerEntry, type Purse, payClubFee } from "@guago/shared";
import type { Db } from "../db/index.ts";
import type { Tx } from "./tx.ts";

export type FeeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "insufficient" | "op_id_reused" };

export interface FeePath {
  /**
   * Opens one transaction, takes the founding fee in it under `opId` and runs `work` in it. A
   * throw from `work` rolls the fee back. An `opId` already paid takes nothing and runs `work`
   * again, which finds what the first run made.
   */
  withFee<T>(
    characterId: string,
    opId: string,
    work: (tx: Tx) => Promise<T>,
  ): Promise<FeeResult<T>>;
}

/**
 * The executor's contract in memory: one operation at a time per character (the executor's
 * character row lock), a known id answered from its record, and the purse moved only when the
 * transaction commits.
 */
export class MemoryWallet implements FeePath {
  readonly ledger: (LedgerEntry & { characterId: string; opId: string })[] = [];
  private readonly purses = new Map<string, Purse>();
  private readonly done = new Map<string, boolean>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly db: Db;
  private readonly page: () => number;
  private readonly seed: number;

  /** `seed`: 솔방울 each character's purse starts with (local play only). */
  constructor(db: Db, options: { page?: () => number; seed?: number } = {}) {
    this.db = db;
    this.page = options.page ?? (() => 1);
    this.seed = options.seed ?? 0;
  }

  credit(characterId: string, pinecones: number): void {
    const purse = this.purseOf(characterId);
    this.purses.set(characterId, { ...purse, pinecone: (purse.pinecone ?? 0) + pinecones });
  }

  balance(characterId: string): number {
    return this.purseOf(characterId).pinecone ?? 0;
  }

  private purseOf(characterId: string): Purse {
    return this.purses.get(characterId) ?? { pinecone: this.seed };
  }

  withFee<T>(characterId: string, opId: string, work: (tx: Tx) => Promise<T>) {
    const run = async (): Promise<FeeResult<T>> => {
      const key = `${characterId}\u0000${opId}`;
      const known = this.done.get(key);
      if (known === false) return { ok: false, error: "insufficient" };
      if (known === true) return { ok: true, value: await this.db.transaction(work) };
      const paid = payClubFee(this.purseOf(characterId), this.page());
      if (!paid.ok) {
        this.done.set(key, false);
        return paid;
      }
      const value = await this.db.transaction(work);
      this.purses.set(characterId, paid.purse);
      this.ledger.push(...paid.ledger.map((e) => ({ ...e, characterId, opId })));
      this.done.set(key, true);
      return { ok: true, value };
    };
    const before = this.queues.get(characterId) ?? Promise.resolve();
    const mine = before.then(run, run);
    const tail = mine.catch(() => {});
    this.queues.set(characterId, tail);
    void tail.then(() => {
      if (this.queues.get(characterId) === tail) this.queues.delete(characterId);
    });
    return mine;
  }
}

/** No wallet yet: every founding is refused as unaffordable, so no club is ever free. */
export const closedFees: FeePath = {
  withFee: async () => ({ ok: false, error: "insufficient" }),
};
