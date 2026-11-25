/**
 * 피타고라스 학파, mid boss of Page 1: 만물은 정수의 비다 (PLAN §5). The courtyard of 크로톤 학당
 * is a counting floor of 16 × 8 unit squares, and the school only knows whole numbers: the
 * formation hops one square at a time, every strike runs along a whole row or column or covers a
 * square number of squares, and nothing it does ever leans. A diagonal is a length it cannot count.
 *
 * The way through is the correction: a player who walks a unit square corner to corner (√2, the
 * length the school drowned a man over) is no longer anywhere the school can count. For a while
 * the weak point is open to that player, and only their hits get through; stepping off the row
 * and the column a strike was aimed at, at once, is a diagonal step too.
 */

import type { Boss, BossBrain } from "../boss.ts";
import { ObjectiveKind, TellKind } from "../boss.ts";
import { type FightWorld, MState, type Player } from "../world.ts";

/** The counting floor: tile (14, 16), 16 × 8 squares of two tiles (`p1-croton-school`). */
export const CROTON_GRID = { x: 224, y: 256, cols: 16, rows: 8, cell: 32 } as const;

const G = CROTON_GRID;
/** A corner counts as reached within this many pixels. */
const CORNER = 10;
/** Ticks the weak point stays open to a player who walked a diagonal. */
const OPEN_TICKS = 160;
/** Ticks between a player's diagonals that count as an objective. */
const DIAGONAL_CREDIT = 200;

// Brain numbers (Boss.n).
const COL = 0;
const ROW = 1;
const NEXT_HOP = 2;
const NEXT_LANE = 3;
const NEXT_SQUARE = 4;
const NEXT_STEP_CUE = 5;
// Per player (Boss.pn): the square stood in (+1), where it was entered, open until.
const CELL = 0;
const IN_X = 1;
const IN_Y = 2;
const OPEN = 3;

function cellAt(x: number, y: number): number {
  const c = Math.floor((x - G.x) / G.cell);
  const r = Math.floor((y - G.y) / G.cell);
  if (c < 0 || r < 0 || c >= G.cols || r >= G.rows) return -1;
  return r * G.cols + c;
}

const centerX = (c: number) => G.x + (c + 0.5) * G.cell;
const centerY = (r: number) => G.y + (r + 0.5) * G.cell;

/**
 * Entered near one corner of square `cell` and left near the opposite one: walked its diagonal.
 */
export function walkedDiagonal(
  cell: number,
  inX: number,
  inY: number,
  outX: number,
  outY: number,
): boolean {
  const x0 = G.x + (cell % G.cols) * G.cell;
  const y0 = G.y + Math.floor(cell / G.cols) * G.cell;
  for (const [ax, ay] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    const cx = x0 + ax * G.cell;
    const cy = y0 + ay * G.cell;
    if (Math.abs(inX - cx) > CORNER || Math.abs(inY - cy) > CORNER) continue;
    const ox = x0 + (1 - ax) * G.cell;
    const oy = y0 + (1 - ay) * G.cell;
    if (Math.abs(outX - ox) <= CORNER && Math.abs(outY - oy) <= CORNER) return true;
  }
  return false;
}

