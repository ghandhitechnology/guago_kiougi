/**
 * A compressed Page played end to end (PLAN §25 M4) against a running local server, with one
 * signed-in bot holding a real WorldRoom seat. The server must run with LIVE_TEST_EVENTS=1: the
 * script restarts its Page, sets the clock rate, walks week 0 to 시대 전환 with the boss events
 * the raid system will send, and drives the combat and navigation events through the admin route.
 * Every line is stamped with wall time since start and the server's game time in KST.
 *
 *   LIVE_TEST_EVENTS=1 PORT=2572 pnpm --filter @guago/server start   (in one terminal)
 *   pnpm live:run --url http://127.0.0.1:2572                        (in another)
 */
import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import {
  API,
  type BoardView,
  type InventorySnapshot,
  LIVE_MESSAGES,
  type LivePush,
  type NoticeView,
  type OpResult,
  type PageView,
  type PresenceMessage,
  type SystemLine,
  WORLD_MESSAGES,
  WORLD_ROOM,
} from "@guago/shared";
import { config } from "../../../apps/server/src/config.ts";
import { signIn } from "./account.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    url: { type: "string", default: "http://127.0.0.1:2572" },
    rate: { type: "string", default: "1456" },
  },
});
const BASE = values.url as string;

const started = Date.now();
let gameNow = 0;
const kst = (ms: number) =>
  new Date(ms + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
function say(text: string): void {
  const wall = ((Date.now() - started) / 1000).toFixed(2).padStart(6);
  console.log(`[${wall}s | ${gameNow ? kst(gameNow) : "----------------"} KST] ${text}`);
}
function check(ok: boolean, what: string): void {
  if (!ok) {
    say(`FAILED: ${what}`);
    process.exit(1);
  }
}

async function admin(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/admin/live`, {
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

const event = (name: string, ...args: unknown[]) =>
  admin({ cmd: "event", name, args, flush: true });

// The bot ------------------------------------------------------------------------------------

// A new bot each run, so every first (an unlock, an award) happens again.
const cookie = await signIn(BASE, "pr", Date.now() % 10_000);
let me = "";
let myName = "";
let room!: Room;
const pushes: LivePush[] = [];
const results = new Map<string, (r: OpResult) => void>();
let waiting: { want: (p: LivePush) => boolean; resolve: (p: LivePush) => void } | undefined;

async function join(): Promise<void> {
  room = await new Client(BASE, { headers: { cookie } }).join(WORLD_ROOM);
  room.onMessage(WORLD_MESSAGES.presence, (m: PresenceMessage) => {
    if (m.t === "all") {
      me = m.you;
      myName = m.list.find((p) => p.id === m.you)?.name ?? "";
    }
  });
  room.onMessage("social", () => {});
  room.onMessage(WORLD_MESSAGES.system, (l: SystemLine) => {
    say(`system ${l.key}${l.params ? ` ${JSON.stringify(l.params)}` : ""}`);
  });
  room.onMessage(WORLD_MESSAGES.change, () => {});
  room.onMessage(WORLD_MESSAGES.refused, (r: unknown) => say(`refused ${JSON.stringify(r)}`));
  room.onMessage(WORLD_MESSAGES.result, (r: OpResult) => results.get(r.id)?.(r));
  room.onMessage(LIVE_MESSAGES.push, (p: LivePush) => {
    pushes.push(p);
    if (p.t === "page") gameNow = p.page.now;
    if (waiting?.want(p)) {
      const w = waiting;
      waiting = undefined;
      w.resolve(p);
    }
  });
  for (let i = 0; i < 50 && !me; i++) await new Promise((r) => setTimeout(r, 20));
}

function next<T extends LivePush["t"]>(
  t: T,
  also: (p: Extract<LivePush, { t: T }>) => boolean = () => true,
) {
  return new Promise<Extract<LivePush, { t: T }>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${t} push`)), 5000);
    waiting = {
      want: (p) => p.t === t && also(p as Extract<LivePush, { t: T }>),
      resolve: (p) => {
        clearTimeout(timer);
        resolve(p as Extract<LivePush, { t: T }>);
      },
    };
  });
}

