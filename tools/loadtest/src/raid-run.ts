/**
 * A Page's bosses played end to end on a time-compressed server (PLAN §25 M4, §10): bots fight
 * the 피타고라스 학파 at week 3 and 제논 at week 6 in their arenas, hunt a field through weeks 8
 * and 9 so the server has damage to measure, then take 아리스토텔레스 from his unlock at week 10
 * through four calibrated 논제 to freed; the clock walks on to 시대 전환, and one bot plays a 복습
 * twice to show its first clear pays once. Each phase's calibrated HP, how long it lasted, the
 * participation tiers and the rewards paid are read from the server's own rows.
 *
 *   LIVE_TEST_EVENTS=1 ALLOW_MAP_OPTION=1 MAP_CHANNEL_SEATS=100 SIGNUPS_PER_IP_PER_DAY=1000 \
 *     PORT=2618 pnpm --filter @guago/server start                     (a fresh database)
 *   pnpm raid:run --url http://127.0.0.1:2618 --bots 40 --rate 4368 --out <dir>
 *
 * The bots are `pnpm loadtest` processes (a share in full auto, a share playing the mechanic),
 * started and stopped per stage; the admin route is the server's loopback metrics port.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import { raidBoss } from "@guago/content";
import {
  DAY_MS,
  ENTER_PATH,
  MAP_MESSAGES,
  MapState,
  MODE_MESSAGE,
  type PageView,
  RAID_TIER_NAMES,
  REPLAY_MESSAGE,
  type Seating,
  TICK_MS,
  WEEK_MS,
} from "@guago/shared";
import { config } from "../../../apps/server/src/config.ts";
import { createDb } from "../../../apps/server/src/db/index.ts";
import { signIn } from "./account.ts";
import { Bot } from "./bot.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    url: { type: "string", default: "http://127.0.0.1:2618" },
    bots: { type: "string", default: "40" },
    rate: { type: "string", default: "4368" },
    /** At most four letters: bot names are the prefix and four digits, eight at most. */
    accounts: { type: "string", default: "raid" },
    out: { type: "string" },
    database: { type: "string" },
    /** `replay`: only the 복습 part, against a server whose bosses are already freed. */
    from: { type: "string" },
  },
});
const BASE = values.url as string;
const BOTS = Number(values.bots);
const WS = BASE.replace(/^http/, "ws");
const CONTROL = (() => {
  const u = new URL(BASE);
  u.port = String(Number(u.port) + 100);
  return u.origin;
})();
const OUT = values.out;
const db = createDb(values.database ?? config.databaseUrl);
const ROOT = path.resolve(import.meta.dirname, "../../..");

const started = Date.now();
const lines: string[] = [];
let gameNow = 0;
const kst = (ms: number) =>
  new Date(ms + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
function say(text: string): void {
  const wall = ((Date.now() - started) / 1000).toFixed(1).padStart(7);
  const line = `[${wall}s | ${gameNow ? kst(gameNow) : "----------------"} KST] ${text}`;
  lines.push(line);
  console.log(line);
}
function fail(what: string): never {
  say(`FAILED: ${what}`);
  finish(1);
}

async function admin(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${CONTROL}/admin/live`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.serverSecret}` },
    body: JSON.stringify(body),
  });
  const out = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`admin ${String(body.cmd)}: ${JSON.stringify(out)}`);
  const page = out.page as PageView | undefined;
  if (page) gameNow = page.now;
  return out;
}
const view = async () => (await admin({ cmd: "state" })).page as PageView;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Walks the clock to week `week` of the Page (never back). */
async function toWeek(week: number): Promise<PageView> {
  const p = await view();
  const by = p.openedAt + week * WEEK_MS - p.now;
  if (by > 0) await admin({ cmd: "step", by: Math.ceil(by) });
  return view();
}

// Bots ----------------------------------------------------------------------------------------

let bots: ChildProcess | undefined;

/** Players in the server's rooms, from its metrics. */
async function seated(): Promise<number> {
  try {
    const res = await fetch(`${CONTROL}/metrics`);
    const body = (await res.json()) as { rooms: { players: number }[] };
    return body.rooms.reduce((a, r) => a + r.players, 0);
  } catch {
    return 0;
  }
}

/**
 * A `pnpm loadtest` crowd on `map` until stopped. The last crowd is let go first and its bodies
 * waited out, so no bot enters while its old room is still writing where it stood.
 */
