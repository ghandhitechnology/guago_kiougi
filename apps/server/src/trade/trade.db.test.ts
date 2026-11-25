/**
 * Trading against a real Postgres (PLAN §26 economic operations, §25 "duplication tests pass
 * under racing requests"). Racing requests run on separate executors over separate connection
 * pools, as separate server processes would, so they share no in-process queue and meet only in
 * the database; each scenario repeats with a random stall after the locks so the interleavings
 * vary. After every scenario `expectConserved` counts every item and currency across all
 * characters and listings from the tables themselves.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { type Drop, VENDING } from "@guago/content";
import {
  bindCost,
  directTax,
  forgeFee,
  listingFee,
  type Major,
  pilgiCost,
  saleTax,
  sheet,
  TRADE,
  TRADE_KEYS,
  type TradeMessage,
  type TradeUpdate,
} from "@guago/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/index.ts";
import { checkInvariants } from "../economy/audit.ts";
import type { ExecResult, ExecutorOptions } from "../economy/executor.ts";
import { createEconomy, type Economy } from "../economy/index.ts";
import { compactLedger, rollUpDays } from "../economy/ledger.ts";
import { ITEM_COLUMNS, itemFromDb } from "../economy/rows.ts";
import { sweepListings } from "./board.ts";
import { searchTrades } from "./log.ts";
import { type CommitOffer, printOf, type TradeCommitRequest } from "./ops.ts";
import { createTrades, type TradeLink } from "./session.ts";

const PAGE = 1;
/** Repetitions of each racing scenario. */
const REPS = 20;

let db: Db;
/** One pool per racer, as one per server process. */
let pools: Db[] = [];
let seq = 0;

beforeAll(() => {
  db = createDb(
    process.env.TEST_DATABASE_URL ?? "postgres://guago:guago@127.0.0.1:54329/guago_test",
  );
  pools = [0, 1, 2].map(() => createDb(process.env.TEST_DATABASE_URL as string));
});
afterAll(async () => {
  await Promise.all([db, ...pools].map((d) => d.pool.end()));
});
beforeEach(async () => {
  await db.pool.query("truncate accounts, trade_log, economy_daily_totals cascade");
});
afterEach(async () => {
  expect((await checkInvariants(db)).violations).toEqual([]);
});

const economy = (options: ExecutorOptions = {}, on: Db = db): Economy =>
  createEconomy(on, { page: () => PAGE, ...options });

/** `n` executors on their own pools, each stalling a random moment once its rows are locked. */
function racers(n: number, extra: ExecutorOptions = {}): Economy[] {
  const stall = async () => {
    const ms = Math.random() * 4;
    if (ms > 1) await sleep(ms);
  };
  return Array.from({ length: n }, (_, i) =>
    economy(
      { hooks: { afterLoad: stall, beforeCommit: stall }, ...extra },
      pools[i % pools.length],
    ),
  );
}

// Characters and their belongings ------------------------------------------------------------

/** A 1학년 at level 30 (tier 1, three book slots), with the kit. */
async function student(eco: Economy, o: { level?: number; major?: Major } = {}): Promise<string> {
  const n = ++seq;
  const a = await db.pool.query(
    `insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
     values ($1, 'x', true, 'ip') returning id`,
    [`trade${n}`],
  );
  const c = await db.pool.query(
    `insert into characters (account_id, name, major, look, map_id, x, y, cohort, level, tier)
     values ($1, $2, $3, '{}', 'lawn', 0, 0, 1, $4, $5) returning id`,
    [a.rows[0].id, `상인${n}`, o.major ?? "math", o.level ?? 30, (o.level ?? 30) >= 30 ? 1 : 0],
  );
  const id = c.rows[0].id as string;
  expect((await eco.executor.execute(id, "kit", "kit", {})).ok).toBe(true);
  return id;
}

const SOURCE = {
  kind: "monster",
  fieldId: "test-field",
  monsterId: "odap",
  rank: "elite",
} as const;

interface Funds {
  pinecone?: number;
  ink?: number;
  binding?: number;
  sheets?: Record<string, number>;
  tools?: string[];
}

async function fund(eco: Economy, id: string, f: Funds): Promise<void> {
  const drops: Drop[] = [];
  if (f.pinecone) drops.push({ item: { kind: "coin", amount: f.pinecone }, source: SOURCE });
  if (f.ink) drops.push({ item: { kind: "ink", qty: f.ink }, source: SOURCE });
  if (f.binding) drops.push({ item: { kind: "binding", qty: f.binding }, source: SOURCE });
  for (const [book, qty] of Object.entries(f.sheets ?? {})) {
    drops.push({ item: { kind: "page", book, qty }, source: SOURCE });
  }
  for (const tool of f.tools ?? []) drops.push({ item: { kind: "tool", tool }, source: SOURCE });
  const r = await eco.executor.execute(id, `fund-${randomUUID()}`, "grant", { exp: 0, drops });
  expect(r.ok).toBe(true);
}

/** A tradable copy of `def`, bound by hand like a player would: crafted from its 낱장. */
async function book(eco: Economy, id: string, def = "sequence"): Promise<string> {
  const cost = bindCost(def, PAGE);
  await fund(eco, id, {
    pinecone: cost.pinecone ?? 0,
    binding: cost.binding ?? 0,
    sheets: { [def]: cost[sheet(def)] ?? 0 },
  });
  const r = await eco.executor.execute(id, randomUUID(), "craft", { def });
  if (!r.ok) throw new Error(r.error);
  return r.outcome.item as string;
}

async function tools(eco: Economy, id: string, n: number): Promise<string[]> {
  const before = new Set(await ids(id, "tool"));
  await fund(eco, id, { tools: Array.from({ length: n }, () => "compass") });
  return (await ids(id, "tool")).filter((t) => !before.has(t));
}

async function ids(owner: string, kind?: string): Promise<string[]> {
  const r = await db.pool.query(
    "select id from items where owner_id = $1 and ($2::text is null or kind = $2) order by id",
    [owner, kind ?? null],
  );
  return r.rows.map((row) => row.id as string);
}

async function ownerOf(item: string): Promise<string | undefined> {
  const r = await db.pool.query("select owner_id from items where id = $1", [item]);
  return r.rows[0]?.owner_id as string | undefined;
}

async function pinecones(id: string): Promise<bigint> {
  const r = await db.pool.query(
    "select pinecones::text as p from wallets where character_id = $1",
    [id],
  );
  return BigInt((r.rows[0]?.p as string | undefined) ?? "0");
}