let counter = 0;
async function read<T extends "page" | "board" | "codex" | "notebook" | "rules">(what: T) {
  const n = ++counter;
  const got = next(what as LivePush["t"], (p) => (p as { n?: number }).n === n);
  room.send(LIVE_MESSAGES.read, { what, n });
  return (await got) as Extract<LivePush, { t: T }>;
}

function op(name: string, req: Record<string, unknown>): Promise<OpResult> {
  const id = `pagerun-${Date.now()}-${++counter}`;
  return new Promise((resolve) => {
    results.set(id, resolve);
    room.send(name, { id, req });
  });
}

async function inventory(): Promise<InventorySnapshot> {
  const res = await fetch(BASE + API.inventory, { headers: { cookie } });
  return (await res.json()) as InventorySnapshot;
}

const describe = (q: NoticeView) =>
  `${q.id} ${q.kind}${Object.keys(q.slots).length ? ` ${JSON.stringify(q.slots)}` : ""} ×${q.target}`;

/** Plays one notice through the events combat and navigation will send. */
async function play(q: NoticeView): Promise<void> {
  for (let i = 0; i < q.target; i++) {
    const s = q.slots;
    if (q.kind === "hunt") await event("kill", me, s.monster, 1);
    else if (q.kind === "collect") await event("collect", me, s.item, 1);
    else if (q.kind === "deliver") await event("deliver", me, s.npc ?? "anyone");
    else if (q.kind === "escort") await event("escort", me, s.npc ?? "anyone");
    else if (q.kind === "nohit") await event("cleanWave", me, s.place ?? "anywhere");
    else await event("story", me, q.template);
  }
}

// The run ------------------------------------------------------------------------------------

await admin({ cmd: "restart" });
await admin({ cmd: "rate", rate: Number(values.rate) });
await join();
say(`bot ${myName} (${me}) in the WorldRoom`);

let page = (await read("page")).page;
say(
  `page ${page.page} at ${page.milestone}, week ${page.week}, clock ×${page.rate}, maps ${page.maps.join(", ")}`,
);

let board: BoardView = (await read("board")).board;
say(`board day ${board.day}: ${board.daily.map(describe).join(" | ")}`);
say(
  `weekly ${board.weekly.map((q) => q.id).join(", ")}; repeat ${board.repeat?.id}; story ${board.story.map((q) => q.id).join(", ")}`,
);
const first = board.daily[0] as NoticeView;
const done = next("done", (p) => p.quest.id === first.id);
await play(first);
say(`done push ${(await done).quest.id}`);
const claim = await op("quest.claim", { quest: first.id });
check(claim.ok, "quest.claim");
say(`quest.claim ${first.id}: ${claim.ok ? `ok, exp ${claim.outcome.exp}` : claim.error}`);
const twice = await op("quest.claim", { quest: first.id });
say(`quest.claim again: ${twice.ok ? "ok" : twice.error}`);
check(!twice.ok, "a second claim is refused");

const unlock = next("unlock");
await event("visit", me, "study-hall");
say(`도감 unlock push: ${(await unlock).entries.join(", ")}`);

