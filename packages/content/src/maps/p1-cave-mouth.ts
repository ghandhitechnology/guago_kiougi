import type { LightSource, MapSource, Thing } from "./format.ts";
import { cellOf, edgeLine, GREEK_LEGEND, merge, type Placed, scatter, settle } from "./greek.ts";
import type { Decal, Prop, Vec } from "./layers.ts";
import { fractal } from "./noise.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 동굴 입구, the slope under the cliff where the 그림자 동굴 opens, stopped at 19:20 with the sun
 * just behind the hill. The guards' fire burns before the mouth; between it and the rock runs a
 * low wall where someone carried cut-out shapes on sticks, and their shadows, a horse and a man
 * with a jar and a bird, still move on the cliff ten times life size though nobody is carrying
 * anything now. Rows of stone benches face the wall, their chains broken open. The guards' post
 * has a helmet on the stool and the roster on the table. Shadow seeps out of the mouth and down
 * the terraces, and that is where the 그림자 come from.
 */

const T = 16;
const W = 80;
const H = 60;

const wave = (v: number, seed: number, scale = 7) => fractal(v, 0.5, scale, seed) * 2 - 1;

/** Where the cave opens in the cliff: the tiles under its arch. */
const CAVE: Vec = [40, 8];
const FIRE: Vec = [47, 15];

function paintPlan(): PlanGrid {
  const g = new PlanGrid(W, H, "_");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (y < 4) g.set(x, y, "~");
      else if (y < 9) g.set(x, y, "r");
      // Scree slopes rising to the cliff on both flanks, the valley floor below.
      else if (x < 3 + wave(y, 3) * 1.5 + (y < 30 ? (30 - y) * 0.25 : 0)) g.set(x, y, "r");
      else if (x > W - 4 + wave(y, 4) * 1.5 - (y < 26 ? (26 - y) * 0.3 : 0)) g.set(x, y, "r");
      else if (y > H - 5 + wave(x, 5) * 1.4) g.set(x, y, "%");
    }
  // The roads in from the grove and out toward the 아고라 cut through the flanks.
  g.path(
    [
      [0, 45],
      [8, 46],
    ],
    5,
    "_",
    { ragged: 0.4, seed: 18 },
  );
  g.path(
    [
      [70, 49],
      [80, 49],
    ],
    5,
    "_",
    { ragged: 0.4, seed: 19 },
  );
  // The mouth: a notch into the rock where the floor slopes in.
  g.rect(CAVE[0] - 2, 6, 4, 3, "_");
  // Terrace ledges down the slope, with wide ramps between.
  g.path(
    [
      [0, 25],
      [14, 24],
      [29, 26],
    ],
    2.2,
    "r",
    { ragged: 0.4, seed: 21 },
  );
  g.path(
    [
      [52, 25],
      [66, 23],
      [80, 24],
    ],
    2.2,
    "r",
    { ragged: 0.4, seed: 22 },
  );
  g.path(
    [
      [0, 40],
      [12, 41],
    ],
    2.2,
    "r",
    { ragged: 0.4, seed: 23 },
  );
  g.path(
    [
      [27, 40],
      [42, 39],
      [55, 41],
    ],
    2.2,
    "r",
    { ragged: 0.4, seed: 24 },
  );
  g.path(
    [
      [68, 40],
      [80, 41],
    ],
    2.2,
    "r",
    { ragged: 0.4, seed: 25 },
  );
  // Boulder fields on the west slope.
  g.blob(14, 33, 2.2, 1.6, "r", { seed: 26 });
  g.blob(9, 50, 2.6, 1.8, "r", { seed: 27 });
  g.blob(64, 49, 2.4, 1.7, "r", { seed: 28 });
  // The spring under the cliff in the east.
  g.blob(66, 13, 4, 2.4, "w", { seed: 29, ragged: 0.2 });
  // Teal grass holding on where the slope is gentle.
  g.patches("_", ",", {
    scale: 5,
    threshold: 0.6,
    seed: 31,
    inside: { x: 0, y: 12, w: W, h: H - 12 },
  });
  g.blob(CAVE[0] + 2, 15, 12, 6, "_", { seed: 32, ragged: 0.15 });
  g.fray(",", "_", { seed: 33, passes: 1, scale: 3.2 });
  g.majority(",", "_", 4);
  return settle(g, [2, 46]);
}

