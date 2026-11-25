/**
 * Economic operations against a real Postgres (PLAN §26): atomic, idempotent under retry, and
 * free of duplication when requests race. Expected numbers come from the pure functions, so a
 * retune of the constants does not break these tests. Every test ends with the invariant check.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  bookById,
  type Drop,
  STARTER_BOOKS,
  shopPrice,
  VENDING,
  vendingStock,
  vendingWeek,
} from "@guago/content";
import {
  bindCost,
  catchUp,
  claimPool,
  expToNext,
  feedSheets,
  forgeFee,
  MAJORS,
  type Major,
  mergeTools,
  OP_REFUSAL_RATE,
  OP_TOTAL_RATE,
  type OpMessage,
  type OpRequests,
  pilgiChance,
  pilgiCost,
  poolFill,
  questReward,
  Random,
  STAT_IDS,
  sheet,
  statResetCost,
  textbook,
} from "@guago/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthService } from "../auth/service.ts";
import { createDb, type Db } from "../db/index.ts";
import { onShutdown, runShutdown } from "../shutdown.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { checkInvariants } from "./audit.ts";
import { ContractError, type ExecResult, type ExecutorOptions } from "./executor.ts";
import { GrantBuffer } from "./grants.ts";
import { createOpHandler } from "./handler.ts";
import { createEconomy, type Economy, pruneOperations } from "./index.ts";
import type { AnyOp, Requests } from "./ops.ts";

const PAGE = 1;
const NOW = new Date("2026-11-25T03:00:00Z");

let db: Db;
let seq = 0;

beforeAll(() => {
  db = createDb(TEST_DATABASE_URL);
});
afterAll(async () => {
  await db.pool.end();
});
beforeEach(async () => {
  await db.pool.query("truncate accounts cascade");
});
// Every test leaves the economy whole: wallets equal their ledger, nothing exists unbooked.
afterEach(async () => {
  expect((await checkInvariants(db)).violations).toEqual([]);
});

const economy = (options: ExecutorOptions = {}) =>
  createEconomy(db, { now: () => NOW, page: () => PAGE, ...options });

/** A character made the way creation makes one: the row, then the kit under its fixed id. */
async function character(eco: Economy, major: Major = "math"): Promise<string> {
  const n = ++seq;
  const a = await db.pool.query(
    `insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
     values ($1, 'x', true, 'ip') returning id`,
    [`econ${n}`],
  );
  const c = await db.pool.query(
    `insert into characters (account_id, name, major, look, map_id, x, y, cohort)
     values ($1, $2, $3, '{}', 'lawn', 0, 0, 1) returning id`,
    [a.rows[0].id, `학생${n}`, major],
  );
  const id = c.rows[0].id as string;
  const kit = await eco.executor.execute(id, "kit", "kit", {});
  expect(kit.ok).toBe(true);
  return id;
}

interface Funds {
  pinecone?: number;
  ink?: number;
  binding?: number;
  sheets?: Record<string, number>;
  tools?: string[];
  exp?: number;
}

const SOURCE = {
  kind: "monster",
  fieldId: "test-field",
  monsterId: "odap",
  rank: "elite",
} as const;

function drops(f: Funds): Drop[] {
  const out: Drop[] = [];
  if (f.pinecone) out.push({ item: { kind: "coin", amount: f.pinecone }, source: SOURCE });
  if (f.ink) out.push({ item: { kind: "ink", qty: f.ink }, source: SOURCE });
  if (f.binding) out.push({ item: { kind: "binding", qty: f.binding }, source: SOURCE });
  for (const [book, qty] of Object.entries(f.sheets ?? {})) {
    if (qty > 0) out.push({ item: { kind: "page", book, qty }, source: SOURCE });
  }
  for (const tool of f.tools ?? []) out.push({ item: { kind: "tool", tool }, source: SOURCE });
  return out;
}

/** A character with no kit yet, as one made before items existed. */
async function bareCharacter(major: Major = "math"): Promise<string> {
  const n = ++seq;
  const a = await db.pool.query(
    `insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
     values ($1, 'x', true, 'ip') returning id`,
    [`econ${n}`],
  );
  const c = await db.pool.query(
    `insert into characters (account_id, name, major, look, map_id, x, y, cohort)
     values ($1, $2, $3, '{}', 'lawn', 0, 0, 1) returning id`,
    [a.rows[0].id, `학생${n}`, major],
  );
  return c.rows[0].id as string;
}

/** Credit through a combat grant, the way income enters the game. */
async function fund(eco: Economy, id: string, f: Funds): Promise<ExecResult> {
  const r = await eco.executor.execute(id, `fund-${randomUUID()}`, "grant", {
    exp: f.exp ?? 0,
    drops: drops(f),
  });
  expect(r.ok).toBe(true);
  return r;
}

function op<K extends AnyOp>(
  eco: Economy,
  id: string,
  name: K,
  req: Requests[K],
  opId: string = randomUUID(),
): Promise<ExecResult> {
  return eco.executor.execute(id, opId, name, req);
}

/** The bind cost of `def` as purse amounts, in `fund` form. */
function bindFunds(def: string, copies = 1): Funds {
  const cost = bindCost(def, PAGE);
  return {
    pinecone: (cost.pinecone ?? 0) * copies,
    binding: (cost.binding ?? 0) * copies,
    sheets: { [def]: (cost[sheet(def)] ?? 0) * copies },
  };
}

async function craft(eco: Economy, id: string, def: string): Promise<string> {
  const r = await op(eco, id, "craft", { def });
  if (!r.ok) throw new Error(r.error);
  return r.outcome.item as string;
}

async function pinecones(id: string): Promise<string> {
  const r = await db.pool.query(
    "select pinecones::text as p from wallets where character_id = $1",
    [id],
  );
  return r.rows[0].p as string;
}

