/**
 * A boss arena run headless: the map, the boss, same-level players of every class, and the inputs
 * that walk them. Everything the checks drive goes through `stepFight`, the step the server runs.
 */

import {
  compileKit,
  fightMapOf,
  mapById,
  RAID_BOSSES,
  STARTER_BOOKS,
  simRules,
} from "@guago/content";
import {
  BOSS_CUES,
  type Boss,
  type BossCue,
  castFlag,
  createFight,
  Ev,
  type FightInput,
  type FightWorld,
  MOVE_MAX,
  Mode,
  NO_STATS,
  type Player,
  startBoss,
  stepFight,
  TICK_RATE_HZ,
} from "@guago/shared";

export const rules = simRules();
export const MAJORS = Object.keys(STARTER_BOOKS) as (keyof typeof STARTER_BOOKS)[];

export function kitFor(major: string, level: number) {
  const books = STARTER_BOOKS[major as keyof typeof STARTER_BOOKS];
  return compileKit({
    major,
    minor: null,
    level,
    stats: NO_STATS,
    books: books.map((def) => ({ def, level, grade: 0, pilgi: 0, evolved: false })),
    tools: [],
  });
}

export interface Seat {
  readonly major?: string;
  readonly mode?: Mode;
  readonly x: number;
  readonly y: number;
  /** In 완전 수동, ask for every book in turn, so it fires as soon as it is ready. */
  readonly cast?: boolean;
}

export interface Arena {
  readonly w: FightWorld;
  readonly b: Boss;
  readonly players: Player[];
  readonly level: number;
  /** Moves held per player id, sent every tick until changed. */
  readonly held: Map<string, { mx: number; my: number; flags: number }>;
  readonly seqs: Map<string, number>;
  readonly casting: Set<string>;
  /** What each player's hits on the boss were before the gate and the shield, and after. */
  readonly raw: Float64Array;
  readonly dealt: Float64Array;
  /** Cues heard so far, by name. */
  readonly cues: Map<BossCue, number>;
}

export function bossDef(id: string) {
  const def = RAID_BOSSES.find((d) => d.id === id);
  if (!def) throw new Error(`no boss ${id}`);
  return def;
}

/** A fresh arena for boss `id` at its level, with `seats` players seated where they say. */
export function arena(
  id: string,
  seats: readonly Seat[],
  opts: { seed?: number; level?: number; hp?: number } = {},
): Arena {
  const def = bossDef(id);
  const level = opts.level ?? def.level;
  const map = fightMapOf(mapById(def.map) as never);
  const w = createFight(map, rules, null, opts.seed ?? 1);
  const players: Player[] = [];
  const casting = new Set<string>();
  seats.forEach((s, i) => {
    const major = s.major ?? (MAJORS[i % MAJORS.length] as string);
    const p = w.addPlayer(`p${i}`, i, s.x, s.y, kitFor(major, level), level);
    p.mode = s.mode ?? Mode.Semi;
    if (s.cast) casting.add(p.id);
    players.push(p);
  });
  const b = startBoss(w, id, level, opts.hp === undefined ? {} : { hp: opts.hp });
  const a: Arena = {
    w,
    b,
    players,
    level,
    held: new Map(),
    seqs: new Map(),
    casting,
    raw: new Float64Array(256),
    dealt: new Float64Array(256),
    cues: new Map(),
  };
  const take = b.take.bind(b);
  b.take = (world, p, part, amount) => {
    const d = take(world, p, part, amount);
    if (p) {
      a.raw[p.index] = (a.raw[p.index] as number) + amount;
      a.dealt[p.index] = (a.dealt[p.index] as number) + d;
    }
    return d;
  };
  return a;
}

/** Holds a move (and flags for the next tick only). */
export function hold(a: Arena, p: Player, mx: number, my: number, flags = 0): void {
  a.held.set(p.id, { mx, my, flags });
}

/** A move toward (x, y) at full tilt, slowing for the last step, or nothing within `near` px. */
export function toward(p: Player, x: number, y: number, near = 0.75): [number, number] {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= near) return [0, 0];
  const k = Math.min(1, d / (p.kit.speed / TICK_RATE_HZ));
  return [Math.round((dx / d) * MOVE_MAX * k), Math.round((dy / d) * MOVE_MAX * k)];
}

export function walk(a: Arena, p: Player, x: number, y: number): void {
  const [mx, my] = toward(p, x, y);
  hold(a, p, mx, my);
}

const inputs = new Map<string, FightInput[]>();

/** One tick with every held move; one-shot flags (a dodge) are cleared after it. */
export function tick(a: Arena): void {
  inputs.clear();
  for (const p of a.players) {
    if (!p.joined) continue;
    const h = a.held.get(p.id) ?? { mx: 0, my: 0, flags: 0 };
    const seq = (a.seqs.get(p.id) ?? 0) + 1;
    a.seqs.set(p.id, seq);
    let flags = h.flags;
    if (a.casting.has(p.id)) flags |= castFlag(a.w.tick % p.kit.weapons.length);
    inputs.set(p.id, [{ seq, mx: h.mx, my: h.my, flags }]);
    if (h.flags) a.held.set(p.id, { mx: h.mx, my: h.my, flags: 0 });
  }
  stepFight(a.w, inputs);
  const w = a.w;
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    if (e?.type !== Ev.Cue) continue;
    const name = BOSS_CUES[e.d] as BossCue;
    a.cues.set(name, (a.cues.get(name) ?? 0) + 1);
  }
}

/**
 * Runs up to `n` ticks: `before` sets the inputs for the coming tick, `after` reads what it did.
 * Either stops the run early by returning true. Returns the ticks run.
 */
export function run(
  a: Arena,
  n: number,
  before?: (a: Arena) => unknown,
  after?: (a: Arena) => unknown,
): number {
  for (let i = 0; i < n; i++) {
    if (before?.(a) === true) return i;
    tick(a);
    if (after?.(a) === true) return i + 1;
  }
  return n;
}

/** Keeps every player alive and fresh: for checks that measure something other than survival. */
export function heal(a: Arena): void {
  for (const p of a.players) {
    if (!p.joined) continue;
    if (p.down) {
      p.downAt = -1;
      p.reviver = -1;
    }
    p.hp = p.kit.maxHp;
  }
}

/** This tick's events of `type`, passed to `each`. */
export function eachEvent(
  w: FightWorld,
  type: number,
  each: (e: { a: number; b: number; c: number; d: number; e: number }) => void,
): void {
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    if (e && e.type === type) each(e);
  }
}

/** A mark of the arena's map, which must be there. */
export function mark(a: Arena, name: string): { x: number; y: number } {
  const m = a.w.map.marks?.[name];
  if (!m) throw new Error(`no mark ${name} on ${a.w.map.id}`);
  return m;
}

/** `xs[i]`, which the caller knows is there; throws when it is not. */
export function at<T>(xs: ArrayLike<T>, i: number): T {
  const v = xs[i < 0 ? xs.length + i : i];
  if (v === undefined) throw new Error(`nothing at ${i}`);
  return v;
}

export function sum(xs: ArrayLike<number>, from = 0, to = xs.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += xs[i] as number;
  return s;
}

export function resetTally(a: Arena): void {
  a.raw.fill(0);
  a.dealt.fill(0);
}
