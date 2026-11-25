import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import { buildAllMaps } from "@guago/content";
import {
  type Collidable,
  ENTER_PATH,
  encodeInput,
  INPUT_MESSAGE,
  MapState,
  MOVE_MAX,
  moveBody,
  overlapsSolid,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  POS_SCALE,
  Predictor,
  portalAt,
  type Seating,
  shutDoors,
  TICK_MS,
  TILE_SIZE,
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
 * Bots enter through `POST /api/enter` like the browser. `--map campus-yard` seats them on that
 * map instead of where their characters were saved and `--monsters 150` fills a channel it
 * opens; the server must run with ALLOW_MAP_OPTION=1 for either. A channel holds 60 players
 * (PLAN §10): to put more in one room, run the server with MAP_CHANNEL_SEATS raised; the report
 * reads the busiest room. Bots walk to places all over the map but never through a door, so
 * interest cells and view changes are exercised, and each bot counts what it is sent and sees.
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
    map: { type: "string", default: "campus-field" },
    monsters: { type: "string" },
    metrics: { type: "string" },
  },
});

const BOTS = Number(values.bots);
const SECONDS = Number(values.seconds);
const WARMUP = Number(values.warmup);
const target = new URL(values.url);
const metricsUrl = values.metrics ?? `http://127.0.0.1:${Number(target.port) + 100}/metrics`;
const built = buildAllMaps().find((r) => r.map.id === values.map)?.map;
if (!built) throw new Error(`no map ${values.map}`);
/** The room's walls: the map's own, with doors to unbuilt maps shut, as the server has them. */
const walls: Collidable = { collision: shutDoors(built.collision, built.portals) };
const doors = built.portals;
const MAP_W = walls.collision.w * TILE_SIZE;
const MAP_H = walls.collision.h * TILE_SIZE;
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

const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

interface Stats {
  bytes: number;
  /** Other players and monsters in this bot's state, summed over patches. */
  seenPlayers: number;
  seenMonsters: number;
  maxPlayers: number;
  patches: number;
  reconciles: number;
  corrections: number;
  errors: number[];
  ackMs: number[];
}

/** Somewhere a player fits. */
function anywhere(): { x: number; y: number } {
  for (;;) {
    const x = PLAYER_RADIUS + Math.random() * (MAP_W - 2 * PLAYER_RADIUS);
    const y = PLAYER_RADIUS + Math.random() * (MAP_H - 2 * PLAYER_RADIUS);
    if (!overlapsSolid(walls, x, y, PLAYER_RADIUS) && portalAt(doors, x, y) < 0) return { x, y };
  }
}

/**
 * One bot: picks a place anywhere on the map and walks there with the eight keyboard directions,
 * stops for a moment now and then, and gives up on a place it cannot reach.
 */
class Bot {
  readonly stats: Stats = {
    bytes: 0,
    seenPlayers: 0,
    seenMonsters: 0,
    maxPlayers: 0,
    patches: 0,
    reconciles: 0,
    corrections: 0,
    errors: [],
    ackMs: [],
  };
  private predictor: Predictor | undefined;
  private goal: { x: number; y: number } | undefined;
  private restUntil = 0;
  private checkAt = 0;
  private from = { x: 0, y: 0 };
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
    if (this.measuring) {
      let others = 0;
      for (const p of state.players.values()) if (p.sid && p.sid !== this.room.sessionId) others++;
      this.stats.seenPlayers += others;
      this.stats.seenMonsters += state.monsters.size;
      this.stats.maxPlayers = Math.max(this.stats.maxPlayers, others);
      this.stats.patches++;
    }
    const body = { x: me.x / POS_SCALE, y: me.y / POS_SCALE, facing: me.facing as 0 };
    if (!this.predictor) {
      this.predictor = new Predictor(walls, body, PLAYER_SPEED);
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
    const p = this.predictor;
    if (!p) return;
    let mx = 0;
    let my = 0;
    if (n >= this.restUntil) {
      const at = p.body;
      if (!this.goal || Math.hypot(this.goal.x - at.x, this.goal.y - at.y) < 8) {
        if (this.goal && Math.random() < 0.75) this.restUntil = n + between(10, 80);
        this.goal = anywhere();
        this.from = { x: at.x, y: at.y };
        this.checkAt = n + 40;
      } else if (n >= this.checkAt) {
        // Walled off from it: go somewhere else.
        if (Math.hypot(at.x - this.from.x, at.y - this.from.y) < 6) this.goal = anywhere();
        this.from = { x: at.x, y: at.y };
        this.checkAt = n + 40;
      }
      if (n >= this.restUntil && this.goal) {
        const a = Math.round(Math.atan2(this.goal.y - at.y, this.goal.x - at.x) / (Math.PI / 4));
        mx = Math.round(Math.cos((a * Math.PI) / 4)) * MOVE_MAX;
        my = Math.round(Math.sin((a * Math.PI) / 4)) * MOVE_MAX;
        // A door would take the bot to another map: turn away instead.
        const next = moveBody(walls, p.body, mx, my, PLAYER_SPEED);
        if (portalAt(doors, next.x, next.y) >= 0) {
          mx = 0;
          my = 0;
          this.goal = anywhere();
        }
      }
    }
    const input = p.tick(mx, my);
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
      const res = await fetch(`http://${target.host}${ENTER_PATH}`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(choice),
      });
      if (!res.ok) throw new Error(`enter answered ${res.status}`);
      const { seat } = (await res.json()) as Seating;
      const client = new Client(url, { headers: { cookie } });
      bots.push(new Bot(await client.consumeSeatReservation(seat, MapState)));
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
      map: string;
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
  if (room.map !== values.map) {
    throw new Error(
      `the server runs ${room.map}, not ${values.map}: start it with ALLOW_MAP_OPTION=1`,
    );
  }
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
const worstBot = bots[perBot.indexOf(Math.max(...perBot))] as Bot;
const seen = (b: Bot, pick: (s: Stats) => number) => pick(b.stats) / Math.max(1, b.stats.patches);
const seenPlayers = bots.map((b) => seen(b, (s) => s.seenPlayers));
const seenMonsters = bots.map((b) => seen(b, (s) => s.seenMonsters));
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
  `${BOTS} bots on ${values.map} (${walls.collision.w}×${walls.collision.h} tiles), ${fixed(elapsed, 0)} s measured after ${WARMUP} s warm-up, ${link}`,
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
  `bytes per bot        p50 ${fixed(quantile(perBot, 0.5), 0)}  p95 ${fixed(quantile(perBot, 0.95), 0)}  worst ${fixed(Math.max(0, ...perBot), 0)} (sees ${fixed(
    seen(worstBot, (s) => s.seenPlayers),
    0,
  )} players, ${fixed(
    seen(worstBot, (s) => s.seenMonsters),
    0,
  )} monsters on average)`,
  `in view per client    players mean ${fixed(mean(seenPlayers), 1)}, most ${Math.max(0, ...bots.map((b) => b.stats.maxPlayers))} of ${BOTS - 1}; monsters mean ${fixed(mean(seenMonsters), 1)}`,
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