async function itemIds(id: string): Promise<string[]> {
  const r = await db.pool.query("select id from items where owner_id = $1 order by id", [id]);
  return r.rows.map((row) => row.id as string);
}

/** Everything a retry or a crash could disturb, for before-and-after comparison. */
async function everything(eco: Economy, id: string) {
  const counts = await db.pool.query(
    `select (select count(*) from economy_ledger where character_id = $1)::int as ledger,
            (select count(*) from operations where character_id = $1)::int as ops`,
    [id],
  );
  return { snapshot: await eco.ops.snapshot(id), ...counts.rows[0] };
}

/** The equipped copy of `def`, as the starter kit put it in a slot. */
const kitBook = async (id: string, def: string) =>
  (
    await db.pool.query(
      "select id from items where owner_id = $1 and def_id = $2 and slot is not null",
      [id, def],
    )
  ).rows[0].id as string;

/**
 * Lets `parties` transactions through together once they have all locked their rows, or each
 * one alone after `ms`. With the character lock in place they never meet, so each waits `ms`;
 * without it they read the same rows and write over each other, which the tests then catch.
 */
function barrier(parties = 2, ms = 300) {
  let arrived = 0;
  let open!: () => void;
  const all = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    arrived++;
    if (arrived >= parties) open();
    await Promise.race([all, sleep(ms)]);
  };
}

const oks = (results: ExecResult[]) => results.filter((r) => r.ok).length;

describe("idempotency", () => {
  type Scenario = {
    name: string;
    setup: (eco: Economy, id: string) => Promise<{ [K in AnyOp]: [K, Requests[K]] }[AnyOp]>;
  };

  const scenarios: Scenario[] = [
    {
      name: "grant",
      setup: async () => [
        "grant",
        { exp: 10, drops: drops({ pinecone: 500, ink: 3, tools: ["compass"] }) },
      ],
    },
    {
      name: "craft",
      setup: async (eco, id) => {
        await fund(eco, id, bindFunds("wangdo"));
        return ["craft", { def: "wangdo" }];
      },
    },
    {
      name: "pilgi",
      setup: async (eco, id) => {
        await fund(eco, id, pilgiCost(0, 0, 1));
        return ["pilgi", { item: await kitBook(id, "wangdo") }];
      },
    },
    {
      name: "forge",
      setup: async (eco, id) => {
        await fund(eco, id, bindFunds("graph-note", 3));
        await fund(eco, id, { pinecone: forgeFee(0, PAGE) });
        const copies = [
          await craft(eco, id, "graph-note"),
          await craft(eco, id, "graph-note"),
          await craft(eco, id, "graph-note"),
        ] as [string, string, string];
        return ["forge", { items: copies }];
      },
    },
    {
      name: "feed",
      setup: async (eco, id) => {
        // The owner must be above the book for 낱장 to count: a fresh copy in the bag.
        const cost = bindFunds("wangdo");
        await fund(eco, id, {
          ...cost,
          exp: expToNext(1) * 2,
          sheets: { wangdo: (cost.sheets?.wangdo ?? 0) + 5 },
        });
        return ["feed", { item: await craft(eco, id, "wangdo"), count: 5 }];
      },
    },
    {
      name: "merge",
      setup: async (eco, id) => {
        await fund(eco, id, { tools: ["compass", "compass"] });
        const [into, from] = (
          await db.pool.query("select id from items where owner_id = $1 and kind = 'tool'", [id])
        ).rows.map((r) => r.id as string);
        return ["merge", { into: into as string, from: from as string }];
      },
    },
    {
      name: "evolve",
      setup: async (eco, id) => {
        const def = "wangdo";
        await fund(eco, id, { tools: [bookById(def).tool] });
        // A veteran's state, set directly: 3학년, a 심화서 at level 100, its tool at level 5.
        await db.pool.query("update characters set level = 250, tier = 4 where id = $1", [id]);
        await db.pool.query(
          "update items set grade = 2, level = 100 where owner_id = $1 and def_id = $2",
          [id, def],
        );
        await db.pool.query("update items set level = 5 where owner_id = $1 and kind = 'tool'", [
          id,
        ]);
        const tool = (
          await db.pool.query("select id from items where owner_id = $1 and kind = 'tool'", [id])
        ).rows[0].id as string;
        return ["evolve", { item: await kitBook(id, def), tool }];
      },
    },
    {
      name: "equip",
      setup: async (eco, id) => {
        await fund(eco, id, bindFunds("wangdo"));
        return ["equip", { item: await craft(eco, id, "wangdo"), slot: 0 }];
      },
    },
    {
      name: "unequip",
      setup: async (_eco, id) => ["unequip", { item: await kitBook(id, "wangdo") }],
    },
    {
      name: "stats.allocate",
      setup: async () => ["stats.allocate", { add: { understanding: 2, luck: 1 } }],
    },
    {
      name: "stats.reset",
      setup: async (eco, id) => {
        await fund(eco, id, { pinecone: statResetCost(1) });
        return ["stats.reset", {}];
      },
    },
    {
      name: "shop.buy",
      setup: async (eco, id) => {
        const water = VENDING.fixed[0];
        await fund(eco, id, { pinecone: shopPrice(water, PAGE) * 2 });
        return ["shop.buy", { item: water.id, qty: 2 }];
      },
    },
    {
      name: "claimPool",
      setup: async (_eco, id) => {
        await db.pool.query(
          `update characters set pool_started_at = $2, pool_place = 'field', pool_sheet_book = 'wangdo',
             pool_rates = '{"exp": 40, "pinecone": 9, "sheets": 0.002, "ink": 0.01}' where id = $1`,
          [id, new Date(NOW.getTime() - 3 * 3600_000)],
        );
        return ["claimPool", {}];
      },
    },
    {
      name: "quest.claim",
      setup: async (_eco, id) => {
        const offer = { cadence: "weekly", reward: questReward("weekly", 1), sheetBook: "wangdo" };
        await db.pool.query(
          `insert into quest_progress (character_id, quest_id, state, progress, target, offer)
           values ($1, 'weekly:1', 'done', 3, 3, $2)`,
          [id, JSON.stringify(offer)],
        );
        return ["quest.claim", { quest: "weekly:1" }];
      },
    },
  ];

  for (const s of scenarios) {
    it(`${s.name} applies once under a retried operation id`, async () => {
      const eco = economy({ random: () => 0 });
      const id = await character(eco);
      const [name, req] = await s.setup(eco, id);
      const opId = randomUUID();
      const first = await eco.executor.execute(id, opId, name, req as never);
      expect(first).toMatchObject({ ok: true });
      const after = await everything(eco, id);
      const again = await eco.executor.execute(id, opId, name, req as never);
      expect(again).toEqual(first);
      expect(await everything(eco, id)).toEqual(after);
    });
  }

  it("a retry from another process while the first is in flight waits on the lock, reads the record and never runs again", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const opId = randomUUID();
    let runs = 0;
    const hooks = {
      afterLoad: async (o: { opId: string }) => {
        if (o.opId !== opId) return;
        runs++;
        await held;
      },
    };
    // Two executors share no in-process queue, like two server processes.
    const first = economy({ hooks });
    const second = economy({ hooks });
    const id = await character(first);
    await fund(first, id, bindFunds("wangdo"));
    const a = op(first, id, "craft", { def: "wangdo" }, opId);
    await sleep(50);
    let retried: ExecResult | undefined;
    const b = op(second, id, "craft", { def: "wangdo" }, opId).then((r) => {
      retried = r;
      return r;
    });
    await sleep(200);
    expect(retried).toBeUndefined();
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.ok).toBe(true);
    expect(rb).toEqual(ra);
    expect(runs).toBe(1);
    expect(await itemIds(id)).toHaveLength(3);
  });

  it("a retry in the same process waits in the character's queue and gets the same result", async () => {
    const eco = economy();
    const id = await character(eco);
    await fund(eco, id, bindFunds("wangdo"));
    const opId = randomUUID();
    const [a, b] = await Promise.all([
      op(eco, id, "craft", { def: "wangdo" }, opId),
      op(eco, id, "craft", { def: "wangdo" }, opId),
    ]);
    expect(a.ok).toBe(true);
    expect(b).toEqual(a);
    expect(await itemIds(id)).toHaveLength(3);
  });

  it("an operation id reused with another request is refused and changes nothing", async () => {
    const eco = economy();
    const id = await character(eco);
    await fund(eco, id, bindFunds("wangdo", 2));
    const opId = randomUUID();
    expect((await op(eco, id, "craft", { def: "wangdo" }, opId)).ok).toBe(true);
    const before = await everything(eco, id);
    const reused = await op(eco, id, "craft", { def: "graph-note" }, opId);
    expect(reused).toMatchObject({ ok: false, error: "op_id_reused" });
    expect(await everything(eco, id)).toEqual(before);
  });

  it("a refusal is the id's one result too: its retry is refused the same way", async () => {
    const eco = economy({ random: () => 0 });
    const id = await character(eco);
    const book = await kitBook(id, "wangdo");
    const opId = randomUUID();
    const broke = await op(eco, id, "pilgi", { item: book }, opId);
    expect(broke).toMatchObject({ ok: false, error: "pilgi_cost" });
    await fund(eco, id, pilgiCost(0, 0, 1));
    expect(await op(eco, id, "pilgi", { item: book }, opId)).toEqual(broke);
    expect((await op(eco, id, "pilgi", { item: book })).ok).toBe(true);
  });
});

