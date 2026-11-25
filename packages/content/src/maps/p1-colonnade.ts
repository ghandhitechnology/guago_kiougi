import type { LightSource, MapSource } from "./format.ts";
import {
  blob,
  deepen,
  fieldLegend,
  foam,
  merge,
  type Placed,
  px,
  rockPiles,
  rubble,
  settle,
  sparkles,
  track,
  trees,
} from "./greek.ts";
import type { Decal, Prop, Vec } from "./layers.ts";
import { fractal } from "./noise.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 무너진 열주, the first thing through the rift: a headland over the Aegean stopped at 14:40, the
 * sun high and white, the sea on two sides and a hot wind off it. A temple stood here. Three of
 * its columns still hold a piece of the roof beam; the rest lie across the dust to the east in
 * the order they fell, which is the joke the 오답 will not get. 아리스타르코스's helper has
 * pegged out a gnomon's shadow on the north terrace and will shout at anyone who steps on it, a
 * fisherman's boat waits on the beach with its eye on the sea, and the round threshing floor
 * south of the temple is where the field's worst 오답 comes to stand. High in the sky a tear
 * shows the campus at night, and pages of the notebook blow out of it.
 */

const T = 16;
const W = 80;
const H = 60;

/** Noise along one axis, in [-1, 1]. */
const wave = (v: number, seed: number, scale = 7) => fractal(v, 0.5, scale, seed) * 2 - 1;

/** Where the north coast runs, per column: a headland under the temple, a bay to its east. */
function northCoast(x: number): number {
  const headland = Math.exp(-(((x - 37) / 9) ** 2)) * 2.5;
  const bay = Math.exp(-(((x - 55) / 5) ** 2)) * 3;
  return Math.round(9.5 - headland + bay + wave(x, 3) * 1.4);
}

/** Where the east coast runs, per row: a cove behind the beach where the boat lies. */
function eastCoast(y: number): number {
  const cove = Math.exp(-(((y - 31) / 4) ** 2)) * 4;
  return Math.round(63.5 - cove + wave(y, 5) * 1.6);
}

/** Where the west hills give way, per row: a cut for the road to the 아고라. */
function westHills(y: number): number {
  if (y >= 25 && y <= 32) return 0;
  return Math.round(4 + wave(y, 7, 5) * 2.6 + (y > 40 ? (y - 40) * 0.12 : 0));
}

/** Where the southern slope stops being walkable, per column: a gap for the grove road. */
function southSlope(x: number): number {
  if (x >= 33 && x <= 40) return H;
  return Math.round(52.5 + wave(x, 9) * 1.6);
}

