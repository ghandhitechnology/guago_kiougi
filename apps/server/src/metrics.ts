import { Ev, type FightNet, type FightWorld } from "@guago/shared";

/** Samples kept per series: ten seconds of ticks. */
const WINDOW = 200;

/** A fixed ring of the latest samples. */
class Ring {
  private readonly values = new Float64Array(WINDOW);
  private count = 0;
  private next = 0;

  push(v: number): void {
    this.values[this.next] = v;
    this.next = (this.next + 1) % WINDOW;
    this.count = Math.min(this.count + 1, WINDOW);
  }

  /** p50, p95, p99 and max of what the ring holds, in its units. */
  summary(): { p50: number; p95: number; p99: number; max: number } {
    if (this.count === 0) return { p50: 0, p95: 0, p99: 0, max: 0 };
    const sorted = Array.from(this.values.subarray(0, this.count)).sort((a, b) => a - b);
    const at = (q: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    return {
      p50: round(at(0.5)),
      p95: round(at(0.95)),
      p99: round(at(0.99)),
      max: round(sorted.at(-1) as number),
    };
  }
}

export interface RoomSnapshot {
  readonly room: string;
  readonly map: string;
  readonly players: number;
  readonly clients: number;
  readonly monsters: number;
  /** Whole server tick: inputs, simulation, interest, sync and the patch, in ms over the last ten seconds. */
  readonly tickMs: { p50: number; p95: number; p99: number; max: number };
  /** CPU the main thread spent on the tick, in ms: the tick's real cost, without time the OS took away. */
  readonly tickCpuMs: { p50: number; p95: number; p99: number; max: number };
  /** The patch alone (encode and send), in ms. */
  readonly patchMs: { p50: number; p95: number; p99: number; max: number };
  /** Bytes sent per connected client per second, over the last window. */
  readonly bytesPerClient: { mean: number; max: number };
  /** Inputs refused (repeats, stale, overflow) since the room opened. */
  readonly inputsDropped: number;
  /** Entities entering or leaving a client's view per second, over the last byte window. */
  readonly viewChangesPerSecond: number;
  /** The fight: step and snapshot time, and what happened per second over the last window. */
  readonly fight: {
    readonly simMs: { p50: number; p95: number; p99: number; max: number };
    readonly netMs: { p50: number; p95: number; p99: number; max: number };
    readonly killsPerSecond: number;
    readonly spawnsPerSecond: number;
    readonly hitsPerSecond: number;
    readonly castsPerSecond: number;
    /** Events of every kind the step raised, per second. */
    readonly eventsPerSecond: number;
    /** Effect records filed per second (spawns, ends, bursts). */
    readonly fxPerSecond: number;
    /** Snapshot bytes per client per second by part. */
    readonly bytesByPart: Readonly<Record<string, number>>;
    readonly downs: number;
    readonly revives: number;
    readonly wakes: number;
  };
}

const PARTS = [
  "removals",
  "codes",
  "updates",
  "arrivals",
  "effects",
  "keyframes",
  "private",
  "headers",
] as const;

/**
 * A room's running numbers: tick and patch time, downstream bytes per client, head counts.
 * Rooms register here; the server logs every room on an interval and serves them at /metrics.
 */
export class RoomMetrics {
  static readonly rooms = new Set<RoomMetrics>();

  private readonly tick = new Ring();
  private readonly tickCpu = new Ring();
  private readonly patch = new Ring();
  private bytes = new Map<string, number>();
  private windowStart = performance.now();
  private lastRate: { mean: number; max: number } = { mean: 0, max: 0 };
  players = 0;
  clients = 0;
  monsters = 0;
  inputsDropped = 0;
  /** Running count of view adds and removes, kept by the room. */
  viewChanges = 0;
  private readonly sim = new Ring();
  private readonly net = new Ring();
  private readonly count = { kills: 0, spawns: 0, hits: 0, casts: 0, events: 0, downs: 0, revives: 0, wakes: 0 };
  private countAt = { ...this.count, fx: 0, t: performance.now() };
  private lastFight: RoomSnapshot["fight"] | undefined;
  private fightNet: FightNet | undefined;
  private sentAt: number[] = [];
  private lastSpawnTotal = 0;
  private viewChangesAt = 0;
  private lastViewRate = 0;
  readonly room: string;
  readonly map: string;

