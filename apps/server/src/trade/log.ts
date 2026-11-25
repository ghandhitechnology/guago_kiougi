/**
 * The trade log's search, for the admin page (PLAN §12 admin, §13 "Real-money trading"): by
 * player, by item (one copy, or every copy of a def), by kind and by time, newest first and paged
 * by id. Each filter is backed by an index (`trade_log_*`).
 */

import { koreanDay } from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import type { Queryable } from "../economy/executor.ts";

export interface TradeSearch {
  /** Either side of the trade. */
  player?: string;
  /** Both sides must be these two, in either direction. */
  counterpart?: string;
  /** One copy of a book or tool. */
  item?: string;
  /** A def or stack id (`wangdo`, `ink`), or `pinecone` for trades that moved 솔방울. */
  def?: string;
  kind?: "board" | "direct";
  from?: Date;
  to?: Date;
  /** The `id` of the last row of the previous page. */
  before?: number;
  limit?: number;
}

export interface TradeLogEntry {
  id: number;
  kind: "board" | "direct";
  at: string;
  fromId: string;
  toId: string;
  itemIds: string[];
  defs: string[];
  tax: string;
  payload: unknown;
}

export async function searchTrades(q: Queryable, s: TradeSearch): Promise<TradeLogEntry[]> {
  const limit = Math.min(Math.max(s.limit ?? 50, 1), 500);
  const { rows } = await q.execute(sql`
    select id, kind, at, from_id, to_id, item_ids, defs, tax::text as tax, payload
    from trade_log
    where (${s.player ?? null}::uuid is null or from_id = ${s.player ?? null} or to_id = ${s.player ?? null})
      and (${s.counterpart ?? null}::uuid is null
        or (from_id = ${s.counterpart ?? null} and to_id = ${s.player ?? null})
        or (to_id = ${s.counterpart ?? null} and from_id = ${s.player ?? null}))
      and (${s.item ?? null}::uuid is null or item_ids @> array[${s.item ?? null}::uuid])
      and (${s.def ?? null}::text is null or defs @> array[${s.def ?? null}::text])
      and (${s.kind ?? null}::text is null or kind = ${s.kind ?? null})
      and (${s.from?.toISOString() ?? null}::timestamptz is null or at >= ${s.from?.toISOString() ?? null}::timestamptz)
      and (${s.to?.toISOString() ?? null}::timestamptz is null or at < ${s.to?.toISOString() ?? null}::timestamptz)
      and (${s.before ?? null}::bigint is null or id < ${s.before ?? null})
    order by id desc
    limit ${limit}`);
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind as TradeLogEntry["kind"],
    at: new Date(
      String(r.at)
        .replace(" ", "T")
        .replace(/([+-]\d\d)$/, "$1:00"),
    ).toISOString(),
    fromId: r.from_id as string,
    toId: r.to_id as string,
    itemIds: r.item_ids as string[],
    defs: r.defs as string[],
    tax: r.tax as string,
    payload: r.payload,
  }));
}

/**
 * Everyone a player traded with in a window, with counts and 솔방울 each way: real-money-trading
 * patterns. Recent trades come from the log; those past its retention from `trade_pairs`, whole
 * Korean days at a time, so a window reaching back past retention counts its first and last day
 * whole. A trade is in one or the other, never both.
 */
export async function tradePartners(
  q: Queryable,
  player: string,
  from: Date,
  to: Date,
): Promise<{ partner: string; trades: number; sent: string; received: string }[]> {
  const fromDay = koreanDay(from.getTime());
  const toDay = koreanDay(to.getTime() - 1);
  const { rows } = await q.execute(sql`
    with mine as (
      select case when from_id = ${player} then to_id else from_id end as partner,
        kind, from_id = ${player} as outgoing, payload
      from trade_log
      where (from_id = ${player} or to_id = ${player})
        and at >= ${from.toISOString()}::timestamptz and at < ${to.toISOString()}::timestamptz
    ), recent as (
      select partner, 1 as trades,
        case
          when kind = 'board' and outgoing then 0
          when kind = 'board' then (payload->>'total')::numeric
          else coalesce((payload->${player}::text->>'pinecone')::numeric, 0) end as sent,
        case
          when kind = 'board' and outgoing then (payload->>'total')::numeric
          when kind = 'board' then 0
          else coalesce((payload->(partner::text)->>'pinecone')::numeric, 0) end as received
      from mine
    ), old as (
      select case when a = ${player} then b else a end as partner, trades,
        case when a = ${player} then a_sent else b_sent end as sent,
        case when a = ${player} then b_sent else a_sent end as received
      from trade_pairs
      where (a = ${player} or b = ${player}) and day between ${fromDay}::date and ${toDay}::date
    ), every as (
      select * from recent union all select * from old
    )
    select partner, sum(trades)::int as trades, sum(sent)::text as sent,
      sum(received)::text as received
    from every group by partner order by sum(trades) desc`);
  return rows.map((r) => ({
    partner: r.partner as string,
    trades: r.trades as number,
    sent: r.sent as string,
    received: r.received as string,
  }));
}

/**
 * Trade log retention: rows written (wall clock) more than `days` ago are folded into
 * `trade_pairs` and deleted, a batch per transaction. Returns how many went.
 */
export async function pruneTradeLog(db: Db, wall: () => number, days: number): Promise<number> {
  const cutoff = new Date(wall() - days * 86_400_000).toISOString();
  let gone = 0;
  for (;;) {
    const { rows } = await db.execute(sql`
      with gone as (
        delete from trade_log
        where id in (
          select id from trade_log where recorded_at < ${cutoff}::timestamptz order by id limit 5000)
        returning kind, at, from_id, to_id, item_ids, tax, payload
      ), r as (
        select (at at time zone 'Asia/Seoul')::date as day,
          least(from_id, to_id) as a, greatest(from_id, to_id) as b, kind,
          from_id < to_id as from_is_a, cardinality(item_ids) as items, tax,
          case kind when 'board' then 0
            else coalesce((payload->(from_id::text)->>'pinecone')::numeric, 0) end as from_coin,
          case kind when 'board' then (payload->>'total')::numeric
            else coalesce((payload->(to_id::text)->>'pinecone')::numeric, 0) end as to_coin
        from gone
      ), folded as (
        insert into trade_pairs (day, a, b, kind, trades, a_sent, b_sent, items, tax)
        select day, a, b, kind, count(*),
          sum(case when from_is_a then from_coin else to_coin end),
          sum(case when from_is_a then to_coin else from_coin end),
          sum(items), sum(tax)
        from r group by day, a, b, kind
        on conflict (day, a, b, kind) do update set
          trades = trade_pairs.trades + excluded.trades,
          a_sent = trade_pairs.a_sent + excluded.a_sent,
          b_sent = trade_pairs.b_sent + excluded.b_sent,
          items = trade_pairs.items + excluded.items,
          tax = trade_pairs.tax + excluded.tax
        returning 1
      )
      select (select count(*) from gone)::int as n`);
    const n = (rows[0]?.n as number | undefined) ?? 0;
    gone += n;
    if (n === 0) return gone;
  }
}