function paintPlan(): string {
  const g = new PlanGrid(W, H, ",");
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y < 5) g.set(x, y, "~");
      else if (y < northCoast(x) || x > eastCoast(y)) g.set(x, y, "w");
      else if (x < westHills(y)) g.set(x, y, "r");
      else if (y > southSlope(x)) g.set(x, y, "%");
    }
  }
  // Beaches: dust a few tiles in from the water, deeper where the waves have room.
  for (let y = 5; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g.at(x, y) !== ",") continue;
      const reach = 2 + Math.round(fractal(x, y, 5, 17) * 2);
      let near = false;
      for (let dy = -reach; dy <= reach && !near; dy++)
        for (let dx = -reach; dx <= reach; dx++) if (g.at(x + dx, y + dy) === "w") near = true;
      if (near) g.set(x, y, "_");
    }
  }
  // Worn ground where people walk and fight: the roads, the temple's apron, the floor's yard.
  g.patches(",", "_", { scale: 5, threshold: 0.66, seed: 41 });
  g.path(
    [
      [0, 28],
      [9, 29],
      [17, 25],
      [27, 21],
    ],
    5,
    "_",
    { seed: 46 },
  );
  g.path(
    [
      [12, 30],
      [22, 37],
      [30, 42],
    ],
    4,
    "_",
    { seed: 48 },
  );
  g.path(
    [
      [36, 24],
      [36, 34],
      [36, 45],
      [37, 60],
    ],
    5,
    "_",
    { seed: 47 },
  );
  g.path(
    [
      [44, 22],
      [52, 28],
      [57, 33],
    ],
    6,
    "_",
    { seed: 49 },
  );
  g.blob(36, 18, 12, 9, "_", { seed: 42, ragged: 0.18, onto: ",%" });
  g.blob(50, 20, 7, 6, "_", { seed: 43, ragged: 0.3, onto: "," });
  g.blob(9, 29, 7, 5.5, "_", { seed: 44, ragged: 0.25, onto: "," });
  g.blob(36, 45, 7.5, 5, "_", { seed: 45, ragged: 0.2, onto: "," });
  // Limestone breaking through the meadow, to fight around.
  g.blob(19, 44, 2.4, 1.7, "r", { seed: 31, onto: ",_" });
  g.blob(53, 40, 2.1, 1.5, "r", { seed: 32, onto: ",_" });
  g.blob(14, 13, 2.2, 1.5, "r", { seed: 33, onto: ",_" });
  // No edge between grass and dust runs along the grid: wobble it, then round it into blobs.
  g.fray(",", "_", { seed: 51, passes: 1, scale: 2.6 });
  g.majority(",", "_", 2);
  g.majority("r", "%", 2);
  // The temple's platform, its paving lifted and gone in places, the edges broken; the row
  // under the standing columns is whole.
  const platform = { x: 29, y: 13, w: 15, h: 11 };
  g.rect(platform.x, platform.y, platform.w, platform.h, "m");
  g.patches("m", "_", { scale: 2.4, threshold: 0.74, seed: 52, inside: platform });
  g.fray("m", "_", { seed: 53, passes: 1, scale: 2.2 });
  g.majority("m", "_", 1);
  g.rect(30, 13, 8, 3, "m");
  return settle(g, [1, 28]).toString();
}

const PLAN = paintPlan();
/** The plan with the deep marked out past the shallows; same collision. */
const GROUND = deepen(PLAN);

// The temple --------------------------------------------------------------------------------------

/** The three columns still standing, under the beam. Feet on row 14. */
const STANDING = [31, 33, 35] as const;
const COL_Y = 14;

function temple(): Placed {
  const foot = (tx: number) => [tx * T + 8, (COL_Y + 1) * T - 2] as Vec;
  return {
    objects: [
      ...STANDING.map((tx): Prop => ({ prop: "column", frame: "whole", at: foot(tx) })),
      // The rest of the peristyle: stumps where columns stood, broken low and high.
      place("column-stump", 38, 14, { frame: "high" }),
      place("column-stump", 42, 14, { frame: "low" }),
      place("column-stump", 29, 18, { frame: "high" }),
      place("column-stump", 29, 22, { frame: "low" }),
      place("column-stump", 33, 23, { frame: "low" }),
      place("column-stump", 39, 23, { frame: "high" }),
      place("column-stump", 43, 19, { frame: "low" }),
      // The east colonnade, fallen east in a row, drum by drum.
      place("shaft-fallen", 44, 15),
      place("shaft-fallen", 47, 16, { frame: "snapped" }),
      place("capital-fallen", 52, 17),
      place("shaft-fallen", 45, 21),
      place("capital-fallen", 49, 22),
      { prop: "drum", at: [808, 300] },
      { prop: "drum", at: [842, 316], flip: true },
      { prop: "drum", at: [770, 392] },
      { prop: "drum", at: [600, 300] },
      // The roof came down in front of the columns: the pediment's half, its corner ornament.
      place("pediment-fallen", 30, 17),
      place("acroterion", 33, 17),
      // A kore from the porch, on her back where she fell.
      place("statue-toppled", 40, 21),
      // The temple's own altar, out front where the sacrifices were made.
      place("altar", 44, 26),
      // On the platform: one shaft fell inward across the cella, an amphora rolled to its edge.
      place("shaft-fallen", 36, 18, { frame: "snapped" }),
      { prop: "amphora", at: [658, 360] },
      { prop: "amphora-tipped", at: [520, 268] },
    ],
    overhead: [
      ...STANDING.map((tx): Prop => ({ prop: "column-capital", at: foot(tx) })),
      { prop: "entablature", at: foot(33) },
    ],
    shadows: [
      // The beam's shadow on the platform, and each column's.
      {
        poly: [
          [496, 238],
          [580, 238],
          [592, 250],
          [508, 250],
        ],
      },
      ...STANDING.map((tx) => blob(tx * T + 14, (COL_Y + 1) * T, 7, 3, 2)),
    ],
  };
}

