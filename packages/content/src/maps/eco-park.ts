import type { MapSource, Thing } from "./format.ts";
import { cellOf, merge, type Placed, scatter } from "./greek.ts";
import type { Decal, Prop, Vec } from "./layers.ts";
import { fractal } from "./noise.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 생태공원, behind the 급식실, stopped at 07:10 after a night of rain. It was built to show off
 * flowers; it shows off weeds now, to the knee, and the paving loop around the pond is going
 * under them. The water sculpture in the middle has not run in years, its basin is green and
 * the plaque says it is being looked after. Reeds have the pond, gnats hang over every clump,
 * the benches are for nobody. At the gate somebody laid fresh turf, which is the only part of
 * the garden anyone has touched. The first 오답 any student fights live here.
 */

const T = 16;
const W = 56;
const H = 40;

/** `,` lawn, `_` dirt, `=` paving, `w` the pond; `%` and `:` past the hedges. */
const LEGEND: MapSource["legend"] = {
  ",": { terrain: "grass" },
  _: { terrain: "dirt" },
  "=": { terrain: "walk" },
  w: { terrain: "water", solid: "~" },
  "%": { terrain: "grass", solid: "#" },
  ":": { terrain: "dirt", solid: "#" },
};

const POND: Vec = [28, 23];
const GATE_X = 26;

function paintPlan(): PlanGrid {
  const g = new PlanGrid(W, H, ",");
  // The hedge line all round, a gap at the gate.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const edge = x < 3 || y < 3 || x > W - 4 || y > H - 4;
      if (edge && !(x >= GATE_X - 1 && x <= GATE_X + 4 && y < 3)) g.set(x, y, "%");
    }
  // The way in from the gate, the plaza round the sculpture, the loop round the pond.
  g.rect(GATE_X, 0, 4, 6, "=");
  g.rect(GATE_X - 5, 5, 14, 7, "=");
  for (const [x, y, w, h] of [
    [9, 13, 38, 3],
    [9, 31, 38, 3],
    [9, 13, 3, 21],
    [44, 13, 3, 21],
  ] as const)
    g.rect(x, y, w, h, "=");
  // The weeds take the paving back in places, worst on the far side.
  g.patches("=", ",", {
    scale: 3,
    threshold: 0.66,
    seed: 7,
    inside: { x: 8, y: 12, w: 40, h: 23 },
  });
  // Mud where feet and rain have worn the lawn.
  g.patches(",", "_", { scale: 4, threshold: 0.7, seed: 8 });
  g.blob(POND[0], POND[1], 10, 4.6, "w", { seed: 9, ragged: 0.22 });
  g.blob(POND[0], POND[1], 12, 6.2, "_", { seed: 10, ragged: 0.2, onto: ",=" });
  g.blob(POND[0], POND[1], 10, 4.6, "w", { seed: 9, ragged: 0.22 });
  // Grounds with no pair between them get mud between.
  g.separate(",=", "w", "_").separate("%", "w", ":");
  g.majority(",", "_", 1);
  g.separate(",=", "w", "_");
  g.unsqueeze(",_=").enclose(",_=", [GATE_X + 1, 1], { ",": "%", _: ":", "=": ":" });
  return g;
}

const GRID = paintPlan();
const PLAN = GRID.toString();
const at = cellOf(PLAN);

/** Weed clumps over the lawn, walked through, never around: thick where the garden has gone. */
const weedy = (tx: number, ty: number) => fractal(tx, ty, 6, 31) > 0.5;
const WEEDS = [
  ...scatter(
    { x: 3, y: 3, w: W - 6, h: H - 6 },
    2,
    21,
    (tx, ty) => at(tx, ty) === "," && weedy(tx, ty),
  ),
  ...scatter(
    { x: 3, y: 3, w: W - 6, h: H - 6 },
    4,
    22,
    (tx, ty) => at(tx, ty) === "," && !weedy(tx, ty),
  ),
];

/** Shrubs and trees along the sides, where the hedge gave up. */
const SIDES: readonly Vec[] = Array.from(
  { length: 16 },
  (_, k): Vec => [k % 2 ? W - 2 : 1, 4 + k * 2],
);

function hedges(): Thing[] {
  const out: Thing[] = [];
  for (let x = 2; x < W - 2; x++) {
    if (x >= GATE_X - 1 && x <= GATE_X + 4) continue;
    out.push({
      prop: "hedge",
      frame: "run",
      at: [x * T, 3 * T - 1],
      foot: { x, y: 2, w: 1, h: 1 },
    });
    out.push({
      prop: "hedge",
      frame: "run",
      at: [x * T, (H - 2) * T - 1],
      foot: { x, y: H - 3, w: 1, h: 1 },
    });
  }
  return out;
}

