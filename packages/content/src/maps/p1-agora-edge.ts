import type { LightSource, MapSource, Thing } from "./format.ts";
import { blob, cellOf, fieldLegend, merge, type Placed, scatter, track, trees } from "./greek.ts";
import type { Decal, Prop, Vec } from "./layers.ts";
import { fractal } from "./noise.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 아고라 외곽, the road into the square, stopped at 12:50 under a sun straight overhead. North of
 * the square the city is building a stoa: the stylobate is laid, the columns rise from bare
 * bases to full height along it, and the great crane stopped with a drum in its sling over the
 * last base the moment time tore. The market below was left mid-morning, the fish still on the
 * slab, a basket of figs across the paving. In each corner one of the four elements has dug in
 * where it says it naturally belongs, and they argue across the square: water at the fountain
 * house, fire in the foundry, air on the terrace where every cloth is flying, earth in the
 * stonecutters' yard. The city packs in to the south, houses seen from their backs over their
 * yard walls, and east the road goes through the wall into the 아고라 past the boundary stone.
 */

const T = 16;
const W = 80;
const H = 60;

const wave = (v: number, seed: number, scale = 7) => fractal(v, 0.5, scale, seed) * 2 - 1;

/** The stoa: its stylobate, its front line of columns, and the crane at its east end. */
const STOA = { x: 9, y: 11, w: 27, h: 5 };
const COL_Y = 15;
const COLUMNS = [11, 14, 17, 20, 23, 26, 29, 32] as const;
const CRANE_FOOT = { x: 25, y: 18, w: 7, h: 1 };
/** The square's fountain, its centre. */
const BASIN: Vec = [38, 29];
/** The furnaces stay where their lights are. */
const FURNACES: readonly Vec[] = [
  [64, 42],
  [69, 46],
];
const FOUNTAIN_HOUSE: Vec = [6, 18];
const WALL_X = 74;
const GATE = { y: 26, h: 6 };

/**
 * `,` dry grass, `_` dust, `m` the square's flags, `s` the stoa's marble, `r` rock; `%` and `:`
 * are grass and dust past where anyone walks (the hill, the city's yards).
 */
const LEGEND: MapSource["legend"] = { ...fieldLegend("flags"), s: { terrain: "slab" } };

function paintPlan(): PlanGrid {
  const g = new PlanGrid(W, H, "_");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const road = x >= 37 && x <= 42;
      // Behind the stoa the hill comes right down to its back wall.
      const hill = x >= 2 && x <= 36 ? 10 : 6 + wave(x, 3) * 1.4;
      if (y < hill && !road) g.set(x, y, "r");
      else if (y > 52 + wave(x, 4) * 0.7 && !(x >= 49 && x <= 54)) g.set(x, y, ":");
      else if (x > WALL_X + 1 && !(y >= GATE.y && y < GATE.y + GATE.h)) g.set(x, y, ":");
      else if (x < 3 + wave(y, 6) * 1.5 && !(y >= 27 && y <= 31)) g.set(x, y, "r");
    }
  // The windy terrace: dry grass up on the north-east, combed flat by the wind.
  g.blob(60, 12, 14, 7, ",", { seed: 12, ragged: 0.22, onto: "_" });
  g.patches("_", ",", {
    scale: 6,
    threshold: 0.7,
    seed: 13,
    inside: { x: 3, y: 34, w: 70, h: 18 },
  });
  g.fray(",", "_", { seed: 14, passes: 1, scale: 3 });
  g.majority(",", "_", 2);
  // The square and the way through it, flagged; the fountain house's court.
  g.path(
    [
      [0, 29],
      [79, 28],
    ],
    5,
    "m",
    { seed: 21, ragged: 0.3 },
  );
  g.blob(39, 30, 23, 10.5, "m", { seed: 22, ragged: 0.08 });
  g.rect(4, 19, 11, 8, "m");
  g.fray("m", "_", { seed: 23, passes: 1, scale: 2.6 });
  g.majority("m", "_", 1);
  // The roads north to 리케이온 and south to 엘레아 stay dust.
  g.path(
    [
      [39, 0],
      [39, 19],
    ],
    5,
    "_",
    { seed: 24, ragged: 0.4 },
  );
  g.path(
    [
      [51, 40],
      [52, 60],
    ],
    5,
    "_",
    { seed: 25, ragged: 0.4 },
  );
  // The stoa's stylobate.
  g.rect(STOA.x, STOA.y, STOA.w, STOA.h, "s");
  // Settle: no two grounds without a pair touch.
  const pass = () =>
    g
      .separate(",", "rms", "_")
      .separate("%", "rms", ":")
      .separate("m", "rs", "_")
      .separate("s", "r", "_");
  pass();
  g.unsqueeze("_,ms").enclose("_,ms", [2, 29], { _: ":", ",": "%", m: ":", s: ":" });
  return pass();
}

