import type { LightSource, MapSource, Thing } from "./format.ts";
import { blob, cellOf, GREEK_LEGEND, merge, type Placed, px, settle, trees } from "./greek.ts";
import type { Decal, Prop, Vec } from "./layers.ts";
import { fractal } from "./noise.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 아고라 외곽, the road into the square, stopped at 12:50 under a sun straight overhead: the
 * paving glares and shadows hide under their owners. The city is building a stoa here and the
 * crane stopped with a drum in the air the moment time tore; the market below it was left with
 * the fish still on the tables. In each corner one of the four elements has dug in where it
 * says it naturally belongs, and they argue across the square: water at the fountain house,
 * fire in the foundry, air on the terrace where the washing snaps, earth in the stonecutters'
 * yard. East, between the houses, the road goes on into the 아고라 past the boundary stone.
 */

const T = 16;
const W = 80;
const H = 60;

const wave = (v: number, seed: number, scale = 7) => fractal(v, 0.5, scale, seed) * 2 - 1;

/** The stoa's colonnade line, and the crane at its east end. */
const STOA_Y = 18;
const CRANE: Vec = [53, 17];

function paintPlan(): PlanGrid {
  const g = new PlanGrid(W, H, ",");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // The hill to the north, the houses south and east, a rocky slope west.
      if (y < 6 + wave(x, 3) * 1.4) g.set(x, y, "r");
      else if (y > H - 7 + wave(x, 4) * 0.8) g.set(x, y, "%");
      else if (x > W - 6 + wave(y, 5) * 0.8) g.set(x, y, "%");
      else if (x < 3 + wave(y, 6) * 1.5) g.set(x, y, "r");
    }
  // Worn dust between the yards.
  g.patches(",", "_", { scale: 5, threshold: 0.45, seed: 11 });
  g.blob(15, 15, 10, 7, "_", { seed: 12, ragged: 0.2, onto: ",%" });
  g.blob(66, 13, 9, 6, "_", { seed: 13, ragged: 0.2, onto: ",%" });
  g.blob(15, 45, 10, 6, "_", { seed: 14, ragged: 0.2, onto: ",%" });
  g.blob(66, 45, 9, 6, "_", { seed: 15, ragged: 0.2, onto: ",%" });
  // The roads: west from the cave slope, east into the city, north to 리케이온, south to 엘레아.
  g.path(
    [
      [0, 29],
      [20, 30],
      [30, 30],
    ],
    5,
    "_",
    { seed: 21, ragged: 0.5 },
  );
  g.path(
    [
      [39, 0],
      [40, 12],
    ],
    5,
    "_",
    { seed: 22, ragged: 0.5 },
  );
  g.path(
    [
      [52, 40],
      [52, 60],
    ],
    5,
    "_",
    { seed: 23, ragged: 0.5 },
  );
  g.path(
    [
      [56, 30],
      [80, 29],
    ],
    5,
    "_",
    { seed: 24, ragged: 0.5 },
  );
  g.fray(",", "_", { seed: 31, passes: 1, scale: 2.6 });
  g.majority(",", "_", 2);
  // The paved way and the square, then the stoa's floor along its north side.
  g.path(
    [
      [6, 30],
      [74, 29],
    ],
    4,
    "m",
    { seed: 32, ragged: 0.2 },
  );
  g.rect(28, 20, 30, 20, "m");
  g.rect(30, 14, 26, 6, "m");
  g.patches("m", "_", {
    scale: 2.4,
    threshold: 0.8,
    seed: 33,
    inside: { x: 6, y: 20, w: 68, h: 20 },
  });
  return settle(g, [2, 29]);
}

const GRID = paintPlan();
const PLAN = GRID.toString();
const at = cellOf(PLAN);

// The stoa and the crane --------------------------------------------------------------------------

function stoa(): Placed {
  const cols = [32, 36, 40, 44, 48];
  const done = new Set([32, 36, 40]);
  const feet = (tx: number): Vec => [tx * T + 8, (STOA_Y + 1) * T - 2];
  const crane = place("crane", CRANE[0], CRANE[1], { raw: true });
  return {
    objects: [
      ...cols.map((tx): Prop | Thing =>
        done.has(tx)
          ? { prop: "column", frame: "whole", at: feet(tx), foot: { x: tx, y: STOA_Y, w: 1, h: 1 } }
          : place("column-stump", tx, STOA_Y, { frame: tx === 44 ? "high" : "low" }),
      ),
      // Scaffolding around the column going up next.
      {
        prop: "scaffold",
        at: [44 * T + 8, (STOA_Y + 1) * T],
        sort: (STOA_Y + 1) * T - 1,
        raw: true,
      },
      // The back wall, built a course high, with blocks waiting.
      place("blocks", 31, 14),
      place("blocks", 37, 14),
      place("blocks", 46, 14),
      crane,
    ],
    overhead: [
      ...cols
        .filter((tx) => done.has(tx))
        .map((tx): Prop => ({ prop: "column-capital", at: feet(tx) })),
      { prop: "crane-top", at: crane.at, raw: true },
    ],
    shadows: [blob(crane.at[0] + 30, crane.at[1] - 60, 10, 3, 1)],
  };
}

