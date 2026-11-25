/**
 * The raid's rewards and its persistent pool against a real Postgres (PLAN §26 economic
 * operations, §10 raid rules): a phase's reward goes out once per character under retries, a
 * rival process, a crash before paying and a restart, and for a character who fought in two
 * channels; a crash loses unsaved seconds, never a phase; the boss is freed once with its final
 * hit and boards; a 복습's first clear pays once. Every test ends with the economy's invariants.
 */
import { raidBoss } from "@guago/content";
import { MINUTE_MS, RaidTier, WEEK_MS } from "@guago/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/index.ts";
import { checkInvariants } from "../economy/audit.ts";
import { createEconomy, type Economy } from "../economy/index.ts";
import { LiveClock } from "../live/clock.ts";
import { createLive, type Live } from "../live/index.ts";
import { PageClock } from "../live/page.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { type Raid, RaidHub } from "./hub.ts";

/** Wednesday 2026-11-25 12:00 KST. */
const T0 = Date.UTC(2026, 10, 25, 3, 0, 0);
const ARISTOTLE = raidBoss("aristotle");
if (!ARISTOTLE) throw new Error("no aristotle");
const DEF = ARISTOTLE;

let db: Db;
let seq = 0;
const pools: Db[] = [];
const hubs: RaidHub[] = [];

beforeAll(() => {
  db = createDb(TEST_DATABASE_URL);
});
afterAll(async () => {
  await db.pool.end();
});
beforeEach(async () => {
  await db.pool.query(
    "truncate accounts, server_state, notebook, raids, raid_damage, boss_clears cascade",
  );
});
afterEach(async () => {
  for (const h of hubs.splice(0)) await h.stop();
  for (const p of pools.splice(0)) await p.pool.end();
  expect((await checkInvariants(db)).violations).toEqual([]);
});

async function world() {
  const clock = new LiveClock({ realMs: 0, gameMs: T0, rate: 1 }, () => 0);
  const page = new PageClock(db, clock);
  await page.load(1);
  page.log = () => {};
  let live: Live | undefined;
  const economy = createEconomy(db, {
    now: () => clock.date(),
    page: page.live,
    onApplied: (id, name, r) => live?.onApplied(id, name, r),
  });
  live = createLive(db, {
    clock,
    page,
    economy,
    world: () => ({ sendTo() {}, notify() {}, system() {} }),
    log: () => {},
  });
  await page.tick();
  return { clock, page, economy, live };
}
type World = Awaited<ReturnType<typeof world>>;

/** Another server process on the same database, with its own pool and executor. */
function rivalEconomy(w: World): Economy {
  const other = createDb(TEST_DATABASE_URL);
  pools.push(other);
  return createEconomy(other, { now: () => w.clock.date(), page: w.page.live });
}

function hub(
  w: World,
  executor: Economy["executor"] | { execute: Economy["executor"]["execute"] },
) {
  const h = new RaidHub({
    db,
    clock: w.clock,
    page: w.page,
    executor,
    live: () => w.live.events,
    log: () => {},
  });
  hubs.push(h);
  return h;
}

/** The Page clock walked to week 10 with both mid bosses freed: the era boss stands. */
async function eraOpen(w: World): Promise<void> {
  w.clock.step(3 * WEEK_MS);
  await w.page.tick();
  expect(await w.page.free("pythagoreans")).toBe("freed");
  w.clock.step(3 * WEEK_MS);
  await w.page.tick();
  expect(await w.page.free("zeno")).toBe("freed");
  w.clock.step(4 * WEEK_MS);
  await w.page.tick();
  expect(w.page.progress().bosses.aristotle).toBe("open");
}

const LOOK = {
  body: "b",
  hair: "h",
  hairColor: "c",
  face: "f",
  uniform: "blazer",
  accessories: [],
};

async function character(w: World): Promise<{ id: string; name: string }> {
  const n = ++seq;
  const a = await db.pool.query(
    `insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
     values ($1, 'x', true, 'ip') returning id`,
    [`raid${n}`],
  );
  const c = await db.pool.query(
    `insert into characters (account_id, name, major, look, map_id, x, y, cohort, level)
     values ($1, $2, 'physics', $3, 'p1-lyceum', 0, 0, 1, 100) returning id`,
    [a.rows[0].id, `반${n}`, JSON.stringify(LOOK)],
  );
  const id = c.rows[0].id as string;
  expect((await w.economy.executor.execute(id, "kit", "kit", {})).ok).toBe(true);
  return { id, name: `반${n}` };
}

async function tokens(id: string): Promise<number> {
  const r = await db.pool.query("select tokens from wallets where character_id = $1", [id]);
  return Number(r.rows[0]?.tokens ?? 0);
}

async function participant(raid: string, phase: number, id: string) {
  const r = await db.pool.query(
    "select * from raid_participants where raid_id = $1 and phase = $2 and character_id = $3",
    [raid, phase, id],
  );
  return r.rows[0];
}

