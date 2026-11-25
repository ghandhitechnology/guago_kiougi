import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import { mapById, snapshotReaderForMap } from "@guago/content";
import {
  AIM_MESSAGE,
  type Collidable,
  type Doorway,
  ENTER_PATH,
  encodeInput,
  type Facing,
  INPUT_MESSAGE,
  MapState,
  MODE_MESSAGE,
  MOVE_MAX,
  moveBody,
  NULL_SINK,
  POS_SCALE,
  Predictor,
  portalAt,
  Q,
  type Seating,
  SNAPSHOT_MESSAGE,
  type SnapshotReader,
  shutDoors,
  TICK_MS,
  TILE_SIZE,
  type WireBoss,
  WirePlayer,
  type WireSelf,
} from "@guago/shared";
import { Abuser } from "./abuse.ts";
import { signIn } from "./account.ts";
import { Bot } from "./bot.ts";
import { startNetsim } from "./netsim.ts";

/**
 * Headless players that fight (PLAN §19 budgets, §26 capacity). N bots sign in, join the map the
 * server runs and hunt: a share of them in 완전 자동, played by the server, the rest in 반자동,
 * moving themselves with the browser's prediction while their books fire on their own. A 반자동
 * bot reads the fight snapshot like the browser does, closes on the nearest monster, keeps its
 * distance, circles, and wanders when nothing is near. Some are knocked out; full-auto bots
 * revive them. Prints the server's tick time, the fight's own step and snapshot time, bytes per
 * client (mean and the worst client), events, knock-outs and the server's memory.
 *
 *   pnpm loadtest --bots 80 --seconds 300 --url ws://localhost:2608
 *   … --map p1-colonnade  seat the bots on this map (default campus-field) and `--monsters 150`
 *                         fills a fieldless one; both need ALLOW_MAP_OPTION=1 on the server
 *   … --auto 0.5          share of bots in full auto
 *   … --major chemistry  new characters all of one class (a reaction or healer heavy crowd); use
 *                         a fresh --accounts prefix, since an existing character keeps its class
 *   … --latency 150 --jitter 30 --loss 0.01   every bot through a simulated mobile link
 *   … --out report.txt    also write the report to a file
 *   … --abusers 4         accounts that hoard entry tickets and leave sockets at the yard door
 *                         while the bots join; the report says which channel each bot got
 *   … --objectives 0.3    on a boss arena, share of 반자동 bots that play the fight's mechanic
 *                         (raid-play.ts): diagonals, circles, zones, the block on the ice
 *
 * Bots enter through `POST /api/enter` like the browser. A channel holds 60 players (PLAN §10):
 * to put more in one room, run the server with MAP_CHANNEL_SEATS raised. Bots never walk through
 * a door; the server never walks a full-auto body through one.
 *
 * Bots sign in through the HTTP API as bot0001, bot0002 … (`--accounts` changes the prefix),
 * make their characters on first use and keep their sessions in .local/ for the next run. The
 * server needs a database and a signup limit above the bot count (SIGNUPS_PER_IP_PER_DAY). Its
 * numbers come from the loopback metrics port, the game port + 100 unless `--metrics` says.
 */

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "ws://localhost:2608" },
    bots: { type: "string", default: "80" },
    seconds: { type: "string", default: "60" },
    warmup: { type: "string", default: "10" },
    auto: { type: "string", default: "0.5" },
    latency: { type: "string" },
    jitter: { type: "string", default: "0" },
    loss: { type: "string", default: "0" },
    accounts: { type: "string", default: "bot" },
    major: { type: "string" },
    map: { type: "string", default: "campus-field" },
    monsters: { type: "string" },
    metrics: { type: "string" },
    out: { type: "string" },
    abusers: { type: "string", default: "0" },
    objectives: { type: "string", default: "0" },
  },
});

const BOTS = Number(values.bots);
const SECONDS = Number(values.seconds);
const WARMUP = Number(values.warmup);
const AUTO = Number(values.auto);
const target = new URL(values.url);
const metricsUrl = values.metrics ?? `http://127.0.0.1:${Number(target.port) + 100}/metrics`;
const choice = {
  map: values.map,
  ...(values.monsters === undefined ? {} : { monsters: Number(values.monsters) }),
};