const placed = merge({
  objects: [
    ...hedges(),
    ...SIDES.map(
      ([x, y], i): Prop => ({
        prop: "shrub",
        at: [x * T + 8, y * T + 14],
        ...(i % 3 ? { flip: true } : {}),
      }),
    ),
    // The water sculpture in its green basin, and its plaque.
    place("water-sculpture", GATE_X, 7),
    { prop: "plaque", at: [GATE_X * T + 52, 9 * T + 14] },
    // Benches nobody sits on, a lamp, flowerbeds gone to seed.
    place("bench", 14, 11),
    place("bench", 38, 11),
    place("bench", 13, 34),
    place("bench", 40, 34),
    place("lamp", 12, 18, { frame: "off" }),
    place("lamp", 43, 27, { frame: "off" }),
    place("planter", 5, 6),
    place("planter", 47, 6),
    place("planter", 5, 34),
    // Trees inside the hedge and beyond it.
    ...(
      [
        [6, 22],
        [49, 18],
        [20, 37],
        [36, 1],
        [8, 1],
        [50, 37],
      ] as const
    ).map(([x, y]) => place("zelkova", x, y)),
    place("pine", 49, 29),
    // Reeds at the water's edge.
    ...(
      [
        [312, 344],
        [360, 336],
        [540, 352],
        [588, 384],
        [330, 420],
        [520, 430],
      ] as const
    ).map(
      ([x, y], i): Prop => ({ prop: "reeds", anim: "sway", play: true, index: i % 2, at: [x, y] }),
    ),
    // The weeds.
    ...WEEDS.map(
      ([tx, ty], i): Prop => ({
        prop: "weed-clump",
        anim: i % 3 ? "sway" : "sway2",
        play: true,
        index: i % 2,
        at: [tx * T + 8, ty * T + 14],
        ...(i % 2 ? { flip: true } : {}),
      }),
    ),
  ],
  overhead: [
    ...(
      [
        [6, 22],
        [49, 18],
        [20, 37],
        [36, 1],
        [8, 1],
        [50, 37],
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
    { prop: "pine-crown", anim: "sway", play: true, at: [49 * T + 8, 30 * T - 2] },
  ],
  shadows: [],
} satisfies Placed);

const details: (Decal | Prop)[] = [
  // Fresh turf at the gate: the only part anyone has touched.
  { prop: "sod", at: [(GATE_X - 1) * T, 2 * T] },
  // Lily pads.
  ...(
    [
      [372, 360],
      [420, 384],
      [470, 352],
      [500, 400],
      [396, 410],
    ] as const
  ).map(([x, y], i): Prop => ({ prop: "lily", at: [x, y], ...(i % 2 ? { flip: true } : {}) })),
  { prop: "weeds", at: [180, 520] },
  { prop: "weeds", at: [760, 220] },
];

const map: MapSource = {
  id: "eco-park",
  name: "생태공원",
  seed: 710,
  time: { clock: "07:10", phase: "morning", weather: "haze" },
  theme: "eco-morning",
  sky: "board.mid",
  ambient: { color: "sea.pale", intensity: 0.9 },
  plan: PLAN,
  legend: LEGEND,
  details,
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  emitters: [
    {
      sprite: "gnats",
      anim: "mill",
      area: { x: 80, y: 80, w: 760, h: 480 },
      count: 12,
      life: 6,
      velocity: [2, -1],
    },
    {
      sprite: "dragonfly",
      anim: "beat",
      area: { x: 300, y: 320, w: 300, h: 120 },
      count: 3,
      life: 5,
      velocity: [22, -6],
    },
    {
      sprite: "butterfly",
      anim: "flap",
      area: { x: 80, y: 120, w: 700, h: 420 },
      count: 3,
      life: 9,
      velocity: [9, -4],
    },
    {
      sprite: "mote",
      area: { x: 60, y: 60, w: 780, h: 520 },
      count: 30,
      life: 9,
      velocity: [3, -2],
    },
  ],
  spawns: {
    main: { tile: [GATE_X + 1, 1] },
    campus: { tile: [GATE_X + 1, 1] },
  },
  landmark: { name: "물 조형물", tile: [GATE_X + 1, 6] },
  portals: [
    {
      id: "campus-field",
      rect: { x: GATE_X, y: 0, w: 4, h: 1 },
      to: "campus-field",
      spawn: "eco-park",
    },
  ],
  interactables: [
    { id: "plaque", kind: "lore", rect: { x: GATE_X + 3, y: 9, w: 1, h: 1 } },
    { id: "bench", kind: "sit", rect: { x: 14, y: 11, w: 2, h: 1 } },
  ],
  zones: [
    { id: "gate", kind: "safe", rect: { x: GATE_X - 2, y: 0, w: 8, h: 5 } },
    { id: "sculpture", kind: "gather", rect: { x: GATE_X - 5, y: 5, w: 14, h: 7 } },
    // The first fight: 오답 across the lawn, pencil 오답 in the weeds on the far side.
    {
      id: "lawn",
      kind: "monsters",
      rect: { x: 3, y: 12, w: W - 6, h: H - 15 },
      monster: "odap",
      density: 3,
    },
    {
      id: "far-weeds",
      kind: "monsters",
      rect: { x: 3, y: 26, w: W - 6, h: 11 },
      monster: "odap-pencil",
      density: 3,
    },
  ],
};

export default map;
