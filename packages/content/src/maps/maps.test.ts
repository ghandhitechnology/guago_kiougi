import { isSolidTile } from "@guago/shared";
import { describe, expect, it } from "vitest";
import { applyRules, buildMap, readPlan } from "./build.ts";
import { type ArtIndex, checkMap, narrowTiles, reach } from "./check.ts";
import type { MapSource, Stamp } from "./format.ts";
import { interiorWalls, mountY } from "./interior.ts";
import { place } from "./props.ts";
import { parseStamp } from "./stamp.ts";

const HUT: Stamp = {
  name: "hut",
  grid: `
    ###
    #D#
    .d.
  `,
  legend: {
    "#": { solid: "#" },
    D: { solid: "#" },
    d: { ground: "=", region: "door" },
  },
};

const SOURCE: MapSource = {
  id: "test",
  name: "시험",
  seed: 3,
  time: { clock: "12:00", phase: "noon", weather: "clear" },
  theme: "campus",
  ambient: { color: "stone.bright", intensity: 1 },
  plan: `
    ~~~~~~~~
    ,,,,,,,,
    ,,,,,,,,
    ,,,,,,,,
    ,,,,,,,,
    ,,,,,,,,
    ,,,,,,,,
    ,,,,,,,,
  `,
  legend: { "~": { terrain: null }, ",": { terrain: "grass" }, "=": { terrain: "walk" } },
  stamps: [{ stamp: HUT, at: [2, 1] }],
  objects: [place("bench", 4, 5)],
  spawns: { main: { tile: [2, 6] } },
  landmark: { name: "오두막", tile: [2, 2] },
  portals: [{ id: "in", rect: "hut:door", to: "inside", spawn: "main" }],
};

const ART: ArtIndex = {
  themes: ["campus"],
  palette: { ramps: { stone: { bright: "#faf2e1" } } },
  sprites: { bench: { frames: ["bench/still"], anims: { idle: {} } } },
  rigs: {},
  tilesets: { "lawn-walk": { upper: "grass", lower: "walk", decals: [] } },
  overlays: {},
};
const REGISTRY = { built: new Map([["test", ["main"]]]), planned: new Set(["inside"]) };

describe("stamps", () => {
  it("turns region cells into rectangles relative to the stamp", () => {
    const p = parseStamp(HUT);
    expect(p.w).toBe(3);
    expect(p.h).toBe(3);
    expect(p.regions.get("door")).toEqual({ x: 1, y: 2, w: 1, h: 1 });
    expect(p.cells).toHaveLength(7);
  });

  it("refuses unknown characters, ragged rows and regions that are not rectangles", () => {
    expect(() => parseStamp({ ...HUT, grid: "#x#" })).toThrow(/not in the legend/);
    expect(() => parseStamp({ ...HUT, grid: "###\n##" })).toThrow(/wide/);
    expect(() => parseStamp({ ...HUT, grid: "dd.\n.dd", legend: { d: { region: "r" } } })).toThrow(
      /not a filled rectangle/,
    );
  });
});

describe("collision", () => {
  it("comes from the plan, stamps and prop footprints", () => {
    const { map } = buildMap(SOURCE, new Set(["test"]));
    expect(map.collision.rows).toEqual([
      "~~~~~~~~",
      "..###...",
      "..###...",
      "........",
      "........",
      "....##..",
      "........",
      "........",
    ]);
    expect(map.scene.ground[3]).toBe(",,,=,,,,");
    expect(map.portals[0]).toMatchObject({ rect: { x: 3, y: 3, w: 1, h: 1 }, built: false });
    expect(isSolidTile(map, -1, 3)).toBe(true);
    expect(isSolidTile(map, 0, 0)).toBe(true);
    expect(isSolidTile(map, 0, 1)).toBe(false);
  });

  it("is the same for the same seed and never leaves single changed cells", () => {
    const src = {
      id: "r",
      plan: Array.from({ length: 24 }, () => ",".repeat(40)).join("\n"),
      legend: { ",": { terrain: "grass" }, ":": { terrain: "dirt" } },
    };
    const run = () => {
      const d = readPlan(src);
      applyRules(d, [{ on: ",", to: ":", scale: 4, threshold: 0.6 }], 9, src.legend);
      return d.ground.join("");
    };
    const ground = run();
    expect(ground).toBe(run());
    expect(ground).toContain(":");
    for (let i = 0; i < ground.length; i++) {
      if (ground[i] !== ":") continue;
      const x = i % 40;
      const n = [i - 1, i + 1, i - 40, i + 40].filter(
        (j, k) =>
          j >= 0 &&
          j < ground.length &&
          (k > 1 || Math.floor(j / 40) === Math.floor(i / 40)) &&
          ground[j] === ":",
      );
      expect(n.length, `cell ${x},${Math.floor(i / 40)}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("reachability", () => {
  const grid = { w: 6, h: 4, rows: ["..#...", "..#...", "..#...", "..##.."] };

  it("floods over the four sides only", () => {
    const seen = reach(grid, [0, 0]);
    expect(seen.reduce((a, b) => a + b, 0)).toBe(8);
    expect(seen[3]).toBe(0);
  });

  it("finds one-tile squeezes", () => {
    const rows = [".....", ".....", "##.##", ".....", "....."];
    expect(narrowTiles({ w: 5, h: 5, rows })).toEqual([[2, 2]]);
  });

  it("is checked from the main spawn, along with portals under props", () => {
    expect(checkMap(buildMap(SOURCE, new Set(["test"])), ART, REGISTRY)).toEqual([]);
    const pocket = { ...SOURCE, blocks: [{ x: 0, y: 3, w: 8, h: 1 }] };
    expect(checkMap(buildMap(pocket, new Set(["test"])), ART, REGISTRY).join("\n")).toMatch(
      /cannot reach/,
    );
    const blocked = { ...SOURCE, objects: [place("bench", 2, 3)] };
    expect(checkMap(buildMap(blocked, new Set(["test"])), ART, REGISTRY).join("\n")).toMatch(
      /portal in is blocked by a prop/,
    );
  });
});

describe("interior walls", () => {
  const plan = `
    ##########
    #ll#llllll
    #ll#llllll
    #ll#llllll
    #lllllllll
    #lllllllll
    ####DD####
    tttttttttt
    tttttttttt
    tttttttttt
    tttttttttt
  `;
  const walls = interiorWalls(plan, {
    walls: "#",
    faces: { l: "wall-cream", t: "wall-corridor" },
    doors: { D: { prop: "door-double", frame: "open" } },
  });
  const solid = new Set(
    walls.blocks.flatMap((b) =>
      Array.from(
        { length: b.w * b.h },
        (_, k) => `${b.x + (k % b.w)},${b.y + Math.floor(k / b.w)}`,
      ),
    ),
  );

  it("hangs a solid face three tiles deep under every wall that runs across", () => {
    for (const y of [1, 2, 3]) expect(solid.has(`1,${y}`)).toBe(true);
    expect(solid.has("1,4")).toBe(false);
    for (const y of [7, 8, 9]) expect(solid.has(`0,${y}`)).toBe(true);
    expect(walls.objects.filter((o) => o.prop === "wall-corridor")).toHaveLength(10);
  });

  it("keeps the end of a side wall thin and a doorway's face walkable", () => {
    expect(solid.has("3,4")).toBe(false);
    for (const y of [7, 8, 9]) {
      expect(solid.has(`4,${y}`)).toBe(false);
      expect(solid.has(`5,${y}`)).toBe(false);
    }
    expect(walls.objects).toContainEqual({
      prop: "door-double",
      frame: "open",
      at: [80, mountY(6)],
    });
  });
});
