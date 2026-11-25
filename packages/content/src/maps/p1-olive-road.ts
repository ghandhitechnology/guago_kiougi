import type { MapSource, Thing } from "./format.ts";
import {
  blob,
  cellOf,
  edgeLine,
  fieldLegend,
  merge,
  type Placed,
  px,
  rubble,
  scatter,
  settle,
  track,
  trees,
} from "./greek.ts";
import type { Decal, Prop, Vec } from "./layers.ts";
import { fractal } from "./noise.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 올리브 숲길, inland from the headland, stopped at 09:40 on a harvest morning that never gets
 * warm: a white road winds through terraced groves, shade falls in coins under the olives, and
 * the air is full of pollen. The thousand-year olive at the crossroads is split open at the foot
 * and older than anyone's story about it; its press stands beside it with the beam still in the
 * stone. Ladders lean in the trees, nets lie spread under them, a cart lost its jars on the bend
 * and the oil is still in the road, and a carved stone warns that tortoises cross here, which one
 * is always doing. West, over the stream, a path leaves for 크로톤 학당.
 */

const T = 16;
const W = 80;
const H = 60;

const wave = (v: number, seed: number, scale = 7) => fractal(v, 0.5, scale, seed) * 2 - 1;

/** The stream's west and east banks, per row. */
function stream(y: number): [number, number] {
  const c = 6 + wave(y, 4, 9) * 1.8;
  return [Math.round(c - 1.6), Math.round(c + 1.6)];
}

/** The road, north to east, and its branches. */
const ROAD: readonly Vec[] = [
  [39, 0],
  [38, 8],
  [33, 16],
  [30, 24],
  [34, 33],
  [44, 40],
  [56, 44],
  [68, 45],
  [80, 46],
];
const WEST_PATH: readonly Vec[] = [
  [30, 24],
  [18, 23],
  [8, 23],
  [0, 23],
];
const FARM_TRACK: readonly Vec[] = [
  [31, 22],
  [46, 19],
  [60, 15],
  [66, 13],
];

/** The crossroads, where the thousand-year olive stands. */
const CROSS: Vec = [29, 24];

function paintPlan(): PlanGrid {
  const g = new PlanGrid(W, H, ",");
  // The edge of the grove nobody walks past, ragged; the stream and its far bank to the west.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [w0, w1] = stream(y);
      const north = 3 + wave(x, 11) * 1.4;
      const south = H - 4 + wave(x, 12) * 1.4;
      const east = W - 4 + wave(y, 13) * 1.4;
      if (x >= w0 && x <= w1) g.set(x, y, "w");
      else if (x < w0 || y < north || y > south || x > east) g.set(x, y, "%");
    }
  }
  // Worn ground: the road, its branches, the clearings where the harvest gathers.
  g.path(ROAD, 5, "_", { seed: 31 });
  g.path(WEST_PATH, 4.5, "_", { seed: 32 });
  g.path(FARM_TRACK, 3.5, "_", { seed: 33 });
  g.blob(CROSS[0], CROSS[1], 9, 6.5, "_", { seed: 34, ragged: 0.2 });
  g.blob(22, 44, 8, 5, "_", { seed: 35, ragged: 0.25, onto: "," });
  g.blob(62, 20, 7, 5, "_", { seed: 36, ragged: 0.25, onto: "," });
  g.blob(55, 46, 6, 4, "_", { seed: 37, ragged: 0.25, onto: "," });
  g.patches(",", "_", { scale: 4, threshold: 0.72, seed: 38 });
  // The bridge over the stream is a causeway of dust under the planks.
  g.rect(2, 21, 8, 5, "_");
  g.fray(",", "_", { seed: 41, passes: 1, scale: 2.6 });
  g.majority(",", "_", 2);
  return settle(g, [39, 1]);
}

const GRID = paintPlan();
const PLAN = GRID.toString();
const at = cellOf(PLAN);

// The crossroads --------------------------------------------------------------------------------

const GIANT: Vec = [24, 19];

function crossroads(): Placed {
  const feet: Vec = [(GIANT[0] + 1.5) * T, (GIANT[1] + 2) * T - 2];
  return {
    objects: [
      place("olive-giant", GIANT[0], GIANT[1]),
      place("oil-press", 33, 18),
      { prop: "amphora", at: [588, 316] },
      { prop: "amphora", at: [600, 320] },
      place("shrine", 36, 27),
      { prop: "basket", raw: true, at: [440, 352] },
      { prop: "basket", raw: true, at: [470, 360] },
      { prop: "ladder", raw: true, at: [404, 318], sort: 318 },
    ],
    overhead: [{ prop: "olive-giant-crown", anim: "stir", play: true, at: feet }],
    shadows: [
      { prop: "dapple", frame: "a", at: [feet[0] + 4, feet[1] - 10] },
      { prop: "dapple", frame: "b", at: [feet[0] + 30, feet[1] - 2] },
      { prop: "dapple", frame: "a", at: [feet[0] - 26, feet[1] + 2], flip: true },
    ],
  };
}