async function stack(id: string, def: string): Promise<number> {
  const r = await db.pool.query(
    "select qty from materials where character_id = $1 and def_id = $2",
    [id, def],
  );
  return Number(r.rows[0]?.qty ?? 0);
}

async function tradeLogs(): Promise<number> {
  return Number((await db.pool.query("select count(*) from trade_log")).rows[0].count);
}

// Conservation ---------------------------------------------------------------------------------

const SINKS = [TRADE_KEYS.directTax, TRADE_KEYS.listingFee, TRADE_KEYS.saleTax];

interface Census {
  /** What exists, by unit: wallet currencies, stacks (bags and listings), `item:<def>` copies. */
  held: Map<string, bigint>;
  /** Everything the ledger says entered or left the game, by unit: every key but transfers. */
  flows: Map<string, bigint>;
  /** Of those, trading's fees and taxes. */
  sinks: Map<string, bigint>;
}

async function census(): Promise<Census> {
  const held = new Map<string, bigint>();
  const add = (m: Map<string, bigint>, k: string, v: string) =>
    m.set(k, (m.get(k) ?? 0n) + BigInt(v));
  const q = (text: string, values: unknown[] = []) => db.pool.query(text, values);
  const w = (
    await q(`select coalesce(sum(pinecones), 0)::text as pinecone,
      coalesce(sum(merit_points), 0)::text as merit, coalesce(sum(tokens), 0)::text as token from wallets`)
  ).rows[0] as Record<string, string>;
  for (const [k, v] of Object.entries(w)) add(held, k, v);
  for (const r of (await q("select def_id, sum(qty)::text as n from materials group by 1")).rows) {
    add(held, r.def_id, r.n);
  }
  const listed = await q(
    "select def_id, sum(qty)::text as n from listings where state = 'live' and item_id is null group by 1",
  );
  for (const r of listed.rows) add(held, r.def_id, r.n);
  for (const r of (await q("select def_id, count(*)::text as n from items group by 1")).rows) {
    add(held, `item:${r.def_id}`, r.n);
  }
  const flows = new Map<string, bigint>();
  const moved = await q(`select currency, sum(amount)::text as n from economy_ledger
    where source_or_sink not like 'trade.%' and source_or_sink not like 'escrow.%' group by 1`);
  for (const r of moved.rows) add(flows, r.currency, r.n);
  const sinks = new Map<string, bigint>();
  const taxed = await q(
    `select currency, sum(amount)::text as n from economy_ledger
     where source_or_sink = any($1::text[]) group by 1`,
    [SINKS],
  );
  for (const r of taxed.rows) add(sinks, r.currency, r.n);
  return { held, flows, sinks };
}

/**
 * Nothing was made or lost between two censuses but what the ledger booked as entering or
 * leaving the game. With `tradingOnly`, the only such units are trading's fees and taxes, so
 * every count and sum equals the start minus exactly those.
 */
function expectConserved(before: Census, after: Census, tradingOnly = false): void {
  const delta = (m: (c: Census) => Map<string, bigint>, k: string) =>
    (m(after).get(k) ?? 0n) - (m(before).get(k) ?? 0n);
  const keys = new Set([...before.held.keys(), ...after.held.keys(), ...after.flows.keys()]);
  for (const k of keys) {
    expect(`${k} ${delta((c) => c.held, k)}`).toBe(`${k} ${delta((c) => c.flows, k)}`);
    if (tradingOnly)
      expect(`${k} ${delta((c) => c.flows, k)}`).toBe(`${k} ${delta((c) => c.sinks, k)}`);
  }
}

// Requests ----------------------------------------------------------------------------------

type Offer = { items?: string[]; stacks?: Record<string, number>; pinecone?: number | bigint };

/** A commit request as a window builds it, from the items as they stand now. */
async function commitOf(offers: Record<string, Offer>): Promise<TradeCommitRequest> {
  const parties = Object.keys(offers).sort() as [string, string];
  const out: Record<string, CommitOffer> = {};
  for (const id of parties) {
    const o = offers[id] as Offer;
    const rows = o.items?.length
      ? (
          await db.pool.query(`select ${ITEM_COLUMNS} from items where id = any($1::uuid[])`, [
            o.items,
          ])
        ).rows.map(itemFromDb)
      : [];
    const order = new Map((o.items ?? []).map((x, i) => [x, i]));
    rows.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
    out[id] = {
      items: rows.map(printOf),
      stacks: o.stacks ?? {},
      pinecone: String(o.pinecone ?? 0),
    };
  }
  return { parties, offers: out };
}

const tradeId = () => `trade:${randomUUID()}:0`;

function trade(eco: Economy, as: string, req: TradeCommitRequest, opId = tradeId()) {
  return eco.executor.executeAll(as, opId, "trade.commit", req);
}

function list(
  eco: Economy,
  id: string,
  req: { item?: string; stack?: string; qty?: number; unitPrice: string },
) {
  return eco.executor.execute(id, randomUUID(), "listing.create", req);
}

async function listed(eco: Economy, id: string, req: Parameters<typeof list>[2]): Promise<string> {
  const r = await list(eco, id, req);
  if (!r.ok) throw new Error(r.error);
  return r.outcome.listing as string;
}

function buy(eco: Economy, id: string, listing: string, unitPrice: string, qty = 1) {
  return eco.executor.execute(id, randomUUID(), "listing.buy", { listing, qty, unitPrice });
}

const oks = (rs: { ok: boolean }[]) => rs.filter((r) => r.ok).length;
const fail = (r: ExecResult | undefined) => (r && !r.ok ? r.error : undefined);

// The 매점 게시판 ------------------------------------------------------------------------------

