/**
 * Keeping `economy_ledger` small (PLAN §13 "Keeping the economy healthy", §19 persistence).
 *
 * - Combat grants are coalesced as they are written (executor `write`): one row per character,
 *   Korean day, currency and source, so a horde costs a few dozen rows per player per day
 *   instead of one per flush and source.
 * - Every closed day is rolled up into `economy_daily_totals`, which the admin page's daily
 *   totals read through the `economy_daily` view.
 * - Per-operation rows are kept `LEDGER_RAW_DAYS`, the same window as the chat log, so a
 *   moderator looking into a report sees chat and economic history over the same days. After
 *   that each day is compacted to one row per character, currency and source. Item rows stay
 *   as they are: they are few, and the audit follows each item through them.
 *
 * Compaction keeps every sum: a wallet still equals its ledger and each day still totals the
 * same, so the audit holds before, during and after a run.
 */
import { koreanDay } from "@guago/shared";
import { sql } from "drizzle-orm";
import { type Db, describeError } from "../db/index.ts";

export const LEDGER_RAW_DAYS = 90;
const MAINTAIN_EVERY_MS = 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

/**
 * Days are Korean calendar days by the server clock (live/clock.ts), the clock every operation
 * books its `day` by, so a test server running fast rolls up and compacts its own days.
 */
type Clock = () => number;
const today = (now: Clock) => sql`${koreanDay(now())}::date`;

/**
 * Rolls up every closed day not yet in the table, and the last two rolled again (a transaction
 * that began before midnight may land just after). Returns the days written.
 */
export async function rollUpDays(db: Db, now: Clock = Date.now): Promise<number> {
  const KST_TODAY = today(now);
  const { rows } = await db.execute(sql`
    select coalesce(
      (select max(day) - 1 from economy_daily_totals),
      (select min(day) from economy_ledger)) as start,
      ${KST_TODAY} as today`);
  const start = rows[0]?.start as string | null;
  if (!start) return 0;
  // Recomputed whole, so a run that repeats a day writes the same rows.
  const done = await db.transaction(async (tx) => {
    await tx.execute(sql`
      delete from economy_daily_totals where day between ${start}::date and ${KST_TODAY} - 1`);
    return tx.execute(sql`
      insert into economy_daily_totals (day, currency, source_or_sink, amount, entries)
      select day, currency, source_or_sink, sum(amount), sum(entries)::bigint
      from economy_ledger
      where day between ${start}::date and ${KST_TODAY} - 1
      group by day, currency, source_or_sink
      returning day`);
  });
  return new Set(done.rows.map((r) => r.day)).size;
}

/** Compacts per-operation rows of days past retention, one day per transaction. */
export async function compactLedger(
  db: Db,
  now: Clock = Date.now,
  rawDays = LEDGER_RAW_DAYS,
): Promise<number> {
  const KST_TODAY = today(now);
  let compacted = 0;
  for (;;) {
    const { rows } = await db.execute(sql`
      select min(day)::text as day from economy_ledger
      where not coalesced and item_id is null and day < ${KST_TODAY} - ${rawDays}::int`);
    const day = rows[0]?.day as string | null;
    if (!day) return compacted;
    await db.execute(sql`
      with gone as (
        delete from economy_ledger
        where day = ${day}::date and not coalesced and item_id is null
        returning character_id, currency, source_or_sink, amount, at
      )
      insert into economy_ledger
        (day, at, character_id, operation_id, currency, source_or_sink, amount, coalesced, entries)
      select ${day}::date, max(at), character_id, 'compacted', currency, source_or_sink,
        sum(amount), true, count(*)::int
      from gone group by character_id, currency, source_or_sink
      having sum(amount) <> 0
      on conflict (character_id, day, currency, source_or_sink) where coalesced
      do update set amount = economy_ledger.amount + excluded.amount,
        entries = economy_ledger.entries + excluded.entries`);
    compacted++;
  }
}

/** Rolls up and compacts now and every hour, sooner again after a failure. Returns the stop. */
export function startLedgerMaintenance(db: Db, now: Clock = Date.now): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const run = async () => {
    let next = MAINTAIN_EVERY_MS;
    try {
      await rollUpDays(db, now);
      await compactLedger(db, now);
    } catch (error) {
      console.error(`ledger maintenance failed: ${describeError(error)}`);
      next = RETRY_MS;
    }
    if (!stopped) {
      timer = setTimeout(run, next);
      timer.unref();
    }
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