const GRID = paintPlan();
const PLAN = GRID.toString();
const at = cellOf(PLAN);

// The cliff and the shadow play -----------------------------------------------------------------

const CLIFF_FOOT = 9 * T;

function cliff(): Placed {
  const frames = ["a", "b", "c", "b", "a", "c"];
  return {
    objects: [
      ...Array.from(
        { length: W / 4 },
        (_, k): Prop => ({
          prop: "cliff-face",
          frame: frames[k % frames.length] as string,
          at: [k * 64, CLIFF_FOOT],
          sort: CLIFF_FOOT - 8,
        }),
      ),
      { prop: "cave", at: [CAVE[0] * T, CLIFF_FOOT + 2], sort: CLIFF_FOOT - 6 },
      // The shapes' shadows on the rock behind the puppet wall, thrown by the fire.
      {
        prop: "wall-shadows",
        anim: "flicker",
        play: true,
        at: [FIRE[0] * T + 20, CLIFF_FOOT - 20],
        raw: true,
        sort: CLIFF_FOOT - 5,
      },
    ],
    overhead: [],
    shadows: [],
  };
}

function fireCourt(): Placed {
  const [fx, fy] = FIRE;
  return {
    objects: [
      { prop: "bonfire", anim: "burn", play: true, at: [fx * T + 8, fy * T + 12], raw: true },
      place("puppet-wall", fx - 2, 11),
      {
        prop: "torch",
        anim: "burn",
        play: true,
        at: [(CAVE[0] - 3) * T + 8, 10 * T + 6],
        raw: true,
      },
      {
        prop: "torch",
        anim: "burn",
        play: true,
        index: 1,
        at: [(CAVE[0] + 2) * T + 8, 10 * T + 6],
        raw: true,
      },
      // The guards' post west of the mouth.
      place("guard-post", 30, 11),
      // Benches in rows facing the wall, the chains broken.
      place("bench-stone", 42, 18),
      place("bench-stone", 47, 18),
      place("bench-stone", 39, 21),
      place("bench-stone", 45, 21),
      place("bench-stone", 51, 21),
    ],
    overhead: [],
    shadows: [],
  };
}

const DEAD_TREES: readonly Vec[] = [
  [8, 15],
  [26, 13],
  [62, 18],
  [12, 36],
  [44, 31],
  [66, 44],
  [30, 50],
  [22, 31],
  [58, 33],
  [71, 30],
  [20, 52],
  [50, 53],
  [36, 47],
];

function deadTrees(): Placed {
  return {
    objects: DEAD_TREES.map(([tx, ty], i) => place("dead-tree", tx, ty, { flip: i % 2 === 0 })),
    overhead: [],
    shadows: [],
  };
}

/** Boulders on the walkable slope, kept a tile clear of anything solid. */
const BOULDERS = scatter({ x: 6, y: 27, w: 68, h: 26 }, 9, 13, (tx, ty) => {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 3; dx++) {
      const c = at(tx + dx, ty + dy);
      if (c !== "_" && c !== ",") return false;
    }
  return !DEAD_TREES.some(([x, y]) => Math.abs(x - tx) < 4 && Math.abs(y - ty) < 3);
});

/** Where the valley grass stops being walkable: thorn, dead wood and stones mark the line. */
const EDGE = edgeLine(PLAN, "%:", "_,", 3, 41);

const placed = merge(cliff(), fireCourt(), deadTrees(), {
  objects: [
    ...EDGE.map(
      ([tx, ty], i): Prop => ({
        prop: i % 4 === 0 ? "dead-tree" : i % 2 ? "boulder" : "boulder-big",
        at: [tx * T + 8, ty * T + 14],
        ...(i % 3 ? { flip: true } : {}),
      }),
    ),
    ...BOULDERS.map(([tx, ty], i): Thing => place(i % 3 === 0 ? "boulder-big" : "boulder", tx, ty)),
    // Below the falls of the spring, a jar someone left to fill.
    { prop: "amphora", at: [1000, 250] },
  ],
});

