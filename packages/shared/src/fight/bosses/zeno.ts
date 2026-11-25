/**
 * 제논, mid boss of Page 1: 운동과 다수성은 모순이다 (PLAN §5). The 엘레아 경주로 runs east to him,
 * and while his paradox holds, nobody arrives: nobody walks past the limit circle being filled,
 * every dash toward him covers half the distance left to it and stops, a second body (his ghost)
 * always stands half-way, his arrows hang in the air at every instant without arriving, and his
 * tortoise is always a little ahead.
 *
 * The way through is the correction, a limit: players stand in the shrinking circles (96, 48,
 * 24 px, each half the last) and fill them one after another, while his dichotomy wave strikes
 * the circle they hold. When the third is full the sum has its limit: the distance closes, he can
 * be hit, and every arrow that hung in the air arrives at once. Then he restarts the race.
 */

import { slide, snap } from "../../movement.ts";
import { segDist } from "../attacks.ts";
import type { Boss, BossBrain } from "../boss.ts";
import { BOSS_PLAYERS, BOSS_TELL, ObjectiveKind, TellKind } from "../boss.ts";
import { hurtPlayer, monsterHit } from "../damage.ts";
import { spawnMonster } from "../monsters.ts";
import { type Effect, type FightWorld, FxKind, MState, type Player } from "../world.ts";

/** The limit circles, from the map's marks, each half the last. */
const RINGS = [
  { mark: "ring-96", r: 96 },
  { mark: "ring-48", r: 48 },
  { mark: "ring-24", r: 24 },
] as const;
/** Circles on the ground are drawn in the 3/4 view: this much as tall as they are wide. */
const FLAT = 0.62;
/** Ticks the circle must hold its players to count as filled. */
const FILL_TICKS = 40;
/** Ticks the paradox stays broken once the third circle fills. */
const LIMIT_TICKS = 400;
/** Ticks an arrow hangs when nothing breaks the paradox (it never arrives on its own). */
const HANGS = 72_000;
/** Ticks from the third circle filling to every hanging arrow arriving. */
const ARRIVE = 12;
const MAX_ARROWS = 12;
/** The volley's hit, a share of a tell's. */
const VOLLEY = 1.2;
/** A tortoise every this many ticks while none runs, this far ahead of the leader. */
const TORTOISE_EVERY = 600;
const HEAD_START = 96;
/** Past the wall, a body is swept back this fast, px a tick. */
const SWEEP = 6;
/** The dichotomy wave: ticks between waves (in 토론 시간 fewer), its warning. */
const HALVE_EVERY = 160;
const HALVE_WARN = 30;

// Brain numbers.
const RINGS_FILLED = 0;
const LIMIT_UNTIL = 1;
const FILL = 2;
const NEXT_ARROW = 3;
const TORTOISE = 4;
const TORTOISE_ENTITY = 5;
const NEXT_TORTOISE = 6;
const NEXT_DASH_CUE = 7;
const NEXT_ARROW_CUE = 8;
const ARROW_COUNT = 9;
const NEXT_HALVE = 10;
const TORTOISE_KIND = 11;
/** The tick the hanging arrows arrive, or 0. */
const ARRIVE_AT = 36;
/** MAX_ARROWS slots each: the arrow's effect index, and its record id to know it is still it. */
const ARROWS = 12;
const ARROW_FX = ARROWS + MAX_ARROWS;
// Per player: where the dash began, and whether one is under way.
const DASH_FROM = 0;
const DASHING = 1;

/** Mode bits in the boss record: circles filled (0–3), the paradox broken. */
export const ZenoMode = { Filled: 3, Broken: 4 } as const;

/** He acts out `state` for `ticks`, then stands still again. */
function act(b: Boss, w: FightWorld, state: MState, ticks: number): void {
  b.setState(b.core, state);
  b.core.stateUntil = w.tick + ticks;
}

function broken(b: Boss, tick: number): boolean {
  return tick < (b.n[LIMIT_UNTIL] as number);
}