const PLAN = paintPlan().toString();
const at = cellOf(PLAN);

// The building site -------------------------------------------------------------------------------

function stoa(): Placed {
  const foot = (tx: number): Vec => [tx * T + 8, (COL_Y + 1) * T - 2];
  const objects: Placed["objects"] = [];
  const overhead: Prop[] = [];
  // The back wall, built higher to the west where the work started.
  for (let x = STOA.x; x < STOA.x + STOA.w; x++)
    objects.push({
      prop: "stoa-wall",
      frame: x < 16 ? "c3" : x < 26 ? "c2" : "c1",
      at: [x * T + 8, STOA.y * T + 2],
      foot: { x, y: STOA.y - 1, w: 1, h: 1 },
    });
  // The columns rise along the front: full height, then shafts awaiting capitals, then stumps,
  // then a bare base under the crane's drum.
  COLUMNS.forEach((tx, i) => {
    const f = { x: tx, y: COL_Y, w: 1, h: 1 };
    if (i < 3) {
      objects.push({ prop: "column", frame: "whole", at: foot(tx), foot: f });
      if (i < 2) overhead.push({ prop: "column-capital", at: foot(tx) });
    } else if (i < 7)
      objects.push(place("column-stump", tx, COL_Y, { frame: i < 5 ? "high" : "low" }));
    else objects.push({ prop: "capital-fallen", at: foot(tx), foot: f });
  });
  objects.push(
    { prop: "scaffold", at: [20 * T + 8, (COL_Y + 1) * T], sort: (COL_Y + 1) * T - 1, raw: true },
    { prop: "scaffold", at: [23 * T + 8, (COL_Y + 1) * T], sort: (COL_Y + 1) * T - 1, raw: true },
    // The crane, its wheel and legs in front of the stoa, its boom over the last base.
    {
      prop: "crane-big",
      at: [CRANE_FOOT.x * T + 70 - 6, (CRANE_FOOT.y + 1) * T - 2],
      foot: CRANE_FOOT,
      raw: true,
    },
    // Drums waiting, the mason's shelter, blocks stacked for the next course.
    place("drum-stack", 34, 17),
    place("drum-stack", 6, 15),
    place("shelter", 4, 12),
    place("blocks", 12, 18),
    place("blocks", 18, 19),
  );
  overhead.push({
    prop: "crane-big-top",
    at: [CRANE_FOOT.x * T + 70 - 6, (CRANE_FOOT.y + 1) * T - 2],
    raw: true,
  });
  return {
    objects,
    overhead,
    shadows: [
      // The stoa wall's shadow on its own floor, the crane's lattice across the dust.
      {
        poly: [
          [STOA.x * T, STOA.y * T + 2],
          [(STOA.x + STOA.w) * T, STOA.y * T + 2],
          [(STOA.x + STOA.w) * T + 6, STOA.y * T + 10],
          [STOA.x * T + 6, STOA.y * T + 10],
        ],
      },
      blob(CRANE_FOOT.x * T + 60, (CRANE_FOOT.y + 1) * T, 40, 5, 4),
    ],
  };
}

// The market ---------------------------------------------------------------------------------------

