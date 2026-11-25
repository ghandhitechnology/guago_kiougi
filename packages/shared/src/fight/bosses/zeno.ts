/**
 * 제논, mid boss of Page 1: 운동과 다수성은 모순이다 (PLAN §5). The 엘레아 경주로 runs east to him,
 * and while his paradox holds, nobody arrives: past each limit circle the remaining distance only
 * halves, a dash toward him covers half of it and stops, a second body (his ghost) always stands
 * half-way, his arrows hang in the air at every instant without arriving, and his tortoise is
 * always a little ahead.
 *
 * The way through is the correction, a limit: players stand in the shrinking circles (96, 48,
 * 24 px, each half the last) and fill them one after another. When the third is full the sum
 * has its limit: the distance closes, he can be hit, and every arrow that hung in the air arrives
 * at once. Then he restarts the race.
 */

import { snap } from "../../movement.ts";
import type { Boss, BossBrain } from "../boss.ts";
import { ObjectiveKind, TellKind } from "../boss.ts";
import { spawnMonster } from "../monsters.ts";
import { type FightWorld, FxKind, MState } from "../world.ts";

/** The limit circles, from the map's marks, each half the last. */
const RINGS = [
  { mark: "ring-96", r: 96 },
  { mark: "ring-48", r: 48 },
  { mark: "ring-24", r: 24 },
] as const;
/** Ticks the circle must hold its players to count as filled. */
const FILL_TICKS = 40;
/** Ticks the paradox stays broken once the third circle fills. */
const LIMIT_TICKS = 400;
/** Ticks an arrow hangs when nothing breaks the paradox (it never arrives on its own). */
const HANGS = 72_000;
const MAX_ARROWS = 12;
/** A tortoise every this many ticks while none runs. */
const TORTOISE_EVERY = 600;

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
const ARROWS = 10; // MAX_ARROWS slots: effect index + 1

/** Mode bits in the boss record: circles filled (0–3), the paradox broken. */
export const ZenoMode = { Filled: 3, Broken: 4 } as const;

function broken(b: Boss, tick: number): boolean {
  return tick < (b.n[LIMIT_UNTIL] as number);
}

export const zeno: BossBrain = {
  start(b, w) {
    b.n[NEXT_ARROW] = w.tick + 60;
    b.n[NEXT_TORTOISE] = w.tick + 40;
    b.n[TORTOISE] = -1;
    const ghost = b.rule.part >= 0 ? b.addPart(w, b.rule.part, b.core.x - 120, b.core.y) : null;
    if (ghost) b.setState(ghost, MState.Idle);
  },

  phase() {},

  step(b, w) {
    const tick = w.tick;
    const z = b.core;
    const start = b.mark(w, "start", 136, z.y);
    const open = broken(b, tick);
    // The race restarts once the limit is spent.
    if (!open && (b.n[RINGS_FILLED] as number) >= RINGS.length) {
      b.n[RINGS_FILLED] = 0;
      b.setState(z, MState.Idle);
    }
    const filled = b.n[RINGS_FILLED] as number;
    if (!open) {
      // Nobody gets past the circle being filled; a dash past it stops half-way.
      const ring = RINGS[Math.min(filled, RINGS.length - 1)] as (typeof RINGS)[number];
      const c = b.mark(w, ring.mark, z.x - 200, z.y);
      const wall = c.x + ring.r;
      for (const p of w.players) {
        if (!p.joined || p.down || p.x <= wall) continue;
        if (p.rollLeft > 0 && tick >= (b.n[NEXT_DASH_CUE] as number)) {
          b.n[NEXT_DASH_CUE] = tick + 120;
          b.cue(w, "dash", p.index, p.x, p.y);
        }
        p.x = snap(p.rollLeft > 0 ? (wall + Math.max(start.x, p.x - p.movedX)) / 2 : wall);
        p.rollLeft = 0;
      }
      fillRing(b, w, filled, c.x, c.y, ring.r);
    }
    // His ghost always stands half-way between him and whoever is nearest.
    const ghost = b.parts[1];
    const near = b.nearest(w, z.x, z.y);
    if (ghost?.alive) {
      const gx = near && !open ? (near.x + z.x) / 2 : z.x - 40;
      b.place(ghost, Math.min(gx, z.x - z.radius - ghost.radius), z.y);
    }
    shootArrows(b, w);
    runTortoise(b, w);
    b.mode = Math.min(3, b.n[RINGS_FILLED] as number) | (open ? ZenoMode.Broken : 0);
    for (const p of w.players)
      if (p.index < b.open.length) b.open[p.index] = open && p.joined ? 1 : 0;
  },

  gate(b, w) {
    return broken(b, w.tick) ? 1 : 0;
  },
};

