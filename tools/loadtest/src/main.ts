import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import { mapById } from "@guago/content";
import {
  encodeInput,
  type Facing,
  INPUT_MESSAGE,
  MAP_ROOM,
  MapState,
  MODE_MESSAGE,
  MOVE_MAX,
  NULL_SINK,
  POS_SCALE,
  Predictor,
  Q,
  SNAP_CELL_TILES,
  SNAPSHOT_MESSAGE,
  SnapshotReader,
  TICK_MS,
  TILE_SIZE,
  WirePlayer,
  type WireSelf,
} from "@guago/shared";
import { signIn } from "./account.ts";
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
 *   … --map p1-colonnade  open the room on this map (the server needs ALLOW_MAP_OPTION=1);
 *                         without it the room runs the server's GUAGO_MAP
 *   … --auto 0.5          share of bots in full auto
 *   … --latency 150 --jitter 30 --loss 0.01   every bot through a simulated mobile link
 *   … --out report.txt    also write the report to a file
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
    map: { type: "string" },
    metrics: { type: "string" },
    out: { type: "string" },
  },
});

const BOTS = Number(values.bots);
const SECONDS = Number(values.seconds);
const WARMUP = Number(values.warmup);
const AUTO = Number(values.auto);
const target = new URL(values.url);
const metricsUrl = values.metrics ?? `http://127.0.0.1:${Number(target.port) + 100}/metrics`;
const joinOptions = values.map ? { map: values.map } : {};

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

const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

interface Stats {
  bytes: number;
  snapshots: number;
  reconciles: number;
  corrections: number;
  errors: number[];
  downs: number;
}

/** One bot: a session, its own body predicted, and the snapshot decoded. */
class Bot {
  readonly stats: Stats = {
    bytes: 0,
    snapshots: 0,
    reconciles: 0,
    corrections: 0,
    errors: [],
    downs: 0,
  };
  private predictor: Predictor | undefined;
  private readonly reader = new SnapshotReader();
  private seen = { x: -1, y: -1, seq: -1 };
  private slot: string | undefined;
  private dir: readonly [number, number] = [0, 0];
  private until = 0;
  private wasDown = false;
  private down = false;
  measuring = false;
  readonly room: Room<unknown, MapState>;
  readonly auto: boolean;

  constructor(room: Room<unknown, MapState>, auto: boolean) {
    this.room = room;
    this.auto = auto;
    room.reconnection.enabled = false;
    room.onMessage("*", () => {});
    const sink = { ...NULL_SINK, self: (me: WireSelf) => this.onSelf(me) };
    room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => {
      if (this.measuring) this.stats.snapshots++;
      this.reader.read(bytes, sink);
    });
    const events = room.connection.events;
    const onmessage = events.onmessage;
    events.onmessage = (ev: { data: ArrayBuffer }) => {
      if (this.measuring) this.stats.bytes += ev.data.byteLength;
      onmessage?.(ev);
    };
    room.onStateChange((state) => this.onPatch(state));
    if (auto) room.send(MODE_MESSAGE, [0]);
  }

  get broken(): number {
    return this.reader.broken;
  }

  private map: ReturnType<typeof mapById>;
  private speed = 60;

  private onPatch(state: MapState): void {
    if (this.reader.cols === 1 && state.map) {
      this.map = mapById(state.map);
      if (this.map) {
        const cell = SNAP_CELL_TILES * TILE_SIZE;
        this.reader.cols = Math.ceil((this.map.collision.w * TILE_SIZE) / cell);
        this.reader.rows = Math.ceil((this.map.collision.h * TILE_SIZE) / cell);
      }
    }
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
    this.down = me.down > 0;
    if (this.down && !this.wasDown && this.measuring) this.stats.downs++;
    this.wasDown = this.down;
    this.speed = me.speed || this.speed;
    if (this.predictor) this.predictor.speed = this.speed;
  }

  /** The server's word on the own body, from the snapshot's Self record. */
  private onSelf(me: WireSelf): void {
    const body = { x: me.x / POS_SCALE, y: me.y / POS_SCALE, facing: me.facing as Facing };
    if (!this.predictor) {
      if (!this.map) return;
      this.predictor = new Predictor(this.map, body, this.speed);
      this.seen = { x: me.x, y: me.y, seq: me.seq };
      return;
    }
    if (me.x === this.seen.x && me.y === this.seen.y && me.seq === this.seen.seq) return;
    this.seen = { x: me.x, y: me.y, seq: me.seq };
    // In full auto the server walks the body; the browser follows it instead of predicting.
    if (this.auto) {
      this.predictor.reset(body);
      return;
    }
    const error = this.predictor.reconcile(body, me.seq);
    if (!this.measuring) return;
    this.stats.reconciles++;
    if (error > 0) {
      this.stats.corrections++;
      this.stats.errors.push(error);
    }
  }

  /** 반자동 play: close on the nearest monster, hold a distance, circle; wander when alone. */
  private think(n: number): void {
    const p = this.predictor;
    if (!p) return;
    const px = p.body.x;
    const py = p.body.y;
    let best = Number.POSITIVE_INFINITY;
    let mx = 0;
    let my = 0;
    for (const m of this.reader.members.values()) {
      if (m.kind >= WirePlayer) continue;
      const dx = m.qx / Q - px;
      const dy = m.qy / Q - py;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        mx = dx;
        my = dy;
      }
    }
    const d = Math.sqrt(best);
    if (d < 220) {
      const ux = mx / (d || 1);
      const uy = my / (d || 1);
      // Too close: back off with a sidestep; too far: walk in; else circle.
      const side = Math.floor(n / 60) % 2 === 0 ? 1 : -1;
      let vx: number;
      let vy: number;
      if (d < 44) {
        vx = -ux - uy * side * 0.5;
        vy = -uy + ux * side * 0.5;
      } else if (d > 90) {
        vx = ux;
        vy = uy;
      } else {
        vx = -uy * side;
        vy = ux * side;
      }
      const len = Math.sqrt(vx * vx + vy * vy) || 1;
      this.dir = [Math.round((vx / len) * MOVE_MAX), Math.round((vy / len) * MOVE_MAX)];
      this.until = n + 6;
      return;
    }
    if (n >= this.until) {
      const walking = this.dir[0] !== 0 || this.dir[1] !== 0;
      if (walking && Math.random() < 0.3) {
        this.dir = [0, 0];
        this.until = n + between(6, 30);
      } else {
        const a = Math.random() * Math.PI * 2;
        this.dir = [Math.round(Math.cos(a) * MOVE_MAX), Math.round(Math.sin(a) * MOVE_MAX)];
        this.until = n + between(20, 70);
      }
    }
  }

  tick(n: number): void {
    if (this.auto || !this.predictor || this.down) return;
    if (n % 4 === 0) this.think(n);
    const input = this.predictor.tick(this.dir[0], this.dir[1]);
    if (input) this.room.send(INPUT_MESSAGE, encodeInput(input));
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
  for (let attempt = 1; ; attempt++) {
    try {
      const client = new Client(url, { headers: { cookie } });
      const room = await client.joinOrCreate(MAP_ROOM, joinOptions, MapState);
      bots.push(new Bot(room, i < Math.round(BOTS * AUTO)));
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