// Places ----------------------------------------------------------------------------------------

const OLIVES: readonly Vec[] = [
  [15, 39],
  [26, 49],
  [45, 43],
  [57, 47],
  [10, 47],
  [22, 33],
  [49, 34],
  [18, 19],
];
const CYPRESSES: readonly Vec[] = [
  [8, 22],
  [8, 35],
  [11, 24],
  [11, 34],
  [2, 15],
  [3, 41],
  [63, 55],
  [3, 12],
  [1, 19],
  [1, 36],
  [1, 46],
];

/** The grove the meadow runs into past the south edge, where nobody walks. */
const BEYOND_OLIVES: readonly Vec[] = [
  [4, 56],
  [12, 55],
  [20, 57],
  [27, 55],
  [45, 56],
  [52, 55],
  [59, 57],
  [8, 59],
  [16, 59],
  [56, 59],
  [48, 59],
];
const BEYOND_CYPRESSES: readonly Vec[] = [
  [30, 57],
  [43, 58],
  [24, 59],
  [65, 57],
];

/** Tortoise tracks wandering from the beach across the meadow and back toward the sea. */
function tracks(): Prop[] {
  const out: Prop[] = [];
  const route: readonly Vec[] = [
    [58, 38],
    [50, 44],
    [40, 50],
    [28, 46],
    [22, 40],
    [26, 35],
  ];
  for (let k = 0; k + 1 < route.length; k++) {
    const [x0, y0] = route[k] as Vec;
    const [x1, y1] = route[k + 1] as Vec;
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i < n; i += 2) {
      const x = (x0 + ((x1 - x0) * i) / n) * T;
      const y = (y0 + ((y1 - y0) * i) / n) * T;
      const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0) * 0.5;
      out.push({
        prop: "tracks",
        frame: steep ? "d" : "h",
        at: [Math.round(x), Math.round(y)],
        ...(x1 < x0 ? { flip: true } : {}),
      });
    }
  }
  return out;
}

/** 아리스타르코스's survey: the gnomon, its shadow pegged east with stakes and a cord. */
const GNOMON: Vec = [23, 11];

const lights: LightSource[] = [
  // The altar's fire: small, warm, flickering against the noon.
  {
    at: [752, 184],
    radius: 48,
    color: "gold.light",
    intensity: 0.5,
    flicker: { amount: 0.2, period: 0.7 },
  },
  // The tear's cold night light, falling on the north terrace.
  {
    at: [904, 120],
    radius: 120,
    color: "navy.pale",
    intensity: 0.7,
    flicker: { amount: 0.06, period: 3.2 },
  },
];