/** Two rows of stalls across the square, wide lanes between, each with its awning overhead. */
function market(): Placed {
  const out: Placed = { objects: [], overhead: [], shadows: [] };
  const goods = ["fish", "pots", "figs", "pots"];
  const colours = ["red", "blue", "ochre", "blue", "red"];
  [24, 34].forEach((ty, row) => {
    [30, 35, 40, 46, 51].forEach((tx, k) => {
      const stall = place("stall", tx, ty, {
        frame: goods[(k + row) % goods.length] as string,
        raw: true,
      });
      out.objects.push(stall);
      out.overhead.push({
        prop: "awning",
        frame: colours[(k + row * 2) % colours.length] as string,
        at: stall.at,
      });
      out.shadows.push(blob(stall.at[0] + 2, stall.at[1] - 4, 17, 5));
    });
  });
  return out;
}

// The four corners ---------------------------------------------------------------------------------

const FOUNTAIN: Vec = [11, 10];
const FURNACES: readonly Vec[] = [
  [64, 42],
  [69, 46],
];

function corners(): Placed {
  return {
    objects: [
      // Water: the fountain house, and jars lined up to be filled.
      place("fountain-house", FOUNTAIN[0], FOUNTAIN[1], { anim: "pour", play: true }),
      place("fountain-house", 18, 12, { anim: "pour", play: true, index: 1 }),
      ...[0, 1, 2, 3].map(
        (k): Prop => ({ prop: "amphora", at: [196 + k * 14, 214 + (k % 2) * 4] }),
      ),
      { prop: "amphora-tipped", at: [276, 230] },
      // Air: banners and washing on the windy terrace.
      {
        prop: "banner",
        raw: true,
        anim: "snap",
        play: true,
        at: [62 * T, 11 * T],
        foot: { x: 61, y: 10, w: 1, h: 1 },
      },
      {
        prop: "banner",
        raw: true,
        anim: "snap",
        play: true,
        index: 1,
        at: [70 * T, 9 * T],
        foot: { x: 69, y: 8, w: 1, h: 1 },
      },
      {
        prop: "banner",
        raw: true,
        anim: "snap",
        play: true,
        index: 2,
        at: [72 * T, 16 * T],
        foot: { x: 71, y: 15, w: 1, h: 1 },
      },
      { prop: "drying-line", raw: true, anim: "snap", play: true, at: [65 * T, 15 * T] },
      { prop: "drying-line", raw: true, anim: "snap", play: true, index: 1, at: [60 * T, 19 * T] },
      {
        prop: "banner",
        raw: true,
        anim: "snap",
        play: true,
        index: 1,
        at: [66 * T, 21 * T],
        foot: { x: 65, y: 20, w: 1, h: 1 },
      },
      // Earth: the stonecutters' yard.
      place("blocks", 9, 42),
      place("blocks", 16, 47),
      place("blocks", 21, 41),
      place("capital-fallen", 13, 45),
      place("shaft-fallen", 18, 44),
      place("blocks", 7, 47),
      place("column-stump", 24, 46, { frame: "low" }),
      place("boulder-big", 12, 39),
      // Fire: the foundry.
      ...FURNACES.map(([tx, ty], i) =>
        place("furnace", tx, ty, { anim: "glow", play: true, index: i }),
      ),
      place("amphora-rack", 60, 47, { raw: true }),
      place("furnace", 60, 41, { anim: "glow", play: true, index: 2 }),
      place("blocks", 66, 49),
      // The square's middle: a kouros on its plinth everyone gives directions by.
      place("statue", 43, 31),
      // The way into the city: the boundary stone, a rack of jars waiting to go in.
      place("horos", 72, 27),
      place("amphora-rack", 68, 33, { raw: true }),
    ],
    overhead: [],
    shadows: [],
  };
}

