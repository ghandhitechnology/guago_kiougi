/**
 * The living world's economic operations against a real Postgres (PLAN §26): a notice's reward
 * is claimed once under racing claims and across a reset, a 도움 reward is paid once, 상점 and
 * 벌점 cancel exactly, and a pool starts once per logout and never fills while online. Every test
 * ends with the economy's invariant check, which includes the conduct ledger.
 */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  type Character,
  CLUB_EXP_FOR_NOTICE,
  catchUp,
  DAY_MS,
  HOUR_MS,
  MERIT_TALLY_DAILY,
  MINUTE_MS,
  POOL,
  poolTerms,
} from "@guago/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clubActivity } from "../club-activity.ts";
import { createDb, type Db } from "../db/index.ts";
import { checkInvariants } from "../economy/audit.ts";
import type { ExecutorOptions } from "../economy/executor.ts";
import { createEconomy } from "../economy/index.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { LiveClock } from "./clock.ts";
import { createLive, type Live } from "./index.ts";
import { helpQuestId } from "./ops.ts";
import { PageClock } from "./page.ts";

/** Wednesday 2026-11-25 12:00 KST. */
const T0 = Date.UTC(2026, 10, 25, 3, 0, 0);

let db: Db;
let seq = 0;

beforeAll(() => {
  db = createDb(TEST_DATABASE_URL);
});
afterAll(async () => {
  await db.pool.end();
});
beforeEach(async () => {
  await db.pool.query("truncate accounts, server_state, notebook cascade");
});
afterEach(async () => {
  for (const p of pools.splice(0)) await p.pool.end();
  expect((await checkInvariants(db)).violations).toEqual([]);
});

/** Extra connection pools a test opened, closed after it. */
const pools: Db[] = [];

async function world(
  o: {
    listen?: (id: string, name: string) => void;
    testEvents?: boolean;
    secret?: string;
    hooks?: ExecutorOptions["hooks"];
  } = {},
) {
  const lines: string[] = [];
  const clock = new LiveClock({ realMs: 0, gameMs: T0, rate: 1 }, () => 0);
  const page = new PageClock(db, clock);
  await page.load(1);
  let live: Live | undefined;
  const economy = createEconomy(db, {
    now: () => clock.date(),
    page: page.live,
    onApplied: (id, name, r) => {
      o.listen?.(id, name);
      live?.onApplied(id, name, r);
    },
    ...(o.hooks ? { hooks: o.hooks } : {}),
  });
  live = createLive(db, {
    clock,
    page,
    economy,
    world: () => ({ sendTo() {}, notify() {}, system: (l) => void lines.push(l.key) }),
    log: () => {},
    ...(o.testEvents ? { testEvents: true } : {}),
    ...(o.secret ? { adminSecret: o.secret } : {}),
  });
  page.log = () => {};
  await page.tick();
  return { clock, page, economy, live, lines };
}

/**
 * Another server process on the same database: its own connection pool and executor, so its
 * operations race the first one's at the database's locks, not in one process's lane.
 */
function rival(w: World) {
  const other = createDb(TEST_DATABASE_URL);
  pools.push(other);
  return createEconomy(other, { now: () => w.clock.date(), page: w.page.live }).executor;
}

type World = Awaited<ReturnType<typeof world>>;

const LOOK = {
  body: "b",
  hair: "h",
  hairColor: "c",
  face: "f",
  uniform: "blazer",
  accessories: [],
};

async function character(w: World, level = 1, map = "lawn", x = 0, y = 0): Promise<Character> {
  const n = ++seq;
  const a = await db.pool.query(
    `insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
     values ($1, 'x', true, 'ip') returning id`,
    [`live${n}`],
  );
  const c = await db.pool.query(
    `insert into characters (account_id, name, major, look, map_id, x, y, cohort, level)
     values ($1, $2, 'math', $3, $4, $5, $6, 1, $7) returning id`,
    [a.rows[0].id, `생${n}`, JSON.stringify(LOOK), map, x, y, level],
  );
  const id = c.rows[0].id as string;
  expect((await w.economy.executor.execute(id, "kit", "kit", {})).ok).toBe(true);
  return { id, name: `생${n}`, major: "math", look: LOOK, level, mapId: map, x, y, cohort: 1 };
}

