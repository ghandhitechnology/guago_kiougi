import {
  INTEREST_CELL_TILES,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  nextRandom,
  TILE_SIZE,
} from "@guago/shared";
import { describe, expect, it } from "vitest";
import { InterestGrid, type Viewer } from "./interest.ts";

/**
 * The view must hold everything the screen can show. Sideways: half the screen, the camera's
 * lean (8 px), half the widest sprite (16 px) and the gap between where the server and the
 * player's own client hold the player (up to 10 px at 150 ms). Up and down: half the screen, the
 * chest offset and lean (20 px) and the tallest sprite.
 */
const REACH_X = INTERNAL_WIDTH / 2 + 8 + 16 + 10;
const REACH_Y = INTERNAL_HEIGHT / 2 + 20 + 66;
const CELL = INTEREST_CELL_TILES * TILE_SIZE;
/** Bandwidth: nothing further out than the 3×3 cells and a little slack is ever held. */
const FAR_X = 2 * CELL + 40;
const FAR_Y = 2 * CELL + 16;
const MAP = 40 * CELL;

class FakeView {
  readonly held = new Set<object>();
  add(e: object) {
    this.held.add(e);
  }
  remove(e: object) {
    this.held.delete(e);
  }
  has(e: object) {
    return this.held.has(e);
  }
}

function roller(seed: number) {
  let s = seed;
  return () => {
    const [v, n] = nextRandom(s);
    s = n;
    return v;
  };
}

describe("interest grid", () => {
  it("shows everything a screen can reach and nothing far, for viewers and entities on the move", () => {
    const roll = roller(11);
    const grid = new InterestGrid<object>(MAP, MAP);
    const walkers = Array.from({ length: 300 }, () => ({
      id: {},
      x: 4 * CELL + roll() * 8 * CELL,
      y: 4 * CELL + roll() * 8 * CELL,
      a: roll() * Math.PI * 2,
    }));
    const viewers = walkers
      .slice(0, 20)
      .map((w) => ({ w, viewer: { view: new FakeView(), cell: undefined } as Viewer<object> }));
    for (let tick = 0; tick < 600; tick++) {
      for (const w of walkers) {
        if (roll() < 0.05) w.a = roll() * Math.PI * 2;
        w.x = Math.min(MAP - 1, Math.max(0, w.x + Math.cos(w.a) * 3));
        w.y = Math.min(MAP - 1, Math.max(0, w.y + Math.sin(w.a) * 3));
        const cell = grid.place(w.id, w.x, w.y);
        const mine = viewers.find((v) => v.w === w);
        if (mine && (cell !== undefined || mine.viewer.cell === undefined)) {
          grid.watch(mine.viewer, cell ?? grid.cellOfEntity(w.id));
        }
      }
      for (const { w, viewer } of viewers) {
        const held = (viewer.view as FakeView).held;
        for (const o of walkers) {
          const dx = Math.abs(o.x - w.x);
          const dy = Math.abs(o.y - w.y);
          if (dx <= REACH_X && dy <= REACH_Y && !held.has(o.id)) {
            throw new Error(
              `tick ${tick}: an entity ${dx.toFixed(0)}, ${dy.toFixed(0)} px away is missing`,
            );
          }
          if (held.has(o.id) && (dx > FAR_X || dy > FAR_Y)) {
            throw new Error(
              `tick ${tick}: an entity ${dx.toFixed(0)}, ${dy.toFixed(0)} px away is held`,
            );
          }
        }
      }
    }
  });

  it("does not flicker something walking up and down a view's edge", () => {
    const grid = new InterestGrid<object>(MAP, MAP);
    const viewer: Viewer<object> = { view: new FakeView(), cell: undefined };
    const me = {};
    grid.watch(viewer, grid.place(me, 5 * CELL + 10, 5 * CELL + 10));
    const other = {};
    const edge = 7 * CELL + 24; // the right edge of the view, margin included
    for (let i = 0; i < 200; i++) grid.place(other, edge + ((i % 8) - 4), 5 * CELL + 50);
    expect(grid.changes).toBeLessThanOrEqual(2);
  });
});
