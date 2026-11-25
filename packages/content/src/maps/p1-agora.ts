import type { LightSource, MapSource } from "./format.ts";
import { blob, GREEK_LEGEND, merge, type Placed, px, settle, trees } from "./greek.ts";
import type { Decal, Prop, Vec } from "./layers.ts";
import { fractal } from "./noise.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 아고라, the town inside the rift, where it is always 15:10. Students come through a wound in
 * the west of the square, a tear with its paper edges lifting and the 운동장's night still
 * lying in it, and step out into a dry Greek afternoon. The painted stoa closes the north side,
 * its red panels full of hoplites and ships; the market fills the east under striped awnings,
 * the owl stall among them selling what the era sells; the heroes' monument in the middle
 * carries the town's 과제 on whitened boards, and the fountain house in the south-east is where
 * everyone ends up. 아리스토텔레스 lectures on the stoa's steps, 제논 paces the market lane,
 * a Pythagorean counts pebbles by the fountain, and 아리스타르코스 has pegged out a shadow by
 * the west hill and will not have it stepped on. Roads leave by gates at every side.
 */

const T = 16;
const W = 72;
const H = 56;

const wave = (v: number, seed: number, scale = 7) => fractal(v, 0.5, scale, seed) * 2 - 1;

/** The wound: where the rift opens on this side, in tiles. */
const WOUND: Vec = [7, 28];
/** The painted stoa: its west end tile, bay count, and the row its steps are on. */
const STOA = { x: 17, bays: 15, steps: 8 };
const MONUMENT: Vec = [29, 20];
const KRENE: Vec = [45, 34];
const GNOMON: Vec = [11, 14];
const ALTAR: Vec = [19, 33];
/** The orchestra: the round dancing floor south of the square. */
const ORCHESTRA: Vec = [27, 43];

function paintPlan(): string {
  const g = new PlanGrid(W, H, "_");
  // The sky over the ridge to the north, and the ridge itself.
  for (let x = 0; x < W; x++) {
    const ridge = 5 + Math.round(wave(x, 3, 6) * 1.2);
    for (let y = 0; y < H; y++) {
      if (y < 3) g.set(x, y, "~");
      else if (y < ridge) g.set(x, y, "r");
    }
  }
  // Hills on the west and east, dry slopes on the south, all past walking.
  for (let y = 3; y < H; y++) {
    const west = Math.round(3 + wave(y, 5, 6) * 1.4);
    const east = Math.round(W - 4 + wave(y, 7, 6) * 1.4);
    for (let x = 0; x < west; x++) g.set(x, y, y < 20 ? "r" : "%");
    for (let x = east; x < W; x++) g.set(x, y, y < 22 ? "r" : "%");
  }
  for (let x = 0; x < W; x++) {
    const south = Math.round(H - 4 + wave(x, 9, 6) * 1.3);
    for (let y = south; y < H; y++) g.set(x, y, "%");
  }
  // Nothing walks behind the stoa: the ridge comes down to its roof.
  g.rect(STOA.x - 7, 3, STOA.bays * 2 + 16, STOA.steps - 3, "r");
  // The west hill, where the survey is pegged out at its foot.
  g.blob(5, 9, 6, 5, "r", { seed: 11, ragged: 0.2 });
  g.blob(64, 6, 8, 3.5, "r", { seed: 12, ragged: 0.25 });
  // Dry grass on the town's edges and between the roads.
  g.patches("_", ",", { scale: 6, threshold: 0.52, seed: 21 });
  // The square, the stoa's apron and the market lane stay beaten earth.
  g.blob(32, 24, 17, 10, "_", { seed: 22, ragged: 0.15, onto: "," });
  g.rect(STOA.x - 1, STOA.steps, STOA.bays * 2 + 4, 3, "_");
  g.rect(49, 12, 18, 16, "_", ",");
  // Roads out: to the colonnade (east), the Lyceum (north-east), the olive road (south), the cave
  // mouth (north-west) and the town's edge (south-west).
  const roads: readonly (readonly Vec[])[] = [
    [
      [44, 27],
      [58, 28],
      [72, 28],
    ],
    [
      [56, 18],
      [64, 12],
      [72, 11],
    ],
    [
      [36, 36],
      [35, 46],
      [35, 56],
    ],
    [
      [14, 18],
      [6, 12],
      [-1, 11],
    ],
    [
      [18, 36],
      [8, 42],
      [-1, 45],
    ],
  ];
  for (const [i, r] of roads.entries()) g.path(r, 4, "_", { seed: 30 + i, ragged: 0.6 });
  // Paving: round the monument, along the stoa's front, round the fountain and the altar.
  g.blob(MONUMENT[0] + 2.5, MONUMENT[1] + 1, 8.5, 5, "m", { seed: 41, ragged: 0.18 });
  g.rect(STOA.x, STOA.steps + 1, STOA.bays * 2 + 2, 2, "m");
  g.blob(KRENE[0] + 2, KRENE[1] + 3, 5.5, 3.2, "m", { seed: 42, ragged: 0.15 });
  g.blob(ALTAR[0] + 1, ALTAR[1] + 0.5, 3.4, 2.4, "m", { seed: 43, ragged: 0.1 });
  g.blob(ORCHESTRA[0] + 0.5, ORCHESTRA[1] + 0.5, 7, 5, "_", { seed: 45, ragged: 0.1 });
  g.patches("m", "_", { scale: 2.2, threshold: 0.8, seed: 44 });
  g.fray(",", "_", { seed: 51, passes: 1, scale: 2.6 });
  g.majority(",", "_", 2);
  g.majority("r", "%", 1);
  settle(g, [WOUND[0] + 8, WOUND[1]]);
  // The wound: the 운동장's night, sand in the middle, its lawn round the edge.
  g.blob(WOUND[0], WOUND[1], 4.2, 5.4, "g", { seed: 61, ragged: 0.22 });
  g.blob(WOUND[0] + 0.6, WOUND[1] + 0.8, 1.8, 3.2, "n", { seed: 62, ragged: 0.3, onto: "g" });
  g.separate("n", "_,mr%:", "g");
  return g.toString();
}