export const zeno: BossBrain = {
  start(b, w) {
    b.n[NEXT_ARROW] = w.tick + 60;
    b.n[NEXT_TORTOISE] = w.tick + 200;
    b.n[NEXT_HALVE] = w.tick + HALVE_EVERY;
    b.n[TORTOISE] = -1;
    b.n[TORTOISE_KIND] = w.rules.monsters.findIndex((k) => k.id === "tortoise") + 1;
    const ghost = b.rule.part >= 0 ? b.addPart(w, b.rule.part, b.core.x - 120, b.core.y) : null;
    if (ghost) b.setState(ghost, MState.Idle);
  },

  phase() {},

  step(b, w) {
    const tick = w.tick;
    const z = b.core;
    const open = broken(b, tick);
    if (z.state !== MState.Idle && tick >= z.stateUntil) b.setState(z, MState.Idle);
    // The race restarts once the limit is spent.
    if (!open && (b.n[RINGS_FILLED] as number) >= RINGS.length) {
      b.n[RINGS_FILLED] = 0;
      b.n[FILL] = 0;
    }
    const filled = b.n[RINGS_FILLED] as number;
    const ring = RINGS[Math.min(filled, RINGS.length - 1)] as (typeof RINGS)[number];
    const c = b.mark(w, ring.mark, z.x - 200, z.y);
    const wall = open ? Number.POSITIVE_INFINITY : c.x + ring.r;
    for (const p of w.players) {
      if (p.joined && !p.down && p.index < BOSS_PLAYERS) race(b, w, p, wall);
    }
    if (!open) fillRing(b, w, filled, c.x, c.y, ring.r);
    halve(b, w, open, c.x, c.y, ring.r);
    // His ghost always stands half-way between him and whoever is nearest.
    const ghost = b.parts[1];
    const near = b.nearest(w, z.x, z.y);
    if (ghost?.alive) {
      const gx = near && !open ? (near.x + z.x) / 2 : z.x - 40;
      const gy = near && !open ? (near.y + z.y) / 2 : z.y;
      b.place(ghost, Math.min(gx, z.x - z.radius - ghost.radius), gy);
    }
    if (tick === b.n[ARRIVE_AT]) volley(b, w);
    shootArrows(b, w);
    runTortoise(b, w, wall);
    const now = broken(b, tick);
    b.mode = Math.min(3, b.n[RINGS_FILLED] as number) | (now ? ZenoMode.Broken : 0);
    for (const p of w.players)
      if (p.index < BOSS_PLAYERS) b.open[p.index] = now && p.joined ? 1 : 0;
  },

  gate(b, w) {
    return broken(b, w.tick) ? 1 : 0;
  },
};

/**
 * One runner against the paradox: a dash toward him covers at most half of what is left to the
 * wall, and nobody stands past the wall (walking into it stops there; anyone beyond is swept back).
 */
function race(b: Boss, w: FightWorld, p: Player, wall: number): void {
  const i = p.index * 4;
  const dashing = p.rollLeft > 0 || (p.forceTicks > 0 && p.forceKeep);
  if (!dashing) {
    b.pn[i + DASHING] = 0;
  } else if (!b.pn[i + DASHING]) {
    b.pn[i + DASHING] = 1;
    b.pn[i + DASH_FROM] = p.x - p.movedX;
  }
  if (wall === Number.POSITIVE_INFINITY) return;
  const x0 = p.x;
  if (dashing && p.movedX > 0) {
    const from = b.pn[i + DASH_FROM] as number;
    const limit = from + Math.max(0, wall - from) / 2;
    if (p.x > limit) {
      p.x = snap(Math.max(Math.min(from, wall), limit));
      p.rollLeft = 0;
      p.forceTicks = 0;
      p.forceKeep = false;
      if (w.tick >= (b.n[NEXT_DASH_CUE] as number)) {
        b.n[NEXT_DASH_CUE] = w.tick + 120;
        b.cue(w, "dash", p.index, p.x, p.y);
      }
    }
  }
  if (p.x > wall) {
    const over = p.x - wall;
    // Walked into it this tick: it stops there. Already past (the race restarted): swept back.
    const back = over <= Math.max(0, p.movedX) + 0.5 ? over : Math.min(over, SWEEP);
    p.x = snap(slide(w.map, p.x, p.y, -back, 0, p.r).x);
  }
  p.movedX -= x0 - p.x;
}

function inRing(p: Player, cx: number, cy: number, r: number): boolean {
  const dx = (p.x - cx) / r;
  const dy = (p.y - cy) / (r * FLAT);
  return dx * dx + dy * dy <= 1;
}

