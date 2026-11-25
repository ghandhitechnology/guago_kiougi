/**
 * 피타고라스 학파, mid boss of Page 1: 만물은 정수의 비다 (PLAN §5). The courtyard of 크로톤 학당
 * is a counting floor of 16 × 8 unit squares, and the school only knows whole numbers: the
 * formation hops one square at a time along a row or a column, every strike covers whole squares
 * of one row, one column or a square number of them, and nothing it does ever leans. A diagonal
 * is a length it cannot count.
 *
 * The way through is the correction: a player who walks a unit square corner to corner (√2, the
 * length the school drowned a man over) is no longer anywhere the school can count. For a while
 * the school cannot aim at that player, the weak point is open to them, and their hits get
 * through in full; everyone else's only leak.
 */

import type { Boss, BossBrain } from "../boss.ts";
import { BOSS_PLAYERS, ObjectiveKind, TellKind } from "../boss.ts";
import { type FightWorld, MState, type Player } from "../world.ts";

/** The counting floor: tile (14, 16), 16 × 8 squares of two tiles (`p1-croton-school`). */
export const CROTON_GRID = { x: 224, y: 256, cols: 16, rows: 8, cell: 32 } as const;

const G = CROTON_GRID;
/** A corner counts as reached within this many pixels on each axis. */
const CORNER = 10;
/** A walk counts as the diagonal while it keeps this close to it, px. */
const LEAN = 9;
/** Ticks the weak point stays open to a player who walked a diagonal. */
const OPEN_TICKS = 160;
/** Ticks between a player's diagonals that count as an objective. */
const DIAGONAL_CREDIT = 200;
/** Ticks from a strike's tell to its landing: a lane, a square. */
const LANE_WARN = 24;
const SQUARE_WARN = 30;

// Brain numbers (Boss.n).
const COL = 0;
const ROW = 1;
const NEXT_HOP = 2;
const NEXT_LANE = 3;
const NEXT_SQUARE = 4;
const NEXT_STEP_CUE = 5;
// Per player (Boss.pn): the square stood in (+1), the corner it was entered by (+1), how far the
// walk has leaned off that corner's diagonal, and the tick the weak point stays open to.
const CELL = 0;
const CORNER_IN = 1;
const DRIFT = 2;
const OPEN = 3;

function cellAt(x: number, y: number): number {
  const c = Math.floor((x - G.x) / G.cell);
  const r = Math.floor((y - G.y) / G.cell);
  if (c < 0 || r < 0 || c >= G.cols || r >= G.rows) return -1;
  return r * G.cols + c;
}

const centerX = (c: number) => G.x + (c + 0.5) * G.cell;
const centerY = (r: number) => G.y + (r + 0.5) * G.cell;
const cornerX = (cell: number, k: number) => G.x + ((cell % G.cols) + (k & 1)) * G.cell;
const cornerY = (cell: number, k: number) => G.y + (Math.floor(cell / G.cols) + (k >> 1)) * G.cell;

/** The corner of `cell` (0 top left, 1 top right, 2 bottom left, 3 bottom right) near (x, y), or -1. */
function cornerNear(cell: number, x: number, y: number): number {
  for (let k = 0; k < 4; k++) {
    if (Math.abs(x - cornerX(cell, k)) <= CORNER && Math.abs(y - cornerY(cell, k)) <= CORNER)
      return k;
  }
  return -1;
}

/** How far (x, y) stands off the diagonal of `cell` that starts at corner `k`, px. */
function offDiagonal(cell: number, k: number, x: number, y: number): number {
  const dx = (k & 1) === 0 ? 1 : -1;
  const dy = k >> 1 === 0 ? 1 : -1;
  return Math.abs((x - cornerX(cell, k)) * dy - (y - cornerY(cell, k)) * dx) / Math.SQRT2;
}