const PLAN = paintPlan();

// The stoa -------------------------------------------------------------------------------------

/** Panels in order along the stoa: the battle, the horsemen, the fleet, a plain stretch, a door. */
const PANELS = [
  "door",
  "hoplites",
  "hoplites",
  "horse",
  "plain",
  "ship",
  "ship",
  "hoplites",
  "horse",
  "horse",
  "plain",
  "ship",
  "hoplites",
  "plain",
  "door",
] as const;

function stoa(): Partial<Placed> {
  const foot = (STOA.steps + 1) * T - 1;
  const sort = STOA.steps * T;
  const x0 = STOA.x * T;
  return {
    objects: [
      { prop: "stoa-end", frame: "w", at: [x0 - T, foot], sort },
      ...PANELS.map(
        (frame, i): Prop => ({ prop: "stoa-bay", frame, at: [x0 + i * 2 * T, foot], sort }),
      ),
      { prop: "stoa-end", frame: "e", at: [x0 + PANELS.length * 2 * T, foot], sort },
    ],
  };
}

// The market -----------------------------------------------------------------------------------

const STALLS: readonly [string, number, number][] = [
  ["olives", 50, 14],
  ["owl", 53, 14],
  ["fish", 56, 14],
  ["figs", 59, 14],
  ["pots", 62, 14],
  ["scrolls", 51, 20],
  ["olives", 54, 20],
  ["figs", 57, 20],
  ["fish", 60, 20],
];

function market(): Partial<Placed> {
  return {
    objects: [
      ...STALLS.map(([frame, tx, ty]) => place("stall", tx, ty, { frame })),
      // Stock waiting behind and between the stalls.
      place("pithos", 65, 14),
      place("pithos", 63, 20),
      { prop: "amphora", at: [px(65, 16)[0], px(65, 16)[1] + 4] },
      { prop: "amphora-tipped", at: [px(64, 22)[0], px(64, 22)[1] + 5] },
      place("cart", 47, 18, { flip: true }),
      place("cart", 64, 25),
      { prop: "amphora", at: [px(48, 23)[0], px(48, 23)[1] + 6] },
    ],
  };
}

// Places -----------------------------------------------------------------------------------------