describe("racing requests", () => {
  /**
   * Two executors, as if two server processes, so the racing pair shares no in-process queue
   * and meets in the database. Their transactions meet at one barrier once their rows are
   * locked. Setup goes through a plain economy. The name of each test says what keeps the pair
   * apart: [row locks] tests are also covered by the character lock, [character lock] tests by
   * nothing else.
   */
  const racers = (): [Economy, Economy] => {
    const meet = barrier();
    const options = { random: () => 0, hooks: { afterLoad: meet } };
    return [economy(options), economy(options)];
  };

  it("[row locks] two 필기 attempts on one book with money for one: one lands", async () => {
    const eco = economy();
    const id = await character(eco);
    await fund(eco, id, pilgiCost(0, 0, 1));
    const book = await kitBook(id, "wangdo");
    const [a, b] = racers();
    const results = await Promise.all([
      op(a, id, "pilgi", { item: book }),
      op(b, id, "pilgi", { item: book }),
    ]);
    expect(oks(results)).toBe(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "pilgi_cost" });
    expect(await pinecones(id)).toBe("0");
  });

  it("[row locks] two 제련 that share a copy: one lands", async () => {
    const eco = economy();
    const id = await character(eco);
    await fund(eco, id, bindFunds("graph-note", 5));
    await fund(eco, id, { pinecone: forgeFee(0, PAGE) * 2 });
    const [c1, c2, c3, c4, c5] = [
      await craft(eco, id, "graph-note"),
      await craft(eco, id, "graph-note"),
      await craft(eco, id, "graph-note"),
      await craft(eco, id, "graph-note"),
      await craft(eco, id, "graph-note"),
    ] as string[];
    const [a, b] = racers();
    const results = await Promise.all([
      op(a, id, "forge", { items: [c1, c2, c3] as [string, string, string] }),
      op(b, id, "forge", { items: [c3, c4, c5] as [string, string, string] }),
    ]);
    expect(oks(results)).toBe(1);
    // Two kit books and three of the five copies: one forge ate two.
    expect(await itemIds(id)).toHaveLength(5);
  });

  it("[row locks] two purchases with money for one: one lands", async () => {
    const eco = economy();
    const id = await character(eco);
    const water = VENDING.fixed[0];
    await fund(eco, id, { pinecone: shopPrice(water, PAGE) });
    const [a, b] = racers();
    const results = await Promise.all([
      op(a, id, "shop.buy", { item: water.id, qty: 1 }),
      op(b, id, "shop.buy", { item: water.id, qty: 1 }),
    ]);
    expect(oks(results)).toBe(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "buy_cost" });
    const held = await db.pool.query(
      "select qty from materials where character_id = $1 and def_id = $2",
      [id, `snack:${water.id}`],
    );
    expect(Number(held.rows[0].qty)).toBe(1);
  });

  it("[row locks] equipping a copy while 제련 eats it: one lands", async () => {
    const eco = economy();
    const id = await character(eco);
    await fund(eco, id, bindFunds("wangdo", 3));
    await fund(eco, id, { pinecone: forgeFee(0, PAGE) });
    const [c1, c2, c3] = [
      await craft(eco, id, "wangdo"),
      await craft(eco, id, "wangdo"),
      await craft(eco, id, "wangdo"),
    ] as string[];
    const [a, b] = racers();
    // 제련 keeps the first of equal copies and eats the other two, `c2` among them.
    const results = await Promise.all([
      op(a, id, "equip", { item: c2 as string, slot: 0 }),
      op(b, id, "forge", { items: [c1, c2, c3] as [string, string, string] }),
    ]);
    expect(oks(results)).toBe(1);
    expect(["item_equipped", "item_missing"]).toContain(
      (results.find((r) => !r.ok) as { error: string }).error,
    );
  });

  it("[character lock] a pool claim racing itself pays once", async () => {
    const id = await character(economy());
    const rates = { exp: 40, pinecone: 9, sheets: 0.002, ink: 0.01 };
    const started = new Date(NOW.getTime() - 2 * 3600_000);
    await db.pool.query(
      `update characters set pool_started_at = $2, pool_rates = $3, pool_place = 'field',
         pool_sheet_book = 'wangdo' where id = $1`,
      [id, started, JSON.stringify(rates)],
    );
    const [a, b] = racers();
    const results = await Promise.all([op(a, id, "claimPool", {}), op(b, id, "claimPool", {})]);
    expect(oks(results)).toBe(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "pool_empty" });
    const fill = poolFill(rates, 2 * 3600, "field", false, catchUp(1, PAGE));
    const paid = claimPool({}, fill, "wangdo");
    expect(paid.ok && (await pinecones(id))).toBe(String(paid.ok && paid.state.purse.pinecone));
  });

  it("[character lock] two allocations of the last stat points: one lands and neither is lost", async () => {
    const id = await character(economy());
    const [a, b] = racers();
    const results = await Promise.all([
      op(a, id, "stats.allocate", { add: { understanding: 3 } }),
      op(b, id, "stats.allocate", { add: { luck: 3 } }),
    ]);
    expect(oks(results)).toBe(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "stat_points" });
    const stats = (await economy().ops.snapshot(id))?.progression.stats;
    expect((stats?.understanding ?? 0) + (stats?.luck ?? 0)).toBe(3);
  });

  it("[character lock] two copies of one book into two empty slots at once: one lands", async () => {
    const eco = economy();
    const id = await character(eco);
    for (const def of STARTER_BOOKS.math) {
      expect((await op(eco, id, "unequip", { item: await kitBook(id, def) })).ok).toBe(true);
    }
    await fund(eco, id, bindFunds("wangdo", 2));
    const c1 = await craft(eco, id, "wangdo");
    const c2 = await craft(eco, id, "wangdo");
    const [a, b] = racers();
    const results = await Promise.all([
      op(a, id, "equip", { item: c1, slot: 0 }),
      op(b, id, "equip", { item: c2, slot: 1 }),
    ]);
    expect(oks(results)).toBe(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "equip_duplicate" });
  });

  it("[delta writes] a drop grant racing a spend: both land and neither is lost", async () => {
    const eco = economy();
    const id = await character(eco);
    const cost = pilgiCost(0, 0, 1);
    await fund(eco, id, { pinecone: 1000, ink: cost.ink });
    const book = await kitBook(id, "wangdo");
    const [a, b] = racers();
    const results = await Promise.all([
      op(a, id, "pilgi", { item: book }),
      op(b, id, "grant", { exp: 0, drops: drops({ pinecone: 5000 }) }),
    ]);
    expect(oks(results)).toBe(2);
    expect(await pinecones(id)).toBe(String(1000 + 5000 - cost.pinecone));
  });
});

