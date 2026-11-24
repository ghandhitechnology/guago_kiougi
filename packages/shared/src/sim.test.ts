import { describe, expect, it } from "vitest";
import { createWorld, type SimWorld, step } from "./sim.ts";

function run(seed: number, ticks: number): SimWorld {
  let world = createWorld(576, 352, [{ kind: "odap", count: 12 }], seed);
  for (let i = 0; i < ticks; i++) world = step(world);
  return world;
}

describe("simulation step", () => {
  it("replays the same world from the same seed", () => {
    expect(run(7, 1200)).toEqual(run(7, 1200));
    expect(run(7, 1200)).not.toEqual(run(8, 1200));
  });

  it("does not mutate the world it is given", () => {
    const world = createWorld(576, 352, [{ kind: "odap", count: 4 }], 1);
    const copy = JSON.parse(JSON.stringify(world));
    step(world);
    expect(world).toEqual(copy);
  });

  it("keeps every monster inside the map", () => {
    const world = run(3, 2400);
    for (const m of world.monsters) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThanOrEqual(world.width);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(world.height);
    }
  });
});