const placed = merge(
  { objects: rockPiles(PLAN, 2, 17) },
  temple(),
  trees("olive", OLIVES, 1),
  trees("cypress", CYPRESSES),
  trees("olive", BEYOND_OLIVES, 3),
  trees("cypress", BEYOND_CYPRESSES, 1),
  {
    objects: [
      // The road in from the 아고라: a herm at the fork.
      place("herm", 13, 27),
      // The kouros at the crossroads south of the temple, and his head.
      place("statue", 38, 31),
      // The survey: gnomon and stakes along its shadow.
      place("gnomon", GNOMON[0], GNOMON[1]),
      ...[1, 2, 3, 4].map(
        (k): Prop => ({
          prop: "stake",
          at: [(GNOMON[0] + k * 1.4) * T + 8, GNOMON[1] * T + 12 + k],
        }),
      ),
      // The altar on the north terrace, its fire.
      place("altar", 46, 11),
      { prop: "altar-fire", anim: "burn", play: true, at: [752, 182], raw: true, sort: 191 },
      // The beach: the boat drawn up, nets drying, a few amphorae.
      place("boat", 56, 29),
      place("nets", 58, 38),
      { prop: "amphora", at: [890, 496] },
      { prop: "amphora-tipped", at: [868, 510] },
      // Rocks standing in the sea off the headland and the beach.
      place("boulder-big", 67, 18),
      place("boulder", 69, 21),
      place("boulder", 66, 42),
      place("boulder-big", 21, 7),
      place("boulder", 8, 8),
      place("boulder", 72, 33),
      // Rocks to kite around, on the meadow and the beach.
      place("boulder-big", 27, 38),
      place("boulder", 31, 51),
      place("boulder", 42, 39),
      place("boulder-big", 52, 26),
      place("boulder", 61, 44),
      place("boulder", 9, 39),
      place("boulder", 16, 49),
      place("boulder", 24, 15),
      // What blew through the tear: the 운동장's cone on a stump, a ball, a page.
      { prop: "marker-cone", at: [536, 365], sort: 380 },
      { prop: "ball", at: [612, 196] },
      { prop: "sneaker", at: [886, 196] },
    ],
    shadows: [blob(752, 194, 14, 3, 2)],
  },
);

/** Roads and the paths people cut: the cart road in from the 아고라 and down to the grove. */
const RUTS: readonly (readonly Vec[])[] = [
  [
    [0, 28],
    [9, 29],
    [17, 25],
    [27, 21],
  ],
  [
    [36, 26],
    [36, 45],
    [37, 59],
  ],
];
const PATHS: readonly (readonly Vec[])[] = [
  [
    [44, 22],
    [52, 28],
    [57, 33],
  ],
  [
    [12, 30],
    [22, 37],
    [30, 42],
  ],
  [
    [24, 12],
    [30, 12],
  ],
];

const details: (Decal | Prop)[] = [
  ...foam(GROUND),
  ...RUTS.flatMap((r) => track("ruts", r, PLAN)),
  ...PATHS.flatMap((r) => track("footpath", r, PLAN)),
  // Masonry strewn around the temple and down the line of the fallen columns.
  ...rubble([36, 19], 11, 14, 3, PLAN),
  ...rubble([49, 19], 7, 8, 4, PLAN),
  ...rubble([24, 12], 5, 5, 5, PLAN),
  { prop: "threshing", at: px(36, 45) },
  { prop: "statue-head", at: [636, 518] },
  ...tracks(),
  // The gnomon's shadow line, pegged.
  ...[0, 1, 2, 3, 4, 5].map(
    (k): Prop => ({
      prop: "chalk-h",
      frame: `h${k % 4}`,
      at: [(GNOMON[0] + k) * T + 8, GNOMON[1] * T + 14 + Math.round(k * 0.6)],
    }),
  ),
  { decal: "marble-dust/shards", at: [744, 238] },
  { decal: "marble-dust/shards", at: [792, 340] },
  { decal: "marble-dust/pebbles", at: [690, 392] },
  { decal: "marble-dust/shards", at: [452, 300] },
  { prop: "weeds", at: [300, 600] },
  { prop: "weeds", at: [760, 690] },
];

