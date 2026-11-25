import { building } from "./buildings.ts";
import type { LightSource, MapSource, Thing } from "./format.ts";
import type { Prop, Vec } from "./layers.ts";
import { place } from "./props.ts";
import { gridLines } from "./stamp.ts";

/**
 * 운동장 at 23:40 on the Thursday the device fired, and it is 23:40 here forever. The power is
 * out; the only light is the afternoon of another century pouring out of the tear in the field,
 * warm on the sand and throwing every shadow away from it. The stands and the 조회대 watch the
 * square field; the dorm's windows are still lit beyond the fence because 2면 just ended. One
 * floodlight is still trying. Pages of the notebook drift toward the tear, and by its lip there
 * is one white sneaker.
 */

const T = 16;

const PLAN = `
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ====================================,,,,,,,mmmmmmmm,,,,,,,======================
    ,,,,,,,,,,,,===================,,,,,,,,,,dmmmmmmmmmd,,,,,,======================
    ,,,,,,,,,,,,===================,,,,,,,,,ddmmmmmmmmm,,,,,,,======================
    ,,,,,,,,,,,,===================,,,,,,,ddddmmmmmmmmmd,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,===================,,,,,ddddddmmmmmmmmmdd,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,===================,,,,ddddddmmmmmmmmmmmd,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,=====================,,,ddddddmmmmmmmmmmmdd,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,=====================,,,dddddddddddddddddddd,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,sssssssssssssssssssssssddddddddddddddddd,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,sssssssssssssssssssssssddddddddddddddddd,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,sssssssssssssssssssssssssddddddddddddd,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,sssssssssssssssssssssssssddddddddddddd,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,sssssssssssssssssssssssssddddddddddddd,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,ssssssssssssssssssssssssssddddddddds,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,ssssssssssssssssssssssssssdddddddsss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,sssssssssssssssssssssssssddddddddsss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    =============,ssssssssssssssssssssssssssddddddssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    =============,ssssssssssssssssssssssssssddddddssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    =============,sssssssssssssssssssssssssssssdssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,sssssssssssssssssssssssssssssdssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,===========,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,===========,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,===========,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,,,,,,,===,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,ssssssssssssssssssssssssssssssssssss,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,cccccccccc,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,%
    %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%===%%%%%%%%%%%%%%%%%%
`;

const ROWS = gridLines(PLAN);
/** Whether a tile is torn open to the era. */
const torn = (x: number, y: number): boolean => "dm".includes(ROWS[y]?.[x] ?? "");

/** The tear's heart, where its light comes from and where it leads. */
const CORE: Vec = [46 * T + 8, 8 * T];

/**
 * A chalk line along tiles, its pieces worn unevenly, broken where the field is torn away.
 */
function chalk(axis: "h" | "v", x: number, y: number, n: number, wear: number): Prop[] {
  const out: Prop[] = [];
  for (let i = 0; i < n; i++) {
    const tx = axis === "h" ? x + i : x;
    const ty = axis === "h" ? y : y + i;
    if (torn(tx, ty)) continue;
    const frame = `${axis}${[0, 1, 0, 3, 2, 0, 1, 0, 3, 0][(i * 7 + wear) % 10]}`;
    out.push({
      prop: axis === "h" ? "chalk-h" : "chalk-v",
      frame,
      at: axis === "h" ? [tx * T, ty * T + 7] : [tx * T + 7, ty * T],
    });
  }
  return out;
}

/** A long shadow thrown away from the tear's light. */
function awayFromTear(frame: string, x: number, y: number): Prop {
  return { prop: "long-shadow", frame, at: [x, y], ...(x < CORE[0] ? { flip: true } : {}) };
}

/** Columns that came up through the field, on campus ground, lit side toward the tear. */
function campusColumn(x: number, y: number, frame: "whole" | "broken"): Prop[] {
  return [{ prop: "column", frame, at: [x, y], ...(x < CORE[0] ? { flip: true } : {}) }];
}

const pageEmitter = (
  sprite: string,
  count: number,
  area: { x: number; y: number; w: number; h: number },
) => ({
  sprite,
  anim: "turn",
  area,
  count,
  life: 9,
  velocity: [6, -4] as Vec,
  toward: CORE,
});