describe("atomicity", () => {
  it("a crash between applying and committing leaves nothing behind", async () => {
    const crashing = economy({
      hooks: {
        beforeCommit: (o) => {
          if (o.name === "craft") throw new Error("power cut");
        },
      },
    });
    const id = await character(crashing);
    await fund(crashing, id, bindFunds("wangdo"));
    const before = await everything(crashing, id);
    const opId = randomUUID();
    await expect(op(crashing, id, "craft", { def: "wangdo" }, opId)).rejects.toThrow("power cut");
    expect(await everything(crashing, id)).toEqual(before);
    // The id was never recorded, so the retry applies, once.
    const eco = economy();
    const landed = await op(eco, id, "craft", { def: "wangdo" }, opId);
    expect(landed.ok).toBe(true);
    expect(await op(eco, id, "craft", { def: "wangdo" }, opId)).toEqual(landed);
    expect(await itemIds(id)).toHaveLength(3);
  });

  it("a new character's kit is made inside the creating transaction", async () => {
    const eco = economy();
    const auth = createAuthService({ db, onCharacterCreated: eco.giveKit });
    const look = { body: "a", hair: "b", hairColor: "c", face: "d", uniform: "e", accessories: [] };
    const account = async (login: string) =>
      (
        await db.pool.query(
          `insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
           values ($1, 'x', true, 'ip') returning id`,
          [login],
        )
      ).rows[0].id as string;
    const made = await auth.createCharacter(await account("kitmaker"), {
      name: "물리학생",
      major: "physics",
      look,
    });
    if (!made.ok) throw new Error(made.error);
    const snapshot = await eco.ops.snapshot(made.value.id);
    const kit = [...(snapshot?.items ?? [])].sort((x, y) => (x.slot ?? 9) - (y.slot ?? 9));
    expect(kit.map((i) => [i.def, i.slot])).toEqual(
      STARTER_BOOKS.physics.map((def, slot) => [def, slot]),
    );
    expect(snapshot?.wallet).toEqual({ pinecone: "0", merit: "0", token: "0" });

    const broken = createAuthService({
      db,
      onCharacterCreated: async () => {
        throw new Error("kit failed");
      },
    });
    const orphan = await account("kitless");
    await expect(
      broken.createCharacter(orphan, { name: "빈손", major: "math", look }),
    ).rejects.toThrow("kit failed");
    const left = await db.pool.query("select 1 from characters where account_id = $1", [orphan]);
    expect(left.rowCount).toBe(0);
  });

  it("balances past 2^53 stay exact to the unit", async () => {
    const eco = economy();
    const id = await character(eco);
    const big = Number.MAX_SAFE_INTEGER;
    await fund(eco, id, { pinecone: big });
    await fund(eco, id, { pinecone: big });
    await fund(eco, id, { pinecone: 3 });
    expect(await pinecones(id)).toBe((BigInt(big) * 2n + 3n).toString());
  });
});

