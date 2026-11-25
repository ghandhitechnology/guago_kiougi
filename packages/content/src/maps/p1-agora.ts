import type { LightSource, MapSource } from "./format.ts";
import { blob, GREEK_LEGEND, merge, type Placed, px, settle, trees } from "./greek.ts";
import type { Decal, Prop, ShadowShape, Vec } from "./layers.ts";
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
 * everyone ends up. The temple stands on the west hill over the round tholos; a street of houses
 * runs along the south with the mint and a potter on it, washing strung over it, a cook's smoke
 * going up. 아리스토텔레스 lectures on the stoa's steps, 제논 walks the colonnade road past
 * milestones that come closer and closer together and never reach the gate, a Pythagorean counts
 * pebbles by the fountain with the beans set well away, and 아리스타르코스 has chalked the sun
 * and moon by his gnomon, which everyone walks straight through. The sun is in the west-south-west
 * and every shadow falls east.
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
/** The temple on the west hill, the tholos below it, the street of houses along the south. */
const TEMPLE: Vec = [1, 10];
const THOLOS: Vec = [15, 20];
const STREET = { y: 45, west: 4, east: 51 };
/** The council hall east of the fountain, facing the colonnade road. */
const COUNCIL: Vec = [57, 33];

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
  g.patches("_", ",", { scale: 6, threshold: 0.6, seed: 21 });
  // The town's middle is trodden bare; grass keeps to its edges.
  g.blob(34, 36, 22, 13, "_", { seed: 23, ragged: 0.2, onto: "," });
  // The square, the stoa's apron and the market lane stay beaten earth.
  g.blob(32, 24, 17, 10, "_", { seed: 22, ragged: 0.15, onto: "," });
  g.rect(STOA.x - 1, STOA.steps, STOA.bays * 2 + 4, 3, "_");
  g.rect(49, 12, 18, 16, "_", ",");
  // Roads out: east to the colonnade, south-west to the town's edge.
  const roads: readonly (readonly Vec[])[] = [
    [
      [44, 27],
      [58, 28],
      [72, 28],
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
  // Under the wound only beaten dust: the hole is drawn whole over it.
  g.blob(WOUND[0], WOUND[1], 4.6, 5.8, "_", { seed: 61, ragged: 0.1, onto: ",_m" });
  settle(g, [WOUND[0] + 8, WOUND[1]]);
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
      ...STALLS.map(([frame, tx, ty]) => place("market-stall", tx, ty, { frame })),
      // Stock waiting behind and between the stalls.
      place("pithos", 65, 14),
      place("pithos", 63, 20),
      { prop: "amphora", at: [px(65, 16)[0], px(65, 16)[1] + 4] },
      { prop: "amphora-tipped", at: [px(64, 22)[0], px(64, 22)[1] + 5] },
      place("handcart", 47, 18, { flip: true }),
      place("handcart", 64, 25),
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
  [64, 37],
  [37, 31],
  [23, 30],
  [32, 32],
  // On the slope behind the street.
  [12, 52],
  [17, 52],
  [56, 52],
];
const CYPRESSES: readonly Vec[] = [
  [15, 6],
  [52, 6],
  [69, 16],
  [65, 10],
  [68, 34],
  [30, 51],
  [41, 51],
  [6, 52],
  [66, 46],
];

/** Pebbles laid out in the dust as numbers: rows of 1, 2, 3, 4 make the ten. */
function tetractys(x: number, y: number): Prop[] {
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

/** A square number in pebbles, `n` on a side. */
function square(x: number, y: number, n: number): Prop[] {
  const out: Prop[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      out.push({ prop: "pebble", frame: `p${(r * n + c) % 3}`, at: [x + c * 7, y + r * 6] });
  return out;
}

/** The street of houses, west and east of the orchestra, doors onto the street. */
const HOUSES: readonly [string, number][] = [
  ["white", STREET.west],
  ["ochre", STREET.west + 5],
  ["white", STREET.west + 10],
  ["ochre", 34],
  ["white", 39],
  ["ochre", 44],
  ["mint", STREET.east],
  ["potter", STREET.east + 5],
  ["ochre", STREET.east + 10],
];
/** Houses elsewhere: by the hill north of the wound, on the road south of it, under the hall. */
const MORE_HOUSES: readonly [string, number, number][] = [
  ["ochre", 2, 16],
  ["white", 3, 37],
  ["ochre", 8, 37],
  ["white", 57, 40],
  ["ochre", 62, 40],
];

/** Long afternoon shade off the east side of something standing, `h` px tall, `w` px deep. */
function shade(x: number, foot: number, h: number, w: number): ShadowShape {
  return {
    poly: [
      [x, foot - h],
      [x, foot],
      [x + w, foot - 6],
      [x + w, foot - h - 6],
    ],
  };
}

function town(): Partial<Placed> {
  const houseFoot = (STREET.y + 3) * T - 2;
  return {
    objects: [
      // The temple on its rise, the tholos below it.
      place("temple", TEMPLE[0], TEMPLE[1]),
      place("tholos", THOLOS[0], THOLOS[1]),
      place("bouleuterion", COUNCIL[0], COUNCIL[1]),
      ...HOUSES.map(([frame, x]) => place("townhouse", x, STREET.y, { frame })),
      ...MORE_HOUSES.map(([frame, x, y]) => place("townhouse", x, y, { frame })),
      // The town wall along the slope behind the street.
      ...Array.from(
        { length: 62 },
        (_, i): Prop => ({ prop: "city-wall", at: [(4 + i) * T + 8, 53 * T + 4] }),
      ),
      // The street's well.
      { prop: "well", at: [31 * T, 49 * T + 12] },
      // The water clock that times the speeches, by the stoa's east end.
      { prop: "clepsydra", anim: "run", play: true, at: [49 * T, 10 * T + 12] },
      // The wall of potsherds, every vote and grudge in town scratched on one.
      place("ostraka", 50, 11),
    ],
    overhead: [
      // Pennants across the market lane and the street.
      ...[0, 1, 2, 3].map(
        (k): Prop => ({
          prop: "bunting",
          anim: "flap",
          play: true,
          index: k % 2,
          at: [(50 + k * 4) * T, 15 * T + 4],
        }),
      ),
      ...[0, 1, 2].map(
        (k): Prop => ({
          prop: "bunting",
          anim: "flap",
          play: true,
          index: (k + 1) % 2,
          at: [(STREET.west + k * 4) * T + 8, (STREET.y + 3) * T + 2],
        }),
      ),
      ...[0, 1, 2].map(
        (k): Prop => ({
          prop: "bunting",
          anim: "flap",
          play: true,
          index: k % 2,
          at: [(STREET.east + k * 4) * T + 8, (STREET.y + 3) * T + 2],
        }),
      ),
      // The vine over the fountain's west side.
      { prop: "vine-top", at: [43 * T + 8, 39 * T] },
    ],
    shadows: [
      ...HOUSES.map(([, x]) => shade((x + 5) * T - 2, houseFoot, 56, 26)),
      ...MORE_HOUSES.map(([, x, y]) => shade((x + 5) * T - 2, (y + 3) * T - 2, 56, 26)),
      shade((THOLOS[0] + 5) * T - 8, (THOLOS[1] + 2) * T - 2, 60, 30),
      shade((COUNCIL[0] + 6) * T + 4, (COUNCIL[1] + 3) * T - 2, 70, 28),
      shade(STOA.x * T + STOA.bays * 2 * T + T, (STOA.steps + 1) * T - 1, 70, 30),
      shade(53 * T, 12 * T - 2, 24, 14),
      // Shade pools under the stalls' awnings, east of each.
      ...STALLS.map(([, x, y]) => shade((x + 3) * T - 4, (y + 1) * T - 2, 30, 14)),
      // Under the vine.
      {
        poly: [
          [41 * T + 14, 37 * T],
          [46 * T + 14, 37 * T - 6],
          [46 * T + 14, 39 * T - 6],
          [41 * T + 14, 39 * T],
        ],
      },
      blob(ALTAR[0] * T + 22, ALTAR[1] * T + 13, 14, 3, 2),
    ],
  };
}

/** The life of the place: things people are in the middle of doing. */
function life(): Partial<Placed> {
  return {
    objects: [
      // The vine's posts.
      { prop: "vine-posts", at: [43 * T + 8, 39 * T] },
      // The barber's corner by the old south road, the cook's fire and the fish drying by it.
      { prop: "barber", at: [42 * T + 8, 49 * T + 4] },
      { prop: "cook-fire", anim: "burn", play: true, at: [36 * T + 8, 49 * T + 10] },
      { prop: "awning", frame: "red", at: [36 * T + 8, 49 * T + 12] },
      { prop: "fish-rack", anim: "sway", play: true, at: [66 * T + 8, 24 * T + 10] },
      // The potter at his wheel in the street before his shop, pots set out to dry.
      {
        prop: "potter-wheel",
        anim: "spin",
        play: true,
        at: [(STREET.east + 7) * T, (STREET.y + 4) * T + 8],
      },
      { prop: "amphora", at: [(STREET.east + 9) * T, (STREET.y + 4) * T + 2] },
      { prop: "amphora-tipped", at: [(STREET.east + 10) * T + 6, (STREET.y + 4) * T + 6] },
      // Washing over the west street, a child's hoop dropped in it.
      {
        prop: "drying-line",
        anim: "snap",
        play: true,
        at: [(STREET.west + 7) * T, (STREET.y + 5) * T],
      },
      { prop: "toy-hoop", at: [28 * T, 49 * T] },
      // A dog asleep in the stoa's shade, pigeons on the paving.
      {
        prop: "sleeping-dog",
        anim: "breathe",
        play: true,
        at: [22 * T, 8 * T + 12],
        sort: 8 * T + 2,
      },
      { prop: "pigeons", anim: "peck", play: true, at: [34 * T, 24 * T + 8] },
      { prop: "pigeons", anim: "peck", play: true, index: 1, at: [27 * T, 19 * T + 10] },
      { prop: "pigeons", anim: "peck", play: true, index: 2, at: [45 * T + 8, 42 * T + 6] },
      // Baskets of the day's goods set out before the stalls.
      { prop: "basket", at: [51 * T + 4, 15 * T + 12] },
      { prop: "basket", at: [57 * T + 8, 15 * T + 12] },
      { prop: "basket", at: [55 * T, 21 * T + 12] },
      { prop: "amphora-rack", at: [48 * T, 15 * T + 14] },
      // The plaza between the wound, the monument and the fountain: shade, a seller or two, jars.
      place("marble-bench", 22, 31),
      place("marble-bench", 33, 33),
      place("stall", 27, 36, { frame: "figs" }),
      place("stall", 47, 30, { frame: "pots" }),
      { prop: "basket", at: [29 * T + 4, 37 * T + 10] },
      { prop: "amphora", at: [24 * T + 8, 36 * T + 12] },
      { prop: "amphora-tipped", at: [25 * T + 6, 37 * T + 4] },
      { prop: "amphora", at: [37 * T, 27 * T + 10] },
      { prop: "handcart", at: [39 * T + 8, 29 * T + 12] },
      { prop: "basket", at: [49 * T + 8, 31 * T + 12] },
      // The Pythagoreans' beans, carried well away from the pebbles and left there.
      { prop: "bean-sack", at: [46 * T + 12, 41 * T + 12] },
      // 제논's road: milestones halving the distance to the gate, none of them at it.
      ...[46, 58, 64, 67, 68.5].map(
        (x): Prop => ({ prop: "boundary-stone", at: [Math.round(x * T) + 8, 30 * T + 10] }),
      ),
    ],
  };
}

const lights: LightSource[] = [
  // The wound: the school's night lying in the afternoon, its cold spilling out over the dust.
  {
    at: px(WOUND[0], WOUND[1]),
    radius: 150,
    color: "navy.pale",
    intensity: 0.9,
    flicker: { amount: 0.06, period: 3.2 },
    paint: {
      bands: [],
      region: "wound",
      reach: [48],
      ragged: 5,
      rays: { at: px(WOUND[0], WOUND[1]), count: 9, amount: 0.25 },
    },
  },
  // The 운동장's lamp, still lit on the far side.
  {
    at: [WOUND[0] * T + 22, WOUND[1] * T - 16],
    radius: 44,
    color: "gold.pale",
    intensity: 0.6,
  },
  // The altar's fire.
  {
    at: [ALTAR[0] * T + 16, ALTAR[1] * T + 4],
    radius: 40,
    color: "gold.light",
    intensity: 0.6,
    flicker: { amount: 0.2, period: 0.7 },
  },
];

/** The wound's sprite is drawn about its centre; the lamp and goal stand inside it. */
const WOUND_AT: Vec = [WOUND[0] * T, WOUND[1] * T + 4];
const inWound = (sx: number, sy: number): Vec => [WOUND_AT[0] - 92 + sx, WOUND_AT[1] - 112 + sy];

const placed = merge(
  stoa(),
  market(),
  town(),
  life(),
  trees("olive", OLIVES, 2),
  trees("cypress", CYPRESSES, 1),
  {
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
        (k): Prop => ({
          prop: "stake",
          at: [(GNOMON[0] + k * 1.5) * T + 8, GNOMON[1] * T + 13 + k],
        }),
      ),
      // Boundary stones where the roads enter the square, a herm at each gate.
      ...(
        [
          [44, 25],
          [34, 37],
          [16, 18],
          [19, 37],
          [56, 17],
        ] as const
      ).map(([x, y]): Prop => ({ prop: "boundary-stone", at: [x * T + 8, y * T + 12] })),
      place("herm", 69, 25),
      place("herm", 3, 41),
      // Jars by the fountain, waiting to be filled; one already full and leaking.
      place("pithos", 50, 36),
      { prop: "amphora", at: [px(43, 37)[0], px(43, 37)[1] + 4] },
      { prop: "amphora", at: [px(44, 38)[0] + 4, px(44, 38)[1] + 4] },
      { prop: "amphora-tipped", at: [px(50, 38)[0], px(50, 38)[1] + 5] },
      // Statues on the square.
      place("statue", 26, 27),
      place("statue", 42, 22, { flip: true }),
      place("column-stump", 21, 23, { frame: "high" }),
      // The north-east corner: a wayside shrine, jars stacked for the market, a cypress.
      { prop: "shrine", at: [63 * T + 8, 11 * T + 12] },
      { prop: "amphora-rack", at: [67 * T, 12 * T + 12] },
      { prop: "handcart", at: [60 * T, 12 * T + 12], flip: true },
      // Rocks on the hills.
      place("boulder", 13, 4),
      place("boulder", 60, 6),
      place("boulder-big", 66, 4),
      // The 운동장 standing in the wound, and what blew through it.
      { prop: "night-goal", at: inWound(44, 74), raw: true },
      { prop: "night-lamp", at: inWound(114, 92), raw: true },
      { prop: "sneaker", at: [px(13, 31)[0], px(13, 31)[1]] },
      { prop: "ball", at: [px(14, 25)[0], px(14, 25)[1]] },
    ],
  },
);

/** Weeds in the paving's joints, a few to every patch of paving, never in a pattern. */
function jointWeeds(): Prop[] {
  const rows = PLAN.split("\n");
  const out: Prop[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "m") continue;
      const n = fractal(x * 3.1, y * 2.7, 1.3, 77);
      if (n > 0.8)
        out.push({ prop: "joint-weeds", frame: `w${(x + y) % 3}`, at: [x * T + 4, y * T + 13] });
    }
  });
  return out;
}

