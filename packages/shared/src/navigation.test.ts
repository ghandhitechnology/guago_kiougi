import { describe, expect, it } from "vitest";
import { type Collidable, gridOf } from "./collision.ts";
import { TILE_SIZE } from "./constants.ts";
import { MOVE_MAX, type MoveInput } from "./movement.ts";
import { type Doorway, stepDoors } from "./navigation.ts";
import { addPlayer, createWorld, type SimWorld, step } from "./sim.ts";

/**
 * A corridor 20 tiles wide with a wall along its top, broken by two doors: one at tiles 4–5
 * of row 1, one at tile 15 of row 1. Row 0 is wall above the doors, as on a building front.
 */
function corridor(): { map: Collidable; portals: Doorway[] } {
  const wall: [number, number][] = [];
  for (let x = 0; x < 20; x++) {
    wall.push([x, 0]);
    if (x !== 4 && x !== 5 && x !== 15) wall.push([x, 1]);
  }
  return {
    map: gridOf(20, 8, wall),
    portals: [{ rect: { x: 4, y: 1, w: 2, h: 1 } }, { rect: { x: 15, y: 1, w: 1, h: 1 } }],
  };
}

const T = TILE_SIZE;
const up = (seq: number): MoveInput => ({ seq, mx: 0, my: -MOVE_MAX });
const down = (seq: number): MoveInput => ({ seq, mx: 0, my: MOVE_MAX });
const right = (seq: number): MoveInput => ({ seq, mx: MOVE_MAX, my: 0 });

type Script = Record<string, (tick: number) => ((seq: number) => MoveInput) | undefined>;

/** Steps the world and the doorways together, recording each entry as `tick:id:portal`. */
function run(world: SimWorld, map: Collidable, portals: Doorway[], ticks: number, script: Script) {
  let inside = new Map<string, number>();
  const seqs = new Map<string, number>();
  const log: string[] = [];
  for (let t = 1; t <= ticks; t++) {
    const inputs = new Map<string, MoveInput[]>();
    for (const [id, pick] of Object.entries(script)) {
      const make = pick(t);
      if (!make) continue;
      const seq = (seqs.get(id) ?? 0) + 1;
      seqs.set(id, seq);
      inputs.set(id, [make(seq)]);
    }
    world = step(world, map, inputs);
    const doors = stepDoors(inside, world.players, portals);
    inside = new Map(doors.inside);
    for (const e of doors.entered) log.push(`${t}:${e.id}:${e.portal}`);
  }
  return { log, world, inside };
}

describe("doorways in the simulation step", () => {
  it("fires once, on the tick the feet cross into the door", () => {
    const { map, portals } = corridor();
    // Feet at the middle of tile (4, 4): 2.5 tiles below the door row at 3 px a tick.
    let world = createWorld(map, [], 1);
    world = addPlayer(world, "a", 4 * T + 8, 4 * T + 8);
    const { log } = run(world, map, portals, 40, { a: () => up });
    // From y = 72 the feet reach the door row (y < 32) after 14 ticks of 3 px.
    expect(log).toEqual(["14:a:0"]);
  });

  it("does not fire for a body put down inside a door until it steps out and back in", () => {
    const { map, portals } = corridor();
    let world = createWorld(map, [], 1);
    world = addPlayer(world, "b", 15 * T + 8, 1 * T + 12);
    const script: Script = { b: (t) => (t <= 6 ? down : t <= 12 ? up : undefined) };
    const { log } = run(world, map, portals, 20, script);
    // Down 18 px leaves the door at tick 2; up again re-enters it on the way back.
    expect(log).toEqual(["11:b:1"]);
  });

  it("ignores walking along a wall past both doors without entering", () => {
    const { map, portals } = corridor();
    let world = createWorld(map, [], 1);
    world = addPlayer(world, "c", 1 * T + 8, 2 * T + 8);
    const { log, inside } = run(world, map, portals, 80, { c: () => right });
    expect(log).toEqual([]);
    expect(inside.get("c")).toBe(-1);
  });

  it("replays to the same entries from the same inputs", () => {
    const { map, portals } = corridor();
    const make = () => {
      let world = createWorld(map, [], 7);
      world = addPlayer(world, "a", 4 * T + 8, 4 * T + 8);
      world = addPlayer(world, "b", 15 * T + 8, 1 * T + 12);
      world = addPlayer(world, "c", 9 * T + 8, 5 * T + 8);
      return world;
    };
    const script: Script = {
      a: (t) => (t % 30 < 15 ? up : down),
      b: (t) => (t % 20 < 10 ? down : up),
      c: (t) => (t % 50 < 25 ? right : up),
    };
    const first = run(make(), map, portals, 300, script);
    const second = run(make(), map, portals, 300, script);
    expect(first.log.length).toBeGreaterThan(3);
    expect(second.log).toEqual(first.log);
    expect(second.world).toEqual(first.world);
  });
});
