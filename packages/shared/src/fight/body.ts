import type { Collidable } from "../collision.ts";
import { DODGE, ticks } from "../combat.ts";
import {
  type Body,
  Facing,
  moveBody,
  moveDirection,
  PLAYER_RADIUS,
  slide,
  snap,
} from "../movement.ts";

/** A dodge roll covers `DODGE.distance` over its invulnerable window, one step per input. */
export const ROLL_STEPS = ticks(DODGE.invulnerableSeconds);
export const ROLL_STEP = DODGE.distance / ROLL_STEPS;

/**
 * Bits of an input's flags (`input` is `[seq, mx, my, flags]`): a dodge, and in 완전 수동 the
 * book to cast, as slot + 1 in bits 1 to 3.
 */
export const InputFlag = { Dodge: 1 } as const;
export const CAST_SHIFT = 1;
export const CAST_MASK = 7;

export function castFlag(slot: number): number {
  return ((slot + 1) & CAST_MASK) << CAST_SHIFT;
}

/** The book slot an input asks to cast, or -1. */
export function castOf(flags: number): number {
  return ((flags >> CAST_SHIFT) & CAST_MASK) - 1;
}

/** A player's body with its roll in progress: inputs left and the step per input. */
export interface RollBody extends Body {
  readonly roll: number;
  readonly rdx: number;
  readonly rdy: number;
}

const FACING_VEC: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, -1],
  [-1, 0],
  [1, 0],
];

/** Unit direction a roll started now would take: the held move, else where the body faces. */
export function rollDirection(facing: Facing, mx: number, my: number): [number, number] {
  const [vx, vy] = moveDirection(mx, my);
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len > 0) return [vx / len, vy / len];
  const f = FACING_VEC[facing] ?? [0, 1];
  return [f[0], f[1]];
}

/**
 * One input of a player's own movement, the dodge roll included. The server and the client's
 * prediction both run this, so a predicted roll lands where the server puts it. A roll ignores
 * the move held during it and slides along walls like a walk.
 */
export function stepBody(
  map: Collidable,
  b: RollBody,
  mx: number,
  my: number,
  flags: number,
  speed: number,
  canRoll: boolean,
): RollBody {
  let { roll, rdx, rdy } = b;
  if (flags & InputFlag.Dodge && roll === 0 && canRoll) {
    const [dx, dy] = rollDirection(b.facing, mx, my);
    roll = ROLL_STEPS;
    rdx = dx * ROLL_STEP;
    rdy = dy * ROLL_STEP;
  }
  if (roll > 0) {
    const at = slide(map, b.x, b.y, rdx, rdy, PLAYER_RADIUS);
    let facing = b.facing;
    if (Math.abs(rdx) > Math.abs(rdy)) facing = rdx > 0 ? Facing.Right : Facing.Left;
    else if (rdy !== 0) facing = rdy > 0 ? Facing.Down : Facing.Up;
    return { x: snap(at.x), y: snap(at.y), facing, roll: roll - 1, rdx, rdy };
  }
  const moved = moveBody(map, b, mx, my, speed);
  return { x: moved.x, y: moved.y, facing: moved.facing, roll: 0, rdx, rdy };
}