describe("필기", () => {
  it("keeps its pity streak through failures, resets it on success, and applies the odds it showed", async () => {
    let roll = 0;
    const eco = economy({ random: () => roll });
    const id = await character(eco);
    const book = await kitBook(id, "wangdo");
    // A book at +15, where the base chance has reached its floor.
    await db.pool.query("update items set pilgi = 15 where id = $1", [book]);
    await fund(eco, id, { pinecone: 10 ** 9, ink: 10 ** 6 });
    const shown = async () =>
      (await eco.ops.snapshot(id))?.items.find((i) => i.id === book)?.next?.chance as number;

    // Odds the player was not shown are refused before anything is spent.
    const wallet = await pinecones(id);
    expect(await op(eco, id, "pilgi", { item: book, chance: 0.99 })).toMatchObject({
      error: "odds_changed",
    });
    expect(await pinecones(id)).toBe(wallet);

    for (let fails = 0; ; fails++) {
      const chance = await shown();
      expect(chance).toBe(pilgiChance(15, fails));
      if (chance >= 1) break;
      // A roll equal to the chance misses: success is roll < chance.
      roll = chance;
      const r = await op(eco, id, "pilgi", { item: book, chance });
      expect(r).toMatchObject({ ok: true, outcome: { success: false, chance } });
    }
    // The streak made the next attempt certain; even the highest roll lands.
    const fails = (await eco.ops.snapshot(id))?.items.find((i) => i.id === book)?.pilgiFails;
    expect(fails).toBe(8);
    roll = 0.999999;
    const certain = await op(eco, id, "pilgi", { item: book, chance: 1 });
    expect(certain).toMatchObject({ ok: true, outcome: { success: true, chance: 1 } });
    const after = (await eco.ops.snapshot(id))?.items.find((i) => i.id === book);
    expect(after).toMatchObject({ pilgi: 16, pilgiFails: 0, next: { chance: pilgiChance(16, 0) } });

    // Just under the shown chance lands.
    roll = pilgiChance(16, 0) - 1e-9;
    expect(await op(eco, id, "pilgi", { item: book, chance: pilgiChance(16, 0) })).toMatchObject({
      outcome: { success: true },
    });
  });
});

describe("combat grants", () => {
  it("a thousand kills land as one operation, and a flush whose answer was lost lands once", async () => {
    const eco = economy();
    const id = await character(eco);
    let lose = true;
    const grants = new GrantBuffer({
      async execute(...args: Parameters<Economy["executor"]["execute"]>) {
        const result = await eco.executor.execute(...args);
        if (lose) {
          lose = false;
          throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
        }
        return result;
      },
    });
    const field = (i: number) => ({
      ...SOURCE,
      rank: "normal" as const,
      fieldId: `field-${i % 2}`,
    });
    for (let i = 0; i < 1000; i++) {
      grants.add(id, {
        exp: 2,
        drops: [
          { item: { kind: "coin", amount: 7 }, source: field(i) },
          ...(i % 100 === 0 ? [{ item: { kind: "ink", qty: 1 } as const, source: field(i) }] : []),
        ],
      });
    }
    await grants.flush();
    expect(grants.waiting).toBe(1);
    // In flight under its id, so pruning keeps its record.
    expect(grants.inflightIds()).toHaveLength(1);
    await grants.flush();
    expect(grants.waiting).toBe(0);
    expect(await pinecones(id)).toBe("7000");
    const grantsRecorded = await db.pool.query(
      "select count(*)::int as n from operations where character_id = $1 and name = 'grant'",
      [id],
    );
    expect(grantsRecorded.rows[0].n).toBe(1);
    // One ledger row per source, not per kill.
    const rows = await db.pool.query(
      "select count(*)::int as n from economy_ledger where character_id = $1 and currency = 'pinecone'",
      [id],
    );
    expect(rows.rows[0].n).toBe(2);
  });
});