let url = values.url;
if (values.latency !== undefined) {
  const port = 2650 + Math.floor(Math.random() * 40);
  await startNetsim(
    port,
    { host: target.hostname, port: Number(target.port) },
    { latency: Number(values.latency), jitter: Number(values.jitter), loss: Number(values.loss) },
  );
  url = `ws://localhost:${port}`;
}

const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
};
const fixed = (v: number, d = 1) => v.toFixed(d);

const ABUSERS = Number(values.abusers);
const abusers: Abuser[] = [];
for (let i = 0; i < ABUSERS; i++) {
  const cookie = await signIn(`http://${target.host}`, "ab", i + 1);
  const a = new Abuser(`http://${target.host}`, url, cookie, choice);
  abusers.push(a);
  void a.run();
}
if (ABUSERS > 0) await new Promise((r) => setTimeout(r, 3000));

console.log(`signing in and joining ${BOTS} bots at ${url}`);
const bots: Bot[] = [];
/** Which channel each bot was seated in. */
const channelsOf: number[] = [];
for (let i = 0; i < BOTS; i++) {
  const cookie = await signIn(`http://${target.host}`, values.accounts, i + 1, values.major);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`http://${target.host}${ENTER_PATH}`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(choice),
      });
      if (!res.ok) throw new Error(`enter answered ${res.status}`);
      const { seat, channel } = (await res.json()) as Seating;
      channelsOf.push(channel);
      const client = new Client(url, { headers: { cookie } });
      const room = await client.consumeSeatReservation(seat, MapState);
      const auto = i < Math.round(BOTS * AUTO);
      // The last `--objectives` share of the bots play the boss fight's mechanic.
      const plays = i >= BOTS - Math.round(BOTS * Number(values.objectives)) && !auto ? i : -1;
      bots.push(new Bot(room, auto, plays));
      break;
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }
}

const abuse = abusers.length
  ? `${abusers.length} abusers made ${abusers.reduce((a, b) => a + b.tickets, 0)} entry requests and ${abusers.reduce((a, b) => a + b.cycles, 0)} door hops while the bots joined`
  : "";
await Promise.all(abusers.map((a) => a.stop()));
const tally = new Map<number, number>();
for (const c of channelsOf) tally.set(c, (tally.get(c) ?? 0) + 1);
const seatedIn = [...tally]
  .sort((a, b) => a[0] - b[0])
  .map(([c, k]) => `channel ${c}: ${k}`)
  .join(", ");
console.log(`bots seated in ${seatedIn}${abuse ? `; ${abuse}` : ""}`);

// One clock drives every bot at 20 Hz, catching up by whole ticks so the input rate stays exact.
let n = 0;
const t0 = performance.now();
const driver = setInterval(() => {
  const due = Math.floor((performance.now() - t0) / TICK_MS);
  while (n < due) {
    n++;
    for (const bot of bots) bot.tick(n);
  }
}, 5);

