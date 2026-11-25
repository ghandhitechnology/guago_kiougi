import type { LightSource, MapSource } from "./format.ts";
import { blob, GREEK_LEGEND, merge, type Placed, px, settle, trees } from "./greek.ts";
import type { Prop, ShadowShape, Vec } from "./layers.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 크로톤 학당, 05:50. The school stands on its headland with its back to the sea and its face to
 * the courtyard, and the courtyard is all counting floor: a hundred and twenty-eight unit squares
 * laid in rows, each numbered in pebbles, every seam dark so a crowd can count them from
 * anywhere. The school stays in the courtyard around the clock and lets nobody walk a diagonal.
 * The sun is just up out of the sea to the east and everything throws its shadow west across the
 * squares. A monochord waits on its table; the brothers have fenced the bean patch so no one has
 * to walk through it. The road in runs along the shore from the olive grove, past the boat.
 */

const T = 16;
const W = 60;
const H = 46;

/** The counting floor: its top-left tile and size in unit squares (two tiles each). */
const GRID = { x: 14, y: 16, cols: 16, rows: 8 };
const CELL = 2;
/** The school's stoa: its first bay's tile and the row of its steps. */
const SCHOOL = { x: 14, bays: 16, steps: 13 };
const LANDING: Vec = [50, 39];
const ALTAR: Vec = [49, 15];
/** The shore road east to the olive grove. */
const ROAD_Y = 41;

function paintPlan(): string {
  const g = new PlanGrid(W, H, ",");
  // Sky over the sea, then the sea round the north and east of the headland.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (y < 4) g.set(x, y, "~");
      else if (y < 8) g.set(x, y, "w");
      else if (x > 54 - Math.round(Math.sin(y / 4) * 1.5) && y < 36) g.set(x, y, "w");
      else if (x > 57 && y < 42) g.set(x, y, "w");
    }
  // A strip of shore behind the school nobody walks, the school's back to the water.
  g.rect(0, 8, W, 1, ":");
  // The cove: a beach where the boat comes in.
  g.blob(LANDING[0] + 3, LANDING[1] - 1, 6, 4.5, "w", { seed: 5, ragged: 0.2, onto: "," });
  g.blob(LANDING[0] + 1, LANDING[1] + 1, 5, 3, "_", { seed: 6, ragged: 0.2, onto: ",w" });
  // Hills to the west and south, past walking.
  for (let y = 8; y < H; y++) {
    const west = Math.round(2 + Math.sin(y / 5) * 1.2);
    for (let x = 0; x < west; x++) g.set(x, y, "%");
  }
  for (let x = 0; x < W; x++) {
    const south = Math.round(H - 3 + Math.sin(x / 6) * 1.2);
    for (let y = south; y < H; y++) if (g.at(x, y) !== "w") g.set(x, y, "%");
  }
  // Worn paths: from the landing to the courtyard, round the garden.
  g.path(
    [
      [LANDING[0], LANDING[1]],
      [44, 37],
      [34, 35],
    ],
    4,
    "_",
    { seed: 7 },
  );
  g.path(
    [
      [12, 34],
      [7, 30],
      [6, 18],
    ],
    3,
    "_",
    { seed: 8 },
  );
  g.path(
    [
      [LANDING[0] - 2, LANDING[1] + 1],
      [54, ROAD_Y],
      [W, ROAD_Y],
    ],
    3,
    "_",
    { seed: 12, ragged: 0.3 },
  );
  g.patches(",", "_", { scale: 4, threshold: 0.7, seed: 9 });
  // The courtyard: paving all round the counting floor, and the apron in front of the school.
  g.rect(GRID.x - 2, SCHOOL.steps, GRID.cols * CELL + 4, GRID.rows * CELL + 5, "m");
  g.rect(SCHOOL.x - 2, 9, SCHOOL.bays * 2 + 4, 4, "m");
  // The east headland, where they greet the sun.
  g.blob(ALTAR[0] + 1, ALTAR[1] + 2, 4, 3.5, "_", { seed: 10, ragged: 0.2 });
  g.fray(",", "_", { seed: 11, passes: 1, scale: 2.4 });
  g.majority(",", "_", 2);
  return settle(g, [LANDING[0], LANDING[1] + 1]).toString();
}

const PLAN = paintPlan();

// The school and the floor ----------------------------------------------------------------------

const BAYS = ["door", "plain", "plain", "plain", "plain", "plain", "plain", "door"];

