/**
 * Trading as item operations (PLAN §13 "Player trading"): the commit of a direct trade, and the
 * 매점 게시판's create, buy, cancel and expiry. Each is a party operation the executor runs in one
 * transaction over every character it touches and the listing it names: rows in, rows out, no
 * I/O. Nothing leaves a bag before the transaction that moves it, so a trade that never commits
 * holds nothing anywhere.
 */
import {
  type Currency,
  directTax,
  listingFee,
  MAX_TRADE_AMOUNT,
  type OpError,
  type Purse,
  saleTax,
  stackCategory,
  TRADABLE_STACK,
  TRADE,
  TRADE_KEYS,
  type TradeErrorCode,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import type {
  Applied,
  ExactEntry,
  Give,
  Loaded,
  PartyApplied,
  PartyOpDef,
  PartyStep,
  Requests,
} from "../economy/ops.ts";
import { type ItemRow, itemView, type ListingRow, listedItem } from "../economy/rows.ts";

const HOUR = 3600_000;

/** An offered item as both sides confirmed it: any change since makes the trade `trade_changed`. */
export interface ItemPrint {
  id: string;
  def: string;
  grade: number;
  level: number;
  exp: number;
  pilgi: number;
  pilgiFails: number;
  evolved: boolean;
}

export const printOf = (row: ItemRow): ItemPrint => ({
  id: row.id,
  def: row.def,
  grade: row.grade,
  level: row.level,
  exp: row.exp,
  pilgi: row.pilgi,
  pilgiFails: row.pilgiFails,
  evolved: row.evolved,
});

export interface CommitOffer {
  items: ItemPrint[];
  stacks: Record<string, number>;
  pinecone: string;
}

/**
 * Exactly what both sides confirmed. `parties` is sorted, and nothing names who confirmed last,
 * so the request hashes the same whichever side the commit runs under.
 */
export interface TradeCommitRequest {
  parties: [string, string];
  offers: Record<string, CommitOffer>;
}

export interface ExpireRequest {
  listing: string;
}

const refuse = (error: TradeErrorCode | OpError): PartyStep => ({ ok: false, error });

/** Why an item in the bag may not be offered or listed, or null. */
export function untradable(row: ItemRow, now: Date): TradeErrorCode | null {
  if (row.bound) return "trade_item_bound";
  if (row.slot !== null) return "trade_item_equipped";
  if (row.tradableAt && row.tradableAt.getTime() > now.getTime()) return "trade_item_cooldown";
  return null;
}

/** The purse after `entries`, from the exact balances. */
function settle(l: Loaded, entries: readonly ExactEntry[]): Purse {
  const next: Record<string, bigint> = { ...(l.exact as Record<string, bigint>) };
  for (const e of entries) next[e.currency] = (next[e.currency] ?? 0n) + e.amount;
  return Object.fromEntries(Object.entries(next).map(([c, v]) => [c, Number(v)])) as Purse;
}

const has = (l: Loaded, currency: string): bigint =>
  (l.exact as Record<string, bigint | undefined>)[currency] ?? 0n;

const entry = (currency: string, amount: bigint, key: string): ExactEntry => ({
  currency: currency as Currency,
  amount,
  key,
});

function applied(
  l: Loaded,
  entries: ExactEntry[],
  rest: Omit<Applied, "purse" | "ledger">,
): Applied {
  return { purse: settle(l, entries), ledger: entries.filter((e) => e.amount !== 0n), ...rest };
}

const later = (now: Date, hours: number) => new Date(now.getTime() + hours * HOUR);

// Direct trade --------------------------------------------------------------------------------

const commit: PartyOpDef<TradeCommitRequest> = {
  client: false,
  shared: true,
  async others(_q, req) {
    return req.parties;
  },
  rows: (req, party) => ({ items: (req.offers[party]?.items ?? []).map((i) => i.id) }),
  currencies(req) {
    const stacks = new Set<string>();
    for (const offer of Object.values(req.offers))
      for (const s of Object.keys(offer.stacks)) stacks.add(s);
    return ["pinecone", ...stacks];
  },
  apply(world, req, env) {
    const [a, b] = req.parties;
    if (a === b || !world.parties.has(a) || !world.parties.has(b) || a > b) {
      return refuse("trade_no_session");
    }
    const sides = [
      { from: a, to: b },
      { from: b, to: a },
    ] as const;
    let empty = true;
    for (const { from } of sides) {
      const l = world.parties.get(from) as Loaded;
      if (l.character.level < TRADE.level) return refuse("trade_level");
      const offer = req.offers[from];
      if (!offer) return refuse("trade_no_session");
      if (
        offer.items.length > 0 ||
        Object.keys(offer.stacks).length > 0 ||
        offer.pinecone !== "0"
      ) {
        empty = false;
      }
      for (const print of offer.items) {
        const row = l.items.get(print.id);
        if (!row) return refuse("trade_item_gone");
        if (JSON.stringify(printOf(row)) !== JSON.stringify(print)) return refuse("trade_changed");
        const why = untradable(row, env.now);
        if (why) return refuse(why);
      }
      for (const [def, qty] of Object.entries(offer.stacks)) {
        if (!TRADABLE_STACK.test(def) || !Number.isInteger(qty) || qty <= 0)
          return refuse("trade_stack");
        if (has(l, def) < BigInt(qty)) return refuse("trade_funds");
      }
      const coin = BigInt(offer.pinecone);
      if (coin < 0n || coin > MAX_TRADE_AMOUNT) return refuse("trade_funds");
      if (has(l, "pinecone") < coin) return refuse("trade_funds");
    }
    if (empty) return refuse("trade_empty");

    const entries = new Map<string, ExactEntry[]>([
      [a, []],
      [b, []],
    ]);
    const gives = new Map<string, Give[]>([
      [a, []],
      [b, []],
    ]);
    const taxes = new Map<string, bigint>();
    const tradableAt = later(env.now, TRADE.retradeHours);
    for (const { from, to } of sides) {
      const offer = req.offers[from] as CommitOffer;
      const out = entries.get(from) as ExactEntry[];
      const into = entries.get(to) as ExactEntry[];
      const coin = BigInt(offer.pinecone);
      if (coin > 0n) {
        const tax = directTax(coin);
        taxes.set(to, tax);
        out.push(entry("pinecone", -coin, TRADE_KEYS.direct));
        into.push(entry("pinecone", coin, TRADE_KEYS.direct));
        into.push(entry("pinecone", -tax, TRADE_KEYS.directTax));
      }
      for (const [def, qty] of Object.entries(offer.stacks)) {
        out.push(entry(def, -BigInt(qty), TRADE_KEYS.direct));
        into.push(entry(def, BigInt(qty), TRADE_KEYS.direct));
      }
      for (const print of offer.items) {
        (gives.get(from) as Give[]).push({ id: print.id, to, tradableAt });
      }
    }
    const parties = new Map<string, Applied>();
    for (const id of [a, b]) {
      const l = world.parties.get(id) as Loaded;
      parties.set(
        id,
        applied(l, entries.get(id) as ExactEntry[], {
          give: gives.get(id) as Give[],
          itemKey: TRADE_KEYS.direct,
          outcome: { tax: (taxes.get(id) ?? 0n).toString() },
        }),
      );
    }
    const view = (id: string) => {
      const offer = req.offers[id] as CommitOffer;
      const l = world.parties.get(id) as Loaded;
      return {
        items: offer.items.map((p) => itemView(l.items.get(p.id) as ItemRow)),
        stacks: offer.stacks,
        pinecone: offer.pinecone,
      };
    };
    const all = [...(req.offers[a]?.items ?? []), ...(req.offers[b]?.items ?? [])];
    const stacks = new Set([
      ...Object.keys(req.offers[a]?.stacks ?? {}),
      ...Object.keys(req.offers[b]?.stacks ?? {}),
    ]);
    const coin = req.offers[a]?.pinecone !== "0" || req.offers[b]?.pinecone !== "0";
    const value: PartyApplied = {
      parties,
      log: {
        kind: "direct",
        fromId: a,
        toId: b,
        itemIds: all.map((p) => p.id),
        defs: [...new Set([...all.map((p) => p.def), ...stacks, ...(coin ? ["pinecone"] : [])])],
        tax: (taxes.get(a) ?? 0n) + (taxes.get(b) ?? 0n),
        payload: { [a]: view(a), [b]: view(b) },
      },
    };
    return { ok: true, value };
  },
};

// 매점 게시판 ----------------------------------------------------------------------------------

const create: PartyOpDef<Requests["listing.create"]> = {
  client: true,
  others: async () => [],
  rows: (req) => ({ items: req.item ? [req.item] : [], listingCount: true }),
  currencies: (req) => ["pinecone", ...(req.stack ? [req.stack] : [])],
  apply(world, req, env) {
    const me = world.initiator;
    const l = world.parties.get(me) as Loaded;
    if (l.character.level < TRADE.level) return refuse("trade_level");
    if (l.listingCount >= TRADE.board.listings) return refuse("listing_limit");
    const unit = BigInt(req.unitPrice);
    const qty = req.item ? 1 : (req.qty ?? 0);
    const total = unit * BigInt(qty);
    if (unit <= 0n || qty <= 0 || total > MAX_TRADE_AMOUNT) return refuse("listing_price");
    const fee = listingFee(total);
    const id = env.newId();
    const base = {
      id,
      sellerId: me,
      state: "live" as const,
      qty,
      listedQty: qty,
      unitPrice: unit,
      fee,
      createdAt: env.now,
      expiresAt: later(env.now, TRADE.board.hours),
      closedAt: null,
      expired: false,
    };
    const entries = [entry("pinecone", -fee, TRADE_KEYS.listingFee)];
    let listing: ListingRow;
    const put: ItemRow[] = [];
    if (req.item) {
      const row = l.items.get(req.item);
      if (!row) return refuse("item_missing");
      const why = untradable(row, env.now);
      if (why) return refuse(why);
      listing = {
        ...base,
        category: row.kind,
        def: row.def,
        grade: row.grade,
        itemId: row.id,
        item: listedItem(row),
      };
      put.push({ ...row, listing: id });
    } else {
      const stack = req.stack as string;
      if (!TRADABLE_STACK.test(stack)) return refuse("trade_stack");
      if (has(l, stack) < BigInt(qty)) return refuse("trade_funds");
      entries.push(entry(stack, -BigInt(qty), TRADE_KEYS.escrow));
      listing = {
        ...base,
        category: stackCategory(stack),
        def: stack,
        grade: 0,
        itemId: null,
        item: null,
      };
    }
    // The fee comes out of the same purse a listed stack does; check it after.
    if (has(l, "pinecone") < fee) return refuse("listing_funds");
    return {
      ok: true,
      value: {
        parties: new Map([
          [me, applied(l, entries, { put, outcome: { listing: id, fee: fee.toString() } })],
        ]),
        listings: [listing],
      },
    };
  },
};

/**
 * The seller of a live listing, read before the locks: a listing's seller never changes, and a
 * closed one never opens again, so a buy of a closed listing need not wait on its seller.
 */
async function sellerOf(q: Parameters<PartyOpDef<unknown>["others"]>[0], listing: string) {
  const { rows } = await q.execute(
    sql`select seller_id from listings where id = ${listing} and state = 'live'`,
  );
  return rows.length > 0 ? [rows[0]?.seller_id as string] : [];
}

const listedRows = (listing: ListingRow | undefined, party: string) =>
  listing?.itemId && listing.sellerId === party ? { listed: [listing.itemId] } : {};

const buy: PartyOpDef<Requests["listing.buy"]> = {
  client: true,
  others: (q, req) => sellerOf(q, req.listing),
  listings: (req) => [req.listing],
  rows: (req, party, locked) => listedRows(locked.listings.get(req.listing), party),
  // A seller the buyer blocked is off the board for them (PLAN §12 "Block hides … trades").
  async facts(q, req, locked) {
    const seller = locked.listings.get(req.listing)?.sellerId;
    if (!seller) return { blocked: false };
    const { rows } = await q.execute(sql`
      select 1 from blocks where character_id = ${locked.initiator} and other_id = ${seller}`);
    return { blocked: rows.length > 0 };
  },
  currencies(req, party, _loaded, locked) {
    const listing = locked.listings.get(req.listing);
    if (!listing || party !== locked.initiator) return ["pinecone"];
    return ["pinecone", ...(listing.itemId ? [] : [listing.def])];
  },
  apply(world, req, env) {
    const me = world.initiator;
    const listing = world.listings.get(req.listing);
    if (!listing) return refuse("listing_missing");
    if (listing.sellerId === me) return refuse("listing_own");
    if (world.facts.blocked) return refuse("listing_missing");
    if (listing.state !== "live") return refuse("listing_closed");
    if (listing.expired) return refuse("listing_expired");
    const buyer = world.parties.get(me) as Loaded;
    const seller = world.parties.get(listing.sellerId);
    // Live when read, but its seller was not locked: it closed after the first look.
    if (!seller) return refuse("listing_closed");
    if (buyer.character.level < TRADE.level) return refuse("trade_level");
    if (BigInt(req.unitPrice) !== listing.unitPrice) return refuse("listing_price");
    if (req.qty > listing.qty) return refuse("listing_qty");
    const total = listing.unitPrice * BigInt(req.qty);
    if (has(buyer, "pinecone") < total) return refuse("listing_funds");
    const tax = saleTax(total);

    const buys = [entry("pinecone", -total, TRADE_KEYS.board)];
    const sells = [
      entry("pinecone", total, TRADE_KEYS.board),
      entry("pinecone", -tax, TRADE_KEYS.saleTax),
    ];
    const give: Give[] = [];
    let itemPayload: unknown = null;
    if (listing.itemId) {
      const row = seller.items.get(listing.itemId);
      // The listing is live, so its item is held in it; anything else is a broken row.
      if (!row || row.listing !== listing.id) return refuse("listing_missing");
      give.push({ id: row.id, to: me, tradableAt: later(env.now, TRADE.retradeHours) });
      itemPayload = itemView(row);
    } else {
      buys.push(entry(listing.def, BigInt(req.qty), TRADE_KEYS.board));
    }
    const left = listing.qty - req.qty;
    const closed: ListingRow = {
      ...listing,
      qty: left,
      ...(left === 0 ? { state: "sold" as const, closedAt: env.now } : {}),
    };
    const value: PartyApplied = {
      parties: new Map([
        [
          me,
          applied(buyer, buys, {
            itemKey: TRADE_KEYS.board,
            outcome: { listing: listing.id, qty: req.qty, paid: total.toString() },
          }),
        ],
        [
          listing.sellerId,
          applied(seller, sells, {
            give,
            itemKey: TRADE_KEYS.board,
            outcome: {
              listing: listing.id,
              sold: req.qty,
              proceeds: (total - tax).toString(),
            },
          }),
        ],
      ]),
      listings: [closed],
      log: {
        kind: "board",
        fromId: listing.sellerId,
        toId: me,
        itemIds: listing.itemId ? [listing.itemId] : [],
        defs: [listing.def],
        tax,
        payload: {
          listing: listing.id,
          def: listing.def,
          grade: listing.grade,
          qty: req.qty,
          unitPrice: listing.unitPrice.toString(),
          total: total.toString(),
          item: itemPayload,
        },
        board: {
          listingId: listing.id,
          def: listing.def,
          grade: listing.grade,
          qty: req.qty,
          unitPrice: listing.unitPrice,
        },
      },
    };
    return { ok: true, value };
  },
};

/** Cancel and expiry: whatever is still listed goes back to the seller. Fees stay paid. */
function close(state: "cancelled" | "expired"): PartyOpDef<{ listing: string }> {
  return {
    client: state === "cancelled",
    others: async () => [],
    listings: (req) => [req.listing],
    rows: (req, party, locked) => listedRows(locked.listings.get(req.listing), party),
    currencies(req, _party, _loaded, locked) {
      const listing = locked.listings.get(req.listing);
      return listing && !listing.itemId ? [listing.def] : [];
    },
    apply(world, req, env) {
      const me = world.initiator;
      const listing = world.listings.get(req.listing);
      if (!listing || listing.sellerId !== me) return refuse("listing_missing");
      if (listing.state !== "live") return refuse("listing_closed");
      if (state === "expired" && !listing.expired) {
        // The sweeper only asks once the database says so; a refusal here would be recorded
        // under the listing's one expiry id and block it for good, so it is a bug, not a result.
        throw new Error(`listing ${listing.id} is not yet expired`);
      }
      const l = world.parties.get(me) as Loaded;
      const entries: ExactEntry[] = [];
      const put: ItemRow[] = [];
      if (listing.itemId) {
        const row = l.items.get(listing.itemId);
        if (!row || row.listing !== listing.id) return refuse("listing_missing");
        put.push({ ...row, listing: null });
      } else {
        entries.push(entry(listing.def, BigInt(listing.qty), TRADE_KEYS.escrow));
      }
      return {
        ok: true,
        value: {
          parties: new Map([
            [
              me,
              applied(l, entries, { put, outcome: { listing: listing.id, returned: listing.qty } }),
            ],
          ]),
          listings: [{ ...listing, state, qty: 0, closedAt: env.now }],
        },
      };
    },
  };
}

export const PARTY_OPS = {
  "trade.commit": commit,
  "listing.create": create,
  "listing.buy": buy,
  "listing.cancel": close("cancelled"),
  "listing.expire": close("expired"),
} satisfies { [K in keyof Requests]?: PartyOpDef<Requests[K]> };
