import { describe, expect, it } from "vitest";
import { type Collidable, gridOf, isSolidTile, overlapsSolid } from "./collision.ts";
import { TILE_SIZE } from "./constants.ts";
import { type Body, MOVE_MAX, moveBody, PLAYER_RADIUS, PLAYER_SPEED, slide } from "./movement.ts";
import { nextRandom } from "./rng.ts";
import { createWorld, MONSTER_RADIUS, step } from "./sim.ts";

/**
 * Walls hold for any layout: random walks over generated maps full of one-tile-thick walls and
 * their joints. Interior maps are drawn with thin walls and furniture, so a single layout where
 * a body slips through is a hole in every room built later.
 */

const W = 26;
const H = 20;
const STEP = PLAYER_SPEED / 20;
/** Snapping to the 1/8 px grid can add a hair to a step. */
const SNAP_SLACK = 0.1;

type Tile = [number, number];

function rng(seed: number) {
  let state = seed >>> 0;
  const roll = () => {
    const [v, n] = nextRandom(state);
    state = n;
    return v;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(roll() * (hi - lo + 1));
  return { roll, int };
}

/** A map of one-tile-thick walls: runs, L, T and plus joints, closed rooms, touching corners. */
function layout(seed: number): Collidable {
  const { roll, int } = rng(seed);
  const solid: Tile[] = [];
  const run = (x: number, y: number, dx: number, dy: number, n: number) => {
    for (let i = 0; i < n; i++) solid.push([x + dx * i, y + dy * i]);
  };
  for (let f = 0; f < 9; f++) {
    const x = int(0, W - 1);
    const y = int(0, H - 1);
    const a = int(2, 7);
    const b = int(2, 7);
    switch (int(0, 6)) {
      case 0: // L joint
        run(x, y, 1, 0, a);
        run(x, y, 0, 1, b);
        break;
      case 1: // T joint
        run(x - a, y, 1, 0, 2 * a + 1);
        run(x, y, 0, 1, b);
        break;
      case 2: // plus joint
        run(x - a, y, 1, 0, 2 * a + 1);
        run(x, y - b, 0, 1, 2 * b + 1);
        break;
      case 3: {
        // a closed room, sometimes with a one-tile door
        run(x, y, 1, 0, a + 2);
        run(x, y + b + 1, 1, 0, a + 2);
        run(x, y, 0, 1, b + 2);
        run(x + a + 1, y, 0, 1, b + 2);
        if (roll() < 0.5) {
          const door = solid.length - 1 - int(1, b);
          solid.splice(door, 1);
        }
        break;
      }
      case 4: // blocks touching only at corners
        solid.push([x, y], [x + 1, y + 1], [x + 2, y], [x + 3, y + 1]);
        break;
      case 5: // a staircase of single tiles
        for (let i = 0; i < a; i++) solid.push([x + i, y + i]);
        break;
      default: // a straight run against the map edge
        if (roll() < 0.5) run(0, y, 1, 0, a);
        else run(x, 0, 0, 1, b);
    }
  }
  return gridOf(W, H, solid);
}

/**
 * Which walled-off region each walkable tile belongs to, joining tiles that share a side: two
 * tiles that only touch at a corner are a wall, and a one-tile corridor is wide enough for any
 * collider here. A body may never change region; that is what a wall is.
 */
function regions(map: Collidable): (x: number, y: number) => number {
  const id = new Int32Array(W * H).fill(-1);
  let next = 0;
  for (let start = 0; start < W * H; start++) {
    if (id[start] !== -1 || isSolidTile(map, start % W, Math.floor(start / W))) continue;
    const todo = [start];
    id[start] = next;
    while (todo.length > 0) {
      const i = todo.pop() as number;
      const x = i % W;
      const y = (i - x) / W;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        const j = ny * W + nx;
        if (isSolidTile(map, nx, ny) || id[j] !== -1) continue;
        id[j] = next;
        todo.push(j);
      }
    }
    next++;
  }
  return (x, y) => id[Math.floor(y / TILE_SIZE) * W + Math.floor(x / TILE_SIZE)] as number;
}

/** Somewhere a circle fits. */
function placeFree(map: Collidable, r: number, roll: () => number): Body | undefined {
  for (let i = 0; i < 200; i++) {
    const x = r + roll() * (W * TILE_SIZE - 2 * r);
    const y = r + roll() * (H * TILE_SIZE - 2 * r);
    if (!overlapsSolid(map, x, y, r))
      return { x: Math.round(x * 8) / 8, y: Math.round(y * 8) / 8, facing: 0 };
  }
  return undefined;
}