async function row(id: string) {
  return (await db.pool.query("select * from characters where id = $1", [id])).rows[0];
}

async function ledgerCount(id: string, key: string): Promise<number> {
  const r = await db.pool.query(
    "select count(distinct operation_id)::int as n from economy_ledger where character_id = $1 and source_or_sink = $2",
    [id, key],
  );
  return r.rows[0].n;
}

/** Plays whatever a notice asks for, through the same events combat and navigation send. */
async function complete(w: World, id: string, questId: string): Promise<void> {
  const q = await w.live.board.quest(id, questId);
  if (!q) throw new Error(`no quest ${questId}`);
  const slots = q.offer.slots ?? {};
  for (let i = 0; i < q.target; i++) {
    switch (q.offer.kind) {
      case "hunt":
        w.live.events.kill(id, String(slots.monster));
        break;
      case "collect":
        w.live.events.collect(id, String(slots.item));
        break;
      case "deliver":
        w.live.events.deliver(id, String(slots.npc ?? "anyone"));
        break;
      case "escort":
        w.live.events.escort(id, String(slots.npc ?? "anyone"));
        break;
      case "nohit":
        w.live.events.cleanWave(id, String(slots.place ?? "anywhere"));
        break;
      default:
        w.live.events.story(id, String(q.offer.template));
    }
  }
  await w.live.progress.flush(id);
  expect((await w.live.board.quest(id, questId))?.state).toBe("done");
}

describe("수행평가 board", () => {
  it("a notice's reward is claimed once under racing claims and across a reset", async () => {
    const w = await world();
    const c = await character(w);
    await w.live.board.ensure(c.id);
    const day = Math.floor((T0 + 4 * HOUR_MS) / DAY_MS);
    const quest = `daily:${day}:0`;
    await complete(w, c.id, quest);

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        w.economy.executor.execute(c.id, randomUUID(), "quest.claim", { quest }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.error)).toEqual(
      Array(5).fill("quest_claimed"),
    );
    expect(await ledgerCount(c.id, "quest.daily")).toBe(1);

    // The board turns at 05:00 KST: today's notices are new rows; yesterday's claim stays spent.
    w.clock.step(DAY_MS);
    await w.live.board.ensure(c.id);
    const again = await w.economy.executor.execute(c.id, randomUUID(), "quest.claim", { quest });
    expect(again).toMatchObject({ ok: false, error: "quest_claimed" });
    expect(await ledgerCount(c.id, "quest.daily")).toBe(1);
    const fresh = await w.live.board.quest(c.id, `daily:${day + 1}:0`);
    expect(fresh?.state).toBe("active");

    // Back after three days: today's board, drawn once, and nothing for the days missed.
    w.clock.step(3 * DAY_MS);
    expect(await w.live.board.ensure(c.id)).not.toBeNull();
    expect(await w.live.board.ensure(c.id)).toBeNull();
    const days = await db.pool.query(
      "select distinct split_part(quest_id, ':', 2) as d from quest_progress where character_id = $1 and quest_id like 'daily:%' order by 1",
      [c.id],
    );
    expect(days.rows.map((r) => Number(r.d))).toEqual([day, day + 1, day + 4]);
    // An expired notice takes no more progress.
    const old = await w.live.board.quest(c.id, `daily:${day + 1}:1`);
    if (old?.offer.kind === "hunt") {
      w.live.events.kill(c.id, String(old.offer.slots?.monster), old.target);
      await w.live.progress.flush(c.id);
      expect((await w.live.board.quest(c.id, old.id))?.state).toBe("active");
    }
  });

  it("a 도움 reward is paid once", async () => {
    const w = await world();
    const poster = await character(w, 1);
    const helper = await character(w, 30);
    const other = await character(w, 40);
    const posted = await w.live.board.post(poster.id, "help-revive");
    if ("refused" in posted) throw new Error(posted.refused);
    expect(posted.result.ok).toBe(true);
    // A second notice while the first is up is refused.
    const second = await w.live.board.post(poster.id, "help-walk");
    expect("result" in second && second.result).toMatchObject({ ok: false, error: "help_open" });

    const [a, b] = await Promise.all([
      w.live.board.take(helper.id, posted.notice),
      w.live.board.take(other.id, posted.notice),
    ]);
    const taken = [a, b].filter((r) => "ok" in r && r.ok);
    expect(taken).toHaveLength(1);
    const winner = a && "ok" in a && a.ok ? helper : other;

    const quest = helpQuestId(posted.notice);
    w.live.progress.help(winner.id, quest, posted.notice);
    await w.live.progress.flush(winner.id);
    w.live.progress.help(winner.id, quest, posted.notice);
    await w.live.progress.flush(winner.id);

    expect((await w.live.board.quest(winner.id, quest))?.state).toBe("claimed");
    expect(await ledgerCount(winner.id, "merit.help")).toBe(1);
    const r = await row(winner.id);
    expect([r.merits, r.demerits]).toEqual([1, 0]);
    const wallet = await db.pool.query("select merit_points from wallets where character_id = $1", [
      winner.id,
    ]);
    expect(wallet.rows[0].merit_points).toBe("1");
    const notice = await db.pool.query("select state from help_notices where id = $1", [
      posted.notice,
    ]);
    expect(notice.rows[0].state).toBe("done");
  });
});