/** The city past the edges: houses in rows along the south and up the east, packed as a city is. */
function city(): Placed {
  const houses: Prop[] = [];
  for (const [row, shift] of [
    [52, 0],
    [56, 2],
    [60, 1],
  ] as const)
    for (let tx = shift - 2; tx < W; tx += 4)
      if (at(tx + 1, Math.min(row - 1, H - 1)) === "%" || row === 60)
        houses.push({
          prop: "house",
          frame: (tx * 7 + row) % 3 ? "a" : "b",
          at: [tx * T + 28 + ((tx * 5 + row) % 3) - 1, row * T + ((tx * 3) % 4) - 2],
          ...((tx + row) % 2 ? { flip: true } : {}),
        });
  for (const [col, shift] of [
    [74, 0],
    [78, 2],
  ] as const)
    for (let ty = shift + 4; ty < 52; ty += 4)
      if (at(col + 1, ty - 1) === "%" && at(col + 1, ty - 3) === "%")
        houses.push({
          prop: "house",
          frame: (ty + col) % 3 ? "b" : "a",
          at: [col * T + 28, ty * T],
        });
  // The old wall along the hill to the north, broken where the road climbs to 리케이온.
  const wall = Array.from({ length: W }, (_, x) => x)
    .filter((x) => x < 35 || x > 44)
    .map((x): Prop => ({ prop: "city-wall", at: [x * T + 8, 5 * T + 2] }));
  return { objects: [...houses, ...wall], overhead: [], shadows: [] };
}

const placed = merge(
  stoa(),
  market(),
  corners(),
  city(),
  trees("olive", [
    [7, 25],
    [24, 10],
    [29, 48],
    [8, 34],
  ]),
  trees("cypress", [
    [36, 8],
    [43, 8],
    [74, 24],
    [74, 35],
  ]),
);

const details: (Decal | Prop)[] = [
  { prop: "worn", at: [px(42, 30)[0] - 20, px(42, 30)[1]] },
  { prop: "oil-stain", at: [560, 560] },
  { decal: "marble-dust/shards", at: [180, 700] },
  { decal: "marble-dust/shards", at: [240, 740] },
  { decal: "marble-dust/pebbles", at: [300, 690] },
  { decal: "marble-dust/shards", at: [720, 230] },
];

const lights: LightSource[] = FURNACES.map(([tx, ty]) => ({
  at: [tx * T + 16, ty * T + 4] as Vec,
  radius: 80,
  color: "clay.light",
  intensity: 1,
  flicker: { amount: 0.18, period: 0.8 },
}));

const map: MapSource = {
  id: "p1-agora-edge",
  name: "아고라 외곽",
  seed: 1250,
  time: { clock: "12:50", phase: "noon", weather: "haze" },
  theme: "greece-noon",
  shade: "greece-shade",
  sky: "gold.pale",
  ambient: { color: "stone.bright", intensity: 0.95 },
  plan: PLAN,
  legend: GREEK_LEGEND,
  details,
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights,
  atmosphere: FURNACES.map(
    ([tx, ty], i): Prop => ({
      prop: "embers",
      anim: "rise",
      play: true,
      index: i * 5,
      at: [tx * T + 10, ty * T - 10],
    }),
  ),
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
  landmark: { name: "기중기", tile: [CRANE[0] + 1, CRANE[1] - 3] },
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
    { id: "crane", kind: "lore", rect: { x: CRANE[0], y: CRANE[1], w: 3, h: 1 } },
    { id: "fountain-house", kind: "lore", rect: { x: FOUNTAIN[0], y: FOUNTAIN[1], w: 4, h: 2 } },
  ],
  zones: [
    { id: "west-gate", kind: "safe", rect: { x: 0, y: 24, w: 9, h: 10 } },
    { id: "city-gate", kind: "safe", rect: { x: 71, y: 24, w: 9, h: 10 } },
    { id: "lyceum-road", kind: "safe", rect: { x: 34, y: 0, w: 11, h: 7 } },
    { id: "elea-road", kind: "safe", rect: { x: 47, y: 53, w: 11, h: 7 } },
    { id: "stoa-steps", kind: "gather", rect: { x: 30, y: 19, w: 26, h: 3 } },
    { id: "between-stalls", kind: "elite", rect: { x: 34, y: 27, w: 16, h: 6 } },
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
      rect: { x: 26, y: 19, w: 34, h: 22 },
      monster: "odap-pencil",
      density: 3.1,
    },
    {
      id: "way",
      kind: "monsters",
      rect: { x: 4, y: 26, w: 68, h: 8 },
      monster: "rational",
      density: 3.7,
    },
    {
      id: "fountain",
      kind: "monsters",
      rect: { x: 4, y: 7, w: 24, h: 16 },
      monster: "element-water",
      density: 5,
    },
    {
      id: "foundry",
      kind: "monsters",
      rect: { x: 56, y: 37, w: 18, h: 15 },
      monster: "element-fire",
      density: 6.5,
    },
    {
      id: "terrace",
      kind: "monsters",
      rect: { x: 56, y: 7, w: 18, h: 15 },
      monster: "element-air",
      density: 6.5,
    },
    {
      id: "yard",
      kind: "monsters",
      rect: { x: 4, y: 37, w: 24, h: 15 },
      monster: "element-earth",
      density: 5,
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