/** Shadow seeping from the mouth down the slope, reaching sideways. */
const CRAWL: readonly [x: number, y: number, flip: boolean][] = [
  [600, 210, false],
  [700, 280, true],
  [560, 330, false],
  [680, 420, true],
  [470, 470, false],
  [760, 520, true],
  [600, 600, false],
  [380, 560, true],
  [860, 600, false],
  [520, 720, true],
  [300, 760, false],
  [980, 700, true],
  [700, 820, false],
];

/** Cut-outs dropped on the slope by whoever was carrying them, as far down as the valley. */
const DROPPED: readonly [x: number, y: number, frame: string][] = [
  [690, 250, "horse"],
  [520, 384, "jar"],
  [820, 470, "man"],
  [400, 650, "horse"],
  [940, 560, "jar"],
  [610, 760, "man"],
];

const details: (Decal | Prop)[] = [
  ...DROPPED.map(
    ([x, y, frame], i): Prop => ({
      prop: "cutout",
      frame,
      at: [x, y],
      ...(i % 2 ? { flip: true } : {}),
    }),
  ),
  ...CRAWL.map(
    ([x, y, flip], i): Prop => ({
      prop: "shadow-crawl",
      anim: "reach",
      play: true,
      index: i % 2,
      at: [x, y],
      raw: true,
      flip,
    }),
  ),
  ...(
    [
      [300, 160],
      [420, 170],
      [980, 160],
      [180, 300],
      [260, 420],
      [520, 460],
      [700, 690],
      [900, 640],
      [1080, 330],
      [360, 620],
      [140, 560],
    ] as const
  ).map(([x, y]): Decal => ({ decal: "cliff/scree", at: [x, y] })),
  { decal: "cliff/scree", at: [300, 160] },
  { decal: "cliff/scree", at: [880, 168] },
  { decal: "cliff/scree", at: [140, 260] },
  { decal: "cliff/scree", at: [1150, 230] },
];

const lights: LightSource[] = [
  {
    at: [FIRE[0] * T + 8, FIRE[1] * T],
    radius: 170,
    color: "gold.light",
    intensity: 1.1,
    flicker: { amount: 0.12, period: 0.6 },
    paint: {
      bands: ["greece", "dusk-fire"],
      at: [FIRE[0] * T + 8, FIRE[1] * T + 8],
      r: [84, 50],
      ragged: 10,
      pulse: { amount: 0.05, period: 0.6 },
    },
  },
  ...[CAVE[0] - 3, CAVE[0] + 2].map(
    (tx): LightSource => ({
      at: [tx * T + 8, 10 * T - 20],
      radius: 60,
      color: "gold.light",
      intensity: 0.7,
      flicker: { amount: 0.18, period: 0.45 },
      paint: { bands: ["dusk-fire"], at: [tx * T + 8, 10 * T + 6], r: [24, 12], ragged: 4 },
    }),
  ),
  // The guards' lamp under the awning.
  {
    at: [496, 190],
    radius: 40,
    color: "gold.light",
    intensity: 0.5,
    flicker: { amount: 0.1, period: 1.1 },
  },
];

