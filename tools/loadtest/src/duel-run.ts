/**
 * The 콜로세움 played by signed-in bots against a running local server (PLAN §14): a challenged
 * 1v1 to a result, a queued 3v3 to a result, a forfeit by disconnect, two duels at once, a crowd
 * watching from the gallery with the bytes each of them receives, and a field where two players
 * stand together and neither can hurt the other. Each check prints PASS or FAIL; the exit code is
 * the number of failures.
 *
 *   ALLOW_MAP_OPTION=1 MAP_CHANNEL_SEATS=64 PORT=2577 pnpm --filter @guago/server start
 *   node tools/loadtest/src/duel-run.ts --url http://127.0.0.1:2577 [--only spectators]
 *
 * `ALLOW_MAP_OPTION` lets bots enter the map a scenario needs; `MAP_CHANNEL_SEATS` above 60 lets
 * sixty watchers and two fighters share one channel.
 */
import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import { snapshotReaderForMap } from "@guago/content";
import {
  DUEL_MESSAGES,
  type DuelEvent,
  type DuelResultView,
  ENTER_PATH,
  encodeInput,
  type FloorView,
  INPUT_MESSAGE,
  MAP_MESSAGES,
  MapState,
  MOVE_MAX,
  NULL_SINK,
  POS_SCALE,
  Q,
  type Seating,
  SNAPSHOT_MESSAGE,
  type SnapshotReader,
  TICK_MS,
  type Transfer,
  WirePlayer,
  type WireSelf,
  WORLD_MESSAGES,
  WORLD_ROOM,
} from "@guago/shared";
import { signIn } from "./account.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    url: { type: "string", default: "http://127.0.0.1:2577" },
    only: { type: "string" },
    spectators: { type: "string", default: "60" },
    accounts: { type: "string", default: "dl" },
    verbose: { type: "boolean", default: false },
  },
});
const HTTP = values.url as string;
const WS = HTTP.replace(/^http/, "ws");
const started = Date.now();
let failures = 0;