/** Empties the pool from `by` and waits for the phase to close and its rewards to go out. */
async function finish(h: RaidHub, r: Raid, by: { id: string; name: string }): Promise<void> {
  r.hit(r.hp, 0, by);
  await h.settle();
}

describe("a phase's rewards", () => {
  it("go out once per character under retries, a rival process, a crash before paying and a restart", async () => {
    const w = await world();
    await eraOpen(w);
    let down = false;
    const real = w.economy.executor;
    const h = hub(w, {
      execute: ((...args: Parameters<typeof real.execute>) =>
        down
          ? Promise.reject(new Error("executor down"))
          : real.execute(...args)) as typeof real.execute,
    });
    await h.poll();
    const r = h.raidFor("aristotle");
    if (!r) throw new Error("no raid");
    expect(r.phase).toBe(1);
    const a = await character(w);
    const b = await character(w);
    // a fights in two channels of the arena this phase, b in one.
    r.credit(a.id, a.name, 4000, 20 * MINUTE_MS, 1, 0);
    r.credit(a.id, a.name, 3000, 15 * MINUTE_MS, 0, 5);
    r.credit(b.id, b.name, 10, 1000, 0, 0);
    await h.save();
    await finish(h, r, a);

    expect(r.phase).toBe(2);
    const pa = await participant(r.id, 1, a.id);
    expect(Number(pa.damage)).toBe(7000);
    expect(Number(pa.active_ms)).toBe(35 * MINUTE_MS);
    expect(pa.tier).toBe(RaidTier.Contributor);
    expect(pa.paid).toBe(true);
    expect((await participant(r.id, 1, b.id)).tier).toBe(RaidTier.Present);
    const ta = await tokens(a.id);
    const tb = await tokens(b.id);
    expect(ta).toBe(DEF.rewards.tokens[RaidTier.Contributor]);
    expect(tb).toBe(DEF.rewards.tokens[RaidTier.Present]);

    // Retried here twice at once and by another process: nothing more.
    const rival = hub(w, rivalEconomy(w).executor);
    const again = await Promise.all([
      h.payPhase(r.id, 1, DEF),
      h.payPhase(r.id, 1, DEF),
      rival.payPhase(r.id, 1, DEF),
    ]);
    expect(again).toEqual([0, 0, 0]);
    expect(await tokens(a.id)).toBe(ta);
    expect(await tokens(b.id)).toBe(tb);

    // Phase 2 closes while the executor is down: its rewards wait in the rows.
    r.credit(a.id, a.name, 50, 0, 10, 0);
    await h.save();
    down = true;
    await finish(h, r, a);
    expect(r.phase).toBe(3);
    const unpaid = await participant(r.id, 2, a.id);
    expect(unpaid.tier).toBe(RaidTier.Core);
    expect(unpaid.paid).toBe(false);
    expect(await tokens(a.id)).toBe(ta);

    // A restart finds them and pays once; a second restart finds nothing.
    down = false;
    const restarted = hub(w, real);
    await restarted.start();
    await restarted.settle();
    expect(await tokens(a.id)).toBe(ta + (DEF.rewards.tokens[RaidTier.Core] ?? 0));
    expect((await participant(r.id, 2, a.id)).paid).toBe(true);
    const twice = hub(w, real);
    await twice.start();
    await twice.settle();
    expect(await tokens(a.id)).toBe(ta + (DEF.rewards.tokens[RaidTier.Core] ?? 0));
    // The restarted hubs hold the raid at phase 3, as written.
    expect(twice.raidFor("aristotle")?.phase).toBe(3);
  });

  it("are bound when an era boss's roll drops a tool, and booked in the ledger", async () => {
    const w = await world();
    await eraOpen(w);
    const h = hub(w, w.economy.executor);
    await h.poll();
    const r = h.raidFor("aristotle") as Raid;
    const a = await character(w);
    r.credit(a.id, a.name, 1, 3 * 60 * MINUTE_MS, 0, 0);
    await finish(h, r, a);
    // A boss roll always drops a tool (DROPS.toolChance.boss = 1): bound, since an era boss's.
    const items = await db.pool.query(
      `select i.bound from items i join economy_ledger l on l.item_id = i.id
       where l.character_id = $1 and l.source_or_sink = 'drop.boss.aristotle.p1-lyceum'`,
      [a.id],
    );
    expect(items.rows.length).toBeGreaterThan(0);
    expect(items.rows.every((x) => x.bound === true)).toBe(true);
    const ledger = await db.pool.query(
      "select count(*)::int as n from economy_ledger where character_id = $1 and source_or_sink = 'raid.aristotle.phase'",
      [a.id],
    );
    expect(ledger.rows[0].n).toBeGreaterThan(0);
  });
});