  constructor(room: string, map: string) {
    this.room = room;
    this.map = map;
    RoomMetrics.rooms.add(this);
  }

  dispose(): void {
    RoomMetrics.rooms.delete(this);
  }

  recordTick(ms: number, cpuMs: number, patchMs: number): void {
    this.tick.push(ms);
    this.tickCpu.push(cpuMs);
    this.patch.push(patchMs);
  }

  recordFight(simMs: number, netMs: number): void {
    this.sim.push(simMs);
    this.net.push(netMs);
  }

  /** Counts one tick's events. */
  countTick(w: FightWorld, net: FightNet): void {
    this.fightNet = net;
    const c = this.count;
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (!e) continue;
      c.events++;
      if (e.type === Ev.Kill) c.kills++;
      else if (e.type === Ev.Hit) c.hits++;
      else if (e.type === Ev.Cast) c.casts++;
      else if (e.type === Ev.Down) c.downs++;
      else if (e.type === Ev.Revive) c.revives++;
      else if (e.type === Ev.Wake) c.wakes++;
    }
    c.spawns = w.spawned;
  }

  private rollFight(): void {
    const now = performance.now();
    const seconds = (now - this.countAt.t) / 1000;
    if (seconds < 1 && this.lastFight) return;
    const c = this.count;
    const a = this.countAt;
    const net = this.fightNet;
    const per = (v: number) => Math.round((v / Math.max(1e-3, seconds)) * 10) / 10;
    const sent = net ? [...net.sent] : [];
    const clients = Math.max(1, this.clients);
    const bytesByPart: Record<string, number> = {};
    PARTS.forEach((k, i) => {
      bytesByPart[k] = Math.round(((sent[i] ?? 0) - (this.sentAt[i] ?? 0)) / seconds / clients);
    });
    this.lastFight = {
      simMs: this.sim.summary(),
      netMs: this.net.summary(),
      killsPerSecond: per(c.kills - a.kills),
      spawnsPerSecond: per(c.spawns - this.lastSpawnTotal),
      hitsPerSecond: per(c.hits - a.hits),
      castsPerSecond: per(c.casts - a.casts),
      eventsPerSecond: per(c.events - a.events),
      fxPerSecond: per((net?.totals.fx ?? 0) - a.fx),
      bytesByPart,
      downs: c.downs,
      revives: c.revives,
      wakes: c.wakes,
    };
    this.lastSpawnTotal = c.spawns;
    this.countAt = { ...c, fx: net?.totals.fx ?? 0, t: now };
    this.sentAt = sent;
  }

  sent(client: string, bytes: number): void {
    this.bytes.set(client, (this.bytes.get(client) ?? 0) + bytes);
  }

  /** Closes the current byte window when it is at least `minMs` old and starts the next. */
  private rollBytes(minMs: number): void {
    const now = performance.now();
    const seconds = (now - this.windowStart) / 1000;
    if (seconds * 1000 < minMs) return;
    const rates = [...this.bytes.values()].map((b) => b / seconds);
    this.lastRate = {
      mean: Math.round(rates.reduce((a, b) => a + b, 0) / Math.max(1, rates.length)),
      max: Math.round(Math.max(0, ...rates)),
    };
    this.bytes = new Map([...this.bytes.keys()].map((k) => [k, 0]));
    this.lastViewRate = Math.round((this.viewChanges - this.viewChangesAt) / seconds);
    this.viewChangesAt = this.viewChanges;
    this.windowStart = now;
  }

  forget(client: string): void {
    this.bytes.delete(client);
  }

  snapshot(): RoomSnapshot {
    this.rollBytes(5000);
    this.rollFight();
    return {
      room: this.room,
      map: this.map,
      players: this.players,
      clients: this.clients,
      monsters: this.monsters,
      tickMs: this.tick.summary(),
      tickCpuMs: this.tickCpu.summary(),
      patchMs: this.patch.summary(),
      bytesPerClient: this.lastRate,
      inputsDropped: this.inputsDropped,
      viewChangesPerSecond: this.lastViewRate,
      fight: this.lastFight as RoomSnapshot["fight"],
    };
  }
}

export function allRooms(): RoomSnapshot[] {
  return [...RoomMetrics.rooms].map((m) => m.snapshot());
}