// The grove -------------------------------------------------------------------------------------

/** Walls of the terraces: runs of dry stone with gaps a crowd can pour through. */
const WALLS: readonly [x: number, y: number, len: number][] = [
  [11, 34, 5],
  [20, 34, 5],
  [11, 46, 5],
  [26, 50, 6],
  [48, 9, 6],
  [58, 10, 5],
  [64, 27, 6],
  [44, 52, 7],
  [58, 52, 5],
];

function walls(): Thing[] {
  return WALLS.flatMap(([x, y, len]) =>
    Array.from({ length: len }, (_, k) =>
      place("wall-dry", x + k, y, { frame: k === 0 ? "l" : k === len - 1 ? "r" : "run" }),
    ),
  );
}
const wallAt = new Set(
  WALLS.flatMap(([x, y, len]) => Array.from({ length: len }, (_, k) => `${x + k},${y}`)),
);

/** An orchard tree may stand on walkable grass, clear of paths, walls and other things. */
function orchardSpot(tx: number, ty: number): boolean {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const c = at(tx + dx, ty + dy);
      const near = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      if (near ? c !== "," : c !== "," && c !== "_") return false;
      if (wallAt.has(`${tx + dx},${ty + dy}`)) return false;
    }
  const [gx, gy] = GIANT;
  if (tx >= gx - 3 && tx <= gx + 5 && ty >= gy - 3 && ty <= gy + 4) return false;
  return true;
}

const ORCHARD = scatter({ x: 8, y: 4, w: 70, h: 52 }, 5, 7, orchardSpot);
const BEYOND = scatter({ x: 0, y: 0, w: W, h: H }, 5, 9, (tx, ty) => at(tx, ty) === "%");

/** The grove's edge, where the walkable ground stops: rocks between the trunks. */
const EDGE = edgeLine(PLAN, "%", "_,", 4, 43);

const placed = merge(
  {
    objects: EDGE.map(
      ([tx, ty], i): Prop => ({
        prop: i % 3 === 0 ? "boulder-big" : "boulder",
        at: [tx * T + 8, ty * T + 14],
        ...(i % 2 ? { flip: true } : {}),
      }),
    ),
  },
  crossroads(),
  trees("olive", ORCHARD, 0, { dapple: true }),
  trees("olive", BEYOND, 1, { dapple: true }),
  // Cypresses lining the road down from the headland, and at the east gate.
  trees("cypress", [
    [35, 2],
    [43, 2],
    [34, 7],
    [42, 8],
    [76, 40],
    [76, 52],
  ]),
  {
    objects: [
      ...walls(),
      // The bend where the cart tipped: jars broken in the road.
      place("cart", 59, 42, { raw: true }),
      { prop: "amphora-tipped", at: [912, 700] },
      { prop: "amphora-tipped", at: [940, 716], flip: true },
      { prop: "amphora", at: [976, 690] },
      // The tortoise crossing.
      place("tortoise-stone", 40, 36),
      // The farm: hives on their bench, the well.
      place("hives", 66, 17),
      place("hives", 68, 20),
      place("well", 58, 20, { raw: true }),
      // The harvest under the trees.
      { prop: "basket", raw: true, at: [342, 700] },
      { prop: "basket", raw: true, at: [372, 712] },
      { prop: "ladder", raw: true, at: [870, 300] },
      { prop: "ladder", raw: true, at: [214, 590] },
      // Rocks the plough went around.
      place("boulder", 50, 30),
      place("boulder-big", 14, 40),
      place("boulder-big", 58, 30),
      place("boulder", 21, 38),
      place("boulder-big", 69, 8),
      place("boulder", 16, 53),
    ],
    shadows: [blob(948, 676, 18, 4, 2)],
  },
);

const details: (Decal | Prop)[] = [
  // The cart road's ruts, the farm track, and the path worn down to the bridge.
  ...track("ruts", ROAD, PLAN),
  ...track("ruts", FARM_TRACK, PLAN),
  ...track("footpath", WEST_PATH, PLAN),
  // Stone the ploughs turned up and heaped by the walls.
  ...rubble([20, 34], 4, 5, 21, PLAN),
  ...rubble([55, 10], 4, 5, 22, PLAN),
  ...rubble([28, 50], 4, 4, 23, PLAN),
  { prop: "bridge", at: [32, 330], raw: true },
  { prop: "oil-stain", at: [920, 680] },
  { prop: "oil-stain", at: [952, 700], flip: true },
  { prop: "ground-net", at: px(22, 44) },
  { prop: "ground-net", at: px(62, 20), flip: true },
  // Tortoise tracks straight across the road at the crossing stone.
  ...[0, 1, 2, 3, 4].map(
    (k): Prop => ({ prop: "tracks", frame: "d", at: [620 + k * 14, 560 + k * 10] }),
  ),
  { prop: "weeds", at: [700, 140] },
  { prop: "weeds", at: [180, 760] },
];

