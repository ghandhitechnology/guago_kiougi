/**
 * Watching the economy (PLAN §13): daily totals by source and sink per currency for the admin
 * page, and an invariant check that can run at any time on a live database.
 */
import { TIERS } from "@guago/shared";
import { sql } from "drizzle-orm";
import { OPERATION_RETENTION_MINUTES, type Queryable } from "./executor.ts";

export interface Violation {
  check: string;
  characterId: string | null;
  detail: string;
}

export interface AuditReport {
  ok: boolean;
  counts: {
    characters: number;
    items: number;
    materials: number;
    ledger: number;
    operations: number;
    listings: number;
  };
  violations: Violation[];
}

const WALLET_CURRENCIES = sql`('pinecone', 'merit', 'token')`;

/** Each query returns the rows that break one rule. */
const CHECKS: Record<string, ReturnType<typeof sql>> = {
  // The wallet is the sum of its ledger, to the unit.
  wallet_equals_ledger: sql`
    with l as (
      select character_id, currency, sum(amount) as total from economy_ledger
      where currency in ${WALLET_CURRENCIES} group by 1, 2
    ), w as (
      select character_id, 'pinecone' as currency, pinecones as total from wallets
      union all select character_id, 'merit', merit_points from wallets
      union all select character_id, 'token', tokens from wallets
    )
    select coalesce(w.character_id, l.character_id) as character_id,
      coalesce(w.currency, l.currency) || ': wallet ' || coalesce(w.total, 0)::text
        || ', ledger ' || coalesce(l.total, 0)::text as detail
    from w full join l on l.character_id = w.character_id and l.currency = w.currency
    where coalesce(w.total, 0) <> coalesce(l.total, 0)`,

  // Every stack is the sum of its ledger; no stack exists that the ledger did not make.
  materials_equal_ledger: sql`
    with l as (
      select character_id, currency as def_id, sum(amount) as total from economy_ledger
      where currency not in ${WALLET_CURRENCIES} and item_id is null group by 1, 2
    )
    select coalesce(m.character_id, l.character_id) as character_id,
      coalesce(m.def_id, l.def_id) || ': held ' || coalesce(m.qty, 0)::text
        || ', ledger ' || coalesce(l.total, 0)::text as detail
    from materials m full join l on l.character_id = m.character_id and l.def_id = m.def_id
    where coalesce(m.qty, 0) <> coalesce(l.total, 0)`,

  // Every item was made once, and the ledger of its owner holds it: +1 when made or received,
  // -1 when used up or given. Everyone else's ledger of it nets to zero.
  items_match_ledger: sql`
    with l as (
      select character_id, item_id, min(currency) as currency, sum(amount) as total
      from economy_ledger where item_id is not null group by 1, 2
    ), m as (
      select item_id,
        count(*) filter (where amount > 0 and source_or_sink not like 'trade.%') as made
      from economy_ledger where item_id is not null group by 1
    )
    select coalesce(i.owner_id, l.character_id) as character_id,
      coalesce(i.id, l.item_id)::text || ': '
        || case when i.id is null then 'not held, ledger holds ' || l.total::text
                when l.item_id is null then 'no ledger entry brought it here'
                when m.made <> 1 then 'made ' || m.made::text || ' times'
                else 'ledger holds ' || l.total::text || ' of ' || l.currency end as detail
    from items i
    full join l on l.item_id = i.id and l.character_id = i.owner_id
    left join m on m.item_id = coalesce(i.id, l.item_id)
    where (i.id is null and l.total <> 0)
       or (i.id is not null and (l.item_id is null or l.total <> 1 or m.made <> 1
           or l.currency <> 'item:' || i.def_id))`,

  // What moves between players nets to zero across the game: 솔방울 and stacks of direct
  // trades, and 솔방울 of board sales (the buyer's out is the seller's in).
  transfers_net_zero: sql`
    select null::uuid as character_id,
      currency || ' ' || source_or_sink || ' nets ' || sum(amount)::text as detail
    from economy_ledger
    where item_id is null and (source_or_sink = 'trade.direct'
      or (source_or_sink = 'trade.board' and currency in ${WALLET_CURRENCIES}))
    group by currency, source_or_sink
    having sum(amount) <> 0`,

  // A stack taken into listings is still there, sold to a buyer, or back with its seller.
  escrow_matches_listings: sql`
    with moved as (
      select currency, sum(amount) as total from economy_ledger
      where item_id is null and currency not in ${WALLET_CURRENCIES}
        and source_or_sink in ('escrow.board', 'trade.board')
      group by 1
    ), held as (
      select def_id as currency, sum(qty) as total from listings
      where state = 'live' and item_id is null group by 1
    )
    select null::uuid as character_id,
      coalesce(moved.currency, held.currency) || ': escrow and sales ' || coalesce(moved.total, 0)::text
        || ', listed ' || coalesce(held.total, 0)::text as detail
    from moved full join held on held.currency = moved.currency
    where coalesce(moved.total, 0) + coalesce(held.total, 0) <> 0`,

  // A listed item is in its seller's live listing and nowhere else; a live listing holds it.
  listings_hold_items: sql`
    select i.owner_id as character_id, i.id::text || ': listed in a listing that does not hold it' as detail
    from items i left join listings l on l.id = i.listing_id
    where i.listing_id is not null
      and (l.id is null or l.state <> 'live' or l.item_id <> i.id or l.seller_id <> i.owner_id)
    union all
    select l.seller_id, 'listing ' || l.id::text || ' does not hold its item'
    from listings l
    left join items i on i.id = l.item_id and i.listing_id = l.id and i.owner_id = l.seller_id
    where l.state = 'live' and l.item_id is not null and i.id is null`,

  // Bound items never change hands (PLAN §13).
  bound_never_traded: sql`
    select distinct l.character_id, l.item_id::text || ': bound, but traded' as detail
    from economy_ledger l join items i on i.id = l.item_id
    where i.bound and l.source_or_sink like 'trade.%'`,

  no_negative_balance: sql`
    select character_id, 'wallet below zero' as detail from wallets
    where pinecones < 0 or merit_points < 0 or tokens < 0
    union all
    select character_id, def_id || ' below zero' from materials where qty < 0`,

  // One item per slot, and only slots the tier has (PLAN §7).
  slots_valid: sql`
    select owner_id as character_id, kind || ' slot ' || slot::text || ' holds ' || count(*)::text
      as detail
    from items where slot is not null group by owner_id, kind, slot having count(*) > 1
    union all
    select i.owner_id, i.id::text || ': ' || i.kind || ' slot ' || i.slot::text || ' past tier '
      || c.tier::text
    from items i join characters c on c.id = i.owner_id
    where i.slot is not null and i.slot >= case i.kind
      when 'book' then (${sql.param(TIERS.map((t) => t.books))}::int[])[c.tier + 1]
      else (${sql.param(TIERS.map((t) => t.tools))}::int[])[c.tier + 1] end`,

  // Every ledger entry belongs to a recorded operation (within the retention window).
  ledger_has_operation: sql`
    select distinct l.character_id, 'entry of unrecorded operation ' || l.operation_id as detail
    from economy_ledger l
    left join operations o on o.character_id = l.character_id and o.op_id = l.operation_id
    where o.op_id is null and l.at > now() - make_interval(mins => ${OPERATION_RETENTION_MINUTES - 10})`,
};