async function crowd(map: string, n: number, objectives: number, auto = 0.4): Promise<void> {
  stopCrowd();
  for (let i = 0; i < 30 && (await seated()) > 0; i++) await sleep(1000);
  const args = [
    path.join(ROOT, "tools/loadtest/src/main.ts"),
    "--bots",
    String(n),
    "--seconds",
    "3600",
    "--warmup",
    "1",
    "--auto",
    String(auto),
    "--url",
    WS,
    "--map",
    map,
    "--accounts",
    values.accounts as string,
    "--objectives",
    String(objectives),
  ];
  const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] });
  child.on("exit", (code) => {
    if (bots === child && code !== 0) fail(`the bots on ${map} stopped (${code})`);
  });
  bots = child;
  say(
    `${n} bots onto ${map} (${Math.round(auto * 100)}% full auto, ${Math.round(objectives * 100)}% playing the mechanic)`,
  );
}

function stopCrowd(): void {
  if (bots && bots.exitCode === null) bots.kill("SIGTERM");
  bots = undefined;
}

// The server's rows ---------------------------------------------------------------------------

interface RaidRow {
  id: string;
  phase: number;
  hp: number;
  max: number;
  freed: boolean;
}

async function raidOf(boss: string, openedAt: number): Promise<RaidRow | undefined> {
  const { rows } = await db.pool.query(
    "select id, phase, hp, max_hp, freed_at from raids where id = $1",
    [`1:${Math.round(openedAt)}:${boss}`],
  );
  const r = rows[0];
  return r
    ? {
        id: r.id,
        phase: Number(r.phase),
        hp: Number(r.hp),
        max: Number(r.max_hp),
        freed: r.freed_at !== null,
      }
    : undefined;
}

/** Waits for the boss's raid to appear, printing its pool as it goes, until `done` says so. */
async function watch(
  boss: string,
  openedAt: number,
  done: (r: RaidRow) => boolean,
  limitMs: number,
): Promise<RaidRow> {
  const until = Date.now() + limitMs;
  let last = "";
  for (;;) {
    const r = await raidOf(boss, openedAt);
    await view();
    if (r) {
      const line = `${boss} 논제 ${r.phase}: ${Math.round(r.hp).toLocaleString()} / ${Math.round(r.max).toLocaleString()}${r.freed ? " freed" : ""}`;
      if (line !== last) say(line);
      last = line;
      if (done(r)) return r;
    }
    if (Date.now() > until) fail(`${boss} did not get there in ${limitMs / 1000} s`);
    await sleep(2000);
  }
}

async function phases(raid: string, rate: number): Promise<string[]> {
  // Rewards go out in the background after each phase closes: wait for the last of them.
  for (let i = 0; i < 30; i++) {
    const left = await db.pool.query(
      "select count(*)::int as n from raid_participants where raid_id = $1 and tier > 0 and not paid",
      [raid],
    );
    if (left.rows[0].n === 0) break;
    await sleep(1000);
  }
  const { rows } = await db.pool.query(
    `select phase, max_hp, calibration, started_at, ended_at from raid_phases
     where raid_id = $1 order by phase`,
    [raid],
  );
  const out: string[] = [];
  for (const p of rows) {
    const tiers = await db.pool.query(
      `select tier, count(*)::int as n, count(*) filter (where paid)::int as paid
       from raid_participants where raid_id = $1 and phase = $2 group by tier order by tier`,
      [raid, p.phase],
    );
    const tokens = await db.pool.query(
      `select coalesce(sum(l.amount), 0)::text as tokens, count(distinct l.character_id)::int as ops
       from economy_ledger l
       where l.currency = 'token' and l.operation_id like $1`,
      [`raid:${raid}:${p.phase}`],
    );
    const loot = await db.pool.query(
      `select count(*)::int as n from economy_ledger l
       where l.operation_id like $1 and l.currency <> 'token'`,
      [`raid:${raid}:${p.phase}`],
    );
    const ms = p.ended_at ? new Date(p.ended_at).getTime() - new Date(p.started_at).getTime() : 0;
    const c = p.calibration as {
      total: number;
      boss: number;
      measuredMs: number;
      standingMs: number;
      totalStanding: number;
    };
    const share =
      c.standingMs >= 6 * 3_600_000 && c.totalStanding > 0 ? c.boss / c.totalStanding : null;
    out.push(
      [
        `  논제 ${p.phase}: calibrated HP ${Math.round(Number(p.max_hp)).toLocaleString()}`,
        `from ${Math.round(c.total).toLocaleString()} damage over ${(c.measuredMs / DAY_MS).toFixed(2)} days`,
        share === null ? "(share assumed 0.3)" : `(boss share measured ${share.toFixed(2)})`,
        `· lasted ${(ms / DAY_MS).toFixed(2)} Page days (${(ms / rate / 1000).toFixed(0)} s real)`,
        `· tiers ${tiers.rows.map((t) => `${RAID_TIER_NAMES[Number(t.tier)] || "none"} ${t.n}`).join(", ")}`,
        `· paid ${tiers.rows.reduce((a, t) => a + Number(t.paid), 0)} characters, ${Number(tokens.rows[0]?.tokens ?? 0).toLocaleString()} 탐구 토큰 to ${tokens.rows[0]?.ops ?? 0} characters, ${loot.rows[0]?.n ?? 0} loot ledger rows`,
      ].join(" "),
    );
  }
  return out;
}