function school(): Partial<Placed> {
  const foot = (SCHOOL.steps + 1) * T - 1;
  const sort = SCHOOL.steps * T;
  const x0 = SCHOOL.x * T;
  const bays = Array.from({ length: SCHOOL.bays }, (_, i) => BAYS[i % BAYS.length] as string);
  return {
    objects: [
      { prop: "stoa-end", frame: "w", at: [x0 - T, foot], sort },
      ...bays.map(
        (frame, i): Prop => ({ prop: "stoa-bay", frame, at: [x0 + i * 2 * T, foot], sort }),
      ),
      { prop: "stoa-end", frame: "e", at: [x0 + SCHOOL.bays * 2 * T, foot], sort },
    ],
    // The school's own shadow, thrown west by the sun coming up behind its east end.
    shadows: [
      {
        poly: [
          [x0 - T, foot - 60],
          [x0 - T, foot],
          [x0 - 6 * T, foot + 2],
          [x0 - 7 * T, foot - 40],
        ],
      },
    ],
  };
}

/** Unit squares, numbered row by row in pebbles one to ten, and the diagonal nobody walks. */
function floor(): Prop[] {
  const out: Prop[] = [];
  for (let r = 0; r < GRID.rows; r++)
    for (let c = 0; c < GRID.cols; c++) {
      const at: Vec = [(GRID.x + c * CELL) * T, (GRID.y + r * CELL) * T];
      out.push({ prop: "p1-cell", frame: `n${((r * GRID.cols + c) % 10) + 1}`, at, raw: true });
    }
  return out;
}

/** A tile's centre of the unit square at column `c`, row `r`, corner `dx`, `dy` (0 or 1). */
const corner = (c: number, r: number, dx: number, dy: number): Vec => [
  GRID.x + c * CELL + dx,
  GRID.y + r * CELL + dy,
];

/** Long morning shadows: everything standing throws its shadow west. */
function west(x: number, y: number, len: number, w = 5): ShadowShape {
  return {
    poly: [
      [x + 3, y - w / 2],
      [x + 3, y + w / 2],
      [x - len, y + w / 2 + 2],
      [x - len - 4, y - w / 2 + 1],
    ],
  };
}

const OLIVES: readonly Vec[] = [
  [6, 12],
  [9, 36],
  [20, 39],
  [30, 41],
  [41, 40],
  [4, 26],
];
const CYPRESSES: readonly Vec[] = [
  [8, 11],
  [3, 38],
  [15, 41],
  [36, 42],
  [47, 12],
  [50, 31],
];

const grove = merge(trees("olive", OLIVES, 1), trees("cypress", CYPRESSES, 2));

const lights: LightSource[] = [
  // The altar's fire, lit for the greeting.
  {
    at: [ALTAR[0] * T + 16, ALTAR[1] * T + 4],
    radius: 44,
    color: "gold.light",
    intensity: 0.5,
    flicker: { amount: 0.2, period: 0.7 },
  },
];

const placed = merge(
  school(),
  { objects: grove.objects, overhead: grove.overhead },
  {
    objects: [
      // The garden: the bean patch behind its fence, the monochord on its table, a statue of
      // the master with his back to the beans.
      place("beans", 3, 18),
      place("monochord", 6, 28),
      place("statue", 9, 22),
      place("marble-bench", 4, 32),
      // The headland: the altar for the sun, a herm, amphorae of the morning's water.
      place("altar", ALTAR[0], ALTAR[1]),
      {
        prop: "altar-fire",
        anim: "burn",
        play: true,
        at: [ALTAR[0] * T + 16, ALTAR[1] * T + 6],
        raw: true,
        sort: ALTAR[1] * T + 15,
      },
      place("herm", 52, 21),
      { prop: "amphora", at: [px(48, 20)[0], px(48, 20)[1] + 4] },
      place("pithos", 11, 14),
      // Columns at the courtyard's corners, where the counting starts.
      place("column", 12, 32, { frame: "whole" }),
      place("column", 47, 32, { frame: "whole" }),
      // The landing: the boat drawn up, nets drying, a rope to the stake.
      place("boat", LANDING[0] - 1, LANDING[1] - 2),
      place("nets", 45, 41),
      place("boulder-big", 56, 34),
    ],
    overhead: [
      { prop: "column-capital", at: [12 * T + 8, 33 * T - 2] },
      { prop: "column-capital", at: [47 * T + 8, 33 * T - 2] },
    ],
    shadows: [
      ...[...OLIVES].map(([x, y]) => west(x * T + 8, y * T + 14, 46, 12)),
      ...[...CYPRESSES].map(([x, y]) => west(x * T + 8, y * T + 14, 40, 6)),
      west(12 * T + 8, 33 * T - 2, 70, 8),
      west(47 * T + 8, 33 * T - 2, 70, 8),
      west(9 * T + 8, 22 * T + 14, 40, 6),
      west(52 * T + 8, 21 * T + 14, 30, 5),
      blob(ALTAR[0] * T + 10, ALTAR[1] * T + 14, 16, 3, 0),
    ],
  },
);