const map: MapSource = {
  id: "p1-olive-road",
  name: "올리브 숲길",
  seed: 940,
  time: { clock: "09:40", phase: "morning", weather: "haze" },
  theme: "olive-morning",
  shade: "greece-shade",
  sky: "olive.mid",
  ambient: { color: "stone.bright", intensity: 0.95 },
  plan: PLAN,
  legend: fieldLegend("slab"),
  details,
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights: [
    // The shrine's little lamp, kept lit through the morning.
    {
      at: [584, 432],
      radius: 28,
      color: "gold.light",
      intensity: 0.4,
      flicker: { amount: 0.15, period: 0.9 },
    },
  ],
  emitters: [
    {
      sprite: "mote",
      area: { x: 120, y: 60, w: 1080, h: 840 },
      count: 60,
      life: 8,
      velocity: [4, -2],
    },
    {
      sprite: "butterfly",
      anim: "flap",
      area: { x: 200, y: 500, w: 500, h: 300 },
      count: 3,
      life: 9,
      velocity: [12, -6],
    },
    {
      sprite: "butterfly",
      anim: "flap",
      area: { x: 880, y: 220, w: 300, h: 200 },
      count: 2,
      life: 8,
      velocity: [-10, 4],
    },
  ],
  spawns: {
    main: { tile: [39, 2] },
    "p1-colonnade": { tile: [39, 2] },
    "p1-cave-mouth": { tile: [76, 46], facing: "left" },
    "p1-croton-school": { tile: [2, 23], facing: "right" },
  },
  landmark: { name: "천 년 올리브", tile: [25, 18] },
  portals: [
    {
      id: "colonnade",
      rect: { x: 37, y: 0, w: 4, h: 1 },
      to: "p1-colonnade",
      spawn: "p1-olive-road",
    },
    {
      id: "cave-mouth",
      rect: { x: 79, y: 44, w: 1, h: 4 },
      to: "p1-cave-mouth",
      spawn: "p1-olive-road",
    },
    {
      id: "croton",
      rect: { x: 0, y: 22, w: 1, h: 3 },
      to: "p1-croton-school",
      spawn: "p1-olive-road",
    },
  ],
  interactables: [
    { id: "olive-giant", kind: "lore", rect: { x: GIANT[0], y: GIANT[1], w: 3, h: 2 } },
    { id: "press", kind: "lore", rect: { x: 33, y: 18, w: 3, h: 2 } },
    { id: "tortoise-stone", kind: "lore", rect: { x: 40, y: 36, w: 1, h: 1 } },
    { id: "well", kind: "lore", rect: { x: 58, y: 20, w: 2, h: 1 } },
    { id: "shrine", kind: "lore", rect: { x: 36, y: 27, w: 1, h: 1 } },
  ],
  zones: [
    { id: "north-gate", kind: "safe", rect: { x: 33, y: 0, w: 12, h: 7 } },
    { id: "bridge", kind: "safe", rect: { x: 0, y: 19, w: 10, h: 9 } },
    { id: "east-gate", kind: "safe", rect: { x: 71, y: 41, w: 9, h: 10 } },
    { id: "giant-shade", kind: "gather", rect: { x: 21, y: 21, w: 10, h: 5 } },
    { id: "harvest-nets", kind: "elite", rect: { x: 18, y: 41, w: 9, h: 6 } },
    // At full count about 150: 오답 throughout, pencil packs in the grass between the trees,
    // 유리수 병사 marching the road, 불의 정령 where the oil spilled and around the press,
    // 물의 정령 by the stream and the well, the tortoise on the road.
    {
      id: "grove",
      kind: "monsters",
      rect: { x: 8, y: 3, w: 70, h: 54 },
      monster: "odap",
      density: 1.7,
    },
    {
      id: "grass",
      kind: "monsters",
      rect: { x: 10, y: 28, w: 66, h: 28 },
      monster: "odap-pencil",
      density: 1.9,
    },
    {
      id: "road",
      kind: "monsters",
      rect: { x: 26, y: 8, w: 46, h: 40 },
      monster: "rational",
      density: 1.6,
    },
    {
      id: "spill",
      kind: "monsters",
      rect: { x: 28, y: 14, w: 40, h: 36 },
      monster: "element-fire",
      density: 2.2,
    },
    {
      id: "water",
      kind: "monsters",
      rect: { x: 8, y: 6, w: 60, h: 24 },
      monster: "element-water",
      density: 1.8,
    },
    {
      id: "crossing",
      kind: "monsters",
      rect: { x: 30, y: 28, w: 30, h: 16 },
      monster: "tortoise",
      density: 0.25,
    },
  ],
};

export default map;