describe("under load", () => {
  it("hundreds of random concurrent operations and retries keep every invariant", async () => {
    const rng = new Random(20261125);
    const eco = economy({ random: () => rng.next() });
    const majors = MAJORS.slice(0, 4);
    const chars = await Promise.all(majors.map((m) => character(eco, m)));
    for (const [i, c] of chars.entries()) {
      const [first, second] = STARTER_BOOKS[majors[i] as Major];
      await fund(eco, c, {
        pinecone: 3_000_000,
        ink: 3000,
        binding: 40,
        sheets: { [first]: 500, [second]: 300 },
        tools: Array(4).fill(bookById(first).tool),
        exp: expToNext(1) * 4,
      });
    }

    type Sent = { c: string; opId: string; name: AnyOp; req: Requests[AnyOp] };
    const history: Sent[] = [];
    const results = new Map<string, ExecResult[]>();
    const stock = vendingStock(vendingWeek(NOW.getTime())).map((s) => s.id);

    function plan(i: number, snap: NonNullable<Awaited<ReturnType<Economy["ops"]["snapshot"]>>>) {
      const c = chars[i] as string;
      const major = majors[i] as Major;
      const books = snap.items.filter((x) => x.kind === "book");
      const tools = snap.items.filter((x) => x.kind === "tool");
      const pick = <T>(xs: readonly T[]) => (xs.length ? rng.pick(xs) : undefined);
      const anyItem = () => pick(snap.items)?.id ?? randomUUID();
      const send = (name: AnyOp, req: Requests[AnyOp]): Sent => ({
        c,
        opId: randomUUID(),
        name,
        req,
      });
      switch (rng.int(11)) {
        case 0:
          return send("grant", {
            exp: rng.int(200),
            drops: drops({
              pinecone: 1 + rng.int(5000),
              ink: rng.int(5),
              sheets: { [rng.pick(STARTER_BOOKS[major])]: rng.int(25) },
              tools: rng.chance(0.2) ? [bookById(STARTER_BOOKS[major][0]).tool] : [],
            }),
          });
        case 1:
          return send("craft", { def: rng.pick(STARTER_BOOKS[major]) });
        case 2: {
          const b = pick(books);
          const req: OpRequests["pilgi"] = { item: b?.id ?? randomUUID() };
          if (b?.next && rng.chance(0.7)) req.chance = b.next.chance;
          return send("pilgi", req);
        }
        case 3: {
          const bag = books.filter((x) => x.slot === null);
          const def = pick(bag)?.def;
          const same = bag.filter((x) => x.def === def);
          const three = (same.length >= 3 ? same : books).slice(0, 3).map((x) => x.id);
          while (three.length < 3) three.push(anyItem());
          return send("forge", { items: three as [string, string, string] });
        }
        case 4:
          return send("feed", { item: pick(books)?.id ?? anyItem(), count: 1 + rng.int(15) });
        case 5:
          return send("merge", {
            into: pick(tools)?.id ?? anyItem(),
            from: pick(tools)?.id ?? anyItem(),
          });
        case 6:
          return send("equip", { item: anyItem(), slot: rng.int(3) });
        case 7:
          return send("unequip", { item: anyItem() });
        case 8:
          return send("stats.allocate", { add: { [rng.pick(STAT_IDS)]: rng.int(3) } });
        case 9:
          return rng.chance(0.3)
            ? send("stats.reset", {})
            : send("shop.buy", { item: rng.pick(stock), qty: 1 + rng.int(3) });
        default:
          return send("claimPool", {});
      }
    }

    for (let wave = 0; wave < 6; wave++) {
      const snaps = await Promise.all(chars.map((c) => eco.ops.snapshot(c)));
      const batch: Sent[] = [];
      for (let k = 0; k < 60; k++) {
        // Some requests are retries of earlier ones, sent again under the same id, sometimes
        // while the first is still in flight.
        if (history.length > 0 && rng.chance(0.2)) {
          batch.push(rng.pick(history));
          continue;
        }
        const i = rng.int(chars.length);
        const sent = plan(i, snaps[i] as NonNullable<(typeof snaps)[number]>);
        history.push(sent);
        batch.push(sent);
      }
      await Promise.all(
        batch.map(async (s) => {
          const r = await eco.executor.execute(s.c, s.opId, s.name, s.req as never);
          results.set(s.opId, [...(results.get(s.opId) ?? []), r]);
        }),
      );
    }

    // Every id got one result, however often it was sent.
    let retried = 0;
    for (const rs of results.values()) {
      if (rs.length > 1) retried++;
      for (const r of rs) expect(r).toEqual(rs[0]);
    }
    expect(retried).toBeGreaterThan(20);
    const applied = [...results.values()].filter((rs) => rs[0]?.ok).length;
    expect(applied).toBeGreaterThan(100);
    const report = await checkInvariants(db);
    if (process.env.ECONOMY_REPORT) {
      console.log(JSON.stringify({ sent: history.length, retried, applied, ...report }, null, 2));
    }
    expect(report.violations).toEqual([]);
  }, 60_000);
});