/** The tetractys before the altar: ten pebbles, one, two, three, four. */
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

const map: MapSource = {
  id: "p1-croton-school",
  name: "크로톤 학당",
  seed: 550,
  time: { clock: "05:50", phase: "morning", weather: "sea-wind" },
  theme: "greece",
  shade: "greece-shade",
  sky: "navy.dark",
  ambient: { color: "rose.pale", intensity: 0.94, sun: { dir: [-0.9, 0.08], color: "rose.light" } },
  plan: PLAN,
  legend: GREEK_LEGEND,
  backdrop: [{ prop: "dawn", at: [-60, 4], raw: true }],
  details: [
    ...floor(),
    ...tetractys(ALTAR[0] * T + 14, (ALTAR[1] + 2) * T),
    { decal: "marble-dust/shards", at: [180, 300] },
    { decal: "marble-dust/pebbles", at: [130, 560] },
  ],
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights,
  atmosphere: [
    ...[
      [56, 10],
      [57, 24],
      [52, 6],
      [20, 6],
      [40, 7],
      [56, 37],
    ].map(
      ([x, y], i): Prop => ({
        prop: "surf",
        anim: "lap",
        play: true,
        index: i % 3,
        at: [(x as number) * T, (y as number) * T],
        raw: true,
      }),
    ),
  ],
  emitters: [
    {
      sprite: "gull",
      anim: "glide",
      area: { x: -40, y: 70, w: 1000, h: 50 },
      count: 2,
      life: 40,
      velocity: [-26, 2],
    },
    {
      sprite: "mote",
      area: { x: 100, y: 200, w: 800, h: 500 },
      count: 24,
      life: 6,
      velocity: [-8, 2],
    },
  ],
  spawns: {
    main: { tile: [W - 3, ROAD_Y], facing: "left" },
    "p1-olive-road": { tile: [W - 3, ROAD_Y], facing: "left" },
  },
  landmark: { name: "셈의 마당", tile: [GRID.x + GRID.cols, GRID.y + GRID.rows] },
  blocks: [{ x: SCHOOL.x - 1, y: SCHOOL.steps - 4, w: SCHOOL.bays * 2 + 2, h: 4 }],
  portals: [
    // The road east along the shore to the olive grove.
    {
      id: "olive-road",
      rect: { x: W - 1, y: ROAD_Y - 1, w: 1, h: 3 },
      to: "p1-olive-road",
      spawn: "p1-croton-school",
    },
  ],
  interactables: [
    { id: "monochord", kind: "lore", rect: { x: 6, y: 28, w: 3, h: 1 } },
    { id: "beans", kind: "lore", rect: { x: 3, y: 18, w: 4, h: 2 } },
    { id: "altar", kind: "lore", rect: { x: ALTAR[0], y: ALTAR[1], w: 2, h: 1 } },
    {
      id: "school-steps",
      kind: "sit",
      rect: { x: SCHOOL.x, y: SCHOOL.steps, w: SCHOOL.bays * 2, h: 1 },
    },
  ],
  zones: [
    {
      id: "landing",
      kind: "safe",
      rect: { x: LANDING[0] - 4, y: LANDING[1], w: W - LANDING[0] + 4, h: 5 },
    },
    {
      id: "steps",
      kind: "gather",
      rect: { x: SCHOOL.x, y: SCHOOL.steps, w: SCHOOL.bays * 2, h: 2 },
    },
    {
      id: "grid-edge",
      kind: "monsters",
      rect: { x: GRID.x - 2, y: GRID.y - 2, w: GRID.cols * CELL + 4, h: GRID.rows * CELL + 4 },
      monster: "rational",
      density: 0.6,
    },
  ],
  arenas: [
    {
      id: "counting-floor",
      rect: { x: GRID.x, y: GRID.y, w: GRID.cols * CELL, h: GRID.rows * CELL },
      modes: [],
    },
  ],
  marks: {
    // Where the school forms up and fights from.
    boss: corner(7, 3, 1, 1),
    "grid-center": corner(7, 3, 1, 1),
    // One unit square's diagonal, top left to bottom right.
    "corner-a": corner(9, 3, 0, 0),
    "corner-b": corner(9, 3, 1, 1),
    sea: [56, 14],
  },
};

export default map;