/** Players standing in the circle long enough fill it; the third full circle breaks the paradox. */
function fillRing(b: Boss, w: FightWorld, filled: number, cx: number, cy: number, r: number): void {
  let inside = 0;
  let joined = 0;
  for (const p of w.players) {
    if (!p.joined) continue;
    joined++;
    if (!p.down && inRing(p, cx, cy, r)) inside++;
  }
  const need = Math.min(6, Math.max(1, Math.ceil(joined * 0.15)));
  b.n[FILL] = inside >= need ? (b.n[FILL] as number) + 1 : Math.max(0, (b.n[FILL] as number) - 2);
  if ((b.n[FILL] as number) < FILL_TICKS) return;
  b.n[FILL] = 0;
  b.n[RINGS_FILLED] = filled + 1;
  b.cue(w, "ring-filled", -1, cx, cy);
  b.completeHeld(w, ObjectiveKind.Hold, (p) => inRing(p, cx, cy, r));
  if (filled + 1 >= RINGS.length) {
    b.n[LIMIT_UNTIL] = w.tick + LIMIT_TICKS;
    act(b, w, MState.Recover, LIMIT_TICKS);
    arrive(b, w);
  }
}

/**
 * The dichotomy wave: the circle being held turns red and strikes, so a class holding it steps
 * out or rolls through; with the paradox broken, it goes out around him instead.
 */
function halve(b: Boss, w: FightWorld, open: boolean, cx: number, cy: number, r: number): void {
  const tick = w.tick;
  if (tick < (b.n[NEXT_HALVE] as number)) return;
  b.n[NEXT_HALVE] = tick + (b.debate ? HALVE_EVERY * 0.6 : HALVE_EVERY);
  const z = b.core;
  const x = open ? z.x : cx;
  const y = open ? z.y : cy;
  const rx = open ? 56 : r;
  // An oval on the ground, as the circle is drawn: a line along it as wide as it is tall.
  const h = rx * FLAT;
  b.tell(w, TellKind.Slam, x - (rx - h), y, h, 2 * (rx - h), 0, 2 * h, tick + HALVE_WARN, 0.8);
  if (!open) act(b, w, MState.Cast, HALVE_WARN);
}

/** An arrow at a player that hangs where it is at every instant. */
function shootArrows(b: Boss, w: FightWorld): void {
  const tick = w.tick;
  if (tick < (b.n[NEXT_ARROW] as number) || broken(b, tick)) return;
  b.n[NEXT_ARROW] = tick + (b.debate ? 40 : 80);
  const count = b.n[ARROW_COUNT] as number;
  if (count >= MAX_ARROWS) return;
  const p = anyRunner(w);
  if (!p) return;
  const z = b.core;
  const angle = Math.atan2(p.y - z.y, p.x - z.x);
  const length = Math.min(1500, Math.hypot(p.x - z.x, p.y - z.y) + 80);
  const e = b.tell(w, TellKind.Arrow, z.x, z.y, 5, length, angle, 10, tick + HANGS, 0.6);
  if (!e) return;
  b.n[ARROWS + count] = e.index;
  b.n[ARROW_FX + count] = e.fx;
  b.n[ARROW_COUNT] = count + 1;
  act(b, w, MState.Fire, 16);
  if (tick >= (b.n[NEXT_ARROW_CUE] as number)) {
    b.n[NEXT_ARROW_CUE] = tick + 300;
    b.cue(w, "arrow", p.index, z.x, z.y);
  }
}

/** A standing player on the track, chosen by the seeded random. */
function anyRunner(w: FightWorld): Player | null {
  let count = 0;
  for (const p of w.players) if (p.joined && !p.down) count++;
  if (count === 0) return null;
  let k = w.random.int(count);
  for (const p of w.players) {
    if (!p.joined || p.down) continue;
    if (k-- === 0) return p;
  }
  return null;
}

/** One of the boss's arrows still standing in slot `i`, or null. */
function arrowAt(b: Boss, w: FightWorld, i: number): Effect | null {
  const e = w.effects[b.n[ARROWS + i] as number];
  if (!e?.alive || e.fx !== b.n[ARROW_FX + i] || e.kind !== FxKind.Danger) return null;
  return e.count === BOSS_TELL + TellKind.Arrow && e.source === b.core.index ? e : null;
}