export async function checkInvariants(q: Queryable): Promise<AuditReport> {
  const violations: Violation[] = [];
  for (const [check, query] of Object.entries(CHECKS)) {
    const { rows } = await q.execute(query);
    for (const r of rows) {
      violations.push({
        check,
        characterId: (r.character_id as string | null) ?? null,
        detail: r.detail as string,
      });
    }
  }
  const { rows } = await q.execute(sql`
    select (select count(*) from characters)::int as characters,
      (select count(*) from items)::int as items,
      (select count(*) from materials)::int as materials,
      (select count(*) from economy_ledger)::int as ledger,
      (select count(*) from operations)::int as operations,
      (select count(*) from listings where state = 'live')::int as listings`);
  return {
    ok: violations.length === 0,
    counts: rows[0] as AuditReport["counts"],
    violations,
  };
}

export interface DailyTotal {
  /** Korean calendar day, `YYYY-MM-DD`. */
  day: string;
  currency: string;
  sourceOrSink: string;
  /** Exact decimal; positive for a faucet, negative for a sink. */
  amount: string;
  entries: number;
}

/** Totals per day, currency and source or sink, from `from` through `to` (inclusive). */
export async function dailyTotals(
  q: Queryable,
  range: { from: string; to: string; currency?: string },
): Promise<DailyTotal[]> {
  const { rows } = await q.execute(sql`
    select day::text as day, currency, source_or_sink, amount::text as amount, entries::int
    from economy_daily
    where day between ${range.from}::date and ${range.to}::date
      and (${range.currency ?? null}::text is null or currency = ${range.currency ?? null})
    order by day, currency, amount desc, source_or_sink`);
  return rows.map((r) => ({
    day: r.day as string,
    currency: r.currency as string,
    sourceOrSink: r.source_or_sink as string,
    amount: r.amount as string,
    entries: r.entries as number,
  }));
}