// 복습 ----------------------------------------------------------------------------------------

/** One bot asks for a 복습 of `boss`, fights it in full auto, and comes back. */
async function replay(boss: string, index: number): Promise<{ cleared: boolean; tokens: number }> {
  const cookie = await signIn(BASE, `${values.accounts}r`, index);
  const res = await fetch(`${BASE}${ENTER_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ map: "p1-agora" }),
  });
  if (!res.ok) fail(`enter answered ${res.status}`);
  const { seat } = (await res.json()) as Seating;
  const client = new Client(WS, { headers: { cookie } });
  let room: Room<unknown, MapState> = await client.consumeSeatReservation(seat, MapState);
  const me = await db.pool.query(
    "select c.id from characters c join accounts a on a.id = c.account_id where a.login_id = $1",
    [`${values.accounts}r${String(index).padStart(4, "0")}`],
  );
  const id = me.rows[0]?.id as string;
  const tokens = async () =>
    Number(
      (await db.pool.query("select tokens from wallets where character_id = $1", [id])).rows[0]
        ?.tokens ?? 0,
    );
  const before = await tokens();
  const moved = (r: Room<unknown, MapState>) =>
    new Promise<Seating & { via: string }>((resolve) => {
      r.onMessage(MAP_MESSAGES.transfer, (t: Seating & { via: string }) => resolve(t));
      r.onMessage("*", () => {});
    });
  let next = moved(room);
  room.send(REPLAY_MESSAGE, [boss]);
  const into = await Promise.race([next, sleep(10_000).then(() => null)]);
  if (!into) fail(`no 복습 seat for ${boss}`);
  await room.leave();
  room = await client.consumeSeatReservation(into.seat, MapState);
  // 반자동, playing the fight's mechanic the way a player who watched it would.
  room.send(MODE_MESSAGE, [1]);
  next = moved(room);
  const bot = new Bot(room, false, 0);
  let n = 0;
  const driver = setInterval(() => bot.tick(++n), TICK_MS);
  say(`복습 ${boss}: seated alone in its arena (${into.map}, channel ${into.channel})`);
  const back = await Promise.race([next, sleep(480_000).then(() => null)]);
  clearInterval(driver);
  if (!back) fail(`복습 ${boss} not cleared in 480 s`);
  await room.leave();
  const after = await tokens();
  const cleared =
    (
      await db.pool.query("select 1 from boss_clears where character_id = $1 and boss_id = $2", [
        id,
        boss,
      ])
    ).rows.length > 0;
  say(`복습 ${boss}: cleared, walked back to ${back.map}; 탐구 토큰 ${before} → ${after}`);
  return { cleared, tokens: after - before };
}

/**
 * The bots' characters at a boss's band level, as the class would be by that week (the books
 * keep their levels; phases are sized to whatever the class deals). Off any bot's seat only.
 */
async function levelBots(level: number): Promise<void> {
  const r = await db.pool.query(
    `update characters c set level = $1, exp = 0 from accounts a
     where a.id = c.account_id and a.login_id like $2 and c.level < $1`,
    [level, `${values.accounts}%`],
  );
  say(`the class at level ${level} (${r.rowCount} characters)`);
}

// The run -------------------------------------------------------------------------------------

function finish(code: number): never {
  stopCrowd();
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    const name = values.from ? `raid-run-${values.from}.txt` : "raid-run.txt";
    writeFileSync(path.join(OUT, name), `${lines.join("\n")}\n`);
  }
  void db.pool.end();
  process.exit(code);
}
process.on("SIGINT", () => finish(130));

const rate = Number(values.rate);
if (values.from === "replay") {
  await replays();
  finish(0);
}
await admin({ cmd: "restart" });
await admin({ cmd: "rate", rate });
let page = await view();
say(
  `Page ${page.page} restarted at rate ${rate}: ${page.milestone}, a Page day is ${(DAY_MS / rate / 1000).toFixed(1)} s real`,
);

// The class signs up in the 아고라 first, so its characters exist to be levelled.
await crowd("p1-agora", BOTS, 0, 0);
for (let i = 0; i < 60 && (await seated()) < BOTS; i++) await sleep(1000);
stopCrowd();
for (let i = 0; i < 30 && (await seated()) > 0; i++) await sleep(1000);

// Week 3: the 피타고라스 학파 at the 크로톤 학당.
page = await toWeek(3);
await levelBots(raidBoss("pythagoreans")?.level ?? 50);
say(`week ${page.week}: ${page.milestone}`);
await watch("pythagoreans", page.openedAt, () => true, 20_000);
await crowd("p1-croton-school", BOTS, 0.4);
const pyth = await watch("pythagoreans", page.openedAt, (r) => r.freed, 600_000);
stopCrowd();
for (const l of await phases(pyth.id, rate)) say(l);

// Week 6: 제논 at the 엘레아 경주로.
stopCrowd();
for (let i = 0; i < 30 && (await seated()) > 0; i++) await sleep(1000);
await levelBots(raidBoss("zeno")?.level ?? 80);
page = await toWeek(6);
say(`week ${page.week}: ${page.milestone}`);
await watch("zeno", page.openedAt, () => true, 20_000);
await crowd("p1-elea-track", BOTS, 0.5);
const zeno = await watch("zeno", page.openedAt, (r) => r.freed, 600_000);
stopCrowd();
for (const l of await phases(zeno.id, rate)) say(l);

// Weeks 8 and 9: the class hunts a field, and the server measures what it deals.
stopCrowd();
for (let i = 0; i < 30 && (await seated()) > 0; i++) await sleep(1000);
await levelBots(raidBoss("aristotle")?.level ?? 100);
page = await toWeek(8);
say(
  `week ${page.week}: ${page.milestone}; the bots hunt 아고라 변두리 until 아리스토텔레스 appears`,
);
await crowd("p1-agora-edge", BOTS, 0, 0.5);
const era = await watch(
  "aristotle",
  page.openedAt,
  () => true,
  Math.ceil((2.2 * WEEK_MS) / rate) + 30_000,
);
page = await view();
say(
  `week ${page.week}: ${page.milestone}; 아리스토텔레스 stands, 논제 1 at ${Math.round(era.max).toLocaleString()} HP`,
);
await crowd("p1-lyceum", BOTS, 0.35);
const freed = await watch("aristotle", page.openedAt, (r) => r.freed, 3_600_000);
stopCrowd();
say("아리스토텔레스 freed. Each 논제:");
for (const l of await phases(freed.id, rate)) say(l);
const nb = await db.pool.query(
  "select boss_id, final_hit_name, board_leaders from notebook_bosses order by freed_at",
);
for (const r of nb.rows) {
  say(
    `연구노트: ${r.boss_id} final hit ${r.final_hit_name ?? "-"}; ${(r.board_leaders as { board: string; name: string }[]).map((l) => `${l.board} ${l.name}`).join(", ")}`,
  );
}

// A week after the era boss: 시대 전환.
const state = await admin({ cmd: "state" });
const freedAt = (state.freed as Record<string, number>).aristotle ?? gameNow;
await admin({ cmd: "step", by: Math.max(0, Math.ceil(freedAt + WEEK_MS - gameNow) + 60_000) });
page = await view();
say(`시대 전환: ${page.milestone}${page.sealed ? ", the Page is sealed" : ""}`);
if (page.milestone !== "p1.era-change") fail("the Page did not reach 시대 전환");

await replays();
say("ok");
finish(0);

/** 복습: 제논 twice by one student, the first clear paid once. */
async function replays(): Promise<void> {
  const z = raidBoss("zeno");
  const first = await replay("zeno", 1);
  const second = await replay("zeno", 1);
  say(
    `복습 first clear paid ${first.tokens} 탐구 토큰 (content: ${z?.firstClear.tokens}), the second clear ${second.tokens}`,
  );
  if (!first.cleared || first.tokens !== z?.firstClear.tokens || second.tokens !== 0)
    fail("복습's first clear was not paid exactly once");
}
