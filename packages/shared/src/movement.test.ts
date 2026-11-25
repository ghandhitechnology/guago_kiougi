import { describe, expect, it } from "vitest";
import { type Collidable, gridOf } from "./collision.ts";
import { TILE_SIZE } from "./constants.ts";
import { type Body, Facing, MOVE_MAX, moveBody, PLAYER_RADIUS, PLAYER_SPEED } from "./movement.ts";

const M = MOVE_MAX;
const STEP = PLAYER_SPEED / 20;

function walls(tiles: readonly [number, number][]): Collidable {
  return gridOf(20, 20, tiles);
}

function walk(map: Collidable, from: Body, mx: number, my: number, ticks: number): Body[] {
  const path = [from];
  for (let i = 0; i < ticks; i++)
    path.push(moveBody(map, path.at(-1) as Body, mx, my, PLAYER_SPEED));
  return path;
}

const at = (x: number, y: number): Body => ({ x, y, facing: Facing.Down });

describe("player movement", () => {
  const open = gridOf(20, 20);

  it("starts and stops within one tick", () => {
    const moved = moveBody(open, at(100, 100), M, 0, PLAYER_SPEED);
    expect(moved.x - 100).toBe(STEP);
    expect(moveBody(open, moved, 0, 0, PLAYER_SPEED)).toEqual(moved);
  });

  it("covers the same ground on a diagonal as along an axis", () => {
    const straight = walk(open, at(40, 40), M, 0, 40).at(-1) as Body;
    const diagonal = walk(open, at(40, 40), M, M, 40).at(-1) as Body;
    const d = Math.hypot(diagonal.x - 40, diagonal.y - 40);
    expect(Math.abs(d - (straight.x - 40))).toBeLessThan(0.5);
    expect(diagonal.x).toBe(diagonal.y);
  });

  it("slides along a wall of many tiles at an even pace, snagging on no seam", () => {
    const row = Array.from({ length: 16 }, (_, i) => [i + 2, 8] as [number, number]);
    const map = walls(row);
    // Pressed diagonally up into the wall's underside.
    const path = walk(map, at(40, 9 * TILE_SIZE + PLAYER_RADIUS + 2), M, -M, 60);
    const steps = path.slice(3).map((b, i) => b.x - (path[i + 2] as Body).x);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(0.25);
    for (const b of path) expect(b.y).toBeGreaterThanOrEqual(9 * TILE_SIZE + PLAYER_RADIUS - 0.125);
  });

  it("slips past a corner that clips the collider, losing at most a few ticks", () => {
    const map = walls([[8, 8]]);
    const clear = 8 * TILE_SIZE - PLAYER_RADIUS;
    const free = Math.ceil((10 * TILE_SIZE - clear) / STEP);
    for (let overlap = 1; overlap <= 6; overlap++) {
      // Walking up past the block's right edge with `overlap` px of the collider over it.
      const path = walk(
        map,
        at(9 * TILE_SIZE + PLAYER_RADIUS - overlap, 10 * TILE_SIZE),
        0,
        -M,
        free + 3,
      );
      expect((path.at(-1) as Body).y).toBeLessThan(clear);
    }
  });

  it("threads a one-tile gap from off centre", () => {
    const map = walls([
      [6, 8],
      [8, 8],
    ]);
    const path = walk(map, at(7 * TILE_SIZE + 2, 11 * TILE_SIZE), 0, -M, 20);
    expect((path.at(-1) as Body).y).toBeLessThan(8 * TILE_SIZE - PLAYER_RADIUS);
  });

  it("does not squeeze between two blocks that touch at a corner", () => {
    const map = walls([
      [8, 8],
      [9, 9],
    ]);
    const end = walk(map, at(9 * TILE_SIZE + 8, 8 * TILE_SIZE + 8), -M, M, 60).at(-1) as Body;
    expect(end.x).toBeGreaterThan(9 * TILE_SIZE);
  });
});