const AXES = [-MOVE_MAX, -64, 0, 64, MOVE_MAX];

describe("walls hold for any layout", () => {
  it("never lets a player overlap or cross a wall, or move further than one step in a tick", () => {
    let worst = 0;
    let ticks = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const map = layout(seed);
      const region = regions(map);
      const { roll, int } = rng(seed * 7919);
      for (let p = 0; p < 4; p++) {
        let body = placeFree(map, PLAYER_RADIUS, roll);
        if (!body) continue;
        let mx = 0;
        let my = 0;
        for (let t = 0; t < 400; t++) {
          if (t % int(1, 30) === 0) {
            mx = AXES[int(0, 4)] as number;
            my = AXES[int(0, 4)] as number;
          }
          const next = moveBody(map, body, mx, my, PLAYER_SPEED);
          const moved = Math.hypot(next.x - body.x, next.y - body.y);
          worst = Math.max(worst, moved);
          if (
            overlapsSolid(map, next.x, next.y, PLAYER_RADIUS) ||
            region(next.x, next.y) !== region(body.x, body.y) ||
            moved > STEP + SNAP_SLACK
          ) {
            throw new Error(
              `seed ${seed}: (${body.x}, ${body.y}) input (${mx}, ${my}) went to (${next.x}, ${next.y})`,
            );
          }
          body = next;
          ticks++;
        }
      }
    }
    expect(ticks).toBeGreaterThan(80_000);
    expect(worst).toBeLessThanOrEqual(STEP + SNAP_SLACK);
  });

  it("never lets a body slid by any vector overlap or cross a wall", () => {
    // What monsters and crowd pushes use, with no step-length guard after it.
    for (let seed = 1; seed <= 60; seed++) {
      const map = layout(seed);
      const region = regions(map);
      const { roll } = rng(seed * 104729);
      for (const r of [PLAYER_RADIUS, MONSTER_RADIUS]) {
        let body = placeFree(map, r, roll);
        if (!body) continue;
        for (let t = 0; t < 1500; t++) {
          const a = roll() * Math.PI * 2;
          const len = roll() * 2 * r;
          const next = slide(map, body.x, body.y, Math.cos(a) * len, Math.sin(a) * len, r);
          if (
            overlapsSolid(map, next.x, next.y, r) ||
            region(next.x, next.y) !== region(body.x, body.y)
          ) {
            throw new Error(
              `seed ${seed} r ${r}: (${body.x}, ${body.y}) slid to (${next.x}, ${next.y})`,
            );
          }
          body = { x: next.x, y: next.y, facing: 0 };
        }
      }
    }
  });

  it("never lets a wandering, crowding monster overlap or cross a wall", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const map = layout(seed);
      const region = regions(map);
      let world = createWorld(map, [{ kind: "odap", count: 40 }], seed);
      const home = new Map(world.monsters.map((m) => [m.id, region(m.x, m.y)]));
      for (let t = 0; t < 600; t++) {
        world = step(world, map);
        for (const m of world.monsters) {
          if (overlapsSolid(map, m.x, m.y, MONSTER_RADIUS) || region(m.x, m.y) !== home.get(m.id)) {
            throw new Error(`seed ${seed} tick ${t}: monster ${m.id} at (${m.x}, ${m.y})`);
          }
        }
      }
    }
  });

  it("holds the room: a body pressed into every inside corner of a closed room stays in it", () => {
    const room: Tile[] = [];
    for (let i = 2; i <= 6; i++) room.push([i, 2], [i, 6], [2, i], [6, i]);
    const map = gridOf(10, 10, room);
    const inside = (b: Body) =>
      b.x > 3 * TILE_SIZE && b.x < 6 * TILE_SIZE && b.y > 3 * TILE_SIZE && b.y < 6 * TILE_SIZE;
    for (const [mx, my] of [
      [-MOVE_MAX, -MOVE_MAX],
      [MOVE_MAX, -MOVE_MAX],
      [-MOVE_MAX, MOVE_MAX],
      [MOVE_MAX, MOVE_MAX],
    ] as const) {
      let body: Body = { x: 4.5 * TILE_SIZE, y: 4.5 * TILE_SIZE, facing: 0 };
      for (let t = 0; t < 40; t++) body = moveBody(map, body, mx, my, PLAYER_SPEED);
      expect(inside(body)).toBe(true);
    }
  });
});