function market(): Placed {
  const objects: Placed["objects"] = [];
  const overhead: Prop[] = [];
  const shadows: Placed["shadows"] = [];
  const awned = (tx: number, ty: number, goods: string, colour: string, flip = false) => {
    const stall = place("stall", tx, ty, { frame: goods, raw: true, flip });
    objects.push(stall);
    overhead.push({ prop: "awning", frame: colour, at: stall.at, flip });
    shadows.push(blob(stall.at[0] + 2, stall.at[1] - 4, 17, 5));
  };
  // The fountain at the square's centre.
  objects.push(place("basin", BASIN[0] - 2, BASIN[1], { anim: "pour", play: true }));
  // Stalls of every size, set where their owners liked, not in rows.
  objects.push(
    {
      prop: "fish-table",
      at: [23 * T + 8, 24 * T - 2],
      foot: { x: 22, y: 23, w: 3, h: 1 },
      raw: true,
    },
    {
      prop: "long-stall",
      frame: "jars",
      at: [29 * T, 23 * T - 2],
      foot: { x: 28, y: 22, w: 3, h: 1 },
      raw: true,
    },
    {
      prop: "long-stall",
      frame: "cloth",
      at: [50 * T, 24 * T - 2],
      foot: { x: 49, y: 23, w: 3, h: 1 },
      raw: true,
      flip: true,
    },
    {
      prop: "long-stall",
      frame: "jars",
      at: [52 * T, 38 * T - 2],
      foot: { x: 51, y: 37, w: 3, h: 1 },
      raw: true,
    },
    { prop: "crates", at: [26 * T, 35 * T - 2], foot: { x: 25, y: 34, w: 2, h: 1 }, raw: true },
    place("amphora-pile", 31, 36, { raw: true }),
    place("cart", 57, 32, { raw: true }),
    // The awning strung across the lane south of the fountain, on its two poles.
    {
      prop: "string-awning",
      anim: "sag",
      play: true,
      at: [37 * T, 36 * T - 2],
      sort: 36 * T - 3,
      raw: true,
    },
  );
  // Goods spilling out round every stall: jars, baskets, a crate or two, walked between.
  const clutter: readonly [x: number, y: number, prop: string][] = [
    [21, 24, "amphora"],
    [25, 24, "basket"],
    [27, 23, "amphora"],
    [31, 23, "basket"],
    [42, 25, "basket"],
    [45, 25, "amphora"],
    [48, 24, "basket"],
    [52, 24, "amphora"],
    [54, 28, "basket"],
    [57, 28, "amphora"],
    [44, 36, "basket"],
    [47, 36, "amphora"],
    [50, 38, "basket"],
    [54, 38, "amphora"],
    [18, 34, "amphora"],
    [21, 34, "basket"],
    [24, 35, "amphora"],
    [30, 37, "basket"],
  ];
  clutter.forEach(([x, y, prop], i) => {
    objects.push({
      prop,
      at: [x * T + 4 + (i % 3) * 3, y * T + 12],
      raw: true,
      ...(i % 2 ? { flip: true } : {}),
    });
  });
  awned(43, 24, "pots", "red");
  awned(55, 27, "figs", "ochre", true);
  awned(45, 35, "fish", "blue");
  awned(19, 33, "pots", "ochre", true);
  return { objects, overhead, shadows };
}

/** The awning's poles: solid, a tile each, at its ends. */
const AWNING_POLES = [
  { x: 34, y: 35, w: 1, h: 1 },
  { x: 39, y: 35, w: 1, h: 1 },
];

// The four corners ---------------------------------------------------------------------------------