/**
 * The paradox broke: every hanging arrow arrives, all on one tick a moment from now. Their paths
 * all meet at him, so the volley strikes once whoever stands on any of them (`volley`); the
 * paths themselves are the tells to dodge.
 */
function arrive(b: Boss, w: FightWorld): void {
  const count = b.n[ARROW_COUNT] as number;
  const at = w.tick + ARRIVE;
  let kept = 0;
  for (let i = 0; i < count; i++) {
    const e = arrowAt(b, w, i);
    if (!e) continue;
    const { x, y, length, angle, width } = e;
    w.endFx(e);
    const next = b.tell(w, TellKind.Arrow, x, y, width / 2, length, angle, width, at, 0);
    if (!next) continue;
    b.n[ARROWS + kept] = next.index;
    b.n[ARROW_FX + kept] = next.fx;
    kept++;
  }
  b.n[ARROW_COUNT] = kept;
  b.n[ARRIVE_AT] = kept > 0 ? at : 0;
}

/** The arrived volley: one hit to each player standing on any arrow's path. */
function volley(b: Boss, w: FightWorld): void {
  const count = b.n[ARROW_COUNT] as number;
  const hit = monsterHit(b.core, b.rule.tellDamage) * VOLLEY;
  for (const p of w.players) {
    if (!p.joined || p.down) continue;
    for (let i = 0; i < count; i++) {
      const e = arrowAt(b, w, i);
      if (!e) continue;
      const x1 = e.x + Math.cos(e.angle) * e.length;
      const y1 = e.y + Math.sin(e.angle) * e.length;
      if (segDist(p.x, p.y, e.x, e.y, x1, y1) > e.width / 2 + p.r) continue;
      hurtPlayer(w, p, hit, b.core.entity, 0);
      break;
    }
  }
  b.n[ARROW_COUNT] = 0;
  b.n[ARRIVE_AT] = 0;
}

/**
 * The tortoise starts a little ahead of the leading runner and runs for the finish; the paradox
 * holds it to the wall like everyone else. Catching it (eleven hits, each half the last) counts.
 */
function runTortoise(b: Boss, w: FightWorld, wall: number): void {
  const tick = w.tick;
  const i = b.n[TORTOISE] as number;
  if (i >= 0) {
    const t = w.monsters[i];
    if (t?.alive && t.entity === b.n[TORTOISE_ENTITY]) {
      if (t.x > wall - t.radius) b.place(t, wall - t.radius, t.y);
      return;
    }
    // Gone: caught if its health ran out, escaped otherwise.
    if (t && !t.alive && t.hp <= 0) {
      const by = t.target >= 0 ? w.players[t.target] : undefined;
      b.complete(w, ObjectiveKind.Break, by?.joined ? by : null, b.n[TORTOISE_ENTITY] as number);
    }
    b.n[TORTOISE] = -1;
    b.n[NEXT_TORTOISE] = tick + TORTOISE_EVERY;
    return;
  }
  if (tick < (b.n[NEXT_TORTOISE] as number)) return;
  const kind = w.rules.monsters[(b.n[TORTOISE_KIND] as number) - 1];
  if (!kind) return;
  let leader: Player | null = null;
  for (const p of w.players) {
    if (!p.joined || p.down || w.inSafe(p.x, p.y)) continue;
    if (!leader || p.x > leader.x) leader = p;
  }
  if (!leader) return;
  const start = b.mark(w, "start", 136, b.core.y);
  let x = Math.max(start.x, Math.min(leader.x + HEAD_START, wall - 24));
  let y = leader.y;
  if (w.tileAt(x, y) !== 0) {
    const at = b.mark(w, "tortoise", b.core.x - 120, b.core.y);
    x = Math.min(at.x, wall - 24);
    y = at.y;
  }
  const t = spawnMonster(w, kind, b.level, false, x, y);
  if (!t) return;
  t.owner = b.core.index;
  b.n[TORTOISE] = t.index;
  b.n[TORTOISE_ENTITY] = t.entity;
  b.n[NEXT_TORTOISE] = tick + TORTOISE_EVERY;
  b.cue(w, "tortoise", -1, x, y);
}