describe("rules that keep what was paid", () => {
  it("feeding more 낱장 than the book can take charges only the sheets it used", async () => {
    const eco = economy();
    const id = await character(eco);
    const cost = bindFunds("wangdo");
    await fund(eco, id, {
      ...cost,
      exp: expToNext(1) * 1.5,
      sheets: { wangdo: (cost.sheets?.wangdo ?? 0) + 500 },
    });
    const book = await craft(eco, id, "wangdo");
    const level = (await eco.ops.snapshot(id))?.progression.level as number;
    const expected = feedSheets(
      { item: textbook(book, "wangdo"), purse: { "sheet:wangdo": 500 } },
      100_000,
      level,
    );
    if (!expected.ok) throw new Error(expected.error);
    expect(expected.state.used).toBeLessThan(500);
    const r = await op(eco, id, "feed", { item: book, count: 100_000 });
    expect(r).toMatchObject({ ok: true, outcome: { used: expected.state.used } });
    const left = (await eco.ops.snapshot(id))?.materials["sheet:wangdo"];
    expect(left).toBe(500 - expected.state.used);
  });

  it("a merge past level 5 keeps the levels that do not fit on the source copy", async () => {
    const eco = economy();
    const id = await character(eco);
    await fund(eco, id, { tools: ["compass", "compass"] });
    const [into, from] = (
      await db.pool.query(
        "select id from items where owner_id = $1 and kind = 'tool' order by id",
        [id],
      )
    ).rows.map((r) => r.id as string) as [string, string];
    await db.pool.query("update items set level = 4 where id = $1", [into]);
    await db.pool.query("update items set level = 3 where id = $1", [from]);
    const expected = mergeTools(
      { id: into, def: "compass", level: 4 },
      { id: from, def: "compass", level: 3 },
    );
    const r = await op(eco, id, "merge", { into, from });
    expect(r).toMatchObject({ ok: true, outcome: { level: 5, left: 2 } });
    const levels = await db.pool.query(
      "select id, level from items where owner_id = $1 and kind = 'tool'",
      [id],
    );
    expect(Object.fromEntries(levels.rows.map((t) => [t.id, t.level]))).toEqual({
      [into]: expected.ok && expected.state.into.level,
      [from]: expected.ok && expected.state.from?.level,
    });
  });

  it("past 2^53, a spend a rounded balance allowed but the exact one cannot cover is refused as insufficient", async () => {
    const eco = economy();
    const id = await character(eco);
    // A level whose stat reset costs a multiple of four in [2^53, 2^54): there, the balance one
    // below the cost rounds up to the cost itself as a double.
    let level = 1400;
    while (statResetCost(level) < 2 ** 53 || statResetCost(level) % 4 !== 0) level++;
    const cost = statResetCost(level);
    expect(cost).toBeLessThan(2 ** 54);
    const exact = BigInt(cost) - 1n;
    expect(Number(exact.toString())).toBe(cost);
    await db.pool.query("update characters set level = $2 where id = $1", [id, level]);
    await fund(eco, id, { pinecone: Number.MAX_SAFE_INTEGER });
    await fund(eco, id, { pinecone: cost - 2 ** 53 });
    expect(await pinecones(id)).toBe(exact.toString());
    const before = await everything(eco, id);
    const opId = randomUUID();
    expect(await op(eco, id, "stats.reset", {}, opId)).toMatchObject({
      ok: false,
      error: "insufficient",
    });
    expect(await everything(eco, id)).toEqual(before);
  });
});

describe("the starter kit on first read", () => {
  it("a character made before items existed gets its kit on the first read, once", async () => {
    const eco = economy();
    const id = await bareCharacter("earth");
    const first = await eco.ops.snapshot(id);
    const second = await eco.ops.snapshot(id);
    expect(first?.items.map((i) => i.def).sort()).toEqual([...STARTER_BOOKS.earth].sort());
    expect(second?.items).toEqual(first?.items);
    expect(await itemIds(id)).toHaveLength(2);
  });

  it("two first reads at once, from two processes, both see the one kit", async () => {
    const id = await bareCharacter("biology");
    const [a, b] = await Promise.all([economy().ops.snapshot(id), economy().ops.snapshot(id)]);
    expect(a?.items).toHaveLength(2);
    expect(b?.items).toHaveLength(2);
    expect(await itemIds(id)).toHaveLength(2);
  });
});

describe("change notices", () => {
  it("a grant sends its equipped books' new EXP alone, not whole items", async () => {
    const eco = economy();
    const id = await character(eco);
    const worn = [
      await kitBook(id, STARTER_BOOKS.math[0]),
      await kitBook(id, STARTER_BOOKS.math[1]),
    ];
    const r = await fund(eco, id, { exp: 50, pinecone: 3 });
    if (!r.ok) throw new Error(r.error);
    expect(r.change.items).toBeUndefined();
    expect(Object.keys(r.change.exp ?? {}).sort()).toEqual([...worn].sort());
    expect(r.change.wallet?.pinecone).toBe("3");
  });
});