describe("벌점 and 상점", () => {
  it("cancel one for one, and 명령퇴사 comes once at 20", async () => {
    const w = await world();
    const c = await character(w);
    const friend = await character(w);
    for (let i = 0; i < 3; i++) await w.live.events.knockout(c.id);
    expect((await row(c.id)).demerits).toBe(3);
    await w.live.events.revive(c.id, friend.id);
    expect((await row(c.id)).demerits).toBe(2);
    for (let i = 0; i < 3; i++) await w.live.events.cleaning(c.id);
    let r = await row(c.id);
    expect([r.demerits, r.merits]).toEqual([0, 4]);
    const wallet = await db.pool.query("select merit_points from wallets where character_id = $1", [
      c.id,
    ]);
    // Four 상점 against three 벌점 left: one spare in the wallet.
    expect(wallet.rows[0].merit_points).toBe("1");

    // Ten patrol catches at once: +2 each, sent home exactly once on reaching 20.
    await Promise.all(Array.from({ length: 10 }, () => w.live.events.patrolCaught(c.id)));
    r = await row(c.id);
    expect([r.demerits, r.expulsions, r.patrol_catches]).toEqual([0, 1, 10]);
    expect(r.titles).toEqual(expect.arrayContaining(["went-home", "caught"]));
    const home = new Date(r.home_until).getTime();
    expect(home).toBe(w.clock.now() + 10 * MINUTE_MS);
    expect(new Date(r.penalty_until).getTime()).toBe(home + HOUR_MS);
  });
});