const lights: LightSource[] = [
  // The tear: afternoon light from another century, the only real light on the field.
  {
    at: [CORE[0], CORE[1] + 80],
    radius: 300,
    color: "clay.dust",
    intensity: 1.15,
    flicker: { amount: 0.04, period: 2.2 },
    paint: {
      bands: ["rift-sun", "rift-warm", "rift-ember"],
      region: "dm",
      reach: [22, 60, 112],
      ragged: 9,
      rays: { at: [CORE[0], CORE[1] + 40], count: 11, amount: 0.32 },
      pulse: { amount: 0.04, period: 2.2 },
    },
  },
  // The one floodlight still trying.
  {
    at: [200, 220],
    radius: 150,
    color: "gold.pale",
    intensity: 0.5,
    flicker: { amount: 0.8, period: 1.5 },
    paint: { bands: ["campus-glow"], at: [204, 214], r: [64, 30], ragged: 6 },
  },
  // The lamp at the path in from the yard, on another circuit.
  {
    at: [104, 300],
    radius: 80,
    color: "gold.light",
    intensity: 0.7,
    paint: {
      bands: ["campus-lamp", "campus-dusk", "campus-glow"],
      at: [104, 330],
      r: [70, 34],
      ragged: 5,
    },
  },
];

/** 체육창고: the PE shed, its shutter down, where the cones and the balls live. */
const SHED = building({
  name: "shed",
  material: "bld-grey",
  roof: "roof-grey",
  roofRows: 2,
  side: true,
  floors: ["<x#d#x>"],
});