/** Players standing in the circle long enough fill it; the third full circle breaks the paradox. */
function fillRing(b: Boss, w: FightWorld, filled: number, cx: number, cy: number, r: number): void {
  let inside = 0;
  let joined = 0;
  for (const p of w.players) {
    if (!p.joined) continue;
    joined++;
    if (!p.down && (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r) inside++;
  }
  const need = Math.min(6, Math.max(1, Math.ceil(joined * 0.15)));
  b.n[FILL] = inside >= need ? (b.n[FILL] as number) + 1 : Math.max(0, (b.n[FILL] as number) - 2);
  if ((b.n[FILL] as number) < FILL_TICKS) return;
  b.n[FILL] = 0;
  b.n[RINGS_FILLED] = filled + 1;
  b.cue(w, "ring-filled", -1, cx, cy);
  for (const p of w.players) {
    if (p.joined && !p.down && (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r)
      b.complete(w, ObjectiveKind.Hold, p);
  }
  if (filled + 1 >= RINGS.length) {
    b.n[LIMIT_UNTIL] = w.tick + LIMIT_TICKS;
    b.setState(b.core, MState.Recover);
    arrive(b, w);
  }
}

/** An arrow at a player that hangs where it is at every instant. */
function shootArrows(b: Boss, w: FightWorld): void {
  const tick = w.tick;
  if (tick < (b.n[NEXT_ARROW] as number) || broken(b, tick)) return;
  b.n[NEXT_ARROW] = tick + (b.debate ? 40 : 80);
  if ((b.n[ARROW_COUNT] as number) >= MAX_ARROWS) return;
  const p = b.nearest(w, b.core.x - 400, b.core.y);
  if (!p) return;
  const z = b.core;
  const angle = Math.atan2(p.y - z.y, p.x - z.x);
  const length = Math.min(900, Math.hypot(p.x - z.x, p.y - z.y) + 80);
  const e = b.tell(w, TellKind.Arrow, z.x, z.y, 5, length, angle, 10, tick + HANGS, 0.8);
  if (!e) return;
  b.n[ARROWS + (b.n[ARROW_COUNT] as number)] = e.index + 1;
  b.n[ARROW_COUNT] = (b.n[ARROW_COUNT] as number) + 1;
  b.setState(z, MState.Fire);
  if (tick >= (b.n[NEXT_ARROW_CUE] as number)) {
    b.n[NEXT_ARROW_CUE] = tick + 300;
    b.cue(w, "arrow", p.index, z.x, z.y);
  }
}

/** The paradox broke: every hanging arrow arrives, a moment from now. */
function arrive(b: Boss, w: FightWorld): void {
  const count = b.n[ARROW_COUNT] as number;
  for (let i = 0; i < count; i++) {
    const e = w.effects[(b.n[ARROWS + i] as number) - 1];
    if (!e?.alive || e.kind !== FxKind.Danger) continue;
    const { x, y, length, angle, width } = e;
    w.endFx(e);
    b.tell(w, TellKind.Arrow, x, y, 5, length, angle, width, w.tick + 12, 0.8);
  }
  b.n[ARROW_COUNT] = 0;
}

/** The tortoise runs ahead; catching it (eleven hits, each half the last) counts. */
function runTortoise(b: Boss, w: FightWorld): void {
  const tick = w.tick;
  const i = b.n[TORTOISE] as number;
  if (i >= 0) {
    const t = w.monsters[i];
    if (t?.alive && t.entity === b.n[TORTOISE_ENTITY]) return;
    // Gone: caught if its health ran out, escaped otherwise.
    if (t && t.hp <= 0) {
      const by = t.target >= 0 ? w.players[t.target] : undefined;
      b.complete(w, ObjectiveKind.Hold, by?.joined ? by : null);
    }
    b.n[TORTOISE] = -1;
    b.n[NEXT_TORTOISE] = tick + TORTOISE_EVERY;
    return;
  }
  if (tick < (b.n[NEXT_TORTOISE] as number)) return;
  const kind = w.rules.monsters.find((k) => k.id === "tortoise");
  if (!kind) return;
  const at = b.mark(w, "tortoise", b.core.x + 60, b.core.y - 30);
  const t = spawnMonster(w, kind, b.level, false, at.x, at.y);
  if (!t) return;
  t.owner = b.core.index;
  b.n[TORTOISE] = t.index;
  b.n[TORTOISE_ENTITY] = t.entity;
  b.cue(w, "tortoise", -1, at.x, at.y);
}
