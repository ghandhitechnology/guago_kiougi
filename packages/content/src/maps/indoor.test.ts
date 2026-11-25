import { describe, expect, it } from "vitest";
import { buildMap } from "./build.ts";
import type { ArtIndex } from "./check.ts";
import type { MapSource } from "./format.ts";
import home from "./home.ts";
import { checkCutsceneMarks, checkIndoor } from "./indoor.ts";

const ROOM: MapSource = {
  id: "room",
  name: "방",
  seed: 1,
  time: { clock: "12:00", phase: "noon", weather: "clear" },
  theme: "campus-night",
  ambient: { color: "stone.bright", intensity: 1 },
  plan: `
    ######
    #____#
    #____#
    #____#
    ######
  `,
  legend: { "#": { terrain: "lino", solid: "#" }, _: { terrain: "lino" } },
  spawns: { main: { tile: [2, 2] } },
  landmark: { name: "방", tile: [2, 2] },
  npcs: [
    { speaker: "cook", tile: [1, 1] },
    { speaker: "nobody", tile: [3, 3], facing: "left" },
  ],
  marks: { chair: { tile: [3, 1] } },
  arenas: [{ id: "ring", rect: { x: 1, y: 1, w: 4, h: 3 }, modes: ["1v1"] }],
};

const ART: ArtIndex = {
  themes: ["campus", "campus-night"],
  palette: { ramps: {} },
  sprites: {},
  rigs: {},
  tilesets: {
    "mat-lino": {
      upper: "mat",
      lower: "lino",
      decals: [],
      bake: ["campus"],
    } as ArtIndex["tilesets"][string],
  },
  overlays: {},
};

describe("stage", () => {
  it("places NPC spots and marks on their tile's feet and keeps arenas", () => {
    const { map } = buildMap(ROOM, new Set(["room"]));
    expect(map.npcs[0]).toEqual({ speaker: "cook", x: 24, y: 28, facing: "down" });
    expect(map.marks.chair).toEqual({ x: 56, y: 28 });
    expect(map.arenas[0]?.rect).toEqual({ x: 1, y: 1, w: 4, h: 3 });
  });

  it("flags unknown speakers and terrains not baked into the map's themes", () => {
    const problems = checkIndoor(buildMap(ROOM, new Set(["room"])).map, ART).join("\n");
    expect(problems).toMatch(/npc nobody is not a narrative speaker/);
    expect(problems).toMatch(/mat-lino is not baked into theme campus-night/);
    expect(problems).not.toMatch(/npc cook/);
  });

  it("finds every mark a cutscene on a built map needs", () => {
    const built = buildMap(home, new Set(["home"])).map;
    expect(checkCutsceneMarks([built])).toEqual([]);
    expect(checkCutsceneMarks([{ ...built, marks: {} }]).join("\n")).toMatch(/needs mark table/);
  });
});