const details: (Decal | Prop)[] = [
  // Paths beaten darker where everyone walks: wound to the monument, the monument to the market
  // and the fountain, the colonnade road, the street.
  ...(
    [
      [14.0, 27.0, "a"],
      [16.3, 26.2, "b"],
      [18.7, 25.3, "c"],
      [21.0, 24.5, "a"],
      [23.3, 23.7, "b"],
      [25.7, 22.8, "c"],
      [28.0, 22.0, "a"],
      [34.0, 23.0, "b"],
      [36.5, 22.2, "c"],
      [39.0, 21.3, "a"],
      [41.5, 20.5, "b"],
      [44.0, 19.7, "c"],
      [46.5, 18.8, "a"],
      [49.0, 18.0, "b"],
      [36.0, 25.0, "c"],
      [37.8, 26.6, "a"],
      [39.6, 28.2, "b"],
      [41.4, 29.8, "c"],
      [43.2, 31.4, "a"],
      [45.0, 33.0, "b"],
      [44.0, 28.0, "c"],
      [46.6, 28.0, "a"],
      [49.2, 28.0, "b"],
      [51.8, 28.0, "c"],
      [54.4, 28.0, "a"],
      [57.0, 28.0, "b"],
      [59.6, 28.0, "c"],
      [62.2, 28.0, "a"],
      [64.8, 28.0, "b"],
      [67.4, 28.0, "c"],
      [70.0, 28.0, "a"],
      [6.0, 49.0, "b"],
      [8.8, 49.0, "c"],
      [11.6, 49.0, "a"],
      [14.4, 49.0, "b"],
      [17.2, 49.0, "c"],
      [20.0, 49.0, "a"],
      [50.0, 49.0, "b"],
      [52.7, 49.0, "c"],
      [55.3, 49.0, "a"],
      [58.0, 49.0, "b"],
      [60.7, 49.0, "c"],
      [63.3, 49.0, "a"],
      [66.0, 49.0, "b"],
      [18.0, 37.0, "c"],
      [15.7, 38.0, "a"],
      [13.3, 39.0, "b"],
      [11.0, 40.0, "c"],
      [8.7, 41.0, "a"],
      [6.3, 42.0, "b"],
      [4.0, 43.0, "c"],
      [32.0, 11.0, "a"],
      [33.5, 13.2, "b"],
      [35.0, 15.4, "c"],
      [36.5, 17.6, "a"],
      [38.0, 19.8, "b"],
      [39.5, 22.0, "c"],
      [41.0, 24.2, "a"],
      [42.5, 26.4, "b"],
      [44.0, 28.6, "c"],
      [45.5, 30.8, "a"],
      [47.0, 33.0, "b"],
    ] as const
  ).map(
    ([x, y, frame]): Prop => ({
      prop: "beaten",
      frame,
      at: [Math.round(x * T) - 28, Math.round(y * T) - 2],
    }),
  ),
  // Cart ruts down the colonnade road and along the street.
  ...[44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70].map(
    (x): Prop => ({ prop: "cart-ruts-h", at: [x * T, 27 * T + 6] }),
  ),
  ...[6, 8, 10, 12, 14, 16, 52, 54, 56, 58, 60, 62, 64].map(
    (x): Prop => ({ prop: "cart-ruts-h", at: [x * T, (STREET.y + 4) * T + 4] }),
  ),
  // Sand drifted against the stoa's steps and the houses, and at the hill's foot.
  ...[18, 24, 31, 38, 44].map(
    (x, i): Prop => ({
      prop: "sand-drift",
      frame: i % 2 ? "a" : "b",
      at: [x * T, (STOA.steps + 1) * T + 2],
    }),
  ),
  ...HOUSES.map(
    ([, x], i): Prop => ({
      prop: "sand-drift",
      frame: i % 2 ? "b" : "a",
      at: [(x + 2) * T, (STREET.y + 3) * T + 4],
    }),
  ),
  { prop: "sand-drift", frame: "a", at: [9 * T, 13 * T + 4] },
  { prop: "sand-drift", frame: "b", at: [62 * T, 13 * T + 2] },
  // The paving's medallion before the monument, and its meander along the stoa's apron.
  { prop: "paving-inlay", at: [31 * T + 8, 24 * T + 4] },
  ...Array.from(
    { length: STOA.bays },
    (_, i): Prop => ({
      prop: "paving-meander",
      at: [(STOA.x + i * 2) * T, (STOA.steps + 3) * T - 4],
    }),
  ),
  ...jointWeeds(),
  // Potsherds by the potter, sandal prints across the square.
  { prop: "potsherds", at: [(STREET.east + 8) * T, (STREET.y + 5) * T + 6] },
  { prop: "sandal-prints", at: [28 * T, 30 * T] },
  { prop: "sandal-prints", at: [38 * T, 18 * T] },
  // 아리스타르코스's sun, earth and moon in chalk, walked straight through.
  { prop: "chalk-orbits", at: [GNOMON[0] * T + 76, GNOMON[1] * T + 52] },
  // The gnomon's shadow, pegged and chalked.
  ...[0, 1, 2, 3, 4, 5].map(
    (k): Prop => ({
      prop: "chalk-h",
      frame: `h${k % 4}`,
      at: [(GNOMON[0] + k) * T + 8, GNOMON[1] * T + 14 + Math.round(k * 0.6)],
    }),
  ),
  // 제논's finish line, chalked across the road just short of the gate, and again, and again.
  ...[68.2, 68.6, 68.9, 69.1].map(
    (x, i): Prop => ({
      prop: "chalk-v",
      frame: `v${i % 4}`,
      at: [Math.round(x * T), 26 * T + 4 + (i % 2) * 16],
    }),
  ),
  // The Pythagoreans' numbers: the ten as a triangle, the squares of two and three.
  ...tetractys(40 * T + 8, 38 * T + 4),
  ...square(37 * T, 40 * T + 2, 2),
  ...square(42 * T + 4, 39 * T + 10, 3),
  { prop: "threshing", at: px(ORCHESTRA[0], ORCHESTRA[1]) },
  // The wound, drawn whole.
  { prop: "wound", at: WOUND_AT, raw: true },
];