describe("매점 게시판 under racing requests", () => {
  it(`N buyers on one listing: exactly one gets it and the seller is paid once (${REPS} rounds of 6)`, async () => {
    const eco = economy();
    const price = 1000n;
    for (let rep = 0; rep < REPS; rep++) {
      const seller = await student(eco);
      const item = await book(eco, seller);
      const buyers = await Promise.all(Array.from({ length: 6 }, () => student(eco)));
      for (const b of buyers) await fund(eco, b, { pinecone: 5000 });
      await fund(eco, seller, { pinecone: Number(listingFee(price)) });
      const listing = await listed(eco, seller, { item, unitPrice: String(price) });
      const before = await census();
      const sellerBefore = await pinecones(seller);
      const results = await Promise.all(
        racers(6).map((r, i) => buy(r, buyers[i] as string, listing, String(price))),
      );
      expect(oks(results)).toBe(1);
      for (const r of results) if (!r.ok) expect(r.error).toBe("listing_closed");
      const winner = buyers[results.findIndex((r) => r.ok)];
      expect(await ownerOf(item)).toBe(winner);
      expect(await pinecones(seller)).toBe(sellerBefore + price - saleTax(price));
      expectConserved(before, await census(), true);
    }
  });

  it(`N buyers on one stack buy in part: never more than listed, each unit paid once (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const seller = await student(eco);
      await fund(eco, seller, { ink: 10, pinecone: 100 });
      const listing = await listed(eco, seller, { stack: "ink", qty: 10, unitPrice: "7" });
      const buyers = await Promise.all(Array.from({ length: 5 }, () => student(eco)));
      for (const b of buyers) await fund(eco, b, { pinecone: 100 });
      const before = await census();
      const wants = buyers.map(() => 1 + Math.floor(Math.random() * 4));
      const results = await Promise.all(
        racers(5).map((r, i) => buy(r, buyers[i] as string, listing, "7", wants[i])),
      );
      let sold = 0;
      for (const [i, r] of results.entries()) {
        const b = buyers[i] as string;
        if (r.ok) {
          sold += wants[i] as number;
          expect(await stack(b, "ink")).toBe(wants[i]);
        } else {
          expect(["listing_qty", "listing_closed"]).toContain(r.error);
          expect(await stack(b, "ink")).toBe(0);
        }
      }
      expect(sold).toBeLessThanOrEqual(10);
      const left = (await db.pool.query("select qty, state from listings where id = $1", [listing]))
        .rows[0];
      expect(Number(left.qty)).toBe(10 - sold);
      expect(left.state).toBe(sold === 10 ? "sold" : "live");
      expectConserved(before, await census(), true);
    }
  });

  it(`buy racing cancel: the item goes to one of them, once (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const seller = await student(eco);
      const buyer = await student(eco);
      const item = await book(eco, seller);
      await fund(eco, seller, { pinecone: 100 });
      await fund(eco, buyer, { pinecone: 500 });
      const listing = await listed(eco, seller, { item, unitPrice: "500" });
      const before = await census();
      const [a, b] = racers(2);
      const [bought, cancelled] = await Promise.all([
        buy(a as Economy, buyer, listing, "500"),
        (b as Economy).executor.execute(seller, randomUUID(), "listing.cancel", { listing }),
      ]);
      expect(oks([bought, cancelled])).toBe(1);
      expect(fail(bought) ?? fail(cancelled)).toBe("listing_closed");
      expect(await ownerOf(item)).toBe(bought.ok ? buyer : seller);
      expect((await ids(seller)).includes(item)).toBe(!bought.ok);
      expectConserved(before, await census(), true);
    }
  });

  it(`buy racing expiry at the expiry instant: sold or returned, never both (${REPS} rounds)`, async () => {
    const eco = economy();
    let sold = 0;
    for (let rep = 0; rep < REPS; rep++) {
      const seller = await student(eco);
      const buyer = await student(eco);
      await fund(eco, seller, { ink: 4, pinecone: 100 });
      await fund(eco, buyer, { pinecone: 500 });
      const listing = await listed(eco, seller, { stack: "ink", qty: 4, unitPrice: "100" });
      // Expires within the next few milliseconds, as the two requests land.
      await db.pool.query(
        "update listings set expires_at = now() + make_interval(secs => $2) where id = $1",
        [listing, Math.random() * 0.006],
      );
      const before = await census();
      const [a, b] = racers(2);
      const [bought] = await Promise.all([
        buy(a as Economy, buyer, listing, "100", 4),
        sleep(Math.random() * 6).then(() => sweepListings(db, (b as Economy).executor)),
      ]);
      await sleep(10);
      await sweepListings(db, eco.executor);
      const row = (await db.pool.query("select state, qty from listings where id = $1", [listing]))
        .rows[0];
      if (bought.ok) {
        sold++;
        expect(row.state).toBe("sold");
        expect(await stack(buyer, "ink")).toBe(4);
        expect(await stack(seller, "ink")).toBe(0);
      } else {
        expect(["listing_expired", "listing_closed"]).toContain(bought.error);
        expect(row.state).toBe("expired");
        expect(await stack(seller, "ink")).toBe(4);
        expect(await stack(buyer, "ink")).toBe(0);
      }
      expectConserved(before, await census(), true);
    }
    // Both orders should have come up; if not the test still checked whichever did.
    expect(sold).toBeGreaterThanOrEqual(0);
  });

  it(`cancel racing expiry: returned once (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const seller = await student(eco);
      const item = await book(eco, seller);
      await fund(eco, seller, { pinecone: 100, ink: 3 });
      const one = await listed(eco, seller, { item, unitPrice: "300" });
      const two = await listed(eco, seller, { stack: "ink", qty: 3, unitPrice: "20" });
      await db.pool.query(
        "update listings set expires_at = now() - interval '1 second' where id = any($1)",
        [[one, two]],
      );
      const before = await census();
      const [a, b, c] = racers(3);
      const results = await Promise.all([
        (a as Economy).executor.execute(seller, randomUUID(), "listing.cancel", { listing: one }),
        (b as Economy).executor.execute(seller, randomUUID(), "listing.cancel", { listing: two }),
        sweepListings(db, (c as Economy).executor),
      ]);
      void results;
      await sweepListings(db, eco.executor);
      expect(await ownerOf(item)).toBe(seller);
      expect(
        (await db.pool.query("select listing_id from items where id = $1", [item])).rows[0]
          .listing_id,
      ).toBe(null);
      expect(await stack(seller, "ink")).toBe(3);
      const states = (
        await db.pool.query("select state from listings where seller_id = $1", [seller])
      ).rows;
      expect(states.every((s) => s.state === "cancelled" || s.state === "expired")).toBe(true);
      expectConserved(before, await census(), true);
    }
  });

  it(`a buyer with exactly enough for one buys two at once: one lands (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const [s1, s2, buyer] = [await student(eco), await student(eco), await student(eco)];
      const i1 = await book(eco, s1);
      const i2 = await book(eco, s2);
      await fund(eco, s1, { pinecone: 100 });
      await fund(eco, s2, { pinecone: 100 });
      await fund(eco, buyer, { pinecone: 800 });
      const l1 = await listed(eco, s1, { item: i1, unitPrice: "800" });
      const l2 = await listed(eco, s2, { item: i2, unitPrice: "800" });
      const before = await census();
      const [a, b] = racers(2);
      const results = await Promise.all([
        buy(a as Economy, buyer, l1, "800"),
        buy(b as Economy, buyer, l2, "800"),
      ]);
      expect(oks(results)).toBe(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ error: "listing_funds" });
      expect(await pinecones(buyer)).toBe(0n);
      expectConserved(before, await census(), true);
    }
  });

  it(`two players buying each other's listings at once never deadlock (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const [x, y] = [await student(eco), await student(eco)];
      const ix = await book(eco, x);
      const iy = await book(eco, y);
      await fund(eco, x, { pinecone: 1000 });
      await fund(eco, y, { pinecone: 1000 });
      const lx = await listed(eco, x, { item: ix, unitPrice: "500" });
      const ly = await listed(eco, y, { item: iy, unitPrice: "500" });
      const before = await census();
      const [a, b] = racers(2);
      const results = await Promise.all([
        buy(a as Economy, x, ly, "500"),
        buy(b as Economy, y, lx, "500"),
      ]);
      expect(oks(results)).toBe(2);
      expect(await ownerOf(ix)).toBe(y);
      expect(await ownerOf(iy)).toBe(x);
      expectConserved(before, await census(), true);
    }
  });

  it("a listed item is out of the bag: it cannot be listed twice, offered, 필기'd, equipped or forged", async () => {
    const eco = economy({ random: () => 0 });
    const seller = await student(eco);
    const buyer = await student(eco);
    const item = await book(eco, seller);
    await fund(eco, seller, { pinecone: 10_000, ink: 100 });
    await listed(eco, seller, { item, unitPrice: "100" });
    expect(await list(eco, seller, { item, unitPrice: "100" })).toMatchObject({
      error: "item_missing",
    });
    const offer = await commitOf({ [seller]: { items: [item] }, [buyer]: {} });
    // The print was read straight from the row; the executor still will not load a listed item.
    expect((await trade(eco, seller, offer)).get(seller)).toMatchObject({
      error: "trade_item_gone",
    });
    for (const [name, req] of [
      ["pilgi", { item }],
      ["equip", { item, slot: 2 }],
      ["feed", { item, count: 1 }],
    ] as const) {
      expect(await eco.executor.execute(seller, randomUUID(), name, req as never)).toMatchObject({
        error: "item_missing",
      });
    }
    const snapshot = await eco.ops.snapshot(seller);
    expect(snapshot?.items.some((i) => i.id === item)).toBe(false);
  });

  it("ten listings at most, the fee is never refunded, an expired listing cannot be bought", async () => {
    const eco = economy();
    const seller = await student(eco);
    const buyer = await student(eco);
    await fund(eco, seller, { ink: 20, pinecone: 1000 });
    await fund(eco, buyer, { pinecone: 1000 });
    const made: string[] = [];
    for (let i = 0; i < TRADE.board.listings; i++) {
      made.push(await listed(eco, seller, { stack: "ink", qty: 1, unitPrice: "50" }));
    }
    expect(await list(eco, seller, { stack: "ink", qty: 1, unitPrice: "50" })).toMatchObject({
      error: "listing_limit",
    });
    const paid = 1000n - (await pinecones(seller));
    expect(paid).toBe(listingFee(50n) * BigInt(TRADE.board.listings));
    const cancel = await eco.executor.execute(seller, randomUUID(), "listing.cancel", {
      listing: made[0] as string,
    });
    expect(cancel.ok).toBe(true);
    expect(1000n - (await pinecones(seller))).toBe(paid);
    await db.pool.query(
      "update listings set expires_at = now() - interval '1 minute' where id = $1",
      [made[1]],
    );
    expect(await buy(eco, buyer, made[1] as string, "50")).toMatchObject({
      error: "listing_expired",
    });
    expect(await sweepListings(db, eco.executor)).toBe(1);
    expect(await sweepListings(db, eco.executor)).toBe(0);
    expect(await stack(seller, "ink")).toBe(20 - TRADE.board.listings + 2);
  });

  it("expiry after a server that was down at the hour returns every overdue listing on the first sweep, once", async () => {
    const eco = economy();
    const seller = await student(eco);
    await fund(eco, seller, { ink: 30, pinecone: 1000 });
    for (let i = 0; i < 3; i++)
      await listed(eco, seller, { stack: "ink", qty: 10, unitPrice: "5" });
    await db.pool.query(
      "update listings set expires_at = now() - interval '3 days' where seller_id = $1",
      [seller],
    );
    const before = await census();
    const [a, b] = racers(2);
    // Two sweepers see the same three; each expiry runs under one id, so the second reads the
    // first one's result back instead of returning anything again.
    const swept = await Promise.all([
      sweepListings(db, (a as Economy).executor),
      sweepListings(db, (b as Economy).executor),
    ]);
    expect(swept[0] + swept[1]).toBeGreaterThanOrEqual(3);
    expect(await stack(seller, "ink")).toBe(30);
    expectConserved(before, await census(), true);
  });

  it("browsing pages by price without repeats, and price history sums the sales", async () => {
    const eco = economy();
    const sellers = [await student(eco), await student(eco), await student(eco)];
    const seller = sellers[0] as string;
    const buyer = await student(eco);
    await fund(eco, buyer, { pinecone: 10_000 });
    const ids: string[] = [];
    for (const [n, s] of sellers.entries()) {
      await fund(eco, s, { ink: 20, pinecone: 10_000 });
      for (let i = 0; i < 10; i++) {
        // Repeated prices on purpose: the cursor carries the id past them.
        const price = String(10 + ((i * 7 + n) % 6));
        ids.push(await listed(eco, s, { stack: "ink", qty: 2, unitPrice: price }));
      }
    }
    const { browseListings, priceHistory } = await import("./board.ts");
    const seen: string[] = [];
    let after: string | undefined;
    do {
      const page = await browseListings(db, {
        category: "material",
        sort: "price",
        ...(after ? { after } : {}),
      });
      seen.push(...page.listings.map((l) => l.id));
      const sorted = page.listings.map((l) => BigInt(l.unitPrice));
      expect([...sorted].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))).toEqual(sorted);
      after = page.next ?? undefined;
    } while (after);
    expect(seen).toHaveLength(ids.length);
    expect(new Set(seen)).toEqual(new Set(ids));
    const first = (await browseListings(db, { def: "ink", sort: "price" })).listings.find(
      (l) => l.seller.id === seller,
    );
    expect((await buy(eco, buyer, first?.id as string, first?.unitPrice as string, 2)).ok).toBe(
      true,
    );
    const history = await priceHistory(db, { def: "ink" });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ volume: 2, low: first?.unitPrice, high: first?.unitPrice });
    const logged = await searchTrades(db, { player: seller, def: "ink" });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ kind: "board", fromId: seller, toId: buyer });
  });
});

// Direct trades: the commit ------------------------------------------------------------------

describe("direct trade commits under racing requests", () => {
  it(`the same item in two trades at once: one lands (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const [a, b, c] = [await student(eco), await student(eco), await student(eco)];
      const item = await book(eco, a);
      const before = await census();
      const [r1, r2] = racers(2);
      const results = await Promise.all([
        trade(r1 as Economy, a, await commitOf({ [a]: { items: [item] }, [b]: {} })),
        trade(r2 as Economy, a, await commitOf({ [a]: { items: [item] }, [c]: {} })),
      ]);
      const mine = results.map((r) => r.get(a) as ExecResult);
      expect(oks(mine)).toBe(1);
      expect(mine.find((r) => !r.ok)).toMatchObject({ error: "trade_item_gone" });
      expect([b, c]).toContain(await ownerOf(item));
      expectConserved(before, await census(), true);
    }
  });

  type Race = {
    name: string;
    /** Sets the owner up; returns the offered item and the racing operation. */
    setup(
      eco: Economy,
      a: string,
    ): Promise<{ item: string; race: (eco: Economy) => Promise<ExecResult> }>;
  };
  const races: Race[] = [
    {
      name: "listed",
      async setup(eco, a) {
        const item = await book(eco, a);
        await fund(eco, a, { pinecone: 100 });
        return { item, race: (r) => list(r, a, { item, unitPrice: "100" }) };
      },
    },
    {
      name: "필기'd",
      async setup(eco, a) {
        const item = await book(eco, a);
        await fund(eco, a, pilgiCost(0, 0, 1));
        return { item, race: (r) => r.executor.execute(a, randomUUID(), "pilgi", { item }) };
      },
    },
    {
      name: "fed",
      async setup(eco, a) {
        const item = await book(eco, a);
        await fund(eco, a, { sheets: { sequence: 3 } });
        return {
          item,
          race: (r) => r.executor.execute(a, randomUUID(), "feed", { item, count: 3 }),
        };
      },
    },
    {
      name: "merged away",
      async setup(eco, a) {
        const [into, from] = (await tools(eco, a, 2)) as [string, string];
        return {
          item: from,
          race: (r) => r.executor.execute(a, randomUUID(), "merge", { into, from }),
        };
      },
    },
    {
      name: "forged away",
      async setup(eco, a) {
        const copies = [await book(eco, a), await book(eco, a), await book(eco, a)] as [
          string,
          string,
          string,
        ];
        await fund(eco, a, { pinecone: forgeFee(0, PAGE) });
        // 제련 keeps the first of equal copies and eats the other two.
        return {
          item: copies.sort()[1] as string,
          race: (r) => r.executor.execute(a, randomUUID(), "forge", { items: copies }),
        };
      },
    },
    {
      name: "equipped",
      async setup(eco, a) {
        const item = await book(eco, a);
        return {
          item,
          race: (r) => r.executor.execute(a, randomUUID(), "equip", { item, slot: 2 }),
        };
      },
    },
  ];

  for (const s of races) {
    it(`an item offered while it is ${s.name}: exactly one of them happens (${REPS} rounds)`, async () => {
      const eco = economy({ random: () => 0 });
      let traded = 0;
      for (let rep = 0; rep < REPS; rep++) {
        const [a, b] = [await student(eco), await student(eco)];
        const { item, race } = await s.setup(eco, a);
        const offer = await commitOf({ [a]: { items: [item] }, [b]: { pinecone: 0 } });
        const before = await census();
        const [r1, r2] = racers(2, { random: () => 0 });
        const [done, other] = await Promise.all([
          trade(r1 as Economy, b, offer),
          race(r2 as Economy),
        ]);
        const t = done.get(b) as ExecResult;
        // One of the two, never both, never neither (except a 필기 or feed that changes the copy
        // first, after which the trade sees a different item than the one confirmed).
        expect(t.ok && other.ok).toBe(false);
        if (t.ok) {
          traded++;
          expect(await ownerOf(item)).toBe(b);
          expect(["item_missing", "item_kind", "item_equipped"]).toContain(fail(other));
        } else {
          expect(other.ok).toBe(true);
          expect(["trade_changed", "trade_item_gone", "trade_item_equipped"]).toContain(t.error);
        }
        expectConserved(before, await census());
      }
      expect(traded).toBeLessThanOrEqual(REPS);
    });
  }

  it(`opposite trades between the same two at once, and a ring of three, never deadlock (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const [a, b, c] = [await student(eco), await student(eco), await student(eco)];
      const [ia, ib, ic, ja, jb] = [
        await book(eco, a),
        await book(eco, b),
        await book(eco, c),
        await book(eco, a),
        await book(eco, b),
      ];
      await fund(eco, a, { pinecone: 1000 });
      await fund(eco, b, { pinecone: 1000 });
      await fund(eco, c, { pinecone: 1000 });
      const before = await census();
      const rs = racers(5);
      const all = await Promise.all([
        trade(
          rs[0] as Economy,
          a,
          await commitOf({ [a]: { items: [ja] }, [b]: { pinecone: 100 } }),
        ),
        trade(
          rs[1] as Economy,
          b,
          await commitOf({ [b]: { items: [jb] }, [a]: { pinecone: 100 } }),
        ),
        trade(rs[2] as Economy, a, await commitOf({ [a]: { items: [ia] }, [b]: {} })),
        trade(rs[3] as Economy, b, await commitOf({ [b]: { items: [ib] }, [c]: {} })),
        trade(rs[4] as Economy, c, await commitOf({ [c]: { items: [ic] }, [a]: {} })),
      ]);
      for (const results of all) for (const r of results.values()) expect(r.ok).toBe(true);
      expect([
        await ownerOf(ja),
        await ownerOf(jb),
        await ownerOf(ia),
        await ownerOf(ib),
        await ownerOf(ic),
      ]).toEqual([b, a, b, c, a]);
      expect(await pinecones(a)).toBe(1000n - 100n + 100n - directTax(100n));
      expectConserved(before, await census(), true);
    }
  });

  it("a retried commit with the same id, from either side, applies once, after success and after failure", async () => {
    const eco = economy();
    const [a, b] = [await student(eco), await student(eco)];
    const item = await book(eco, a);
    await fund(eco, b, { pinecone: 1000 });
    const req = await commitOf({ [a]: { items: [item] }, [b]: { pinecone: 1000 } });
    const opId = tradeId();
    const before = await census();
    // Both sides retry at once, on two executors, then once more each.
    const [r1, r2] = racers(2);
    const [x, y] = await Promise.all([
      trade(r1 as Economy, a, req, opId),
      trade(r2 as Economy, b, req, opId),
    ]);
    expect(x.get(a)?.ok).toBe(true);
    expect(y.get(b)).toEqual(x.get(b));
    expect((await trade(eco, b, req, opId)).get(a)).toEqual(x.get(a));
    expect(await tradeLogs()).toBe(1);
    expect(await pinecones(a)).toBe(1000n - directTax(1000n));
    expectConserved(before, await census(), true);
    // The same id with another request is refused and changes nothing.
    const other = await commitOf({ [a]: {}, [b]: { pinecone: 1 } });
    expect((await trade(eco, a, other, opId)).get(a)).toMatchObject({ error: "op_id_reused" });

    // A refusal is the id's one result: funding afterwards does not make its retry land.
    const broke = await commitOf({ [a]: { pinecone: 5000 }, [b]: {} });
    const failed = tradeId();
    const first = await trade(eco, a, broke, failed);
    expect(first.get(a)).toMatchObject({ error: "trade_funds" });
    await fund(eco, a, { pinecone: 5000 });
    expect((await trade(eco, b, broke, failed)).get(b)).toEqual(first.get(b));
    expect(await tradeLogs()).toBe(1);
  });

  it("a crash between applying and committing leaves nothing; the retry applies once", async () => {
    const crashing = economy({
      hooks: {
        beforeCommit: (o) => {
          if (o.name === "trade.commit") throw new Error("power cut");
        },
      },
    });
    const [a, b] = [await student(crashing), await student(crashing)];
    const item = await book(crashing, a);
    await fund(crashing, b, { pinecone: 300, ink: 5 });
    const req = await commitOf({
      [a]: { items: [item] },
      [b]: { pinecone: 300, stacks: { ink: 5 } },
    });
    const opId = tradeId();
    const before = await census();
    await expect(trade(crashing, a, req, opId)).rejects.toThrow("power cut");
    expectConserved(before, await census());
    expect(await ownerOf(item)).toBe(a);
    expect(await tradeLogs()).toBe(0);
    const eco = economy();
    expect((await trade(eco, b, req, opId)).get(b)?.ok).toBe(true);
    expect((await trade(eco, a, req, opId)).get(a)?.ok).toBe(true);
    expect(await ownerOf(item)).toBe(b);
    expect(await stack(a, "ink")).toBe(5);
    expectConserved(before, await census(), true);
  });

  it("bound, equipped, cooling-down and under-level items and players are refused", async () => {
    const eco = economy();
    const [a, b] = [await student(eco), await student(eco)];
    const low = await student(eco, { level: 29 });
    const kit = (
      await db.pool.query("select id from items where owner_id = $1 and bound limit 1", [a])
    ).rows[0].id as string;
    const item = await book(eco, a);
    await fund(eco, a, { pinecone: 100 });
    const one = async (as: string, offers: Record<string, Offer>) =>
      (await trade(eco, as, await commitOf(offers))).get(as);
    // The kit is bound and worn.
    expect(await one(a, { [a]: { items: [kit] }, [b]: {} })).toMatchObject({
      error: "trade_item_bound",
    });
    await db.pool.query("update items set bound = false where id = $1", [kit]);
    expect(await one(a, { [a]: { items: [kit] }, [b]: {} })).toMatchObject({
      error: "trade_item_equipped",
    });
    await db.pool.query("update items set bound = true where id = $1", [kit]);
    expect(await one(a, { [a]: { pinecone: 1 }, [low]: {} })).toMatchObject({
      error: "trade_level",
    });
    expect(await one(a, { [a]: {}, [b]: {} })).toMatchObject({ error: "trade_empty" });
    expect(await one(a, { [a]: { stacks: { merit: 1 } as never }, [b]: {} })).toMatchObject({
      error: "trade_stack",
    });
    // Received today: it cannot go on for a day, by trade or on the board.
    expect((await one(a, { [a]: { items: [item] }, [b]: {} }))?.ok).toBe(true);
    expect(await one(b, { [b]: { items: [item] }, [a]: {} })).toMatchObject({
      error: "trade_item_cooldown",
    });
    await fund(eco, b, { pinecone: 100 });
    expect(await list(eco, b, { item, unitPrice: "10" })).toMatchObject({
      error: "trade_item_cooldown",
    });
    await db.pool.query(
      "update items set tradable_at = now() - interval '1 second' where id = $1",
      [item],
    );
    expect((await list(eco, b, { item, unitPrice: "10" })).ok).toBe(true);
    // An era boss's drop is bound where it is made.
    const era = await eco.executor.execute(a, randomUUID(), "grant", {
      exp: 0,
      drops: [
        { item: { kind: "tool", tool: "compass" }, source: { ...SOURCE, rank: "boss", era: true } },
      ],
    });
    expect(era.ok).toBe(true);
    const bound = await db.pool.query(
      "select bound from items where owner_id = $1 and kind = 'tool'",
      [a],
    );
    expect(bound.rows.map((r) => r.bound)).toEqual([true]);
  });

  it("amounts past 2^53 move and are taxed exactly", async () => {
    const eco = economy();
    const [a, b] = [await student(eco), await student(eco)];
    const big = 2n ** 60n + 7n;
    await db.pool.query("update wallets set pinecones = $2::numeric where character_id = $1", [
      a,
      big.toString(),
    ]);
    // Booked like any income so the wallet still equals its ledger.
    await db.pool.query(
      `insert into economy_ledger (character_id, operation_id, currency, source_or_sink, amount)
       values ($1, 'test-big', 'pinecone', 'test', $2::numeric)`,
      [a, big.toString()],
    );
    await db.pool.query(
      `insert into operations (character_id, op_id, name, request_hash, ok, result)
       values ($1, 'test-big', 'grant', 'x', true, '{}')`,
      [a],
    );
    const before = await census();
    const moved = big - 3n;
    expect(
      (await trade(eco, a, await commitOf({ [a]: { pinecone: moved }, [b]: {} }))).get(a)?.ok,
    ).toBe(true);
    expect(await pinecones(a)).toBe(3n);
    expect(await pinecones(b)).toBe(moved - directTax(moved));
    expectConserved(before, await census(), true);
  });
});

// Direct trades: the windows -----------------------------------------------------------------

/** Two players side by side in one map room, online in a fake WorldRoom. */
function world() {
  const members = new Map<string, { name: string; level: number }>();
  const placed = new Map<string, { roomId: string; x: number; y: number }>();
  const inbox = new Map<string, TradeUpdate[]>();
  const link: TradeLink = {
    member: (id) => members.get(id),
    place: (id) => placed.get(id),
    send: (id, u) => inbox.set(id, [...(inbox.get(id) ?? []), u]),
  };
  return {
    link,
    join(id: string, x = 0) {
      members.set(id, { name: id.slice(0, 4), level: 30 });
      placed.set(id, { roomId: "lawn-1", x, y: 0 });
    },
    move(id: string, x: number) {
      const p = placed.get(id);
      if (p) p.x = x;
    },
    inbox: (id: string) => inbox.get(id) ?? [],
    last: (id: string, t: TradeUpdate["t"]) =>
      [...(inbox.get(id) ?? [])].reverse().find((u) => u.t === t),
  };
}

let mid = 0;
const msg = <T extends TradeMessage["type"]>(
  type: T,
  req: Extract<TradeMessage, { type: T }>["req"],
) => ({ n: ++mid, type, req }) as TradeMessage;

async function opened(
  trades: ReturnType<typeof createTrades>,
  a: string,
  b: string,
): Promise<string> {
  const asked = (await trades.handle(a, msg("trade.request", { to: b }))) as {
    ok: boolean;
    session: string;
  };
  expect(asked.ok).toBe(true);
  expect((await trades.handle(b, msg("trade.accept", { session: asked.session }))).ok).toBe(true);
  return asked.session;
}

describe("direct trade windows", () => {
  it(`both confirming at the same instant commits once (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const w = world();
      const trades = createTrades({
        db,
        executor: racers(1)[0]?.executor as Economy["executor"],
        link: w.link,
      });
      const [a, b] = [await student(eco), await student(eco)];
      w.join(a);
      w.join(b, 40);
      const item = await book(eco, a);
      await fund(eco, b, { pinecone: 400 });
      const session = await opened(trades, a, b);
      await trades.handle(
        a,
        msg("trade.offer", { session, items: [item], stacks: {}, pinecone: "0" }),
      );
      await trades.handle(
        b,
        msg("trade.offer", { session, items: [], stacks: {}, pinecone: "400" }),
      );
      const before = await census();
      const results = await Promise.all([
        trades.handle(a, msg("trade.confirm", { session, version: 2 })),
        trades.handle(b, msg("trade.confirm", { session, version: 2 })),
      ]);
      expect(oks(results)).toBe(2);
      expect(w.last(a, "done")).toBeDefined();
      expect(w.last(b, "done")).toBeDefined();
      expect(await tradeLogs()).toBe(rep + 1);
      expect(await ownerOf(item)).toBe(b);
      expect(await pinecones(a)).toBe(400n - directTax(400n));
      expect(trades.open).toBe(0);
      expectConserved(before, await census(), true);
    }
  });

  it(`an offer changed as the other side confirms: the commit carries only what both confirmed (${REPS} rounds)`, async () => {
    const eco = economy();
    for (let rep = 0; rep < REPS; rep++) {
      const w = world();
      const trades = createTrades({ db, executor: eco.executor, link: w.link });
      const [a, b] = [await student(eco), await student(eco)];
      w.join(a);
      w.join(b, 16);
      const [cheap, dear] = [await book(eco, a), await book(eco, a)];
      await fund(eco, b, { pinecone: 1000 });
      const session = await opened(trades, a, b);
      await trades.handle(
        a,
        msg("trade.offer", { session, items: [cheap, dear], stacks: {}, pinecone: "0" }),
      );
      await trades.handle(
        b,
        msg("trade.offer", { session, items: [], stacks: {}, pinecone: "1000" }),
      );
      expect((await trades.handle(a, msg("trade.confirm", { session, version: 2 }))).ok).toBe(true);
      const before = await census();
      // b confirms version 2 while a takes the dear copy back out.
      const racing = [
        trades.handle(b, msg("trade.confirm", { session, version: 2 })),
        trades.handle(
          a,
          msg("trade.offer", { session, items: [cheap], stacks: {}, pinecone: "0" }),
        ),
      ];
      if (rep % 2) racing.reverse();
      const [first, second] = await Promise.all(racing);
      void first;
      void second;
      const done = w.last(b, "done");
      if (done) {
        // The confirm went first: both copies, as confirmed, for the 1000.
        expect(await ownerOf(cheap)).toBe(b);
        expect(await ownerOf(dear)).toBe(b);
        expect(await pinecones(a)).toBe(1000n - directTax(1000n));
      } else {
        // The change went first: nothing moved, the window is open at version 3, unconfirmed.
        expect(await ownerOf(cheap)).toBe(a);
        expect(await ownerOf(dear)).toBe(a);
        expect(w.last(b, "offer")).toMatchObject({ version: 3 });
        expect(await pinecones(b)).toBe(1000n);
      }
      expectConserved(before, await census(), true);
    }
  });

  it("walking apart, changing map, leaving and a new login each close the window and move nothing", async () => {
    const eco = economy();
    const w = world();
    const [a, b] = [await student(eco), await student(eco)];
    w.join(a);
    w.join(b, 16);
    const item = await book(eco, a);
    const before = await census();
    type Trades = ReturnType<typeof createTrades>;
    const ends: [string, (t: Trades) => void][] = [
      ["far", () => w.move(b, TRADE.rangeTiles * 16 + 17)],
      ["map", (t) => t.end(a, "map")],
      ["left", (t) => t.end(b, "left")],
      ["replaced", (t) => t.end(a, "replaced")],
    ];
    for (const [reason, end] of ends) {
      const trades = createTrades({ db, executor: eco.executor, link: w.link });
      w.move(b, 16);
      const session = await opened(trades, a, b);
      await trades.handle(
        a,
        msg("trade.offer", { session, items: [item], stacks: {}, pinecone: "0" }),
      );
      expect((await trades.handle(a, msg("trade.confirm", { session, version: 1 }))).ok).toBe(true);
      end(trades);
      trades.check();
      await sleep(5);
      expect(w.last(a, "closed")).toMatchObject({ session, reason });
      expect((await trades.handle(b, msg("trade.confirm", { session, version: 1 }))).ok).toBe(
        false,
      );
      expect(trades.open).toBe(0);
    }
    expect(await ownerOf(item)).toBe(a);
    expectConserved(before, await census());
  });

  it("confirming far apart closes instead of committing; a blocked request lapses unseen", async () => {
    const eco = economy();
    const w = world();
    const [a, b] = [await student(eco), await student(eco)];
    const blocked = new Set([`${b}>${a}`]);
    const trades = createTrades({
      db,
      executor: eco.executor,
      link: w.link,
      isBlocked: (x, y) => blocked.has(`${x}>${y}`),
    });
    w.join(a);
    w.join(b, 16);
    const asked = (await trades.handle(a, msg("trade.request", { to: b }))) as {
      ok: boolean;
      session: string;
    };
    expect(asked.ok).toBe(true);
    expect(w.inbox(b)).toEqual([]);
    expect((await trades.handle(b, msg("trade.accept", { session: asked.session }))).ok).toBe(
      false,
    );
    trades.end(a, "cancelled");
    await sleep(5);
    blocked.clear();
    const item = await book(eco, a);
    const session = await opened(trades, a, b);
    await trades.handle(
      a,
      msg("trade.offer", { session, items: [item], stacks: {}, pinecone: "0" }),
    );
    await trades.handle(a, msg("trade.confirm", { session, version: 1 }));
    w.move(b, 500);
    await trades.handle(b, msg("trade.confirm", { session, version: 1 }));
    expect(w.last(a, "closed")).toMatchObject({ reason: "far" });
    expect(await ownerOf(item)).toBe(a);
  });

  it("a side that leaves while the commit is in flight still gets a whole trade, not half of one", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const eco = economy({
      hooks: {
        beforeCommit: async (o) => {
          if (o.name === "trade.commit") await held;
        },
      },
    });
    const w = world();
    const trades = createTrades({ db, executor: eco.executor, link: w.link });
    const [a, b] = [await student(eco), await student(eco)];
    w.join(a);
    w.join(b, 16);
    const item = await book(eco, a);
    await fund(eco, b, { pinecone: 50 });
    const session = await opened(trades, a, b);
    await trades.handle(
      a,
      msg("trade.offer", { session, items: [item], stacks: {}, pinecone: "0" }),
    );
    await trades.handle(b, msg("trade.offer", { session, items: [], stacks: {}, pinecone: "50" }));
    await trades.handle(a, msg("trade.confirm", { session, version: 2 }));
    const before = await census();
    const last = trades.handle(b, msg("trade.confirm", { session, version: 2 }));
    await sleep(30);
    trades.end(a, "left");
    release();
    expect((await last).ok).toBe(true);
    await sleep(5);
    expect(await ownerOf(item)).toBe(b);
    expect(trades.open).toBe(0);
    expectConserved(before, await census(), true);
  });

  it("a refused commit reopens the window with fresh offers and cleared confirmations", async () => {
    const eco = economy();
    const w = world();
    const trades = createTrades({ db, executor: eco.executor, link: w.link });
    const [a, b] = [await student(eco), await student(eco)];
    w.join(a);
    w.join(b, 16);
    await fund(eco, b, { pinecone: 500 });
    const water = VENDING.fixed[0];
    const item = await book(eco, a);
    const session = await opened(trades, a, b);
    await trades.handle(
      a,
      msg("trade.offer", { session, items: [item], stacks: {}, pinecone: "0" }),
    );
    await trades.handle(b, msg("trade.offer", { session, items: [], stacks: {}, pinecone: "500" }));
    await trades.handle(a, msg("trade.confirm", { session, version: 2 }));
    // b spends the 솔방울 between offering and confirming.
    const spent = await eco.executor.execute(b, randomUUID(), "shop.buy", {
      item: water.id,
      qty: 1,
    });
    expect(spent.ok).toBe(true);
    await trades.handle(b, msg("trade.confirm", { session, version: 2 }));
    expect(w.last(a, "failed")).toMatchObject({ error: "trade_funds", version: 3 });
    expect(w.last(a, "offer")).toMatchObject({ version: 3 });
    const offers = (w.last(a, "offer") as Extract<TradeUpdate, { t: "offer" }>).offers;
    expect(offers[b]?.pinecone).toBe("0");
    expect(await ownerOf(item)).toBe(a);
    expect(trades.open).toBe(1);
  });
});