describe("자습 pool", () => {
  it("starts once per logout and never fills while online", async () => {
    const w = await world();
    const c = await character(w);
    await w.live.joined(c, "world", "s1");
    // Twelve minutes of hunting in a field: 50 EXP and 10 솔방울 every five seconds.
    const source = {
      kind: "monster",
      fieldId: "p1-colonnade",
      monsterId: "odap",
      rank: "normal",
    } as const;
    for (let i = 0; i < 144; i++) {
      w.live.credit(c.id, { exp: 50, drops: [{ item: { kind: "coin", amount: 10 }, source }] });
      w.clock.step(5000);
    }
    await w.live.left(c.id, "world", "s1", false);
    const started = (await row(c.id)).pool_started_at;
    expect(started).not.toBeNull();
    // The same logout again is the same operation; a replaced seat is no logout at all.
    await w.live.left(c.id, "world", "s1", false);
    await w.live.left(c.id, "world", "s0", true);
    expect((await row(c.id)).pool_started_at).toEqual(started);

    w.clock.step(2 * HOUR_MS);
    await w.live.joined(c, "world", "s2");
    w.clock.step(3 * HOUR_MS);
    const view = await w.economy.ops.snapshot(c.id);
    expect(view?.progression.pool?.fill.seconds).toBe(2 * 3600);
    const rate = 50 / 5;
    const expected = rate * poolTerms("hub").share * 7200 * catchUp(1, 1);
    expect(view?.progression.pool?.fill.exp).toBeCloseTo(expected, 6);

    // The next logout pays the pool left unclaimed, once, and starts the next.
    await w.live.left(c.id, "world", "s2", false);
    await w.live.left(c.id, "world", "s2", false);
    expect(await ledgerCount(c.id, "pool")).toBe(1);
    const r = await row(c.id);
    expect(new Date(r.pool_started_at).getTime()).toBe(w.clock.now());
    expect(r.pool_stopped_at).toBeNull();
    expect(r.pool_place).toBe("hub");
    expect(r.hunt_rates).toMatchObject({ field: "p1-colonnade", exp: rate });
    expect(POOL.windowSeconds).toBe(600);
  });

  it("logging out in the 기숙사 gives 숙면 on the next login", async () => {
    const w = await world();
    const c = await character(w, 1, "saebyeok", 100, 100);
    await w.live.joined(c, "world", "a");
    await w.live.left(c.id, "world", "a", false);
    expect((await row(c.id)).pool_place).toBe("dorm");
    // Straight back in: no sleep, no 숙면.
    w.clock.step(5 * MINUTE_MS);
    await w.live.joined(c, "world", "b");
    expect((await row(c.id)).rested_until).toBeNull();
    await w.live.left(c.id, "world", "b", false);
    // A night's sleep: the full thirty minutes.
    w.clock.step(7 * HOUR_MS);
    await w.live.joined(c, "world", "c");
    const r = await row(c.id);
    expect(new Date(r.rested_until).getTime()).toBe(w.clock.now() + 30 * MINUTE_MS);
  });
});

describe("operation ids", () => {
  it("a replayed id is not heard again by the listeners", async () => {
    const heard: string[] = [];
    const w = await world({ listen: (_id, name) => heard.push(name) });
    const c = await character(w);
    await w.live.board.ensure(c.id);
    const day = Math.floor((T0 + 4 * HOUR_MS) / DAY_MS);
    const quest = `weekly:${Math.floor((day + 3) / 7)}:0`;
    await complete(w, c.id, quest);
    clubActivity.take();
    heard.length = 0;
    const first = await w.economy.executor.execute(c.id, "claim-once", "quest.claim", { quest });
    expect(first.ok).toBe(true);
    for (let i = 0; i < 5; i++) {
      const again = await w.economy.executor.execute(c.id, "claim-once", "quest.claim", { quest });
      expect(again).toEqual(first);
    }
    expect(heard.filter((n) => n === "quest.claim")).toHaveLength(1);
    expect(clubActivity.take().get(c.id)).toBe(CLUB_EXP_FOR_NOTICE.weekly);
  });
});

