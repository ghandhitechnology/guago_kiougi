/**
 * The trade log's search, for the admin page (PLAN §12 admin, §13 "Real-money trading"): by
 * player, by item (one copy, or every copy of a def), by kind and by time, newest first and paged
 * by id. Each filter is backed by an index (`trade_log_*`).
 */
import { sql } from "drizzle-orm";
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

/** Everyone a player traded with in a window, with counts and 솔방울 each way: RMT patterns. */
export async function tradePartners(
  q: Queryable,
  player: string,
  from: Date,
  to: Date,
): Promise<{ partner: string; trades: number; sent: string; received: string }[]> {
  const { rows } = await q.execute(sql`
    with mine as (
      select case when from_id = ${player} then to_id else from_id end as partner,
        kind, from_id = ${player} as outgoing, payload
      from trade_log
      where (from_id = ${player} or to_id = ${player})
        and at >= ${from.toISOString()}::timestamptz and at < ${to.toISOString()}::timestamptz
    ), coin as (
      select partner,
        case
          when kind = 'board' and outgoing then 0
          when kind = 'board' then (payload->>'total')::numeric
          else coalesce((payload->${player}::text->>'pinecone')::numeric, 0) end as sent,
        case
          when kind = 'board' and outgoing then (payload->>'total')::numeric
          when kind = 'board' then 0
          else coalesce((payload->(partner::text)->>'pinecone')::numeric, 0) end as received
      from mine
    )
    select partner, count(*)::int as trades, sum(sent)::text as sent, sum(received)::text as received
    from coin group by partner order by count(*) desc`);
  return rows.map((r) => ({
    partner: r.partner as string,
    trades: r.trades as number,
    sent: r.sent as string,
    received: r.received as string,
  }));
}