const map: MapSource = {
  id: "p1-colonnade",
  name: "무너진 열주",
  seed: 1440,
  time: { clock: "14:40", phase: "noon", weather: "sea-wind" },
  theme: "greece",
  shade: "greece-shade",
  sky: "navy.pale",
  ambient: { color: "gold.pale", intensity: 0.95 },
  plan: GROUND,
  legend: fieldLegend("slab"),
  backdrop: [
    { prop: "hellas-sky", at: [0, 0], repeat: 6, raw: true },
    { prop: "tear-night", at: [866, 0], raw: true },
    { prop: "aegean", anim: "ripple", play: true, at: [0, 50], repeat: 6, raw: true },
    { prop: "isles", at: [-40, 51], repeat: 6, raw: true },
    { prop: "sail", anim: "bob", play: true, at: [408, 56], raw: true },
    { prop: "sail", anim: "bob", play: true, index: 1, at: [1150, 58], raw: true, flip: true },
  ],
  details,
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights,
  atmosphere: sparkles(GROUND, 5, 9),
  emitters: [
    // Pages of the notebook blowing out of the tear and over the headland.
    {
      sprite: "page-m",
      anim: "turn",
      area: { x: 880, y: 20, w: 60, h: 30 },
      count: 3,
      life: 14,
      velocity: [-34, 22],
    },
    {
      sprite: "page-s",
      anim: "turn",
      area: { x: 870, y: 20, w: 80, h: 40 },
      count: 5,
      life: 16,
      velocity: [-28, 26],
    },
    // Dust off the meadow in the sea wind.
    {
      sprite: "mote",
      area: { x: 80, y: 160, w: 900, h: 700 },
      count: 40,
      life: 6,
      velocity: [-9, 3],
    },
    {
      sprite: "gull",
      anim: "glide",
      area: { x: -40, y: 70, w: 1300, h: 60 },
      count: 3,
      life: 40,
      velocity: [30, 2],
    },
  ],
  spawns: {
    main: { tile: [2, 28], facing: "right" },
    "p1-agora": { tile: [2, 28], facing: "right" },
    "p1-olive-road": { tile: [36, 57], facing: "up" },
  },
  landmark: { name: "세 기둥", tile: [33, 13] },
  blocks: [
    // The three standing columns and the beam they hold: one block, nothing to slip between.
    { x: 31, y: COL_Y, w: 5, h: 1 },
  ],
  portals: [
    { id: "agora", rect: { x: 0, y: 26, w: 1, h: 4 }, to: "p1-agora", spawn: "p1-colonnade" },
    {
      id: "olive-road",
      rect: { x: 34, y: 59, w: 4, h: 1 },
      to: "p1-olive-road",
      spawn: "p1-colonnade",
    },
  ],
  interactables: [
    { id: "gnomon", kind: "lore", rect: { x: GNOMON[0], y: GNOMON[1], w: 1, h: 1 } },
    { id: "kouros", kind: "lore", rect: { x: 38, y: 31, w: 1, h: 1 } },
    { id: "boat", kind: "lore", rect: { x: 56, y: 29, w: 3, h: 1 } },
    { id: "altar", kind: "lore", rect: { x: 46, y: 11, w: 2, h: 1 } },
  ],
  zones: [
    { id: "arrival", kind: "safe", rect: { x: 0, y: 23, w: 12, h: 12 } },
    { id: "grove-gate", kind: "safe", rect: { x: 31, y: 53, w: 10, h: 7 } },
    { id: "three-columns", kind: "gather", rect: { x: 29, y: 15, w: 15, h: 9 } },
    { id: "statue", kind: "gather", rect: { x: 35, y: 30, w: 7, h: 5 } },
    { id: "threshing-floor", kind: "elite", rect: { x: 32, y: 42, w: 9, h: 6 } },
    // At full count about 150: 오답 everywhere, pencil packs in the meadow grass, 유리수 병사
    // holding the ruins, 불의 정령 around the altar and the beach, one tortoise.
    {
      id: "field",
      kind: "monsters",
      rect: { x: 12, y: 8, w: 52, h: 46 },
      monster: "odap",
      density: 3.7,
    },
    {
      id: "meadow",
      kind: "monsters",
      rect: { x: 6, y: 35, w: 56, h: 19 },
      monster: "odap-pencil",
      density: 2.7,
    },
    {
      id: "ruins",
      kind: "monsters",
      rect: { x: 24, y: 9, w: 34, h: 20 },
      monster: "rational",
      density: 4,
    },
    {
      id: "altar-beach",
      kind: "monsters",
      rect: { x: 44, y: 7, w: 22, h: 30 },
      monster: "element-fire",
      density: 3,
    },
    {
      id: "tortoise-track",
      kind: "monsters",
      rect: { x: 20, y: 34, w: 42, h: 18 },
      monster: "tortoise",
      density: 0.14,
    },
  ],
};

export default map;
