import type { LightSource, MapSource } from "./format.ts";
import { backWall, mount, sideShade } from "./interior.ts";
import { place } from "./props.ts";

/**
 * 집, where 명령퇴사 sends you for ten minutes (PLAN §11): an apartment at 19:10, dinner on the
 * table before you are through the door. The 찌개 is on the stove, the TV is on with the sound
 * low, the fridge has the 장조림 in it, and your mother has a question about whether you are
 * eating properly. There is no way out but the clock: the front door is locked from this side
 * until your time is up.
 */

const TOP = 0;

const lights: LightSource[] = [
  // The lamp over the table, the kitchen's strip light, the TV's flicker.
  {
    at: [88, 140],
    radius: 64,
    color: "gold.pale",
    intensity: 0.7,
    paint: { bands: ["campus", "campus-lamp"], at: [88, 140], r: [56, 34], ragged: 3 },
  },
  {
    at: [80, 84],
    radius: 48,
    color: "stone.bright",
    intensity: 0.5,
    paint: { bands: ["campus-lamp"], at: [80, 90], r: [52, 16], ragged: 2 },
  },
  {
    at: [256, 110],
    radius: 50,
    color: "sea.light",
    intensity: 0.35,
    flicker: { amount: 0.15, period: 0.8 },
    paint: { bands: ["campus-lamp"], at: [256, 116], r: [44, 22], ragged: 3 },
  },
];

const map: MapSource = {
  id: "home",
  name: "집",
  seed: 1910,
  time: { clock: "19:10", phase: "night", weather: "clear" },
  theme: "campus-dusk",
  sky: "ink.deep",
  ambient: { color: "clay.dust", intensity: 0.72, unlit: "campus" },
  plan: `
    ########################
    #||||||||||||||||||||||#
    #||||||||||||||||||||||#
    #||||||||||||||||||||||#
    #fffffffffffffffffffeee#
    #fffffffffffffffffffeee#
    #ffffffffffffffffffffff#
    #fffffffffffffrrrrrrfff#
    #fffffffffffffrrrrrrfff#
    #fffffffffffffrrrrrrfff#
    #fffffffffffffrrrrrrfff#
    #ffffffffffffffffffffff#
    #ffffffffffffffffffffff#
    ########################
  `,
  legend: {
    "#": { terrain: "wood", solid: "#" },
    "|": { terrain: "wood", solid: "#" },
    f: { terrain: "wood" },
    r: { terrain: "rug" },
    e: { terrain: "tile" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  shadows: sideShade(1, 4, 13),
  objects: [
    ...backWall("wall-dorm", 1, 23, TOP, { worn: [11] }),
    mount("calendar", 120, TOP),
    mount("window", 168, TOP, { frame: "night-curtain" }),
    mount("door-dorm", 216, TOP, { frame: "shut" }),
    mount("photo-wall", 304, TOP),
    mount("front-door", 344, TOP),
    mount("wall-clock", 264, TOP, { anim: "tick", play: true }),
    // The kitchen: fridge, counter with the stove going.
    place("fridge", 1, 4),
    place("kitchen-counter", 3, 4, { anim: "cook", play: true }),
    // The table, laid, its chairs.
    place("dining-table", 4, 8),
    { prop: "home-chair", frame: "front", at: [72, 126] },
    { prop: "home-chair", frame: "front", at: [104, 126] },
    { prop: "home-chair", frame: "back", at: [88, 158] },
    // The living room: the TV, the sofa facing it, a plant that is fine here.
    place("tv", 15, 4, { anim: "flicker", play: true }),
    place("sofa", 15, 10, { frame: "back" }),
    place("low-table", 15, 7),
    place("monstera", 22, 12),
    { prop: "bag", frame: "slump", at: [344, 186] },
    // The 현관: shoes, slippers waiting.
    { prop: "shoes", at: [336, 92] },
    { prop: "slippers", frame: "pair", at: [324, 104] },
  ],
  overhead: [{ prop: "pendant", frame: "on", at: [88, 106] }],
  lights,
  spawns: {
    main: { tile: [21, 6], facing: "down" },
  },
  landmark: { name: "식탁", tile: [5, 8] },
  interactables: [
    { id: "front-door", kind: "locked", rect: { x: 21, y: 3, w: 2, h: 1 } },
    { id: "fridge", kind: "lore", rect: { x: 1, y: 4, w: 2, h: 1 } },
    { id: "table", kind: "sit", rect: { x: 4, y: 8, w: 3, h: 1 } },
    { id: "tv", kind: "lore", rect: { x: 15, y: 4, w: 3, h: 1 } },
    { id: "my-room", kind: "locked", rect: { x: 13, y: 3, w: 1, h: 1 } },
    { id: "sofa", kind: "sit", rect: { x: 15, y: 10, w: 3, h: 1 } },
  ],
  zones: [{ id: "home", kind: "safe", rect: { x: 0, y: 0, w: 24, h: 14 } }],
  npcs: [{ speaker: "parent", tile: [5, 5] }],
  marks: { door: [21, 5], table: [5, 9], fridge: [2, 5] },
};

export default map;