const map: MapSource = {
  id: "p1-agora",
  name: "아고라",
  seed: 1510,
  time: { clock: "15:10", phase: "noon", weather: "clear" },
  theme: "greece",
  shade: "greece-shade",
  sky: "navy.pale",
  ambient: { color: "gold.pale", intensity: 0.95 },
  plan: PLAN,
  legend: GREEK_LEGEND,
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
    // Greek dust blowing in over the lip.
    ...(
      [
        [190, -40, 0],
        [200, 30, 1.5],
        [170, 90, 3],
      ] as const
    ).map(
      ([dx, dy, phase]): Prop => ({
        prop: "mote",
        at: [WOUND_AT[0] + dx, WOUND_AT[1] + dy],
        drift: { to: [WOUND_AT[0] + 20, WOUND_AT[1] + dy / 2], period: 4, phase },
      }),
    ),
    // The cook's smoke.
    { prop: "smoke", anim: "rise", play: true, at: [36 * T + 4, 48 * T + 6] },
    {
      prop: "smoke",
      anim: "rise",
      play: true,
      index: 2,
      at: [(STREET.east + 3) * T + 6, (STREET.y - 2) * T],
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
    "p1-agora-edge": { tile: [3, 44], facing: "right" },
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
    { id: "agora-edge", rect: { x: 0, y: 43, w: 1, h: 3 }, to: "p1-agora-edge", spawn: "p1-agora" },
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
    // Townspeople at what they do.
    potter: [STREET.east + 7, STREET.y + 4],
    barber: [43, 49],
    cook: [37, 50],
    "argument-a": [44, 40],
    "argument-b": [46, 40],
    children: [28, 50],
    "fish-seller": [65, 24],
  },
  npcs: [
    { speaker: "aristotle", tile: [STOA.x + STOA.bays, STOA.steps + 2], facing: "down" },
    { speaker: "zeno", tile: [61, 29], facing: "right" },
    { speaker: "pythagoreans", tile: [41, 37], facing: "down" },
    { speaker: "aristarchus", tile: [GNOMON[0] - 1, GNOMON[1] + 1], facing: "right" },
    { speaker: "guard", tile: [6, 41], facing: "right" },
  ],
};

export default map;