function corners(): Placed {
  const objects: Placed["objects"] = [];
  const overhead: Prop[] = [];
  // Water: the fountain house, its trough, jars waiting to be filled.
  objects.push(
    place("fountain-house", FOUNTAIN_HOUSE[0], FOUNTAIN_HOUSE[1], { anim: "pour", play: true }),
    place("trough", 11, 21),
    ...[0, 1, 2, 3, 4].map(
      (k): Prop => ({ prop: "amphora", at: [52 + k * 13, 352 + (k % 2) * 5] }),
    ),
    { prop: "amphora-tipped", at: [150, 410] },
  );
  // Air: the terrace is all moving cloth.
  objects.push(
    ...(
      [
        [49, 10],
        [57, 11],
        [64, 9],
        [71, 11],
        [52, 17],
        [69, 17],
      ] as const
    ).map(
      ([x, y], i): Thing => ({
        prop: "banner",
        anim: "snap",
        play: true,
        index: i % 3,
        at: [x * T, (y + 1) * T],
        foot: { x: x - 1, y, w: 1, h: 1 },
        raw: true,
      }),
    ),
    { prop: "pennants", anim: "gust", play: true, at: [57 * T, 13 * T], raw: true },
    { prop: "pennants", anim: "gust", play: true, index: 1, at: [66 * T, 15 * T], raw: true },
    { prop: "drying-line", anim: "snap", play: true, at: [50 * T, 14 * T], raw: true },
    { prop: "drying-line", anim: "snap", play: true, index: 2, at: [61 * T, 19 * T], raw: true },
  );
  // Earth: the stonecutters' yard, grey and angular.
  objects.push(
    place("tripod", 12, 45, { raw: true }),
    place("blocks", 6, 43),
    place("blocks", 7, 48),
    place("blocks", 18, 43),
    place("drum-stack", 20, 48),
    place("capital-fallen", 15, 49),
    place("shaft-fallen", 9, 51),
    place("blocks", 22, 45),
    place("column-stump", 6, 46, { frame: "high" }),
    place("acroterion", 16, 42),
  );
  // Fire: the foundry, glowing and smoking.
  objects.push(
    ...FURNACES.map(([tx, ty], i) =>
      place("furnace", tx, ty, { anim: "glow", play: true, index: i }),
    ),
    place("furnace", 60, 41, { anim: "glow", play: true, index: 2 }),
    place("amphora-rack", 58, 47, { raw: true }),
    { prop: "mold", at: [67 * T, 50 * T - 4], foot: { x: 66, y: 49, w: 2, h: 1 } },
    { prop: "charcoal", at: [62 * T + 8, 45 * T + 4] },
    { prop: "charcoal", at: [71 * T, 43 * T + 4] },
    { prop: "charcoal", at: [58 * T, 44 * T] },
    // The smiths' lean-to, an anvil under it.
    place("shelter", 68, 51),
    { prop: "anvil", at: [63 * T, 50 * T] },
  );
  return { objects, overhead, shadows: [] };
}

// The city -------------------------------------------------------------------------------------------

/**
 * Houses south of the square seen from their backs, packed and overlapping, different widths
 * and roofs, alleys between some of them with washing strung across; past the wall to the east,
 * the city's fronts. All on ground nobody walks.
 */
function city(): Placed {
  const objects: Prop[] = [];
  // Three rows deep, overlapping, no two neighbours alike, the road to 엘레아 left open.
  const frames = ["g", "e", "c", "a", "g", "f", "e", "b", "d", "e", "h", "g"];
  const width: Readonly<Record<string, number>> = {
    a: 3,
    b: 4,
    c: 2,
    d: 3,
    e: 3,
    f: 3,
    g: 4,
    h: 2,
  };
  [54, 57, 60].forEach((row, r) => {
    let x = -1 - r;
    let k = r * 5;
    while (x < W + 1) {
      const frame = frames[k % frames.length] as string;
      const w = width[frame] ?? 3;
      const road = x + w > 48 && x < 56 && row < 60;
      if (!road)
        objects.push({
          prop: "townhouse",
          frame,
          at: [Math.round((x + w / 2) * T), row * T + ((k * 7) % 3) * 4],
          raw: true,
          ...(k % 3 === 0 ? { flip: true } : {}),
        });
      x += road ? 1 : w - (k % 4 === 0 ? 1 : 0);
      k++;
    }
  });
  // Washing across two alleys.
  objects.push(
    {
      prop: "alley-washing",
      anim: "gust",
      play: true,
      at: [16 * T + 4, 54 * T],
      raw: true,
      sort: 56 * T,
    },
    {
      prop: "alley-washing",
      anim: "gust",
      play: true,
      index: 1,
      at: [59 * T + 8, 54 * T],
      raw: true,
      sort: 56 * T,
    },
  );
  // Past the wall, the city's fronts, two deep up the east edge.
  for (let y = 7; y < 54; y += 3) {
    if (y > GATE.y - 3 && y < GATE.y + GATE.h + 2) continue;
    for (const [col, shift] of [
      [77, 0],
      [80, 1],
    ] as const)
      objects.push({
        prop: "townhouse",
        frame: (["b", "h", "f", "d", "a", "c"] as const)[(y + shift * 3) % 6] as string,
        at: [col * T + shift * 6, (y + shift) * T + 6],
        raw: true,
      });
  }
  // The wall north and south of the gate, its towers either side of the road.
  for (let y = 6; y < 53; y++) {
    if (y >= GATE.y && y < GATE.y + GATE.h) continue;
    objects.push({
      prop: "wall-ns",
      frame: y % 2 ? "a" : "b",
      at: [WALL_X * T + 8, y * T],
      sort: y * T + 15,
    });
  }
  objects.push(
    { prop: "gate-tower", at: [(WALL_X + 1) * T, GATE.y * T + 6], raw: true },
    { prop: "gate-tower", at: [(WALL_X + 1) * T, (GATE.y + GATE.h + 2) * T + 2], raw: true },
  );
  // The old wall along the hill to the north, broken where the road climbs to 리케이온.
  const hillWall = Array.from({ length: WALL_X }, (_, x) => x)
    .filter((x) => x < 36 || x > 43)
    .map((x): Prop => ({ prop: "city-wall", at: [x * T + 8, 5 * T + 2] }));
  return { objects: [...objects, ...hillWall], overhead: [], shadows: [] };
}

