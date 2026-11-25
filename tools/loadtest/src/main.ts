import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import { LAWN } from "@guago/content";
import {
  encodeInput,
  INPUT_MESSAGE,
  MAP_ROOM,
  MapState,
  MOVE_MAX,
  PLAYER_SPEED,
  POS_SCALE,
  Predictor,
  TICK_MS,
} from "@guago/shared";
import { signIn } from "./account.ts";
import { startNetsim } from "./netsim.ts";

/**
 * Headless players: N bots join a map and walk like people do, in bursts with pauses and turns,
 * predicting and reconciling their own movement with the same code the browser runs. Prints the
 * server's tick time, the bytes each client receives and how far predictions were off.
 *
 *   pnpm --filter @guago/loadtest start --bots 80 --seconds 60 --url ws://localhost:2601
 *   … --latency 150 --jitter 30 --loss 0.01   runs every bot through a simulated mobile link
 *
 * Bots sign in through the HTTP API as bot0001, bot0002 … (`--accounts` changes the prefix),
 * make their characters on first use and keep their sessions in .local/ for the next run. The
 * server needs a database and a signup limit above the bot count (SIGNUPS_PER_IP_PER_DAY).
 */

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "ws://localhost:2601" },
    bots: { type: "string", default: "80" },
    seconds: { type: "string", default: "60" },
    warmup: { type: "string", default: "5" },
    latency: { type: "string" },
    jitter: { type: "string", default: "0" },
    loss: { type: "string", default: "0" },
    accounts: { type: "string", default: "bot" },
  },
});

const BOTS = Number(values.bots);
const SECONDS = Number(values.seconds);
const WARMUP = Number(values.warmup);
const target = new URL(values.url);
const metricsUrl = `http://${target.host}/metrics`;

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

const DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

interface Stats {
  bytes: number;
  reconciles: number;
  corrections: number;
  errors: number[];
  ackMs: number[];
}

/** One bot: walks a few seconds, stops, turns, now and then reverses mid-stride. */
class Bot {
  readonly stats: Stats = { bytes: 0, reconciles: 0, corrections: 0, errors: [], ackMs: [] };
  private predictor: Predictor | undefined;
  private dir: readonly [number, number] = [0, 0];
  private until = 0;
  private seen = { x: -1, y: -1, seq: -1 };
  private readonly sentAt = new Map<number, number>();
  /** The body slot this bot sits in. */
  private slot: string | undefined;
  measuring = false;
  moving = 0;
  ticks = 0;
  readonly room: Room<unknown, MapState>;

  constructor(room: Room<unknown, MapState>) {
    this.room = room;
    room.reconnection.enabled = false;
    room.onMessage("*", () => {});
    const events = room.connection.events;
    const onmessage = events.onmessage;
    events.onmessage = (ev: { data: ArrayBuffer }) => {
      if (this.measuring) this.stats.bytes += ev.data.byteLength;
      onmessage?.(ev);
    };
    room.onStateChange((state) => this.onPatch(state));
  }

  private onPatch(state: MapState): void {
    let me = this.slot === undefined ? undefined : state.players.get(this.slot);
    if (me?.sid !== this.room.sessionId) {
      me = undefined;
      for (const [slot, p] of state.players) {
        if (p.sid !== this.room.sessionId) continue;
        this.slot = slot;
        me = p;
      }
    }
    if (!me) return;
    const body = { x: me.x / POS_SCALE, y: me.y / POS_SCALE, facing: me.facing as 0 };
    if (!this.predictor) {
      this.predictor = new Predictor(LAWN, body, PLAYER_SPEED);
      this.seen = { x: me.x, y: me.y, seq: me.seq };
      return;
    }
    if (me.x === this.seen.x && me.y === this.seen.y && me.seq === this.seen.seq) return;
    if (me.seq !== this.seen.seq) {
      const at = this.sentAt.get(me.seq);
      if (at !== undefined && this.measuring) this.stats.ackMs.push(performance.now() - at);
      for (const seq of this.sentAt.keys()) if (seq <= me.seq) this.sentAt.delete(seq);
    }
    this.seen = { x: me.x, y: me.y, seq: me.seq };
    const error = this.predictor.reconcile(body, me.seq);
    if (!this.measuring) return;
    this.stats.reconciles++;
    if (error > 0) {
      this.stats.corrections++;
      this.stats.errors.push(error);
    }
  }

  tick(n: number): void {
    if (!this.predictor) return;
    if (n >= this.until) {
      const walking = this.dir[0] !== 0 || this.dir[1] !== 0;
      if (walking && Math.random() < 0.45) {
        this.dir = [0, 0];
        this.until = n + between(6, 40);
      } else {
        this.dir = DIRS[Math.floor(Math.random() * DIRS.length)] as readonly [number, number];
        this.until = n + between(12, 70);
      }
    }
    const input = this.predictor.tick(this.dir[0] * MOVE_MAX, this.dir[1] * MOVE_MAX);
    if (this.measuring) {
      this.ticks++;
      if (input) this.moving++;
    }
    if (!input) return;
    this.sentAt.set(input.seq, performance.now());
    this.room.send(INPUT_MESSAGE, encodeInput(input));
  }
}

const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
};
const fixed = (v: number, d = 1) => v.toFixed(d);

