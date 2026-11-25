import { type Collidable, overlapsSolid, pushOut } from "./collision.ts";
import { POS_SCALE, TICK_MS } from "./constants.ts";

/** Which way an entity looks. Side frames are drawn facing right and flip for `Left`. */
export const Facing = { Down: 0, Up: 1, Left: 2, Right: 3 } as const;
export type Facing = (typeof Facing)[keyof typeof Facing];

/** A move axis is sent as a whole number in [-MOVE_MAX, MOVE_MAX]. */
export const MOVE_MAX = 127;
/** Stick input shorter than this (of MOVE_MAX) is no input. */
export const MOVE_DEADZONE = 24;
/** Collider radius of a player's feet, in pixels. */
export const PLAYER_RADIUS = 5;
/** Base walking speed in pixels per second: 3 px a tick, 1 px a frame at 60 fps. */
export const PLAYER_SPEED = 60;
/** How far a corner may stick into a player's path before it stops them instead of sliding them past. */
const CORNER_SLIP = 6;

/** One tick of a player's intent. `seq` counts up by one per input the client sends. */
export interface MoveInput {
  readonly seq: number;
  readonly mx: number;
  readonly my: number;
}

/** Where a moving thing stands: its feet, in pixels on the 1/POS_SCALE grid. */
export interface Body {
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
}

/** Snaps a coordinate to the grid positions are stored and sent on. */
export function snap(v: number): number {
  return Math.round(v * POS_SCALE) / POS_SCALE;
}

/**
 * The direction an input asks for: unit length at full tilt in any of the eight directions,
 * shorter for a half-pushed stick, zero inside the deadzone.
 */
export function moveDirection(mx: number, my: number): [number, number] {
  const len = Math.sqrt(mx * mx + my * my);
  if (len < MOVE_DEADZONE) return [0, 0];
  const k = len > MOVE_MAX ? 1 / len : 1 / MOVE_MAX;
  return [mx * k, my * k];
}

/** Facing after an input: the stronger axis wins; on a true diagonal the current facing holds if it fits. */
export function faceToward(facing: Facing, mx: number, my: number): Facing {
  const ax = Math.abs(mx);
  const ay = Math.abs(my);
  if (ax < MOVE_DEADZONE && ay < MOVE_DEADZONE) return facing;
  const h = mx > 0 ? Facing.Right : Facing.Left;
  const v = my > 0 ? Facing.Down : Facing.Up;
  if (ax > ay) return h;
  if (ay > ax) return v;
  return facing === h || facing === v ? facing : h;
}

/** Moves a circle by (dx, dy), sliding along whatever it meets. Steps short enough never to tunnel. */
export function slide(
  map: Collidable,
  x: number,
  y: number,
  dx: number,
  dy: number,
  r: number,
): { x: number; y: number } {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.75)));
  for (let i = 0; i < n; i++) {
    const p = pushOut(map, x + dx / n, y + dy / n, r);
    x = p.x;
    y = p.y;
  }
  return { x, y };
}

/**
 * Sideways shift (signed, perpendicular to the way a cardinal move points) that would clear a
 * corner blocking the move, or 0 when nothing within reach clears it.
 */
function cornerSlip(
  map: Collidable,
  x: number,
  y: number,
  fx: number,
  fy: number,
  r: number,
): number {
  const px = fy === 0 ? 0 : 1;
  const py = fx === 0 ? 0 : 1;
  for (let s = 1; s <= CORNER_SLIP; s++) {
    for (const side of [-1, 1]) {
      const sx = x + px * s * side;
      const sy = y + py * s * side;
      if (overlapsSolid(map, sx, sy, r)) continue;
      if (!overlapsSolid(map, sx + fx, sy + fy, r)) return s * side;
    }
  }
  return 0;
}

/**
 * One fixed tick of player movement: instant start and stop, the same speed in every direction,
 * sliding along walls at full speed and around corners. Deterministic, so the server and the
 * client's prediction land on the same 1/POS_SCALE grid point from the same input.
 */
export function moveBody(
  map: Collidable,
  body: Body,
  mx: number,
  my: number,
  speed: number,
  r: number = PLAYER_RADIUS,
): Body {
  return moveBy(map, body, mx, my, (speed * TICK_MS) / 1000, r);
}

/**
 * Moves a body up to `dist` pixels the way an input points. The tick step is `moveBody`; the
 * client also calls this with a frame's share of a tick to draw the player ahead of the tick.
 * The path never runs longer than `dist`, whatever the walls do.
 */
export function moveBy(
  map: Collidable,
  body: Body,
  mx: number,
  my: number,
  dist: number,
  r: number = PLAYER_RADIUS,
): Body {
  const facing = faceToward(body.facing, mx, my);
  const [vx, vy] = moveDirection(mx, my);
  if (vx === 0 && vy === 0) return facing === body.facing ? body : { ...body, facing };

  const want = dist * Math.sqrt(vx * vx + vy * vy);
  let { x, y } = slide(map, body.x, body.y, vx * dist, vy * dist, r);
  const used = Math.hypot(x - body.x, y - body.y);

  if ((vx === 0) !== (vy === 0)) {
    // A straight move stopped by a corner that only clips the collider slides past it instead,
    // spending what is left of the step sideways.
    const fx = Math.sign(vx);
    const fy = Math.sign(vy);
    const progress = (x - body.x) * fx + (y - body.y) * fy;
    if (progress < want * 0.5) {
      const shift = cornerSlip(map, x, y, fx, fy, r);
      if (shift !== 0) {
        const s = Math.sign(shift) * Math.min(Math.abs(shift), want - used);
        const p = slide(map, x, y, fy === 0 ? 0 : s, fx === 0 ? 0 : s, r);
        return { ...within(map, body, p.x, p.y, want, r), facing };
      }
    }
  }

  // Full speed along walls: what a wall took from the step carries on the way the body did
  // move, as long as that is still the way the player is pushing.
  const extra = want - used;
  if (extra > 1 / 64 && used > 1 / 64) {
    const ux = (x - body.x) / used;
    const uy = (y - body.y) / used;
    if (ux * vx + uy * vy > 0.25 * Math.sqrt(vx * vx + vy * vy)) {
      const p = slide(map, x, y, ux * extra, uy * extra, r);
      x = p.x;
      y = p.y;
    }
  }
  return { ...within(map, body, x, y, want, r), facing };
}

/**
 * Rolling off a corner, the push that keeps a body out of it can carry the body a little further
 * than it asked to go. Pull such an end back onto the step's length when that spot is clear, so
 * no tick ever outruns the speed.
 */
function within(map: Collidable, from: Body, x: number, y: number, want: number, r: number) {
  const dx = x - from.x;
  const dy = y - from.y;
  const len = Math.hypot(dx, dy);
  if (len <= want + 1 / 32) return { x: snap(x), y: snap(y) };
  // Back along the way it came until the spot is clear; the start always is.
  for (let k = want / len; k > 0; k -= 0.125) {
    const qx = snap(from.x + dx * k);
    const qy = snap(from.y + dy * k);
    if (!overlapsSolid(map, qx, qy, r)) return { x: qx, y: qy };
  }
  return { x: from.x, y: from.y };
}