describe("the pool", () => {
  it("loses at most what was not yet written in a crash, never a phase", async () => {
    const w = await world();
    await eraOpen(w);
    const h = hub(w, w.economy.executor);
    await h.poll();
    const r = h.raidFor("aristotle") as Raid;
    const max = r.max;
    r.hit(max * 0.25, 4, null);
    await h.save();
    r.hit(max * 0.25, 0, null);
    // The process dies here: a new one reads the pool as last written.
    const after = hub(w, w.economy.executor);
    await after.start();
    const back = after.raidFor("aristotle") as Raid;
    expect(back.phase).toBe(1);
    expect(back.hp).toBeCloseTo(max * 0.75, 3);
    expect(back.shield).toBeCloseTo(0.8, 6);
    // A closed phase stays closed.
    const a = await character(w);
    back.credit(a.id, a.name, 1, 0, 0, 0);
    await finish(after, back, a);
    const again = hub(w, w.economy.executor);
    await again.start();
    expect(again.raidFor("aristotle")?.phase).toBe(2);
    const phases = await db.pool.query(
      "select phase, max_hp, ended_at from raid_phases where raid_id = $1 order by phase",
      [r.id],
    );
    expect(phases.rows.map((p) => Number(p.phase))).toEqual([1, 2]);
    expect(phases.rows[0].ended_at).not.toBeNull();
    expect(phases.rows[1].ended_at).toBeNull();
  });
});

describe("freeing the boss", () => {
  it("tells the Page clock once with the final hit and the boards, across processes and restarts", async () => {
    const w = await world();
    await eraOpen(w);
    const h = hub(w, w.economy.executor);
    await h.poll();
    const r = h.raidFor("aristotle") as Raid;
    const a = await character(w);
    const b = await character(w);
    for (let phase = 1; phase <= DEF.phases; phase++) {
      r.credit(a.id, a.name, 9000, 3 * 60 * MINUTE_MS, 1, 0);
      r.credit(b.id, b.name, 10, 60 * MINUTE_MS, 4, 25);
      await h.save();
      await finish(h, r, b);
    }
    expect(r.freed).toBe(true);
    expect(w.page.freedBosses().aristotle).toBeDefined();
    const nb = await db.pool.query("select * from notebook_bosses where boss_id = 'aristotle'");
    expect(nb.rows).toHaveLength(1);
    expect(nb.rows[0].final_hit_name).toBe(b.name);
    expect(nb.rows[0].board_leaders).toEqual([
      { board: "damage", id: a.id, name: a.name },
      { board: "support", id: b.id, name: b.name },
      { board: "objectives", id: b.id, name: b.name },
    ]);
    const titles = async (id: string) =>
      (await db.pool.query("select titles from characters where id = $1", [id])).rows[0].titles;
    expect(await titles(a.id)).toContain("raid-damage-aristotle");
    expect(await titles(b.id)).toEqual(
      expect.arrayContaining(["raid-support-aristotle", "raid-objectives-aristotle"]),
    );
    // Every phase paid once: four phases at 핵심 for a.
    expect(await tokens(a.id)).toBe(4 * (DEF.rewards.tokens[RaidTier.Core] ?? 0));
    // Another process and a restart change nothing.
    expect(await w.live.events.bossFreed("aristotle", {})).toBe("already");
    const after = hub(w, rivalEconomy(w).executor);
    await after.start();
    await after.poll();
    await after.settle();
    expect(after.raidFor("aristotle")).toBeUndefined();
    expect((await db.pool.query("select 1 from notebook_bosses")).rows).toHaveLength(3);
    expect((await titles(a.id)).filter((t: string) => t === "raid-damage-aristotle")).toHaveLength(
      1,
    );
    expect(await tokens(a.id)).toBe(4 * (DEF.rewards.tokens[RaidTier.Core] ?? 0));
  });
});

describe("a 복습's first clear", () => {
  it("pays once however often it is cleared, and from whichever process", async () => {
    const w = await world();
    const h = hub(w, w.economy.executor);
    const rival = hub(w, rivalEconomy(w).executor);
    const a = await character(w);
    await Promise.all([
      h.payFirstClear(a.id, "zeno"),
      h.payFirstClear(a.id, "zeno"),
      rival.payFirstClear(a.id, "zeno"),
    ]);
    await h.payFirstClear(a.id, "zeno");
    const zeno = raidBoss("zeno");
    expect(await tokens(a.id)).toBe(zeno?.firstClear.tokens);
    await h.payFirstClear(a.id, "pythagoreans");
    expect(await tokens(a.id)).toBe(
      (zeno?.firstClear.tokens ?? 0) + (raidBoss("pythagoreans")?.firstClear.tokens ?? 0),
    );
    const rows = await db.pool.query("select boss_id from boss_clears where character_id = $1", [
      a.id,
    ]);
    expect(rows.rows.map((x) => x.boss_id).sort()).toEqual(["pythagoreans", "zeno"]);
  });
});