function onFloor(p: Player): boolean {
  return cellAt(p.x, p.y) >= 0;
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
    // Lockstep: one square along a row or a column toward the nearest counted player.
    if (tick >= (b.n[NEXT_HOP] as number)) {
      b.n[NEXT_HOP] = tick + (b.debate ? 20 : 30);
      const p = b.nearest(w, b.core.x, b.core.y);
      const at = p ? cellAt(p.x, p.y) : -1;
      if (p && at >= 0) {
        const dc = (at % G.cols) - (b.n[COL] as number);
        const dr = Math.floor(at / G.cols) - (b.n[ROW] as number);
        if (Math.abs(dc) >= Math.abs(dr) && dc !== 0)
          b.n[COL] = (b.n[COL] as number) + Math.sign(dc);
        else if (dr !== 0) b.n[ROW] = (b.n[ROW] as number) + Math.sign(dr);
        b.place(b.core, centerX(b.n[COL] as number), centerY(b.n[ROW] as number));
        b.setState(b.core, MState.Move);
      } else b.setState(b.core, MState.Idle);
    }
    // A cord across a whole row or a rod down a whole column, where a player was counted.
    if (tick >= (b.n[NEXT_LANE] as number)) {
      b.n[NEXT_LANE] = tick + (b.debate ? 30 : 50);
      const p = pick(b, w);
      if (p) {
        const c = Math.floor((p.x - G.x) / G.cell);
        const r = Math.floor((p.y - G.y) / G.cell);
        const both = b.debate || w.random.next() < 0.25;
        const rowFirst = w.random.next() < 0.5;
        if (both || rowFirst) lane(b, w, r, true);
        if (both || !rowFirst) lane(b, w, c, false);
        b.setState(b.core, MState.Cast);
      }
    }
    // A square number of squares: 4, 9 or 16.
    if (tick >= (b.n[NEXT_SQUARE] as number)) {
      b.n[NEXT_SQUARE] = tick + (b.debate ? 60 : 120);
      const p = pick(b, w);
      if (p) {
        const n = 2 + w.random.int(3);
        const c0 = clamp(Math.floor((p.x - G.x) / G.cell) - Math.floor(n / 2), 0, G.cols - n);
        const r0 = clamp(Math.floor((p.y - G.y) / G.cell) - Math.floor(n / 2), 0, G.rows - n);
        const side = n * G.cell;
        const x = G.x + c0 * G.cell;
        const y = G.y + r0 * G.cell + side / 2;
        b.tell(w, TellKind.Square, x, y, side / 2, side, 0, side, tick + 30, 1.2);
        b.setState(b.core, MState.Slam);
      }
    }
    for (const p of w.players) {
      if (p.index < b.open.length)
        b.open[p.index] = p.joined && tick < (b.pn[p.index * 4 + OPEN] as number) ? 1 : 0;
    }
  },

  gate(b, _w, p) {
    return p && p.index < b.open.length && b.open[p.index] ? 1 : 0;
  },
};

/** Who the school counts: a standing player on the floor, chosen by the seeded random. */
function pick(b: Boss, w: FightWorld): Player | null {
  let count = 0;
  for (const p of w.players) if (p.joined && !p.down && onFloor(p)) count++;
  if (count === 0) return null;
  let k = w.random.int(count);
  for (const p of w.players) {
    if (!p.joined || p.down || !onFloor(p)) continue;
    if (k-- === 0) return p;
  }
  return b.nearest(w, b.core.x, b.core.y);
}

/** A whole row (`row`) or column of the floor. */
function lane(b: Boss, w: FightWorld, i: number, row: boolean): void {
  if (row) {
    if (i < 0 || i >= G.rows) return;
    b.tell(w, TellKind.Lane, G.x, centerY(i), G.cell / 2, G.cols * G.cell, 0, G.cell, w.tick + 24);
  } else {
    if (i < 0 || i >= G.cols) return;
    b.tell(
      w,
      TellKind.Lane,
      centerX(i),
      G.y,
      G.cell / 2,
      G.rows * G.cell,
      Math.PI / 2,
      G.cell,
      w.tick + 24,
    );
  }
}

/**
 * Every square a player enters: walking its diagonal opens the weak point to them; stepping
 * along a row or a column is what the school approves of.
 */
function watchSteps(b: Boss, w: FightWorld): void {
  const tick = w.tick;
  for (const p of w.players) {
    const i = p.index * 4;
    if (p.index * 4 + 3 >= b.pn.length) continue;
    if (!p.joined) {
      b.pn[i + CELL] = 0;
      continue;
    }
    const cell = cellAt(p.x, p.y);
    const was = (b.pn[i + CELL] as number) - 1;
    if (cell === was) continue;
    if (was >= 0) {
      if (walkedDiagonal(was, b.pn[i + IN_X] as number, b.pn[i + IN_Y] as number, p.x, p.y)) {
        const fresh = tick >= (b.pn[i + OPEN] as number) - OPEN_TICKS + DIAGONAL_CREDIT;
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
    b.pn[i + IN_X] = p.x;
    b.pn[i + IN_Y] = p.y;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