describe("admin route", () => {
  /** One request through the route as Node would hand it over. */
  async function call(
    w: World,
    body: unknown,
    o: { from?: string; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: string }> {
    const req = Object.assign(new EventEmitter(), {
      url: "/admin/live",
      method: "POST",
      headers: o.headers ?? {},
      socket: { remoteAddress: o.from ?? "127.0.0.1" },
      destroy() {},
    });
    return new Promise((resolve) => {
      const res = {
        statusCode: 200,
        setHeader() {},
        end(text = "") {
          resolve({ status: res.statusCode, body: String(text) });
        },
      };
      w.live.adminRoute(req as never, res as never, () => resolve({ status: -1, body: "" }));
      req.emit("data", Buffer.from(JSON.stringify(body)));
      req.emit("end");
    });
  }

  it("takes only this machine's direct requests that carry the secret", async () => {
    const w = await world({ secret: "s3cret" });
    const bearer = { authorization: "Bearer s3cret" };
    expect((await call(w, { cmd: "state" })).status).toBe(401);
    expect(
      (await call(w, { cmd: "state" }, { headers: { authorization: "Bearer nope" } })).status,
    ).toBe(401);
    expect((await call(w, { cmd: "state" }, { headers: bearer, from: "10.0.0.2" })).status).toBe(
      404,
    );
    const proxied = { ...bearer, "x-forwarded-for": "203.0.113.9" };
    expect((await call(w, { cmd: "state" }, { headers: proxied })).status).toBe(404);
    expect((await call(w, { cmd: "state" }, { headers: bearer })).status).toBe(200);
    // A live server only reads: the clock and the bosses stay where they are.
    const before = w.clock.now();
    for (const cmd of [
      { cmd: "step", by: "1w" },
      { cmd: "rate", rate: 9 },
      { cmd: "free", boss: "pythagoreans" },
      { cmd: "flush" },
    ]) {
      expect((await call(w, cmd, { headers: bearer })).status).toBe(400);
    }
    expect([w.clock.now(), w.clock.rate]).toEqual([before, 1]);
    // A test server moves the clock with the same secret.
    const t = await world({ secret: "s3cret", testEvents: true });
    expect((await call(t, { cmd: "step", by: "1w" }, { headers: bearer })).status).toBe(200);
    // No secret configured: the route is off.
    const off = await world();
    expect((await call(off, { cmd: "state" }, { headers: bearer })).status).toBe(404);
  });
});

describe("개근상", () => {
  it("a full daily board, claimed one notice at a time, counts toward the streak", async () => {
    const w = await world();
    const c = await character(w);
    const day0 = Math.floor((T0 + 4 * HOUR_MS) / DAY_MS);
    for (const [n, day] of [day0, day0 + 1].entries()) {
      await w.live.board.ensure(c.id);
      for (let i = 0; i < 5; i++) {
        const quest = `daily:${day}:${i}`;
        await complete(w, c.id, quest);
        const r = await w.economy.executor.execute(c.id, randomUUID(), "quest.claim", { quest });
        expect(r.ok).toBe(true);
      }
      await until(async () => (await row(c.id)).board_streak === n + 1);
      expect((await row(c.id)).board_streak_day).toBe(day);
      w.clock.step(DAY_MS);
    }
  });
});

/** Waits for background work to land (the streak runs after the claim commits). */
async function until(check: () => Promise<boolean>, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("week turnover", () => {
  /**
   * Three players earn 상점 and one eats, then the clock jumps two board weeks. The turnover is
   * cut at its k-th step (a fault that never returns: the process died there), or a paying
   * transaction fails, and a fresh server takes over the same database.
   */
  async function scenario(crash: { at?: number; tx?: boolean }) {
    await db.pool.query("truncate accounts, server_state, notebook cascade");
    let calls = 0;
    let hit = false;
    const hooks: ExecutorOptions["hooks"] = {
      beforeCommit(op) {
        if (crash.tx && op.opId.startsWith("floor-leader:") && !hit) {
          hit = true;
          throw new Error("killed inside the transaction");
        }
      },
    };
    const a = await world({ hooks });
    const [x, y, z] = [await character(a), await character(a), await character(a)];
    for (const [c, n] of [
      [x, 3],
      [y, 2],
      [z, 1],
    ] as const) {
      for (let i = 0; i < n; i++) await a.live.events.revive(c.id, c === x ? y.id : x.id);
    }
    expect(await a.live.events.eat(z.id)).toBe("ok");
    a.clock.step(12 * DAY_MS);
    await a.page.saveClock(a.clock.state);
    a.page.fault = () => {
      if (crash.at !== undefined && calls++ === crash.at) {
        hit = true;
        return new Promise<void>(() => {});
      }
    };
    void a.page.tick();
    await new Promise((r) => setTimeout(r, 300));
    // A new process on the same database.
    const b = await world();
    return { hit, ids: [x.id, y.id, z.id], lines: [...a.lines, ...b.lines], b };
  }

  async function paidOnce(lines: string[], b: World): Promise<void> {
    const rows = await db.pool.query("select week, character_id, paid from floor_leaders");
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const r of rows.rows) {
      expect(r.paid).toBe(true);
      const paid = await db.pool.query(
        "select count(*)::int as n from conduct_ledger where character_id = $1 and operation_id = $2 and reason = 'floor-leader'",
        [r.character_id, `floor-leader:${r.week}`],
      );
      expect(paid.rows[0].n).toBe(1);
    }
    const all = await db.pool.query(
      "select count(*)::int as n from conduct_ledger where reason = 'floor-leader'",
    );
    expect(all.rows[0].n).toBe(rows.rows.length);
    const state = await db.pool.query("select last_day, last_week from server_state");
    const now = b.clock.now();
    expect(state.rows[0]).toEqual({
      last_day: Math.floor((now + 4 * HOUR_MS) / DAY_MS),
      last_week: Math.floor((Math.floor((now + 4 * HOUR_MS) / DAY_MS) + 3) / 7),
    });
    expect(lines).toContain("daily-reset");
  }

  it("pays every 층장 once and runs the day, wherever a crash cuts it", async () => {
    let k = 0;
    for (; ; k++) {
      const run = await scenario({ at: k });
      await paidOnce(run.lines, run.b);
      const week1 = await db.pool.query(
        "select character_id from floor_leaders where week = (select min(week) from floor_leaders) order by rank",
      );
      expect(week1.rows.map((r) => r.character_id)).toEqual(run.ids);
      const titles = (await row(run.ids[2] as string)).titles as string[];
      expect(titles.filter((t) => t === "ate-it-all")).toHaveLength(1);
      if (!run.hit) break;
    }
    // Every step of two week turnovers and a day was cut at least once.
    expect(k).toBeGreaterThan(8);
  }, 120_000);

  it("pays every 층장 once when a paying transaction fails", async () => {
    const run = await scenario({ tx: true });
    expect(run.hit).toBe(true);
    await paidOnce(run.lines, run.b);
  });
});

describe("상점 farming", () => {
  const tally = async (id: string) =>
    (
      await db.pool.query(
        "select coalesce(sum(n), 0)::int as n from weekly_tally where character_id = $1 and kind = 'merit'",
        [id],
      )
    ).rows[0].n as number;

  it("counts at most the daily cap of a reason toward 층장, and pays every point", async () => {
    const w = await world();
    const c = await character(w);
    const friend = await character(w);
    for (let i = 0; i < 9; i++) await w.live.events.revive(c.id, friend.id);
    expect((await row(c.id)).merits).toBe(9);
    expect(await tally(c.id)).toBe(MERIT_TALLY_DAILY.revive);
    w.clock.step(DAY_MS);
    await w.live.events.revive(c.id, friend.id);
    expect(await tally(c.id)).toBe(MERIT_TALLY_DAILY.revive + 1);
  });

  it("pays a 도움 between the same two players once a day", async () => {
    const w = await world();
    const poster = await character(w, 1);
    const helper = await character(w, 30);
    const help = async () => {
      const posted = await w.live.board.post(poster.id, "help-revive");
      if ("refused" in posted) throw new Error(posted.refused);
      expect(posted.result.ok).toBe(true);
      expect(await w.live.board.take(helper.id, posted.notice)).toMatchObject({ ok: true });
      w.live.progress.help(helper.id, helpQuestId(posted.notice), posted.notice);
      await w.live.progress.flush(helper.id);
      expect((await w.live.board.quest(helper.id, helpQuestId(posted.notice)))?.state).toBe(
        "claimed",
      );
    };
    await help();
    await help();
    expect((await row(helper.id)).merits).toBe(1);
    expect(await ledgerCount(helper.id, "merit.help")).toBe(1);
    w.clock.step(DAY_MS);
    await help();
    expect((await row(helper.id)).merits).toBe(2);
  });

  it("never counts a 층장's own +5 toward the next 층장", async () => {
    const w = await world();
    const c = await character(w);
    await w.live.events.cleaning(c.id);
    w.clock.step(5 * DAY_MS);
    await w.page.tick();
    w.clock.step(7 * DAY_MS);
    await w.page.tick();
    const weeks = await db.pool.query("select week from floor_leaders where character_id = $1", [
      c.id,
    ]);
    expect(weeks.rows).toHaveLength(1);
    expect((await row(c.id)).merits).toBe(1 + 5);
  });
});