console.log(`signing in and joining ${BOTS} bots at ${url}`);
const bots: Bot[] = [];
for (let i = 0; i < BOTS; i++) {
  const cookie = await signIn(`http://${target.host}`, values.accounts, i + 1);
  // A join can lose a race with a keep-alive close on a slow link; a player would retry too.
  for (let attempt = 1; ; attempt++) {
    try {
      const client = new Client(url, { headers: { cookie } });
      bots.push(new Bot(await client.joinOrCreate(MAP_ROOM, {}, MapState)));
      break;
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }
}

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

interface Window {
  tickP50: number;
  tickP95: number;
  tickMax: number;
  cpuP50: number;
  cpuP95: number;
  patchP95: number;
  bytesMean: number;
  bytesMax: number;
  viewChanges: number;
  players: number;
  monsters: number;
}
const windows: Window[] = [];
const poll = async () => {
  const res = await fetch(metricsUrl);
  const body = (await res.json()) as {
    rooms: {
      players: number;
      monsters: number;
      tickMs: { p50: number; p95: number; max: number };
      tickCpuMs: { p50: number; p95: number; max: number };
      patchMs: { p95: number };
      bytesPerClient: { mean: number; max: number };
      viewChangesPerSecond: number;
    }[];
  };
  const room = body.rooms.sort((a, b) => b.players - a.players)[0];
  if (!room) return;
  windows.push({
    tickP50: room.tickMs.p50,
    tickP95: room.tickMs.p95,
    tickMax: room.tickMs.max,
    cpuP50: room.tickCpuMs.p50,
    cpuP95: room.tickCpuMs.p95,
    patchP95: room.patchMs.p95,
    bytesMean: room.bytesPerClient.mean,
    bytesMax: room.bytesPerClient.max,
    viewChanges: room.viewChangesPerSecond,
    players: room.players,
    monsters: room.monsters,
  });
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
await sleep(WARMUP * 1000);
for (const bot of bots) bot.measuring = true;
await poll(); // closes the warm-up byte window on the server
windows.length = 0;
const start = performance.now();
const end = start + SECONDS * 1000;
while (performance.now() < end) {
  await sleep(Math.min(10_000, end - performance.now()));
  await poll();
}
const elapsed = (performance.now() - start) / 1000;
clearInterval(driver);
for (const bot of bots) bot.measuring = false;

const perBot = bots.map((b) => b.stats.bytes / elapsed);
const errors = bots.flatMap((b) => b.stats.errors);
const reconciles = bots.reduce((a, b) => a + b.stats.reconciles, 0);
const corrections = bots.reduce((a, b) => a + b.stats.corrections, 0);
const acks = bots.flatMap((b) => b.stats.ackMs);
const moving =
  bots.reduce((a, b) => a + b.moving, 0) /
  Math.max(
    1,
    bots.reduce((a, b) => a + b.ticks, 0),
  );
const worst = windows.at(-1);
const median = (pick: (w: Window) => number) => quantile(windows.map(pick), 0.5);
const worstOf = (pick: (w: Window) => number) => Math.max(0, ...windows.map(pick));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

const link =
  values.latency === undefined
    ? "loopback"
    : `round trip ${values.latency} ms + up to ${Number(values.jitter) * 2} ms jitter, loss ${values.loss}`;
const lines = [
  `${BOTS} bots, ${fixed(elapsed, 0)} s measured after ${WARMUP} s warm-up, ${link}`,
  `moving ${fixed(moving * 100, 0)}% of ticks, ${worst?.players ?? 0} players and ${worst?.monsters ?? 0} monsters in the room`,
  "",
  `server tick ms        p50 ${fixed(
    median((w) => w.tickP50),
    2,
  )}  p95 ${fixed(
    median((w) => w.tickP95),
    2,
  )} (worst 10 s window ${fixed(
    worstOf((w) => w.tickP95),
    2,
  )})  max ${fixed(
    worstOf((w) => w.tickMax),
    2,
  )}   budget p95 < 10`,
  `  of it on the CPU    p50 ${fixed(
    median((w) => w.cpuP50),
    2,
  )}  p95 ${fixed(
    median((w) => w.cpuP95),
    2,
  )} (worst 10 s window ${fixed(
    worstOf((w) => w.cpuP95),
    2,
  )})`,
  `patch ms              p95 ${fixed(
    median((w) => w.patchP95),
    2,
  )}`,
  `downstream B/s/client server ${fixed(
    median((w) => w.bytesMean),
    0,
  )} mean, ${fixed(
    worstOf((w) => w.bytesMax),
    0,
  )} max   bots ${fixed(mean(perBot), 0)} mean, ${fixed(Math.max(0, ...perBot), 0)} max   budget < 8000`,
  `view changes/s        ${fixed(
    median((w) => w.viewChanges),
    0,
  )} (an entity entering or leaving one client's view)`,
  `input ack ms          p50 ${fixed(quantile(acks, 0.5), 0)}  p95 ${fixed(quantile(acks, 0.95), 0)}  max ${fixed(Math.max(0, ...acks), 0)}`,
  `reconciliation        ${reconciles} reconciles, ${corrections} corrected (${fixed((corrections / Math.max(1, reconciles)) * 100, 2)}%), error px mean ${fixed(mean(errors), 2)} p95 ${fixed(quantile(errors, 0.95), 2)} max ${fixed(Math.max(0, ...errors), 2)}`,
];
console.log(`\n${lines.join("\n")}\n`);

await Promise.all(bots.map((b) => b.room.leave().catch(() => {})));
process.exit(0);