const placed = merge(
  stoa(),
  market(),
  corners(),
  city(),
  trees("olive", [
    [8, 31],
    [27, 52],
  ]),
  trees("cypress", [
    [36, 8],
    [43, 8],
    [71, 23],
    [71, 34],
  ]),
  // The hill above the stoa: cypresses and rock, nobody's ground.
  trees("cypress", [
    [6, 4],
    [14, 3],
    [21, 5],
    [30, 3],
    [47, 3],
    [56, 2],
    [63, 4],
    [70, 2],
  ]),
  {
    objects: scatter({ x: 0, y: 0, w: W, h: 9 }, 5, 61, (x, y) => at(x, y) === "r").map(
      ([x, y], i): Prop => ({
        prop: i % 3 ? "boulder" : "boulder-big",
        at: [x * T + 8, y * T + 12],
        ...(i % 2 ? { flip: true } : {}),
      }),
    ),
  },
  { objects: [place("horos", 72, 27)] },
);

// Ground detail ---------------------------------------------------------------------------------------

/** The paving's frame: marble bands along the square's edges and across it. */
function bands(): Prop[] {
  const out: Prop[] = [];
  const flag = (x: number, y: number) => at(x, y) === "m";
  for (let x = 16; x <= 62; x++) {
    for (const y of [20, 40])
      if (flag(x, y) && flag(x, y + 1) && flag(x, y - 1))
        out.push({ prop: "paving-band", frame: "h", at: [x * T, y * T] });
  }
  for (let y = 21; y < 40; y++) {
    for (const x of [17, 61, 30])
      if (flag(x, y) && flag(x - 1, y) && flag(x + 1, y))
        out.push({ prop: "paving-band", frame: "v", at: [x * T + 6, y * T] });
  }
  return out;
}