type Summary = { p50: number; p95: number; p99: number; max: number };
interface RoomReport {
  map: string;
  players: number;
  monsters: number;
  tickMs: Summary;
  tickCpuMs: Summary;
  patchMs: Summary;
  bytesPerClient: { mean: number; max: number };
  viewChangesPerSecond: number;
  fight?: {
    simMs: Summary;
    netMs: Summary;
    killsPerSecond: number;
    spawnsPerSecond: number;
    hitsPerSecond: number;
    castsPerSecond: number;
    eventsPerSecond: number;
    fxPerSecond: number;
    bytesByPart: Record<string, number>;
    worstByPart: Record<string, number>;
    downs: number;
    revives: number;
    wakes: number;
  };
}
interface Sample {
  room: RoomReport;
  memory: { rss: number; heapUsed: number };
}
const samples: Sample[] = [];
const poll = async (): Promise<Sample | undefined> => {
  const res = await fetch(metricsUrl);
  const body = (await res.json()) as {
    rooms: RoomReport[];
    memory: { rss: number; heapUsed: number };
  };
  const room = body.rooms.sort((a, b) => b.players - a.players)[0];
  if (!room) return undefined;
  return { room, memory: body.memory };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
await sleep(WARMUP * 1000);
for (const bot of bots) bot.measuring = true;
const first = await poll(); // closes the warm-up window on the server
const start = performance.now();
const end = start + SECONDS * 1000;
while (performance.now() < end) {
  await sleep(Math.min(10_000, end - performance.now()));
  const s = await poll();
  if (s) samples.push(s);
}
const elapsed = (performance.now() - start) / 1000;
clearInterval(driver);
for (const bot of bots) bot.measuring = false;

const rooms = samples.map((s) => s.room);
const fights = rooms.flatMap((r) => (r.fight ? [r.fight] : []));
const median = (pick: (r: RoomReport) => number) => quantile(rooms.map(pick), 0.5);
const worstOf = (pick: (r: RoomReport) => number) => Math.max(0, ...rooms.map(pick));
/** The snapshot parts of the heaviest single client in the heaviest window. */
const worstParts = rooms.reduce<Record<string, number>>((best, r) => {
  const w = r.fight?.worstByPart;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return w && sum(w) > sum(best) ? w : best;
}, {});
const fmed = (pick: (f: NonNullable<RoomReport["fight"]>) => number) =>
  quantile(fights.map(pick), 0.5);
const fworst = (pick: (f: NonNullable<RoomReport["fight"]>) => number) =>
  Math.max(0, ...fights.map(pick));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const perBot = bots.map((b) => b.stats.bytes / elapsed);
const errors = bots.flatMap((b) => b.stats.errors);
const reconciles = bots.reduce((a, b) => a + b.stats.reconciles, 0);
const corrections = bots.reduce((a, b) => a + b.stats.corrections, 0);
const autoCount = bots.filter((b) => b.auto).length;
const last = fights.at(-1);
const firstFight = first?.room.fight;
const memStart = first?.memory ?? samples[0]?.memory;
const memEnd = samples.at(-1)?.memory;
const mb = (v: number | undefined) => fixed((v ?? 0) / 1024 / 1024, 0);
const parts = last ? Object.keys(last.bytesByPart) : [];

const link =
  values.latency === undefined
    ? "loopback"
    : `round trip ${values.latency} ms + up to ${Number(values.jitter) * 2} ms jitter, loss ${values.loss}`;
const lines = [
  `${BOTS} bots (${autoCount} full auto, ${BOTS - autoCount} semi-auto), ${fixed(elapsed, 0)} s measured after ${WARMUP} s warm-up, ${link}, map ${rooms[0]?.map ?? "?"}`,
  `${rooms.at(-1)?.players ?? 0} players; monsters alive p50 ${median((r) => r.monsters)} (min ${Math.min(...rooms.map((r) => r.monsters))}, max ${worstOf((r) => r.monsters)})`,
  "",
  `server tick ms        p50 ${fixed(
    median((r) => r.tickMs.p50),
    2,
  )}  p95 ${fixed(
    median((r) => r.tickMs.p95),
    2,
  )} (worst 10 s window ${fixed(
    worstOf((r) => r.tickMs.p95),
    2,
  )})  p99 ${fixed(
    median((r) => r.tickMs.p99),
    2,
  )}  max ${fixed(
    worstOf((r) => r.tickMs.max),
    2,
  )}   budget p95 < 10`,
  `  of it on the CPU    p50 ${fixed(
    median((r) => r.tickCpuMs.p50),
    2,
  )}  p95 ${fixed(
    median((r) => r.tickCpuMs.p95),
    2,
  )} (worst ${fixed(
    worstOf((r) => r.tickCpuMs.p95),
    2,
  )})  p99 ${fixed(
    median((r) => r.tickCpuMs.p99),
    2,
  )}`,
  `  fight step          p50 ${fixed(
    fmed((f) => f.simMs.p50),
    2,
  )}  p95 ${fixed(
    fmed((f) => f.simMs.p95),
    2,
  )}  p99 ${fixed(
    fmed((f) => f.simMs.p99),
    2,
  )}  max ${fixed(
    fworst((f) => f.simMs.max),
    2,
  )}`,
  `  snapshots           p50 ${fixed(
    fmed((f) => f.netMs.p50),
    2,
  )}  p95 ${fixed(
    fmed((f) => f.netMs.p95),
    2,
  )}  p99 ${fixed(
    fmed((f) => f.netMs.p99),
    2,
  )}  max ${fixed(
    fworst((f) => f.netMs.max),
    2,
  )}   (encode, assemble and send to every client)`,
  `  schema patch        p95 ${fixed(
    median((r) => r.patchMs.p95),
    2,
  )}`,
  `downstream B/s/client server ${fixed(
    median((r) => r.bytesPerClient.mean),
    0,
  )} mean, ${fixed(
    worstOf((r) => r.bytesPerClient.max),
    0,
  )} worst client in any 5 s window   budget < 8000`,
  `  measured by the bots p50 ${fixed(quantile(perBot, 0.5), 0)}  p95 ${fixed(quantile(perBot, 0.95), 0)}  mean ${fixed(mean(perBot), 0)}  worst ${fixed(Math.max(0, ...perBot), 0)} over the whole run`,
  `  snapshot by part    ${parts
    .map(
      (k) =>
        `${k} ${fixed(
          fmed((f) => f.bytesByPart[k] ?? 0),
          0,
        )}`,
    )
    .join("  ")}`,
  `  worst client's      ${parts
    .map((k) => `${k} ${fixed(worstParts[k] ?? 0, 0)}`)
    .join("  ")}   (its heaviest window)`,
  `per second            kills ${fixed(fmed((f) => f.killsPerSecond))}  spawns ${fixed(fmed((f) => f.spawnsPerSecond))} (max ${fixed(fworst((f) => f.spawnsPerSecond))})  casts ${fixed(fmed((f) => f.castsPerSecond))}  hits ${fixed(fmed((f) => f.hitsPerSecond))}  events ${fixed(fmed((f) => f.eventsPerSecond))}  effect records ${fixed(fmed((f) => f.fxPerSecond))}`,
  `knocked out           ${(last?.downs ?? 0) - (firstFight?.downs ?? 0)} times, revived ${(last?.revives ?? 0) - (firstFight?.revives ?? 0)}, woke at the spawn ${(last?.wakes ?? 0) - (firstFight?.wakes ?? 0)}`,
  `server memory         rss ${mb(memStart?.rss)} → ${mb(memEnd?.rss)} MB, heap ${mb(memStart?.heapUsed)} → ${mb(memEnd?.heapUsed)} MB`,
  `snapshot decode       ${bots.reduce((a, b) => a + b.stats.snapshots, 0)} messages, ${bots.reduce((a, b) => a + b.broken, 0)} unresolved transfers`,
  `reconciliation        ${reconciles} reconciles, ${corrections} corrected (${fixed((corrections / Math.max(1, reconciles)) * 100, 2)}%), error px mean ${fixed(mean(errors), 2)} p95 ${fixed(quantile(errors, 0.95), 2)} max ${fixed(Math.max(0, ...errors), 2)}`,
  "",
  "per 10 s window: tick p95 ms, cpu p95 ms, step p95 ms, snapshots p95 ms, B/s mean, B/s worst, monsters, kills/s, spawns/s",
  ...samples.map(
    (s) =>
      `  ${fixed(s.room.tickMs.p95, 2)}  ${fixed(s.room.tickCpuMs.p95, 2)}  ${fixed(s.room.fight?.simMs.p95 ?? 0, 2)}  ${fixed(s.room.fight?.netMs.p95 ?? 0, 2)}  ${s.room.bytesPerClient.mean}  ${s.room.bytesPerClient.max}  ${s.room.monsters}  ${s.room.fight?.killsPerSecond ?? 0}  ${s.room.fight?.spawnsPerSecond ?? 0}`,
  ),
];
const report = `\n${lines.join("\n")}\n`;
console.log(report);
if (values.out) writeFileSync(values.out, report);

await Promise.all(bots.map((b) => b.room.leave().catch(() => {})));
process.exit(0);