const map: MapSource = {
  id: "campus-field",
  name: "운동장",
  seed: 2340,
  time: { clock: "23:40", phase: "night", weather: "sea-wind" },
  theme: "field-night",
  sky: "ink.deep",
  ambient: { color: "navy.light", intensity: 0.34 },
  plan: PLAN,
  legend: {
    "~": { terrain: null },
    ",": { terrain: "grass" },
    "%": { terrain: "grass", solid: "#" },
    "=": { terrain: "walk" },
    s: { terrain: "sand" },
    c: { terrain: "court" },
    d: { terrain: "dirt", theme: "greece" },
    m: { terrain: "marble", theme: "greece" },
  },
  rules: [
    // The square field's sand has worn out into the lawn along its edges, never in a line.
    ...[
      { x: 13, y: 11, w: 38, h: 2 },
      { x: 13, y: 48, w: 38, h: 2 },
      { x: 13, y: 24, w: 1, h: 24 },
      { x: 50, y: 12, w: 1, h: 17 },
      { x: 50, y: 34, w: 1, h: 14 },
    ].map((inside) => ({
      on: ",",
      to: "s",
      scale: 2.2,
      threshold: 0.5,
      near: { chars: "s", within: 1 },
      inside,
    })),
  ],
  edges: [{ overlay: "rift", inside: "dm" }],
  stamps: [{ stamp: SHED, at: [64, 24] }],
  blocks: [
    // The fence, the tear's far edge and the sea wall.
    { x: 0, y: 4, w: 80, h: 1 },
    // The stands, the 조회대.
    { x: 12, y: 5, w: 19, h: 5 },
    { x: 19, y: 10, w: 5, h: 2 },
    // Behind the stands' ends, the fence corners.
    { x: 0, y: 5, w: 12, h: 1 },
    { x: 31, y: 5, w: 5, h: 1 },
    // The tear's far edge, where the era's terrace drops to its sea.
    { x: 36, y: 5, w: 22, h: 1 },
    // The court's fences.
    { x: 0, y: 37, w: 7, h: 1 },
    { x: 0, y: 54, w: 13, h: 1 },
  ],
  backdrop: [
    { prop: "night-stars", anim: "twinkle", play: true, at: [0, 0], repeat: 8, raw: true },
    { prop: "night-moon", at: [1212, 8], raw: true },
    { prop: "dorm-night", anim: "lights", play: true, at: [10, 62], raw: true },
    { prop: "dorm-night", anim: "lights", play: true, index: 2, at: [330, 64], raw: true },
    { prop: "night-dorm", at: [0, 70], raw: true },
    { prop: "night-dorm", at: [300, 70], raw: true },
    { prop: "sky-tear", at: [636, 0], raw: true },
    { prop: "night-sea", anim: "ripple", play: true, at: [896, 32], repeat: 6, raw: true },
    { prop: "night-city", at: [930, 46], repeat: 3, raw: true },
    { prop: "buoy", anim: "blink", play: true, at: [1104, 58], raw: true },
  ],
  details: [
    // The square field's lines: the boundary, the halfway line, the boxes at both ends.
    ...chalk("h", 15, 13, 34, 0),
    ...chalk("h", 15, 46, 34, 3),
    ...chalk("v", 15, 13, 34, 1),
    ...chalk("v", 48, 13, 34, 5),
    ...chalk("v", 31, 13, 34, 2),
    ...chalk("h", 15, 22, 6, 4),
    ...chalk("h", 15, 37, 6, 6),
    ...chalk("v", 21, 22, 15, 7),
    ...chalk("h", 43, 22, 5, 2),
    ...chalk("h", 43, 37, 5, 8),
    ...chalk("v", 42, 26, 11, 3),
    // The court's lines.
    ...chalk("h", 3, 39, 8, 1),
    ...chalk("h", 3, 51, 8, 4),
    ...chalk("v", 3, 39, 12, 2),
    ...chalk("v", 10, 39, 12, 6),
    ...chalk("h", 3, 45, 8, 7),
    // Goal mouths worn bare, drag marks toward the tear, heaves where columns came up.
    { prop: "worn", at: [224, 452] },
    { prop: "worn", at: [700, 452] },
    { prop: "drag", at: [560, 340] },
    { prop: "drag", at: [612, 392] },
    { prop: "drag", at: [508, 300] },
    { prop: "heave", at: [612, 262] },
    { prop: "heave", at: [826, 230] },
    { prop: "heave", at: [580, 420] },
    { prop: "weeds", at: [228, 196] },
    { prop: "weeds", at: [760, 760] },
    { prop: "weeds", at: [184, 610] },
    { prop: "weeds", at: [44, 690] },
    { prop: "weeds", at: [150, 820] },
    { decal: "marble-dust/shards", at: [672, 150] },
    { decal: "marble-dust/pebbles", at: [796, 140] },
  ],
  shadows: [
    awayFromTear("column", 612, 258),
    awayFromTear("column", 826, 226),
    awayFromTear("column", 580, 416),
    awayFromTear("column", 768, 474),
    awayFromTear("tree", 840, 130),
    awayFromTear("figure", 690, 418),
    awayFromTear("imp", 646, 336),
    awayFromTear("imp", 742, 380),
  ],
  objects: [
    // The fence along the north, torn through by the era, and the sea wall to the east.
    { prop: "fence", frame: "run", at: [8, 79], repeat: 36 },
    ...[72, 200, 328, 456].map((x): Prop => ({ prop: "fence", frame: "post", at: [x, 79] })),
    { prop: "seawall", frame: "run", at: [936, 79], repeat: 22 },
    { prop: "fence", frame: "run", at: [936, 68], repeat: 22 },
    ...[1000, 1128, 1256].map((x): Prop => ({ prop: "fence", frame: "post", at: [x, 68] })),
    // The era's terrace at the top of the tear, where its ground drops to its own sea.
    { prop: "terrace", frame: "run", at: [672, 76], repeat: 8, raw: true },
    // The stands and the 조회대.
    ...Array.from(
      { length: 19 },
      (_, i): Thing => ({
        prop: "stands",
        frame: i === 0 ? "l" : i === 18 ? "r" : "m",
        at: [(12 + i) * T, 10 * T - 1],
      }),
    ),
    { prop: "podium", at: [344, 191], sort: 191 },
    { prop: "gym-bag", at: [440, 134], sort: 160 },
    { prop: "bottle", at: [272, 172] },
    { prop: "rocket", at: [168, 186] },
    // Floodlights at the corners; only one still sputters.
    place("floodlight", 12, 12, { anim: "sputter", play: true }),
    place("floodlight", 54, 13, { frame: "off" }),
    place("floodlight", 12, 47, { frame: "off" }),
    place("floodlight", 51, 47, { frame: "off" }),
    // The goals: one where it should be, one taken by a column out of the tear.
    { prop: "goal", at: [212, 472], foot: { x: 13, y: 28, w: 1, h: 2 } },
    place("goal-column", 47, 29, { flip: true }),
    // The tear: columns standing on its marble, the tortoise that cannot be caught, an olive.
    {
      prop: "column",
      frame: "whole",
      at: [704, 106],
      raw: true,
      foot: { x: 43, y: 6, w: 1, h: 1 },
    },
    {
      prop: "column",
      frame: "whole",
      at: [784, 106],
      raw: true,
      foot: { x: 48, y: 6, w: 1, h: 1 },
    },
    { prop: "column", frame: "broken", at: [744, 100], raw: true },
    { prop: "tortoise-statue", at: [744, 150], raw: true, foot: { x: 45, y: 9, w: 2, h: 1 } },
    { prop: "olive", at: [834, 142], raw: true, foot: { x: 52, y: 8, w: 1, h: 1 } },
    { prop: "amphora", at: [684, 168], raw: true },
    { prop: "amphora-tipped", at: [812, 196], raw: true },
    { prop: "drum", at: [640, 220], flip: true },
    // Columns that came up through the field.
    ...campusColumn(612, 258, "whole"),
    ...campusColumn(826, 226, "broken"),
    ...campusColumn(580, 416, "broken"),
    // Left out after PE, and what the last one in left behind.
    { prop: "marker-cone", at: [330, 520] },
    { prop: "marker-cone", at: [362, 534] },
    { prop: "marker-cone", at: [394, 520] },
    { prop: "ball", at: [520, 610] },
    { prop: "sneaker", at: [700, 398] },
    // 엔트로피 at the lip, watching the tear.
    { actor: "entropy", anim: "idle", play: true, at: [668, 382] },
    // The court nobody uses.
    { prop: "hoop", frame: "front", at: [104, 654], foot: { x: 6, y: 40, w: 1, h: 1 } },
    { prop: "hoop", frame: "back", at: [104, 830], foot: { x: 6, y: 51, w: 1, h: 1 } },
    { prop: "fence", frame: "run", at: [8, 607], repeat: 7 },
    { prop: "fence", frame: "run", at: [8, 879], repeat: 13 },
    { prop: "ball", at: [150, 760] },
    // Lamps: the one at the yard path still lit, the rest dead.
    place("lamp", 6, 19),
    place("lamp", 56, 29, { frame: "off" }),
    place("lamp", 56, 8, { frame: "off" }),
    place("lamp", 70, 7, { frame: "off" }),
    place("bench", 63, 5),
    place("bench", 74, 5),
    place("bench", 2, 25),
    // East of the field: the chin-up bars, the tyres, the PE shed.
    place("bars", 56, 40),
    place("tires", 56, 44),
    // Trees along the east, a shrub here and there.
    ...(
      [
        [66, 14],
        [72, 22],
        [66, 38],
        [74, 46],
        [54, 52],
        [26, 52],
        [40, 51],
      ] as const
    ).map(([x, y]) => place("zelkova", x, y)),
    { prop: "shrub", at: [952, 280] },
    { prop: "shrub", at: [1188, 600], flip: true },
    { prop: "shrub", at: [168, 368] },
    // The gate to the 생태공원 at the south edge.
    { prop: "gate", at: [968, 895] },
    ...[57, 58, 63, 64].map(
      (x): Thing => ({
        prop: "hedge",
        frame: x < 60 ? (x === 57 ? "l" : "r") : x === 63 ? "l" : "r",
        at: [x * T, 55 * T + 15],
        foot: { x, y: 55, w: 1, h: 1 },
      }),
    ),
  ],
  overhead: [
    { prop: "column-capital", at: [704, 106], raw: true },
    { prop: "column-capital", at: [784, 106], raw: true },
    { prop: "column-capital", at: [612, 258], flip: true },
    { prop: "olive-crown", anim: "stir", play: true, at: [834, 142], raw: true },
    ...(
      [
        [66, 14],
        [72, 22],
        [66, 38],
        [74, 46],
        [54, 52],
        [26, 52],
        [40, 51],
      ] as const
    ).map(
      ([x, y], i): Prop => ({
        prop: "zelkova-crown",
        anim: "sway",
        play: true,
        index: i % 3,
        at: [x * T + 8, (y + 1) * T - 2],
      }),
    ),
  ],
  lights,
  atmosphere: [
    { prop: "embers", anim: "rise", play: true, at: [690, 300] },
    { prop: "embers", anim: "rise", play: true, index: 6, at: [780, 260] },
    { prop: "embers", anim: "rise", play: true, index: 11, at: [640, 200] },
    { prop: "embers", anim: "rise", play: true, index: 3, at: [730, 400] },
    {
      prop: "scrap",
      anim: "tumble",
      play: true,
      at: [640, 260],
      drift: { to: [690, 180], period: 4 },
    },
    {
      prop: "scrap",
      anim: "tumble",
      play: true,
      index: 2,
      at: [700, 390],
      drift: { to: [730, 300], period: 5, phase: 2 },
    },
    {
      prop: "scrap",
      anim: "tumble",
      play: true,
      index: 1,
      at: [840, 330],
      drift: { to: [800, 250], period: 4.5, phase: 1 },
    },
  ],
  emitters: [
    pageEmitter("page-l", 4, { x: 220, y: 260, w: 360, h: 400 }),
    pageEmitter("page-m", 5, { x: 120, y: 200, w: 500, h: 500 }),
    pageEmitter("page-s", 6, { x: 300, y: 300, w: 600, h: 360 }),
    pageEmitter("page-s", 3, { x: 900, y: 160, w: 300, h: 300 }),
  ],
  spawns: {
    main: { tile: [2, 21], facing: "right" },
    yard: { tile: [1, 21], facing: "right" },
    agora: { tile: [46, 13] },
    "eco-park": { tile: [60, 53], facing: "up" },
  },
  landmark: { name: "균열", tile: [46, 10] },
  portals: [
    { id: "yard", rect: { x: 0, y: 20, w: 1, h: 3 }, to: "campus-yard", spawn: "field" },
    { id: "agora", rect: { x: 44, y: 6, w: 4, h: 2 }, to: "p1-agora", spawn: "campus" },
    { id: "eco-park", rect: { x: 59, y: 55, w: 3, h: 1 }, to: "eco-park", spawn: "campus" },
  ],
  interactables: [
    { id: "stands", kind: "sit", rect: { x: 12, y: 9, w: 19, h: 1 } },
    { id: "podium", kind: "lore", rect: { x: 19, y: 10, w: 5, h: 2 } },
    { id: "sneaker", kind: "lore", rect: { x: 43, y: 24, w: 1, h: 1 } },
    { id: "rocket", kind: "lore", rect: { x: 10, y: 11, w: 1, h: 1 } },
    { id: "gym-bag", kind: "lore", rect: { x: 27, y: 9, w: 1, h: 1 } },
    { id: "shed", kind: "locked", rect: "shed:side-door" },
  ],
  zones: [
    { id: "path-in", kind: "safe", rect: { x: 0, y: 17, w: 12, h: 9 } },
    {
      id: "tear",
      kind: "monsters",
      rect: { x: 30, y: 5, w: 28, h: 26 },
      monster: "odap",
      density: 4,
    },
    {
      id: "field",
      kind: "monsters",
      rect: { x: 14, y: 26, w: 36, h: 22 },
      monster: "odap-pencil",
      density: 2,
    },
    {
      id: "terrace",
      kind: "monsters",
      rect: { x: 41, y: 5, w: 11, h: 6 },
      monster: "rational",
      density: 1,
    },
    { id: "stands-front", kind: "gather", rect: { x: 11, y: 10, w: 21, h: 2 } },
    { id: "court", kind: "gather", rect: { x: 2, y: 38, w: 10, h: 15 } },
  ],
};

export default map;