const details: (Decal | Prop)[] = [
  ...bands(),
  // A different stone round the fountain.
  { prop: "paving-ring", at: [BASIN[0] * T, BASIN[1] * T + 6] },
  // The dust roads' ruts and the setting-out lines chalked along the stoa.
  ...track(
    "ruts",
    [
      [39, 0],
      [39, 19],
    ],
    PLAN,
  ),
  ...track(
    "ruts",
    [
      [51, 41],
      [52, 59],
    ],
    PLAN,
  ),
  ...Array.from(
    { length: 22 },
    (_, k): Prop => ({ prop: "chalk-h", frame: `h${k % 4}`, at: [(10 + k) * T + 8, 17 * T + 7] }),
  ),
  ...Array.from(
    { length: 4 },
    (_, k): Prop => ({ prop: "chalk-v", frame: `v${k % 4}`, at: [21 * T + 7, (16 + k) * T] }),
  ),
  { prop: "ramp", at: [27 * T, 16 * T + 4] },
  // Spilled fruit, and the fishmonger's wet slab dripping.
  { prop: "fruit-spill", at: [27 * T + 6, 36 * T + 2] },
  { prop: "fruit-spill", at: [44 * T, 26 * T + 4], flip: true },
  { prop: "puddle", anim: "sheen", play: true, at: [23 * T + 8, 25 * T + 2] },
  // Water: wet flags, puddles, moss round the fountain house.
  ...(
    [
      [7, 22],
      [11, 24],
      [6, 25],
      [13, 20],
    ] as const
  ).map(
    ([x, y], i): Prop => ({
      prop: "puddle",
      anim: "sheen",
      play: true,
      index: i % 3,
      at: [x * T + 8, y * T + 8],
    }),
  ),
  ...(
    [
      [4, 21],
      [14, 23],
      [9, 26],
      [3, 24],
    ] as const
  ).map(([x, y]): Prop => ({ prop: "moss", at: [x * T + 2, y * T + 8] })),
  // Air: straw combed into streaks.
  ...scatter({ x: 46, y: 7, w: 27, h: 13 }, 3, 41, (x, y) => at(x, y) === ",").map(
    ([x, y]): Prop => ({ prop: "wind-streaks", at: [x * T - 6, y * T + 6] }),
  ),
  // Earth: stone dust and chips over the yard.
  ...(
    [
      [9, 44],
      [15, 46],
      [21, 45],
      [11, 50],
      [18, 51],
    ] as const
  ).map(
    ([x, y], i): Prop => ({ prop: "stone-dust", frame: i % 2 ? "a" : "b", at: [x * T, y * T] }),
  ),
  // Fire: soot and cinders trodden round the furnaces.
  ...scatter(
    { x: 57, y: 40, w: 16, h: 12 },
    2,
    51,
    (x, y) => at(x, y) === "_" || at(x, y) === ",",
  ).map(
    ([x, y], i): Prop => ({
      prop: "soot",
      frame: i % 2 ? "a" : "b",
      at: [x * T + 8, y * T + 6],
      ...(i % 3 ? { flip: true } : {}),
    }),
  ),
];

const lights: LightSource[] = FURNACES.map(([tx, ty]) => ({
  at: [tx * T + 16, ty * T + 4] as Vec,
  radius: 70,
  color: "gold.light",
  intensity: 0.6,
  flicker: { amount: 0.15, period: 0.8 },
}));

