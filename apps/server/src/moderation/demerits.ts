/**
 * Where a confirmed filter strike's 벌점 goes (PLAN §11: +3). The 벌점 system itself (명령퇴사 at
 * 20, 상점 cancelling 벌점) is built on `feat/live-server`; when it lands, it calls
 * `provideDemerits` once at start with its own function, which then runs inside the strike's
 * transaction. Until then the strike adds to `characters.demerits` directly.
 */
import { sql } from "drizzle-orm";
import type { Queryable } from "../economy/executor.ts";

/** PLAN §11 "Chat filter strike confirmed by an admin". */
export const STRIKE_DEMERITS = 3;

export interface DemeritAward {
  characterId: string;
  amount: number;
  /** Why, for the 벌점 system's own records: `filter_strike`. */
  reason: "filter_strike";
  /** The `filter_strikes` row. */
  ref: number;
}

/** Runs inside the caller's transaction: the 벌점 and the strike commit together or not at all. */
export type DemeritSink = (tx: Queryable, award: DemeritAward) => Promise<void>;

const addToColumn: DemeritSink = async (tx, { characterId, amount }) => {
  await tx.execute(
    sql`update characters set demerits = demerits + ${amount}, updated_at = now() where id = ${characterId}`,
  );
};

let sink: DemeritSink = addToColumn;

/** The live-server lane's 벌점 function plugs in here. */
export function provideDemerits(next: DemeritSink): void {
  sink = next;
}

export function awardDemerits(tx: Queryable, award: DemeritAward): Promise<void> {
  return sink(tx, award);
}