export const pythagoreans: BossBrain = {
  start(b, w) {
    b.n[COL] = Math.floor(G.cols / 2);
    b.n[ROW] = Math.floor(G.rows / 2) - 1;
    b.place(b.core, centerX(b.n[COL] as number), centerY(b.n[ROW] as number));
    b.n[NEXT_HOP] = w.tick + 40;
    b.n[NEXT_LANE] = w.tick + 60;
    b.n[NEXT_SQUARE] = w.tick + 160;
  },

  phase() {},

  step(b, w) {
    const tick = w.tick;
    watchSteps(b, w);
    // Lockstep: one square along a row or a column toward the nearest player it can count.
    if (tick >= (b.n[NEXT_HOP] as number)) {
      b.n[NEXT_HOP] = tick + (b.debate ? 20 : 30);
      const p = nearestCounted(b, w);
      if (p) {
        const at = cellAt(p.x, p.y);
        const dc = (at % G.cols) - (b.n[COL] as number);
        const dr = Math.floor(at / G.cols) - (b.n[ROW] as number);
        if (Math.abs(dc) >= Math.abs(dr) && dc !== 0)
          b.n[COL] = (b.n[COL] as number) + Math.sign(dc);
        else if (dr !== 0) b.n[ROW] = (b.n[ROW] as number) + Math.sign(dr);
        b.place(b.core, centerX(b.n[COL] as number), centerY(b.n[ROW] as number));
      }
      // A strike holds its pose until it lands; between strikes the formation hops or stands.
      if (tick >= b.core.stateUntil) b.setState(b.core, p ? MState.Move : MState.Idle);
    }
    // A cord across a whole row or a rod down a whole column, where a player was counted. With
    // nobody to count, they count anyway: a lane at random, more slowly.
    if (tick >= (b.n[NEXT_LANE] as number)) {
      const p = pick(b, w);
      b.n[NEXT_LANE] = tick + (b.debate ? 30 : 50) * (p ? 1 : 2);
      const both = b.debate || w.random.next() < 0.25;
      const rowFirst = w.random.next() < 0.5;
      const r = p ? Math.floor((p.y - G.y) / G.cell) : w.random.int(G.rows);
      const c = p ? Math.floor((p.x - G.x) / G.cell) : w.random.int(G.cols);
      // A cross is two strikes on one square: each hits a little softer.
      const share = both ? 0.7 : 1;
      if (both || rowFirst) lane(b, w, r, true, share);
      if (both || !rowFirst) lane(b, w, c, false, share);
      act(b, w, MState.Cast, LANE_WARN);
    }
    // A square number of squares: 4, 9 or 16, around a counted player.
    if (tick >= (b.n[NEXT_SQUARE] as number)) {
      b.n[NEXT_SQUARE] = tick + (b.debate ? 60 : 120);
      const p = pick(b, w);
      if (p) {
        const n = 2 + w.random.int(3);
        const c0 = clamp(Math.floor((p.x - G.x) / G.cell) - Math.floor(n / 2), 0, G.cols - n);
        const r0 = clamp(Math.floor((p.y - G.y) / G.cell) - Math.floor(n / 2), 0, G.rows - n);
        square(b, w, c0, r0, n);
        act(b, w, MState.Slam, SQUARE_WARN);
      }
    }
    for (const p of w.players) {
      if (p.index < BOSS_PLAYERS)
        b.open[p.index] = p.joined && tick < (b.pn[p.index * 4 + OPEN] as number) ? 1 : 0;
    }
  },

  gate(b, _w, p) {
    return p && p.index < BOSS_PLAYERS && b.open[p.index] ? 1 : 0;
  },
};

/** The formation acts out `state` until `ticks` from now. */
function act(b: Boss, w: FightWorld, state: MState, ticks: number): void {
  b.setState(b.core, state);
  b.core.stateUntil = w.tick + ticks;
}

/** A standing player on the floor the school can count: not one who just walked a diagonal. */
function counted(b: Boss, w: FightWorld, p: Player): boolean {
  if (!p.joined || p.down || cellAt(p.x, p.y) < 0) return false;
  return p.index >= BOSS_PLAYERS || w.tick >= (b.pn[p.index * 4 + OPEN] as number);
}

