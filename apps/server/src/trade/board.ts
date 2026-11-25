/**
 * The 매점 게시판's reads and its clock (PLAN §13). Every time here is the server clock's
 * (live/clock.ts), the one the executor stamps listings with: browsing live listings by category or item,
 * sorted by price and paged by a cursor so every page is one index range; a player's own
 * listings; 14 days of price history; and the sweeper that returns expired listings to their
 * sellers.
 *
 * Expiry runs through the executor like any other operation, one per listing under the id
 * `expire:<listing>`, so it applies once however many sweepers or restarts see it. The sweeper
 * asks the database which listings are past their time, so a server that was down at the hour
 * returns them all on its first sweep; until then they cannot be bought (`listing_expired`),
 * and cancelling one returns it the same way.
 */

import {
  type BoardRequests,
  type ChangeNotice,
  type ListingView,
  type PriceDay,
  TRADE,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import { guarded } from "../background.ts";
import { type Db, describeError } from "../db/index.ts";
import type { Executor } from "../economy/executor.ts";
import { timeFromDb } from "../economy/rows.ts";

const SWEEP_EVERY_MS = 30_000;
const SWEEP_BATCH = 200;
/** Closed listings stay this long in `listing.mine`; the trade log keeps the sale for good. */
const CLOSED_KEPT_DAYS = 14;

function view(r: Record<string, unknown>, withState = false): ListingView {
  return {
    id: r.id as string,
    seller: { id: r.seller_id as string, name: r.seller_name as string },
    category: r.category as ListingView["category"],
    def: r.def_id as string,
    grade: r.grade as number,
    qty: Number(r.qty),
    unitPrice: r.unit_price as string,
    createdAt: (timeFromDb(r.created_at) as Date).toISOString(),
    expiresAt: (timeFromDb(r.expires_at) as Date).toISOString(),
    item: (r.item as ListingView["item"]) ?? null,
    ...(withState ? { state: r.state as NonNullable<ListingView["state"]> } : {}),
  };
}

const VIEW_COLUMNS = sql.raw(`l.id, l.seller_id, c.name as seller_name, l.category, l.def_id,
  l.grade, l.qty, l.unit_price::text as unit_price, l.created_at, l.expires_at, l.item, l.state`);

/** One page of live listings, cheapest (or dearest) first; none of sellers `viewer` blocked. */
export async function browseListings(
  db: Db,
  req: BoardRequests["listing.browse"],
  viewer?: string,
  now: Date = new Date(),
): Promise<{ listings: ListingView[]; next: string | null }> {
  const size = TRADE.board.pageSize;
  const desc = req.sort === "-price";
  const [afterPrice, afterId] = req.after ? (req.after.split(/:(.*)/s) as [string, string]) : [];
  const after = req.after
    ? desc
      ? sql`and (l.unit_price, l.id) < (${afterPrice}::numeric, ${afterId}::uuid)`
      : sql`and (l.unit_price, l.id) > (${afterPrice}::numeric, ${afterId}::uuid)`
    : sql``;
  const order = desc ? sql.raw("l.unit_price desc, l.id desc") : sql.raw("l.unit_price, l.id");
  const { rows } = await db.execute(sql`
    select ${VIEW_COLUMNS}
    from listings l join characters c on c.id = l.seller_id
    where l.state = 'live' and l.expires_at > ${now.toISOString()}::timestamptz
      and (${req.category ?? null}::text is null or l.category = ${req.category ?? null})
      and (${req.def ?? null}::text is null or l.def_id = ${req.def ?? null})
      and (${req.grade ?? null}::smallint is null or l.grade = ${req.grade ?? null})
      ${after}
      and not exists (
        select 1 from blocks b where b.character_id = ${viewer ?? null}::uuid and b.other_id = l.seller_id)
    order by ${order}
    limit ${size + 1}`);
  const page = rows.slice(0, size).map((r) => view(r));
  const last = page.at(-1);
  return {
    listings: page,
    next: rows.length > size && last ? `${last.unitPrice}:${last.id}` : null,
  };
}

/** The seller's live listings and those closed in the last two weeks, newest first. */
export async function myListings(
  db: Db,
  sellerId: string,
  now: Date = new Date(),
): Promise<ListingView[]> {
  const { rows } = await db.execute(sql`
    select ${VIEW_COLUMNS}
    from listings l join characters c on c.id = l.seller_id
    where l.seller_id = ${sellerId}
      and (l.state = 'live'
        or l.closed_at > ${now.toISOString()}::timestamptz - make_interval(days => ${CLOSED_KEPT_DAYS}))
    order by l.created_at desc
    limit 100`);
  return rows.map((r) => view(r, true));
}

/** Sales per Korean day over the last 14 days of one item (and grade, for books). */
export async function priceHistory(
  db: Db,
  req: BoardRequests["listing.history"],
  now: Date = new Date(),
): Promise<PriceDay[]> {
  const { rows } = await db.execute(sql`
    select (at at time zone 'Asia/Seoul')::date::text as day, sum(qty)::bigint as volume,
      min(unit_price)::text as low, max(unit_price)::text as high,
      floor(sum(unit_price * qty) / sum(qty))::text as mean
    from trade_log
    where kind = 'board' and def_id = ${req.def}
      and (${req.grade ?? null}::smallint is null or grade = ${req.grade ?? null})
      and at > ${now.toISOString()}::timestamptz - make_interval(days => ${TRADE.board.historyDays})
    group by 1 order by 1`);
  return rows.map((r) => ({
    day: r.day as string,
    volume: Number(r.volume),
    low: r.low as string,
    high: r.high as string,
    mean: r.mean as string,
  }));
}

/** Returns expired listings to their sellers; returns how many it returned. */
export async function sweepListings(
  db: Db,
  executor: Pick<Executor, "executeAll">,
  clock: () => Date = () => new Date(),
  notify?: (characterId: string, change: ChangeNotice) => void,
): Promise<number> {
  const now = clock();
  const { rows } = await db.execute(sql`
    select id, seller_id from listings
    where state = 'live' and expires_at <= ${now.toISOString()}::timestamptz
    order by expires_at limit ${SWEEP_BATCH}`);
  let returned = 0;
  for (const r of rows) {
    const seller = r.seller_id as string;
    const id = r.id as string;
    try {
      const { results, replayed } = await executor.executeAll(
        seller,
        `expire:${id}`,
        "listing.expire",
        { listing: id },
      );
      const result = results.get(seller);
      // Another sweeper (a second process, the CLI) returned it first: nothing to count or tell.
      if (result?.ok && !replayed) {
        returned++;
        notify?.(seller, result.change);
      }
    } catch (error) {
      console.error(`listing ${id} did not expire: ${describeError(error)}`);
    }
  }
  await db.execute(sql`
    delete from listings
    where state <> 'live'
      and closed_at < ${now.toISOString()}::timestamptz - make_interval(days => ${CLOSED_KEPT_DAYS})`);
  return returned;
}

/** Sweeps now and every 30 seconds of real time (the clock decides what is due). Returns the stop. */
export function startListingSweeper(
  db: Db,
  executor: Pick<Executor, "executeAll">,
  clock: () => Date,
  notify?: (characterId: string, change: ChangeNotice) => void,
): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const run = async () => {
    try {
      // A full batch means more are waiting: go again at once.
      while ((await sweepListings(db, executor, clock, notify)) >= SWEEP_BATCH && !stopped) {}
    } catch (error) {
      console.error(`listing sweep failed: ${describeError(error)}`);
    }
    if (!stopped) {
      timer = setTimeout(guarded("listing sweep", run), SWEEP_EVERY_MS);
      timer.unref();
    }
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
