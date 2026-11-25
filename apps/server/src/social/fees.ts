/**
 * The 동아리 founding fee (PLAN §12, §13), through the item executor: the fee is its internal
 * `club.found` operation (economy/ops.ts) run inside the founding transaction, so the fee and the
 * new club commit together or not at all. Nothing here touches a wallet any other way.
 *
 * A retry under the same operation id finds its club before anything is charged (`replay`), so
 * it pays nothing even after the executor has forgotten the id; two copies racing meet at the
 * executor's character lock, and the second finds the first's record and club.
 */
import { type LedgerEntry, type Purse, payClubFee } from "@guago/shared";
import type { Db } from "../db/index.ts";
import type { Executor } from "../economy/executor.ts";
import type { Tx } from "./tx.ts";

export type FeeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "insufficient" | "op_id_reused" };

export interface FeePath {
  /**
   * Opens one transaction. `replay` runs first: a value from it means the operation already
   * happened, and nothing is charged. Otherwise the fee is taken under `opId` and `work` runs;
   * a throw from `work` rolls the fee back.
   */
  withFee<T>(
    characterId: string,
    opId: string,
    work: (tx: Tx) => Promise<T>,
    replay: (tx: Tx) => Promise<T | undefined>,
  ): Promise<FeeResult<T>>;
}

/** The fee as one executor operation in the founding transaction. */
export function executorFees(db: Db, executor: Executor): FeePath {
  return {
    withFee: (characterId, opId, work, replay) =>
      db.transaction(async (tx) => {
        const prior = await replay(tx);
        if (prior !== undefined) return { ok: true, value: prior };
        const paid = await executor.execute(characterId, opId, "club.found", {}, { tx });
        if (!paid.ok) {
          if (paid.error === "insufficient" || paid.error === "op_id_reused") {
            return { ok: false, error: paid.error };
          }
          throw new Error(`club fee refused: ${paid.error}`);
        }
        return { ok: true, value: await work(tx) };
      }),
  };
}

/**
 * The executor's contract in memory, for tests and the scripted run: one operation at a time per
 * character (the executor's character lock), a known id answered from its record, and the purse
 * moved only when the transaction commits.
 */
export class MemoryWallet implements FeePath {
  readonly ledger: (LedgerEntry & { characterId: string; opId: string })[] = [];
  private readonly purses = new Map<string, Purse>();
  private readonly done = new Map<string, boolean>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly db: Db;
  private readonly page: () => number;

  constructor(db: Db, options: { page?: () => number } = {}) {
    this.db = db;
    this.page = options.page ?? (() => 1);
  }

  credit(characterId: string, pinecones: number): void {
    const purse = this.purses.get(characterId) ?? {};
    this.purses.set(characterId, { ...purse, pinecone: (purse.pinecone ?? 0) + pinecones });
  }

  balance(characterId: string): number {
    return this.purses.get(characterId)?.pinecone ?? 0;
  }

  withFee<T>(
    characterId: string,
    opId: string,
    work: (tx: Tx) => Promise<T>,
    replay: (tx: Tx) => Promise<T | undefined>,
  ): Promise<FeeResult<T>> {
    const run = async (): Promise<FeeResult<T>> => {
      const key = `${characterId}\u0000${opId}`;
      const known = this.done.get(key);
      const out = await this.db.transaction(async (tx) => {
        const prior = await replay(tx);
        if (prior !== undefined) return { value: prior };
        if (known === false) return { refused: true as const };
        if (known === true) return { value: await work(tx) };
        const paid = payClubFee(this.purses.get(characterId) ?? {}, this.page());
        if (!paid.ok) return { refused: true as const };
        return { value: await work(tx), paid };
      });
      if ("refused" in out) {
        this.done.set(key, false);
        return { ok: false, error: "insufficient" };
      }
      if (out.paid) {
        this.purses.set(characterId, out.paid.purse);
        this.ledger.push(...out.paid.ledger.map((e) => ({ ...e, characterId, opId })));
        this.done.set(key, true);
      }
      return { ok: true, value: out.value };
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