describe("combat grants that fail", () => {
  const source = { kind: "monster", fieldId: "f", monsterId: "m", rank: "normal" } as const;
  const coin = (amount: number): Drop => ({ item: { kind: "coin", amount }, source });

  it("refuses malformed credit at add, so it never joins a batch", async () => {
    const eco = economy();
    const id = await character(eco);
    const lines: string[] = [];
    const grants = new GrantBuffer(eco.executor, { log: (line) => lines.push(line) });
    expect(grants.add(id, { exp: Number.NaN, drops: [] })).toBe(false);
    expect(grants.add(id, { exp: 0, drops: [coin(1.5)] })).toBe(false);
    expect(
      grants.add(id, { exp: 0, drops: [{ item: { kind: "ink", qty: 2 ** 53 }, source }] }),
    ).toBe(false);
    expect(grants.add(id, { exp: 5, drops: [coin(40)] })).toBe(true);
    await grants.flush();
    expect(grants.waiting).toBe(0);
    expect(await pinecones(id)).toBe("40");
    expect(lines).toHaveLength(3);
  });

  it("logs a batch the database refuses whole, drops it, and later credit still lands", async () => {
    const eco = economy();
    const id = await character(eco);
    await fund(eco, id, { ink: Number.MAX_SAFE_INTEGER });
    const lines: string[] = [];
    const grants = new GrantBuffer(eco.executor, { log: (line) => lines.push(line) });
    grants.add(id, { exp: 0, drops: [coin(50), { item: { kind: "ink", qty: 1 }, source }] });
    await grants.flush();
    expect(grants.waiting).toBe(0);
    expect(
      lines.some((l) => l.includes("grant dropped (insufficient)") && l.includes('"amount":50')),
    ).toBe(true);
    grants.add(id, { exp: 0, drops: [coin(70)] });
    await grants.flush();
    expect(await pinecones(id)).toBe("70");
  });

  it("drops a batch that breaks the executor's contract instead of retrying it forever", async () => {
    const eco = economy();
    const id = await character(eco);
    const lines: string[] = [];
    const grants = new GrantBuffer(
      {
        execute: (characterId, opId, name, request, on) => {
          if ((request as { exp: number }).exp === 13) throw new ContractError("broken rule");
          return eco.executor.execute(characterId, opId, name, request, on);
        },
      },
      { log: (line) => lines.push(line) },
    );
    grants.add(id, { exp: 13, drops: [coin(1)] });
    await grants.flush();
    grants.add(id, { exp: 0, drops: [coin(9)] });
    await grants.flush();
    expect(await pinecones(id)).toBe("9");
    expect(lines.filter((l) => l.startsWith("grant dropped"))).toHaveLength(1);
  });

  it("shutdown flushes every pending grant, and a failing step does not stop the ones after it", async () => {
    const eco = economy();
    const id = await character(eco);
    eco.grants.add(id, { exp: 0, drops: [coin(25)] });
    const ran: string[] = [];
    onShutdown("broken", () => {
      throw new Error("broken step");
    });
    onShutdown("grants", async () => {
      await eco.grants.flush();
      ran.push("grants");
    });
    await runShutdown();
    expect(ran).toEqual(["grants"]);
    expect(await pinecones(id)).toBe("25");
  });
});

describe("one character cannot tie up the database", () => {
  it("a flood of one character's operations takes one connection at a time and does not hold up another", async () => {
    const eco = economy();
    const flooder = await character(eco);
    const other = await character(eco);
    let busy = 0;
    let peak = 0;
    const acquire = () => {
      busy++;
      peak = Math.max(peak, busy);
    };
    const release = () => {
      busy--;
    };
    db.pool.on("acquire", acquire);
    db.pool.on("release", release);
    try {
      let floodDone = 0;
      const flood = Promise.all(
        Array.from({ length: 30 }, () => op(eco, flooder, "pilgi", { item: randomUUID() })),
      ).then(() => {
        floodDone = performance.now();
      });
      const theirs = await op(eco, other, "stats.allocate", { add: { focus: 1 } });
      const otherDone = performance.now();
      await flood;
      expect(theirs.ok).toBe(true);
      expect(otherDone).toBeLessThan(floodDone);
      // One for the flooder's current operation, one for the other character's.
      expect(peak).toBeLessThanOrEqual(2);
    } finally {
      db.pool.off("acquire", acquire);
      db.pool.off("release", release);
    }
  });

  it("shares one budget across operation types and another across recorded refusals, and both refill", async () => {
    let clock = 1_000_000;
    const eco = economy();
    const handler = createOpHandler({
      db,
      executor: eco.executor,
      now: () => clock,
      page: () => PAGE,
    });
    const send = (id: string, op: OpMessage["op"], req: unknown) =>
      handler.run(id, { id: randomUUID(), op, req } as OpMessage);

    // Every type has budget left, but all of them together are spent.
    const busy = await character(eco);
    const book = await kitBook(busy, "wangdo");
    for (let i = 0; i < OP_TOTAL_RATE.burst; i++) {
      const r =
        i % 2 === 0
          ? await send(busy, "stats.allocate", { add: {} })
          : await send(busy, "equip", { item: book, slot: 0 });
      expect(r.ok).toBe(true);
    }
    const capped = await send(busy, "shop.buy", { item: "water", qty: 1 });
    expect(capped).toMatchObject({ ok: false, error: "rate_limited" });
    clock += (capped as { retryMs: number }).retryMs;
    expect(await send(busy, "shop.buy", { item: "water", qty: 1 })).toMatchObject({
      error: "buy_cost",
    });

    // Recorded refusals have their own, smaller budget, across types.
    const prober = await character(eco);
    for (let i = 0; i < OP_REFUSAL_RATE.burst; i++) {
      const r = await send(prober, i % 2 ? "pilgi" : "feed", {
        item: randomUUID(),
        ...(i % 2 ? {} : { count: 1 }),
      });
      expect(r).toMatchObject({ error: "item_missing" });
    }
    const quiet = await send(prober, "stats.allocate", { add: {} });
    expect(quiet).toMatchObject({ ok: false, error: "rate_limited" });
    clock += (quiet as { retryMs: number }).retryMs;
    expect(await send(prober, "stats.allocate", { add: {} })).toMatchObject({ ok: true });
  });
});

describe("operation records", () => {
  it("are forgotten after their retention, except the kit's and grants still in flight", async () => {
    const eco = economy();
    const id = await character(eco);
    await op(eco, id, "stats.allocate", { add: { focus: 1 } });
    await op(eco, id, "pilgi", { item: randomUUID() });
    const inflight = await fund(eco, id, { pinecone: 5 });
    await db.pool.query(
      "update operations set at = now() - interval '2 hours' where character_id = $1",
      [id],
    );
    await db.pool.query(
      "update economy_ledger set at = now() - interval '2 hours' where character_id = $1",
      [id],
    );
    expect(await pruneOperations(db, [inflight.id])).toBe(2);
    const left = await db.pool.query(
      "select op_id from operations where character_id = $1 order by op_id",
      [id],
    );
    expect(left.rows.map((r) => r.op_id)).toEqual([inflight.id, "kit"].sort());
  });
});