const OLIVES: readonly Vec[] = [
  [24, 15],
  [41, 15],
  [14, 24],
  [24, 41],
  [52, 37],
  [40, 45],
  [60, 42],
  [10, 48],
  [56, 47],
  [16, 48],
  [48, 43],
  [64, 37],
  [37, 31],
  [8, 38],
];
const CYPRESSES: readonly Vec[] = [
  [3, 17],
  [15, 6],
  [52, 6],
  [69, 16],
  [4, 34],
  [68, 34],
  [30, 51],
  [41, 51],
  [6, 52],
  [66, 46],
];

/** Pebbles laid out in the dust as numbers: one, then three, six, ten, the triangles. */
function pebbles(x: number, y: number): Prop[] {
  const out: Prop[] = [];
  for (let row = 0; row < 4; row++)
    for (let k = 0; k <= row; k++)
      out.push({
        prop: "pebble",
        frame: `p${(row + k) % 3}`,
        at: [Math.round(x + k * 7 - row * 3.5), y + row * 6],
      });
  return out;
}

const lights: LightSource[] = [
  // The wound: the school's night lying in the afternoon, a cool rim round it.
  {
    at: px(WOUND[0], WOUND[1]),
    radius: 96,
    color: "navy.light",
    intensity: 0.4,
  },
  // The altar's fire.
  {
    at: [ALTAR[0] * T + 16, ALTAR[1] * T + 4],
    radius: 40,
    color: "gold.light",
    intensity: 0.4,
    flicker: { amount: 0.2, period: 0.7 },
  },
];

const placed = merge(stoa(), market(), trees("olive", OLIVES, 2), trees("cypress", CYPRESSES, 1), {
  objects: [
    place("heroes", MONUMENT[0], MONUMENT[1]),
    place("krene", KRENE[0], KRENE[1], { anim: "run", play: true }),
    // The altar of the twelve gods, where every road out is measured from.
    place("altar", ALTAR[0], ALTAR[1]),
    {
      prop: "altar-fire",
      anim: "burn",
      play: true,
      at: [ALTAR[0] * T + 16, ALTAR[1] * T + 6],
      raw: true,
      sort: ALTAR[1] * T + 15,
    },
    // 아리스타르코스's gnomon, its shadow pegged east.
    place("gnomon", GNOMON[0], GNOMON[1]),
    ...[1, 2, 3, 4].map(
      (k): Prop => ({ prop: "stake", at: [(GNOMON[0] + k * 1.5) * T + 8, GNOMON[1] * T + 13 + k] }),
    ),
    // Boundary stones where the roads enter the square, a herm at each gate.
    ...(
      [
        [44, 25],
        [55, 26],
        [34, 37],
        [16, 19],
        [19, 37],
        [56, 17],
      ] as const
    ).map(([x, y]): Prop => ({ prop: "horos", at: [x * T + 8, y * T + 12] })),
    place("herm", 69, 25),
    place("herm", 37, 51),
    place("herm", 3, 13),
    place("herm", 3, 41),
    place("herm", 68, 9),
    // Jars by the fountain, waiting to be filled; one already full and leaking.
    place("pithos", 50, 36),
    { prop: "amphora", at: [px(43, 37)[0], px(43, 37)[1] + 4] },
    { prop: "amphora", at: [px(44, 38)[0] + 4, px(44, 38)[1] + 4] },
    { prop: "amphora-tipped", at: [px(50, 38)[0], px(50, 38)[1] + 5] },
    // Statues on the square.
    place("statue", 26, 27),
    place("statue", 42, 22, { flip: true }),
    place("column-stump", 21, 23, { frame: "high" }),
    // Rocks on the hills.
    place("boulder-big", 7, 7),
    place("boulder", 13, 4),
    place("boulder", 60, 6),
    place("boulder-big", 66, 4),
    place("boulder", 2, 25),
    // What blew through the wound: a page, a sneaker, a ball.
    { prop: "sneaker", at: [px(13, 31)[0], px(13, 31)[1]] },
    { prop: "ball", at: [px(14, 25)[0], px(14, 25)[1]] },
  ],
  shadows: [
    blob(ALTAR[0] * T + 18, ALTAR[1] * T + 14, 14, 3, 2),
    // The stoa's shade on its own steps and a strip of the apron, the sun being west of south.
    {
      poly: [
        [(STOA.x - 1) * T, (STOA.steps + 1) * T - 6],
        [(STOA.x + STOA.bays * 2 + 1) * T, (STOA.steps + 1) * T - 6],
        [(STOA.x + STOA.bays * 2 + 1) * T + 10, (STOA.steps + 1) * T + 5],
        [(STOA.x - 1) * T + 10, (STOA.steps + 1) * T + 5],
      ],
    },
  ],
});