const map: MapSource = {
  id: "p1-agora-edge",
  name: "아고라 외곽",
  seed: 1250,
  time: { clock: "12:50", phase: "noon", weather: "haze" },
  theme: "greece-noon",
  shade: "greece-shade",
  sky: "gold.pale",
  ambient: { color: "stone.bright", intensity: 1.05 },
  plan: PLAN,
  legend: LEGEND,
  details,
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights,
  atmosphere: [
    ...FURNACES.map(
      ([tx, ty], i): Prop => ({
        prop: "embers",
        anim: "rise",
        play: true,
        index: i * 5,
        at: [tx * T + 10, ty * T - 10],
      }),
    ),
    // Smoke off every furnace, leaning east.
    ...[...FURNACES, [60, 41] as Vec].map(
      ([tx, ty], i): Prop => ({
        prop: "smoke",
        anim: "rise",
        play: true,
        index: i,
        at: [tx * T + 18, ty * T - 22],
        raw: true,
      }),
    ),
  ],
  emitters: [
    {
      sprite: "mote",
      area: { x: 80, y: 100, w: 1100, h: 760 },
      count: 46,
      life: 5,
      velocity: [2, -6],
    },
    {
      sprite: "gull",
      anim: "glide",
      area: { x: -40, y: 20, w: 1300, h: 60 },
      count: 2,
      life: 40,
      velocity: [26, 1],
    },
  ],
  spawns: {
    main: { tile: [2, 29], facing: "right" },
    "p1-cave-mouth": { tile: [2, 29], facing: "right" },
    "p1-agora": { tile: [76, 29], facing: "left" },
    "p1-lyceum": { tile: [39, 2] },
    "p1-elea-track": { tile: [52, 57], facing: "up" },
  },
  landmark: { name: "기중기", tile: [30, 12] },
  blocks: [
    // The city wall north and south of its gate.
    { x: WALL_X, y: 6, w: 2, h: GATE.y - 6 },
    { x: WALL_X, y: GATE.y + GATE.h, w: 2, h: 53 - GATE.y - GATE.h },
    ...AWNING_POLES,
  ],
  portals: [
    {
      id: "cave-mouth",
      rect: { x: 0, y: 27, w: 1, h: 4 },
      to: "p1-cave-mouth",
      spawn: "p1-agora-edge",
    },
    { id: "agora", rect: { x: 79, y: 27, w: 1, h: 4 }, to: "p1-agora", spawn: "p1-agora-edge" },
    { id: "lyceum", rect: { x: 37, y: 0, w: 4, h: 1 }, to: "p1-lyceum", spawn: "p1-agora-edge" },
    { id: "elea", rect: { x: 50, y: 59, w: 4, h: 1 }, to: "p1-elea-track", spawn: "p1-agora-edge" },
  ],
  interactables: [
    { id: "horos", kind: "lore", rect: { x: 72, y: 27, w: 1, h: 1 } },
    { id: "crane", kind: "lore", rect: CRANE_FOOT },
    {
      id: "fountain-house",
      kind: "lore",
      rect: { x: FOUNTAIN_HOUSE[0], y: FOUNTAIN_HOUSE[1], w: 4, h: 2 },
    },
  ],
  zones: [
    { id: "west-gate", kind: "safe", rect: { x: 0, y: 24, w: 9, h: 10 } },
    { id: "city-gate", kind: "safe", rect: { x: 71, y: 24, w: 9, h: 10 } },
    { id: "lyceum-road", kind: "safe", rect: { x: 34, y: 0, w: 11, h: 7 } },
    { id: "elea-road", kind: "safe", rect: { x: 47, y: 53, w: 11, h: 7 } },
    { id: "stoa-steps", kind: "gather", rect: { x: 9, y: 16, w: 16, h: 2 } },
    { id: "between-stalls", kind: "elite", rect: { x: 30, y: 31, w: 17, h: 3 } },
    // At full count about 150: each element dug into its corner, 오답 and pencil packs across
    // the square, 유리수 병사 on the paved way, 그림자 that followed the road from the cave.
    {
      id: "everywhere",
      kind: "monsters",
      rect: { x: 3, y: 7, w: 70, h: 46 },
      monster: "odap",
      density: 0.75,
    },
    {
      id: "square",
      kind: "monsters",
      rect: { x: 16, y: 20, w: 47, h: 22 },
      monster: "odap-pencil",
      density: 2.4,
    },
    {
      id: "way",
      kind: "monsters",
      rect: { x: 0, y: 26, w: 74, h: 7 },
      monster: "rational",
      density: 4,
    },
    {
      id: "fountain",
      kind: "monsters",
      rect: { x: 3, y: 16, w: 14, h: 12 },
      monster: "element-water",
      density: 11,
    },
    {
      id: "foundry",
      kind: "monsters",
      rect: { x: 55, y: 39, w: 19, h: 14 },
      monster: "element-fire",
      density: 7,
    },
    {
      id: "terrace",
      kind: "monsters",
      rect: { x: 46, y: 7, w: 27, h: 13 },
      monster: "element-air",
      density: 5,
    },
    {
      id: "yard",
      kind: "monsters",
      rect: { x: 3, y: 41, w: 22, h: 12 },
      monster: "element-earth",
      density: 7,
    },
    {
      id: "from-the-cave",
      kind: "monsters",
      rect: { x: 3, y: 20, w: 24, h: 20 },
      monster: "cave-shadow",
      density: 5,
    },
    {
      id: "anywhere",
      kind: "monsters",
      rect: { x: 10, y: 36, w: 40, h: 14 },
      monster: "tortoise",
      density: 0.2,
    },
  ],
};

export default map;