function say(text: string): void {
  console.log(`[${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s] ${text}`);
}
function check(ok: boolean, what: string): void {
  if (!ok) failures++;
  say(`${ok ? "PASS" : "FAIL"} ${what}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One signed-in player: its WorldRoom seat, its map seat (following transfers), what it sees. */
class Bot {
  readonly name: string;
  readonly cookie: string;
  id = "";
  charName = "";
  world!: Room;
  map: Room<unknown, MapState> | undefined;
  private reader: SnapshotReader | undefined;
  self = { x: 0, y: 0 };
  floor: FloorView | null = null;
  readonly pushes: DuelEvent[] = [];
  /** Party invites waiting on this player, as the social push last listed them. */
  partyInvites: { id: number }[] = [];
  readonly hurts: { source: number; amount: number }[] = [];
  readonly hitTargets: number[] = [];
  /** Bytes received on the map seat since `measure` was set. */
  bytes = 0;
  measuring = false;
  private n = 0;
  private seq = 0;
  private answers = new Map<number, (a: { ok: boolean; body: unknown }) => void>();
  /** Where to walk; null stands still; "foe" walks at the nearest fighter of the other side. */
  goal: { x: number; y: number } | "foe" | null = null;
  stopped = false;
  private moving: Promise<void> = Promise.resolve();

  constructor(name: string, cookie: string) {
    this.name = name;
    this.cookie = cookie;
  }

  async joinWorld(): Promise<void> {
    this.world = await new Client(WS, { headers: { cookie: this.cookie } }).join(WORLD_ROOM);
    this.world.onMessage("*", () => {});
    this.world.onMessage(
      WORLD_MESSAGES.presence,
      (m: { t: string; you?: string; list?: { id: string; name: string }[] }) => {
        if (m.t !== "all" || !m.you) return;
        this.id = m.you;
        this.charName = m.list?.find((p) => p.id === m.you)?.name ?? "";
      },
    );
    this.world.onMessage(WORLD_MESSAGES.done, (d: { n: number; data?: unknown }) =>
      this.answers.get(d.n)?.({ ok: true, body: d.data }),
    );
    this.world.onMessage(WORLD_MESSAGES.refused, (r: { n?: number }) =>
      r.n !== undefined ? this.answers.get(r.n)?.({ ok: false, body: r }) : undefined,
    );
    this.world.onMessage(DUEL_MESSAGES.push, (e: DuelEvent) => this.pushes.push(e));
    this.world.onMessage("social", (e: { t: string; list?: { id: number }[] }) => {
      if (e.t === "partyInvites" && e.list) this.partyInvites = e.list;
    });
    for (let i = 0; i < 100 && !this.id; i++) await sleep(20);
  }

  async enter(map?: string): Promise<void> {
    const res = await fetch(HTTP + ENTER_PATH, {
      method: "POST",
      headers: { cookie: this.cookie, "content-type": "application/json" },
      body: JSON.stringify(map ? { map } : {}),
    });
    if (!res.ok) throw new Error(`${this.name}: enter answered ${res.status}`);
    const { seat } = (await res.json()) as Seating;
    await this.take(seat);
  }

  private async take(seat: Seating["seat"]): Promise<void> {
    const room = await new Client(WS, { headers: { cookie: this.cookie } }).consumeSeatReservation(
      seat,
      MapState,
    );
    room.reconnection.enabled = false;
    this.reader = undefined;
    const sink = {
      ...NULL_SINK,
      self: (s: WireSelf) => {
        this.self = { x: s.x / POS_SCALE, y: s.y / POS_SCALE };
      },
      hurt: (h: { source: number; amount: number }) =>
        this.hurts.push({ source: h.source, amount: h.amount }),
      hit: (h: { target: number }) => this.hitTargets.push(h.target),
    };
    room.onMessage("*", () => {});
    room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => {
      // The reader is made for the room's map before its first message.
      if (!this.reader && room.state.map) this.reader = snapshotReaderForMap(room.state.map);
      if (!this.reader) return;
      try {
        this.reader?.read(bytes, sink);
      } catch (error) {
        say(`${this.name} snapshot ${error instanceof Error ? error.stack : String(error)}`);
      }
    });
    room.onLeave((code) => {
      if (values.verbose) say(`${this.name} left ${room.roomId} with ${code}`);
    });
    room.onError((code, message) => say(`${this.name} room error ${code} ${message}`));
    room.onMessage(DUEL_MESSAGES.floor, (v: FloorView) => {
      if (
        values.verbose &&
        v.phase !== this.floor?.phase &&
        v.fighters.some((f) => f.id === this.id)
      )
        say(`${this.name} floor ${v.match} ${v.phase} round ${v.round} score ${v.score.join(":")}`);
      this.floor = v;
    });
    room.onMessage(MAP_MESSAGES.transfer, (t: Transfer) => {
      this.moving = this.moving.then(async () => {
        const old = this.map;
        this.map = undefined;
        await old?.leave(true).catch(() => {});
        await this.take(t.seat);
      });
    });
    const events = room.connection.events;
    const onmessage = events.onmessage;
    events.onmessage = (ev: { data: ArrayBuffer }) => {
      if (this.measuring) this.bytes += ev.data.byteLength;
      onmessage?.(ev);
    };
    this.map = room;
    for (let i = 0; i < 100 && !room.state.map; i++) await sleep(20);
  }

  /** Sends a duel request and waits for its one answer. */
  request(
    type: string,
    body: Record<string, unknown> = {},
  ): Promise<{ ok: boolean; body: unknown }> {
    const n = ++this.n;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, body: "timeout" }), 5000);
      this.answers.set(n, (a) => {
        clearTimeout(timer);
        this.answers.delete(n);
        resolve(a);
      });
      this.world.send(type, { ...body, n });
    });
  }

  async push<T extends DuelEvent["t"]>(
    t: T,
    ms = 10_000,
    also: (e: Extract<DuelEvent, { t: T }>) => boolean = () => true,
  ) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const e = this.pushes.find((p) => p.t === t && also(p as Extract<DuelEvent, { t: T }>));
      if (e) return e as Extract<DuelEvent, { t: T }>;
      await sleep(50);
    }
    return undefined;
  }

  /** Sessions of bodies in the room by slot, from the synced identities. */
  private slotOf(sid: string): number {
    let slot = -1;
    this.map?.state.players?.forEach((p, k) => {
      if (p.sid === sid) slot = Number(k);
    });
    return slot;
  }

  /** The perceived position of the body with this session id, if in view. */
  bodyOf(sid: string): { x: number; y: number } | undefined {
    const slot = this.slotOf(sid);
    for (const m of this.reader?.members.values() ?? []) {
      if (m.kind === WirePlayer && m.slot === slot) return { x: m.qx / Q, y: m.qy / Q };
    }
    return undefined;
  }

  /** The network id of the body with this session id, if in view. */
  entityOf(sid: string): number | undefined {
    const slot = this.slotOf(sid);
    for (const m of this.reader?.members.values() ?? []) {
      if (m.kind === WirePlayer && m.slot === slot) return m.id;
    }
    return undefined;
  }

  /** Every player body's network id in view. */
  playerEntities(): Set<number> {
    const out = new Set<number>();
    for (const m of this.reader?.members.values() ?? []) if (m.kind === WirePlayer) out.add(m.id);
    return out;
  }

  tick(): void {
    const room = this.map;
    if (!room || this.stopped) return;
    let target: { x: number; y: number } | undefined;
    if (this.goal === "foe") {
      const me = this.floor?.fighters.find((f) => f.id === this.id);
      const foes = this.floor?.fighters.filter((f) => me && f.team !== me.team && !f.out) ?? [];
      for (const f of foes) {
        const at = this.bodyOf(f.sid);
        if (
          at &&
          (!target ||
            Math.hypot(at.x - this.self.x, at.y - this.self.y) <
              Math.hypot(target.x - this.self.x, target.y - this.self.y))
        )
          target = at;
      }
    } else if (this.goal) target = this.goal;
    let mx = 0;
    let my = 0;
    if (target) {
      const dx = target.x - this.self.x;
      const dy = target.y - this.self.y;
      const d = Math.hypot(dx, dy);
      const stop = this.goal === "foe" ? 56 : 4;
      if (d > stop) {
        mx = Math.round((dx / d) * MOVE_MAX);
        my = Math.round((dy / d) * MOVE_MAX);
      }
    }
    room.send(INPUT_MESSAGE, encodeInput({ seq: ++this.seq, mx, my }));
  }

  async close(): Promise<void> {
    this.stopped = true;
    await this.map?.leave(true).catch(() => {});
    await this.world?.leave(true).catch(() => {});
  }
}

const bots: Bot[] = [];
let botIndex = 0;
async function bot(map?: string): Promise<Bot> {
  const i = ++botIndex;
  const cookie = await signIn(HTTP, values.accounts as string, i);
  const b = new Bot(`${values.accounts}${i}`, cookie);
  await b.joinWorld();
  await b.enter(map);
  bots.push(b);
  return b;
}

// One clock drives every bot's inputs at 20 Hz.
setInterval(() => {
  for (const b of bots) b.tick();
}, TICK_MS).unref();
if (values.verbose) {
  setInterval(() => {
    say(
      bots
        .map(
          (b) =>
            `${b.name}@${b.map?.state.map ?? "-"} ${b.self.x | 0},${b.self.y | 0} ${b.floor?.phase ?? ""}`,
        )
        .join(" | "),
    );
  }, 2000).unref();
}

/** Waits for the match to be decided on every fighter's side and returns the result. */
async function result(fighters: Bot[], ms = 240_000): Promise<DuelResultView | undefined> {
  const over = await fighters[0]?.push("over", ms);
  return over?.result;
}

function describe(r: DuelResultView | undefined): string {
  if (!r) return "no result";
  const rounds = r.rounds.map((x) => `${x.winner || "draw"}/${x.end}/${x.seconds}s`).join(" ");
  const who = r.fighters
    .map(
      (f) =>
        `${f.name || f.id.slice(0, 6)}[${f.team}] dmg ${f.damage} hits ${f.hits} downs ${f.downs}${f.forfeited ? " forfeited" : ""}`,
    )
    .join("; ");
  return `winner ${r.winner || "draw"} in ${r.seconds}s, rounds ${rounds} | ${who}`;
}

/** Fighters walk at each other once the match is on; returns when every one stands on the floor. */
async function fight(fighters: Bot[]): Promise<boolean> {
  for (const f of fighters) f.goal = "foe";
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    if (fighters.every((f) => f.floor?.phase === "countdown" || f.floor?.phase === "fight"))
      return true;
    await sleep(100);
  }
  return false;
}

async function backHome(f: Bot, map: string, ms = 20_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (f.map?.state.map === map && f.floor?.phase !== "fight") return true;
    await sleep(100);
  }
  return false;
}

// ── Scenarios ───────────────────────────────────────────────────────────────

async function challenged(): Promise<void> {
  say("— a challenged 1v1, from two different maps");
  const a = await bot("campus-yard");
  const b = await bot("cafeteria");
  const fromA = a.map?.state.map ?? "";
  const fromB = b.map?.state.map ?? "";
  const sent = await a.request("duel.challenge", { id: b.id });
  check(sent.ok, `challenge sent ${JSON.stringify(sent.body)}`);
  const got = await b.push("challenged");
  check(got !== undefined, "the challenged player is told");
  const accepted = await b.request("duel.accept", { id: got?.id ?? 0 });
  check(accepted.ok, "challenge accepted");
  const match = await a.push("match");
  say(`match ${match?.id} on ${match?.map} channel ${match?.channel}`);
  check(await fight([a, b]), "both fighters arrived on the floor and the countdown began");
  check(a.map?.state.map === "saebyeok" && b.map?.state.map === "saebyeok", "both moved to 새벽관");
  const r = await result([a, b]);
  say(describe(r));
  check(r !== undefined && r.winner > 0, "the match was decided");
  check(
    a.hurts.length + b.hurts.length > 0,
    `players hurt each other (${a.hurts.length + b.hurts.length} hurt records)`,
  );
  a.goal = null;
  b.goal = null;
  check(
    (await backHome(a, fromA)) && (await backHome(b, fromB)),
    `both put back (${fromA}, ${fromB})`,
  );
  const record = await a.request("duel.record", { id: a.id });
  say(`record ${JSON.stringify(record.body)}`);
  check(
    record.ok && (record.body as { played: number }).played >= 1,
    "the record counts the match",
  );
}

async function queued(): Promise<void> {
  say("— a queued 3v3: a party of three against three solo players");
  const team = [await bot("campus-yard"), await bot("campus-yard"), await bot("campus-yard")];
  const solos = [await bot("campus-yard"), await bot("campus-yard"), await bot("campus-yard")];
  const leader = team[0] as Bot;
  for (const m of team.slice(1)) {
    const inv = await leader.request("party.invite", { name: await nameOf(m) });
    check(inv.ok, `party invite ${JSON.stringify(inv.body)}`);
    await sleep(300);
    const partyId = await partyInvite(m);
    const acc = await m.request("party.accept", { id: partyId });
    check(acc.ok, "party joined");
  }
  check((await leader.request("duel.queue", { mode: "3v3" })).ok, "the party queued for 3v3");
  for (const s of solos)
    check((await s.request("duel.queue", { mode: "3v3" })).ok, "a solo player queued for 3v3");
  const all = [...team, ...solos];
  const found = await Promise.all(all.map((b) => b.push("found", 8000)));
  check(
    found.every((f) => f !== undefined),
    "the queue found a match for all six",
  );
  const id = found[0]?.id ?? 0;
  const sameSide = found.slice(0, 3).every((f) => f?.you === found[0]?.you);
  check(sameSide, "the party stays on one side");
  for (const b of all) await b.request("duel.ready", { id });
  check(await fight(all), "all six on the floor");
  const r = await result(all);
  say(describe(r));
  check(
    r !== undefined && r.fighters.length === 6,
    "the 3v3 was decided with six fighters in the result",
  );
  for (const b of all) b.goal = null;
  await sleep(8000);
  for (const b of all) await b.close();
}

async function nameOf(b: Bot): Promise<string> {
  return b.charName;
}

async function partyInvite(b: Bot): Promise<number> {
  for (let i = 0; i < 60 && b.partyInvites.length === 0; i++) await sleep(50);
  return b.partyInvites[0]?.id ?? 0;
}

async function forfeitByDisconnect(): Promise<void> {
  say("— a forfeit by disconnect, mid-round");
  const a = await bot("saebyeok");
  const b = await bot("saebyeok");
  const before = (await a.request("duel.record", { id: b.id })).body as {
    played: number;
    won: number;
  };
  const sent = await a.request("duel.challenge", { id: b.id });
  const got = await b.push("challenged");
  await b.request("duel.accept", { id: got?.id ?? 0 });
  void sent;
  check(await fight([a, b]), "both on the floor (already in 새벽관: nobody was moved)");
  const end = Date.now() + 15_000;
  while (Date.now() < end && a.floor?.phase !== "fight") await sleep(100);
  await sleep(2000);
  say(`${b.name} pulls the plug`);
  await b.map?.leave(false).catch(() => {});
  const r = await result([a], 20_000);
  say(describe(r));
  const quitter = r?.fighters.find((f) => f.id === b.id);
  check(r?.winner === r?.fighters.find((f) => f.id === a.id)?.team, "the one who stayed won");
  check(quitter?.forfeited === true, "the one who dropped forfeited");
  // The record is written once the match is decided, off the tick.
  await a.push("record", 5000);
  const rec = (await a.request("duel.record", { id: b.id })).body as {
    played: number;
    won: number;
  };
  say(`dropped player's record ${JSON.stringify(before)} → ${JSON.stringify(rec)}`);
  check(rec.played === before.played + 1 && rec.won === before.won, "a drop is played, never won");
  a.goal = null;
  await sleep(7000);
  await a.close();
  await b.close();
}

async function twoAtOnce(): Promise<void> {
  say("— two duels at once");
  const p = [
    await bot("campus-yard"),
    await bot("campus-yard"),
    await bot("campus-yard"),
    await bot("campus-yard"),
  ];
  const [a, b, c, d] = p as [Bot, Bot, Bot, Bot];
  await a.request("duel.challenge", { id: b.id });
  await c.request("duel.challenge", { id: d.id });
  const g1 = await b.push("challenged");
  const g2 = await d.push("challenged");
  await Promise.all([
    b.request("duel.accept", { id: g1?.id ?? 0 }),
    d.request("duel.accept", { id: g2?.id ?? 0 }),
  ]);
  const m1 = await a.push("match");
  const m2 = await c.push("match");
  say(`first on channel ${m1?.channel}, second on channel ${m2?.channel}`);
  check(
    m1 !== undefined && m2 !== undefined && m1.channel !== m2.channel,
    "each match has its own floor",
  );
  check(await fight(p), "all four on their floors");
  const [r1, r2] = await Promise.all([result([a, b]), result([c, d])]);
  say(`first: ${describe(r1)}`);
  say(`second: ${describe(r2)}`);
  check(r1 !== undefined && r2 !== undefined, "both decided");
  for (const x of p) x.goal = null;
  await sleep(8000);
  for (const x of p) await x.close();
}

async function spectators(): Promise<void> {
  const count = Number(values.spectators);
  say(`— ${count} watching from the gallery`);
  const a = await bot("saebyeok");
  const b = await bot("saebyeok");
  const crowd: Bot[] = [];
  for (let i = 0; i < count; i++) {
    const s = await bot("saebyeok");
    // Along the corridor to the north gallery over the floor, spread along the rail.
    s.goal = { x: 456 + (i % 20) * 16, y: 72 + Math.floor(i / 20) * 12 };
    crowd.push(s);
  }
  const room = new Set([a, b, ...crowd].map((x) => x.map?.roomId));
  check(room.size === 1, `all ${count + 2} in one channel`);
  await sleep(25_000);
  const sent = await a.request("duel.challenge", { id: b.id });
  void sent;
  const got = await b.push("challenged");
  await b.request("duel.accept", { id: got?.id ?? 0 });
  check(await fight([a, b]), "the fighters are on the floor");
  const end = Date.now() + 15_000;
  while (Date.now() < end && a.floor?.phase !== "fight") await sleep(100);
  for (const s of crowd) {
    s.bytes = 0;
    s.measuring = true;
  }
  const t0 = Date.now();
  const watched = crowd.map(() => 0);
  const sampler = setInterval(() => {
    crowd.forEach((s, i) => {
      if (s.floor?.phase === "fight" && a.floor && a.floor.fighters.every((f) => s.bodyOf(f.sid)))
        watched[i] = (watched[i] ?? 0) + 1;
    });
  }, 1000);
  const r = await result([a, b]);
  clearInterval(sampler);
  const secs = (Date.now() - t0) / 1000;
  for (const s of crowd) s.measuring = false;
  say(describe(r));
  const rates = crowd.map((s) => s.bytes / secs).sort((x, y) => x - y);
  const mean = rates.reduce((x, y) => x + y, 0) / rates.length;
  say(
    `spectator bytes/s over ${secs.toFixed(1)} s of match: mean ${mean.toFixed(0)}, median ${rates[Math.floor(rates.length / 2)]?.toFixed(0)}, p95 ${rates[Math.floor(rates.length * 0.95)]?.toFixed(0)}, max ${rates.at(-1)?.toFixed(0)}`,
  );
  check((rates.at(-1) ?? 0) < 8000, "every spectator under 8 kB/s");
  const sawAll = watched.filter((n) => n > 0).length;
  check(
    sawAll === crowd.length,
    `every spectator saw both fighters in its snapshot (${sawAll}/${crowd.length})`,
  );
  const fighters = new Set(
    (a.floor?.fighters ?? []).map((f) => a.entityOf(f.sid)).filter((e) => e !== undefined),
  );
  const strays = [a, b].flatMap((f) => f.hurts).filter((h) => !fighters.has(h.source));
  check(
    fighters.size === 2 && strays.length === 0,
    `every hurt a fighter took came from the other fighter (${a.hurts.length + b.hurts.length} hurts, ${strays.length} from anyone else)`,
  );
  for (const x of [a, b, ...crowd]) x.goal = null;
  await sleep(7000);
  for (const x of [a, b, ...crowd]) await x.close();
}

async function field(): Promise<void> {
  say("— a field: two players together, hunting, for 30 s");
  const a = await bot("p1-colonnade");
  const b = await bot("p1-colonnade");
  a.goal = { x: 400, y: 300 };
  b.goal = { x: 404, y: 300 };
  await sleep(30_000);
  const others = new Set([...a.playerEntities(), ...b.playerEntities()]);
  const fromPlayers = [...a.hurts, ...b.hurts].filter((h) => others.has(h.source));
  const atPlayers = [...a.hitTargets, ...b.hitTargets].filter((t) => others.has(t));
  say(
    `hurt records ${a.hurts.length + b.hurts.length}, hits ${a.hitTargets.length + b.hitTargets.length}, player bodies seen ${others.size}`,
  );
  check(others.size >= 2, "each saw the other");
  check(fromPlayers.length === 0, "no hurt on the field came from a player");
  check(atPlayers.length === 0, "no hit on the field landed on a player");
  const c = await a.request("duel.forfeit", {});
  check(!c.ok, "nothing to forfeit outside a duel");
  await a.close();
  await b.close();
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  challenged,
  queued,
  forfeit: forfeitByDisconnect,
  two: twoAtOnce,
  spectators,
  field,
};

for (const [name, run] of Object.entries(SCENARIOS)) {
  if (values.only && values.only !== name) continue;
  try {
    await run();
  } catch (error) {
    failures++;
    say(`FAIL ${name} threw ${error instanceof Error ? error.stack : String(error)}`);
  }
  for (const b of bots.splice(0)) await b.close();
}
say(failures === 0 ? "all checks passed" : `${failures} checks failed`);
process.exit(failures);