const details: (Decal | Prop)[] = [
  // The gnomon's shadow, pegged and chalked.
  ...[0, 1, 2, 3, 4, 5].map(
    (k): Prop => ({
      prop: "chalk-h",
      frame: `h${k % 4}`,
      at: [(GNOMON[0] + k) * T + 8, GNOMON[1] * T + 14 + Math.round(k * 0.6)],
    }),
  ),
  // The 운동장's chalk line running on into the night inside the wound.
  ...[-2, -1, 0, 1].map(
    (k): Prop => ({
      prop: "chalk-v",
      frame: `v${(k + 4) % 4}`,
      at: [WOUND[0] * T + 6, (WOUND[1] + k) * T + 4],
    }),
  ),
  ...pebbles(40 * T + 8, 38 * T + 4),
  { prop: "threshing", at: px(ORCHESTRA[0], ORCHESTRA[1]) },
  { decal: "marble-dust/shards", at: [520, 360] },
  { decal: "marble-dust/pebbles", at: [610, 300] },
  { decal: "marble-dust/shards", at: [300, 520] },
  { decal: "marble-dust/pebbles", at: [740, 600] },
  { prop: "weeds", at: [280, 640] },
  { prop: "weeds", at: [900, 520] },
];

const map: MapSource = {
  id: "p1-agora",
  name: "아고라",
  seed: 1510,
  time: { clock: "15:10", phase: "noon", weather: "clear" },
  theme: "greece",
  shade: "greece-shade",
  sky: "navy.pale",
  ambient: { color: "gold.pale", intensity: 1 },
  plan: PLAN,
  legend: {
    ...GREEK_LEGEND,
    n: { terrain: "sand", theme: "field-night" },
    g: { terrain: "grass", theme: "field-night" },
  },
  edges: [{ overlay: "rift", inside: "ng" }],
  backdrop: [
    { prop: "hellas-sky", at: [0, 0], repeat: 5, raw: true },
    { prop: "attica", at: [-24, 48], raw: true },
  ],
  details,
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights,
  atmosphere: [
    // The wound's lip still smoulders where the page tore, and scraps lift off it.
    ...(
      [
        [-36, -50, 0],
        [40, -30, 6],
        [-44, 30, 11],
        [34, 60, 3],
      ] as const
    ).map(
      ([dx, dy, index]): Prop => ({
        prop: "embers",
        anim: "rise",
        play: true,
        index,
        at: [WOUND[0] * T + 8 + dx, WOUND[1] * T + 8 + dy],
      }),
    ),
    {
      prop: "scrap",
      anim: "tumble",
      play: true,
      at: [WOUND[0] * T + 40, WOUND[1] * T - 30],
      drift: { to: [WOUND[0] * T + 110, WOUND[1] * T - 70], period: 5 },
    },
    {
      prop: "scrap",
      anim: "tumble",
      play: true,
      index: 1,
      at: [WOUND[0] * T + 30, WOUND[1] * T + 50],
      drift: { to: [WOUND[0] * T + 120, WOUND[1] * T + 30], period: 6, phase: 2 },
    },
  ],
  emitters: [
    // Pages of the notebook still lifting out of the wound and blowing across the square.
    {
      sprite: "page-m",
      anim: "turn",
      area: { x: WOUND[0] * T - 24, y: WOUND[1] * T - 40, w: 48, h: 60 },
      count: 2,
      life: 12,
      velocity: [30, -6],
    },
    {
      sprite: "page-s",
      anim: "turn",
      area: { x: WOUND[0] * T - 30, y: WOUND[1] * T - 50, w: 60, h: 80 },
      count: 4,
      life: 14,
      velocity: [26, -4],
    },
    {
      sprite: "mote",
      area: { x: 64, y: 140, w: 1000, h: 700 },
      count: 34,
      life: 7,
      velocity: [6, -2],
    },
  ],
  spawns: {
    main: { tile: [WOUND[0] + 8, WOUND[1]], facing: "right" },
    "campus-field": { tile: [WOUND[0] + 8, WOUND[1]], facing: "right" },
    "p1-colonnade": { tile: [69, 28], facing: "left" },
    "p1-lyceum": { tile: [69, 11], facing: "left" },
    "p1-olive-road": { tile: [35, 52], facing: "up" },
    "p1-cave-mouth": { tile: [2, 11], facing: "right" },
    "p1-agora-edge": { tile: [2, 45], facing: "right" },
  },
  landmark: { name: "채색 주랑", tile: [STOA.x + STOA.bays, STOA.steps - 2] },
  blocks: [{ x: STOA.x - 1, y: STOA.steps - 4, w: STOA.bays * 2 + 2, h: 4 }],
  portals: [
    {
      id: "rift",
      rect: { x: WOUND[0] - 1, y: WOUND[1] - 1, w: 3, h: 3 },
      to: "campus-field",
      spawn: "p1-agora",
    },
    { id: "colonnade", rect: { x: 71, y: 26, w: 1, h: 4 }, to: "p1-colonnade", spawn: "p1-agora" },
    { id: "lyceum", rect: { x: 71, y: 9, w: 1, h: 4 }, to: "p1-lyceum", spawn: "p1-agora" },
    {
      id: "olive-road",
      rect: { x: 33, y: 55, w: 4, h: 1 },
      to: "p1-olive-road",
      spawn: "p1-agora",
    },
    { id: "cave-mouth", rect: { x: 0, y: 9, w: 1, h: 4 }, to: "p1-cave-mouth", spawn: "p1-agora" },
    { id: "agora-edge", rect: { x: 0, y: 42, w: 1, h: 4 }, to: "p1-agora-edge", spawn: "p1-agora" },
  ],
  interactables: [
    { id: "heroes", kind: "quests", rect: { x: MONUMENT[0], y: MONUMENT[1], w: 5, h: 1 } },
    { id: "era-shop", kind: "shop", rect: { x: 53, y: 14, w: 3, h: 1 } },
    { id: "stoa-steps", kind: "sit", rect: { x: STOA.x, y: STOA.steps, w: STOA.bays * 2, h: 1 } },
    { id: "krene", kind: "lore", rect: { x: KRENE[0], y: KRENE[1], w: 4, h: 2 } },
    { id: "gnomon", kind: "lore", rect: { x: GNOMON[0], y: GNOMON[1], w: 1, h: 1 } },
    { id: "altar", kind: "lore", rect: { x: ALTAR[0], y: ALTAR[1], w: 2, h: 1 } },
  ],
  zones: [
    { id: "agora", kind: "safe", rect: { x: 0, y: 0, w: W, h: H } },
    { id: "fountain", kind: "gather", rect: { x: KRENE[0] - 3, y: KRENE[1] + 1, w: 10, h: 6 } },
    {
      id: "stoa-front",
      kind: "gather",
      rect: { x: STOA.x, y: STOA.steps, w: STOA.bays * 2, h: 4 },
    },
    { id: "market", kind: "gather", rect: { x: 49, y: 16, w: 18, h: 4 } },
    {
      id: "monument",
      kind: "gather",
      rect: { x: MONUMENT[0] - 3, y: MONUMENT[1] + 1, w: 11, h: 4 },
    },
  ],
  marks: {
    wound: WOUND,
    monument: [MONUMENT[0] + 2, MONUMENT[1] + 1],
    "era-shop": [54, 15],
    fountain: [KRENE[0] + 2, KRENE[1] + 3],
    // Where the hub's helpers stand when an escort notice is up.
    "pythagorean-junior": [38, 39],
    "lyceum-scribe": [36, 10],
    "survey-helper": [16, 16],
  },
  npcs: [
    { speaker: "aristotle", tile: [STOA.x + STOA.bays, STOA.steps + 2], facing: "down" },
    { speaker: "zeno", tile: [57, 18], facing: "left" },
    { speaker: "pythagoreans", tile: [41, 37], facing: "down" },
    { speaker: "aristarchus", tile: [GNOMON[0] - 1, GNOMON[1] + 1], facing: "right" },
    { speaker: "guard", tile: [5, 13], facing: "right" },
  ],
};

export default map;