// Week 0 to 시대 전환 --------------------------------------------------------------------
const step = async (by: string) => {
  const out = await admin({ cmd: "step", by });
  page = out.page as PageView;
  say(
    `step ${by} → week ${page.week}, ${page.milestone}, frontier ${page.frontierLevel}, bosses ${JSON.stringify(page.bosses)}`,
  );
  await new Promise((r) => setTimeout(r, 150));
};
const free = async (boss: string) => {
  const out = await admin({ cmd: "free", boss, record: { finalHit: { id: me, name: myName } } });
  page = out.page as PageView;
  say(`free ${boss}: ${String(out.result)} → ${page.milestone}`);
  await new Promise((r) => setTimeout(r, 150));
};
await step("2w");
check(page.milestone === "p1.wide", "fields 3 and 4 at week 2");
board = (await read("board")).board;
say(`board reset: day ${board.day}, ${board.daily.map((q) => q.id).join(", ")}`);
check(
  board.daily.every((q) => q.id.startsWith(`daily:${board.day}:`)),
  "today's board",
);
await step("1w");
check(page.milestone === "p1.pythagoreans", "mid boss 1 at week 3");
await free("zeno");
await free("pythagoreans");
await step("1w");
check(page.milestone === "p1.pythagoreans-freed", "mid boss 2 waits for week 6");
await step("2w");
check(page.milestone === "p1.zeno", "mid boss 2 at week 6");
await free("zeno");
await step("4w");
check(page.milestone === "p1.aristotle", "era boss at week 10");
await free("aristotle");
await step("6d");
check(page.milestone === "p1.aristotle-freed", "시대 전환 a week after");
await step("1d");
check(page.milestone === "p1.era-change" && page.sealed, "시대 전환");
// Story chapters: a beat played, and a freed boss's chapter through its 복습 fight.
await event("story", me, "p1-open");
await event("bossCleared", me, "pythagoreans");
board = (await read("board")).board;
say(`story chapters now: ${board.story.map((q) => `${q.id}:${q.state}`).join(", ")}`);
const codex = (await read("codex")).codex;
say(`도감 unlocked: ${codex.unlocked.map((u) => u.id).join(", ")}`);

const notebook = (await read("notebook")).notebook;
for (const p of notebook.pages.slice(0, 2)) {
  say(
    `연구노트 page ${p.page}: ${p.state}${p.sealedAt ? ` sealed ${kst(p.sealedAt)}` : ""} ${p.bosses
      .map((b) => `${b.boss} ${b.freedAt ? kst(b.freedAt) : "-"} by ${b.finalHit?.name ?? "-"}`)
      .join("; ")}`,
  );
}
say(
  `연구노트 stubs: ${notebook.pages.filter((p) => p.state === "stub").length} of ${notebook.pages.length}`,
);

// A logout fills the 자습 pool ------------------------------------------------------------
const measured = await admin({
  cmd: "credit",
  character: me,
  times: 150,
  every: "5s",
  credit: {
    exp: 400,
    drops: [
      {
        item: { kind: "coin", amount: 30 },
        source: { kind: "monster", fieldId: "p1-colonnade", monsterId: "odap", rank: "normal" },
      },
    ],
  },
});
say(`measured hunting: ${JSON.stringify(measured.measured)}`);
await room.leave(true);
await new Promise((r) => setTimeout(r, 300));
say("bot logged out");
await step("3h");
await join();
const inv = await inventory();
const pool = inv.progression.pool;
say(
  `back after 3h: pool ${pool ? `${pool.place}, ${pool.fill.seconds}s of ${pool.cap}s, exp ${pool.fill.exp.toFixed(1)}, 솔방울 ${pool.fill.pinecone.toFixed(1)}` : "none"}`,
);
// The clock keeps running at its rate while the bot reconnects, so a little more than 3 hours.
check((pool?.fill.seconds ?? 0) >= 3 * 3600, "three hours of pool");
await step("2h");
const still = (await inventory()).progression.pool;
say(`two hours online later: pool still ${still?.fill.seconds}s`);
check(still?.fill.seconds === pool?.fill.seconds, "no fill while online");
const claimed = await op("claimPool", {});
say(
  `claimPool: ${claimed.ok ? `exp ${claimed.outcome.exp}, ${claimed.outcome.seconds}s` : claimed.error}`,
);

// 벌점 to 명령퇴사 ---------------------------------------------------------------------------
for (let i = 0; i < 10; i++) await event("patrolCaught", me);
await new Promise((r) => setTimeout(r, 300));
const home = pushes.find((p) => p.t === "home");
say(`home push: ${home && home.t === "home" ? `until ${kst(home.until)}` : "none"}`);
const rules = (await read("rules")).rules;
say(
  `rules: 벌점 ${rules.demerits}/${rules.expelAt}, titles ${rules.titles.join(", ")}, penalty until ${rules.penaltyUntil ? kst(rules.penaltyUntil) : "-"}, exp ×${rules.modifiers.exp.toFixed(2)}`,
);
check(rules.demerits === 0 && rules.titles.includes("went-home"), "명령퇴사");

await room.leave(true);
say("done");
process.exit(0);