const map: MapSource = {
  id: "p1-cave-mouth",
  name: "동굴 입구",
  seed: 1920,
  time: { clock: "19:20", phase: "dusk", weather: "clear" },
  theme: "greece-dusk",
  sky: "plum.dark",
  ambient: { color: "plum.light", intensity: 0.62, unlit: "greece" },
  plan: PLAN,
  legend: GREEK_LEGEND,
  backdrop: [{ prop: "dusk-sky", at: [0, 0], repeat: 6, raw: true }],
  details,
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights,
  atmosphere: [
    { prop: "embers", anim: "rise", play: true, at: [FIRE[0] * T - 4, FIRE[1] * T + 4] },
    { prop: "embers", anim: "rise", play: true, index: 7, at: [FIRE[0] * T + 6, FIRE[1] * T] },
  ],
  emitters: [
    {
      sprite: "moths",
      anim: "fly",
      area: { x: 680, y: 190, w: 100, h: 60 },
      count: 4,
      life: 5,
      velocity: [3, -2],
    },
    {
      sprite: "mote",
      area: { x: 80, y: 180, w: 1100, h: 700 },
      count: 30,
      life: 7,
      velocity: [-3, 4],
    },
  ],
  spawns: {
    main: { tile: [2, 46], facing: "right" },
    "p1-olive-road": { tile: [2, 46], facing: "right" },
    "p1-agora-edge": { tile: [77, 49], facing: "left" },
    "p1-shadow-cave": { tile: [CAVE[0] - 1, 11] },
  },
  landmark: { name: "그림자 벽", tile: [FIRE[0], 12] },
  blocks: [{ x: FIRE[0], y: FIRE[1], w: 1, h: 1 }],
  portals: [
    {
      id: "olive-road",
      rect: { x: 0, y: 44, w: 1, h: 4 },
      to: "p1-olive-road",
      spawn: "p1-cave-mouth",
    },
    {
      id: "agora-edge",
      rect: { x: 79, y: 47, w: 1, h: 4 },
      to: "p1-agora-edge",
      spawn: "p1-cave-mouth",
    },
    {
      id: "shadow-cave",
      rect: { x: CAVE[0] - 2, y: 6, w: 4, h: 1 },
      to: "p1-shadow-cave",
      spawn: "p1-cave-mouth",
    },
  ],
  interactables: [
    { id: "roster", kind: "lore", rect: { x: 30, y: 11, w: 2, h: 1 } },
    { id: "puppet-wall", kind: "lore", rect: { x: FIRE[0] - 2, y: 11, w: 4, h: 1 } },
    { id: "benches", kind: "sit", rect: { x: 39, y: 21, w: 15, h: 1 } },
  ],
  zones: [
    { id: "west-gate", kind: "safe", rect: { x: 0, y: 41, w: 9, h: 10 } },
    { id: "east-gate", kind: "safe", rect: { x: 71, y: 44, w: 9, h: 10 } },
    { id: "cave-mouth", kind: "safe", rect: { x: 34, y: 6, w: 9, h: 6 } },
    { id: "fire", kind: "gather", rect: { x: 42, y: 13, w: 10, h: 5 } },
    { id: "front-row", kind: "elite", rect: { x: 38, y: 23, w: 16, h: 5 } },
    // At full count about 150: 그림자 thickest near the mouth and seeping down, 공기의 정령
    // charging along the open terraces, 흙의 정령 among the west boulders, 유리수 병사 on the
    // valley path, 물의 정령 at the spring, 오답 everywhere, the tortoise somewhere below.
    {
      id: "slope",
      kind: "monsters",
      rect: { x: 3, y: 9, w: 74, h: 47 },
      monster: "odap",
      density: 0.8,
    },
    {
      id: "seep",
      kind: "monsters",
      rect: { x: 16, y: 9, w: 48, h: 30 },
      monster: "cave-shadow",
      density: 3,
    },
    {
      id: "terraces",
      kind: "monsters",
      rect: { x: 3, y: 26, w: 74, h: 14 },
      monster: "element-air",
      density: 2.6,
    },
    {
      id: "boulders",
      kind: "monsters",
      rect: { x: 3, y: 27, w: 40, h: 28 },
      monster: "element-earth",
      density: 2.3,
    },
    {
      id: "valley",
      kind: "monsters",
      rect: { x: 3, y: 42, w: 74, h: 14 },
      monster: "rational",
      density: 2.6,
    },
    {
      id: "spring",
      kind: "monsters",
      rect: { x: 54, y: 9, w: 23, h: 15 },
      monster: "element-water",
      density: 4,
    },
    {
      id: "below",
      kind: "monsters",
      rect: { x: 14, y: 42, w: 50, h: 12 },
      monster: "tortoise",
      density: 0.15,
    },
  ],
};

export default map;