/** Who the school counts next, chosen by the seeded random; null when it can count nobody. */
function pick(b: Boss, w: FightWorld): Player | null {
  let count = 0;
  for (const p of w.players) if (counted(b, w, p)) count++;
  if (count === 0) return null;
  let k = w.random.int(count);
  for (const p of w.players) {
    if (!counted(b, w, p)) continue;
    if (k-- === 0) return p;
  }
  return null;
}

function nearestCounted(b: Boss, w: FightWorld): Player | null {
  let best: Player | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const p of w.players) {
    if (!counted(b, w, p)) continue;
    const d = (p.x - b.core.x) ** 2 + (p.y - b.core.y) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/**
 * A whole row (`row`) or column of the floor: a line from its first square's centre to its last's,
 * half a square wide, so it covers exactly those squares.
 */
function lane(b: Boss, w: FightWorld, i: number, row: boolean, share: number): void {
  const half = G.cell / 2;
  const fire = w.tick + LANE_WARN;
  if (row) {
    if (i < 0 || i >= G.rows) return;
    const len = (G.cols - 1) * G.cell;
    b.tell(w, TellKind.Lane, G.x + half, centerY(i), half, len, 0, G.cell, fire, share);
  } else {
    if (i < 0 || i >= G.cols) return;
    const len = (G.rows - 1) * G.cell;
    b.tell(w, TellKind.Lane, centerX(i), G.y + half, half, len, Math.PI / 2, G.cell, fire, share);
  }
}

/** An n × n square from (c0, r0): one strike per row of it, all landing together. */
function square(b: Boss, w: FightWorld, c0: number, r0: number, n: number): void {
  const half = G.cell / 2;
  const fire = w.tick + SQUARE_WARN;
  for (let r = r0; r < r0 + n; r++) {
    const len = (n - 1) * G.cell;
    b.tell(w, TellKind.Square, centerX(c0), centerY(r), half, len, 0, G.cell, fire, 1.2);
  }
}

/**
 * Every square a player crosses: entered by a corner and left by the opposite one, keeping to the
 * line between them, it was its diagonal, and the weak point opens to them. Stepping along a row
 * or a column is what the school approves of.
 */
function watchSteps(b: Boss, w: FightWorld): void {
  const tick = w.tick;
  for (const p of w.players) {
    if (!p.joined || p.index >= BOSS_PLAYERS) continue;
    const i = p.index * 4;
    const cell = cellAt(p.x, p.y);
    const was = (b.pn[i + CELL] as number) - 1;
    const k = (b.pn[i + CORNER_IN] as number) - 1;
    if (was >= 0 && k >= 0)
      b.pn[i + DRIFT] = Math.max(b.pn[i + DRIFT] as number, offDiagonal(was, k, p.x, p.y));
    if (cell === was) continue;
    if (was >= 0 && !p.down) {
      if (k >= 0 && (b.pn[i + DRIFT] as number) <= LEAN && cornerNear(was, p.x, p.y) === 3 - k) {
        const until = b.pn[i + OPEN] as number;
        const fresh = until === 0 || tick >= until - OPEN_TICKS + DIAGONAL_CREDIT;
        b.pn[i + OPEN] = tick + OPEN_TICKS;
        if (fresh) {
          b.cue(w, "diagonal", p.index, p.x, p.y);
          b.cue(w, "weak-open", p.index, b.core.x, b.core.y);
          b.complete(w, ObjectiveKind.Hold, p);
        }
      } else if (cell >= 0 && tick >= (b.n[NEXT_STEP_CUE] as number)) {
        const dc = Math.abs((cell % G.cols) - (was % G.cols));
        const dr = Math.abs(Math.floor(cell / G.cols) - Math.floor(was / G.cols));
        if (dc + dr === 1) {
          b.n[NEXT_STEP_CUE] = tick + 200;
          b.cue(w, "grid-step", p.index, p.x, p.y);
        }
      }
    }
    b.pn[i + CELL] = cell + 1;
    b.pn[i + CORNER_IN] = cell >= 0 ? cornerNear(cell, p.x, p.y) + 1 : 0;
    b.pn[i + DRIFT] = 0;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