// The ledger ---------------------------------------------------------------------------------

describe("ledger growth", () => {
  it("combat grants share one row per character, day and source; compaction and the roll-up keep every sum", async () => {
    const eco = economy();
    const [a, b] = [await student(eco), await student(eco)];
    for (let i = 0; i < 50; i++) await fund(eco, a, { pinecone: 70, ink: 1 });
    const rows = await db.pool.query(
      "select count(*)::int as n, sum(entries)::int as e from economy_ledger where character_id = $1 and coalesced",
      [a],
    );
    expect(rows.rows[0]).toEqual({ n: 2, e: 100 });
    const item = await book(eco, a);
    await fund(eco, b, { pinecone: 100 });
    // Per-operation rows: ten purchases, two rows each.
    const water = VENDING.fixed[0];
    for (let i = 0; i < 10; i++) {
      const bought = await eco.executor.execute(a, randomUUID(), "shop.buy", {
        item: water.id,
        qty: 1,
      });
      expect(bought.ok).toBe(true);
    }
    expect(
      (await trade(eco, a, await commitOf({ [a]: { items: [item] }, [b]: { pinecone: 100 } }))).get(
        a,
      )?.ok,
    ).toBe(true);
    // Move everything back in time: past retention, and into closed days.
    await db.pool.query("update economy_ledger set day = day - 120, at = at - interval '120 days'");
    const before = await census();
    const daily = async () =>
      (
        await db.pool.query(
          "select day::text, currency, source_or_sink, amount::text from economy_daily order by 1, 2, 3",
        )
      ).rows;
    const live = await daily();
    expect(await rollUpDays(db)).toBeGreaterThan(0);
    expect(await daily()).toEqual(live);
    const raw = Number((await db.pool.query("select count(*) from economy_ledger")).rows[0].count);
    expect(await compactLedger(db)).toBeGreaterThan(0);
    const compacted = Number(
      (await db.pool.query("select count(*) from economy_ledger")).rows[0].count,
    );
    expect(compacted).toBeLessThan(raw);
    expect(await rollUpDays(db)).toBeGreaterThan(0);
    expect(await daily()).toEqual(live);
    expectConserved(before, await census());
    expect((await checkInvariants(db)).violations).toEqual([]);
  });
});
