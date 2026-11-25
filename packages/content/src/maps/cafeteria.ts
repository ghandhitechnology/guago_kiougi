import type { Interactable, LightSource, MapSource, Thing } from "./format.ts";
import { backWall, mount, sideShade } from "./indoor.ts";
import type { Prop } from "./layers.ts";
import { place } from "./props.ts";

/**
 * 급식실 at 12:40, the second lunch wave. Time stopped mid-ladle: the line runs right to left
 * from the tray stacks past rice and soup, the cook's window hands out seconds, noon comes in
 * short and bright through two windows, and four long rows of tables fill with whoever came in.
 * In the back corner, behind the rice sacks, is the steel door the cook sits beside on her
 * break and says is a storeroom.
 */

const T = 16;
const WALL = 0;
/** Table rows: the table itself on these rows, benches above and below. */
const TABLE_ROWS = [11, 16, 21];
/** Left tile of each run of two tables. */
const RUNS = [3, 13, 23, 33];
const LINE_Y = 7 * T - 2;

/** The serving line, right to left: trays, rice and soup twice, kimchi and greens, the main. */
const LINE: readonly [number, string][] = [
  [64, "bulgogi-pickles"],
  [96, "kimchi-greens"],
  [128, "rice-soup"],
  [160, "rice-soup"],
  [192, "trays"],
];

function servingLine(): Thing[] {
  return [
    { prop: "serving-line", frame: "cap-l", at: [61, LINE_Y] },
    ...LINE.map(
      ([x, frame], i): Thing => ({
        prop: "serving-line",
        frame,
        at: [x, LINE_Y],
        ...(i === 0 ? { foot: { x: 4, y: 6, w: 10, h: 1 } } : {}),
      }),
    ),
    { prop: "serving-line", frame: "cap-r", at: [195, LINE_Y] },
  ];
}

/** Which tables still have lunch on them: most, a few finished, one nobody cleared. */
const FRAMES = ["lunch", "lunch", "late", "lunch", "empty", "lunch", "lunch", "late"];

function tables(): Thing[] {
  const out: Thing[] = [];
  TABLE_ROWS.forEach((row, r) => {
    RUNS.forEach((x, c) => {
      const k = r * RUNS.length + c;
      // The far bench sits close under the table's back edge, so its seat shows above the top.
      const far = { nudge: [0, -8] as const };
      out.push(place("meal-bench", x, row - 1, far), place("meal-bench", x + 4, row - 1, far));
      out.push(
        place("long-table", x, row, { frame: FRAMES[k % FRAMES.length] as string }),
        place("long-table", x + 4, row, { frame: FRAMES[(k + 3) % FRAMES.length] as string }),
      );
      const near = { nudge: [0, -4] as const };
      out.push(place("meal-bench", x, row + 1, near), place("meal-bench", x + 4, row + 1, near));
    });
  });
  return out;
}

function seats(): { id: string; kind: Interactable["kind"]; rect: Interactable["rect"] }[] {
  return TABLE_ROWS.flatMap((row, r) =>
    RUNS.flatMap((x, c) => [
      { id: `seat-${r}-${c}-n`, kind: "sit" as const, rect: { x, y: row - 1, w: 8, h: 1 } },
      { id: `seat-${r}-${c}-s`, kind: "sit" as const, rect: { x, y: row + 1, w: 8, h: 1 } },
    ]),
  );
}

/** A pendant over each run of tables, and the pool it throws. */
const pendants: Prop[] = TABLE_ROWS.flatMap((row) =>
  RUNS.map((x): Prop => ({ prop: "pendant", frame: "on", at: [(x + 4) * T, (row + 1) * T - 34] })),
);

const sun = (cx: number): LightSource => ({
  at: [cx + 14, 104],
  radius: 64,
  color: "gold.pale",
  intensity: 0.5,
  paint: {
    bands: ["campus", "campus-lamp"],
    spill: { top: [cx - 13, cx + 13, 66], bottom: [cx - 2, cx + 36, 148] },
    ragged: 2,
  },
});

const lights: LightSource[] = [
  sun(392),
  sun(472),
  // The kitchen behind the cook's window.
  {
    at: [264, 70],
    radius: 44,
    color: "gold.light",
    intensity: 0.45,
    paint: { bands: ["campus"], at: [264, 74], r: [40, 14], ragged: 2 },
  },
  ...TABLE_ROWS.flatMap((row) =>
    RUNS.map(
      (x): LightSource => ({
        at: [(x + 4) * T, row * T + 4],
        radius: 72,
        color: "gold.pale",
        intensity: 0.35,
        paint: { bands: ["campus-lamp"], at: [(x + 4) * T, row * T + 6], r: [72, 26], ragged: 3 },
      }),
    ),
  ),
];

const map: MapSource = {
  id: "cafeteria",
  name: "급식실",
  seed: 1240,
  time: { clock: "12:40", phase: "noon", weather: "clear" },
  theme: "campus-dusk",
  sky: "ink.deep",
  ambient: { color: "stone.pale", intensity: 0.86 },
  plan: `
    ##########################################
    #||||||||||||||||||||||||||||||||||||||||#
    #||||||||||||||||||||||||||||||||||||||||#
    #||||||||||||||||||||||||||||||||||||||||#
    #__kkkkkkkkkkkk__________________________#
    #__kkkkkkkkkkkk__________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    #________________________________________#
    _________________________________________#
    _________________________________________#
    #________________________________________#
    #__________________mmmm__________________#
    #__________________mmmm__________________#
    ###################____###################
  `,
  legend: {
    "#": { terrain: "tile", solid: "#" },
    "|": { terrain: "tile", solid: "#" },
    k: { terrain: "tile", solid: "#" },
    _: { terrain: "tile" },
    m: { terrain: "mat" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  details: [
    { prop: "floor-marks", frame: "puddle", at: [210, 404] },
    { prop: "tray-spill", at: [470, 296] },
  ],
  shadows: [...sideShade(1, 4, 25), ...sideShade(1, 27, 30)],
  objects: [
    // The back wall: the kitchen door behind the line, the cook's window, the menu, two windows
    // and the clock, the tray return, and in the corner the door down.
    ...backWall("wall-tiled", 1, 41, WALL, { worn: [12, 30], outlet: [22] }),
    mount("door-double", 104, WALL, { frame: "open" }),
    mount("cook-window", 264, WALL, { anim: "cook", play: true }),
    mount("menu-board", 328, WALL),
    mount("window", 392, WALL, { frame: "day" }),
    mount("wall-clock", 432, WALL, { anim: "tick", play: true }),
    mount("window", 472, WALL, { frame: "day-curtain" }),
    mount("tray-return", 552, WALL, { anim: "run", play: true }),
    mount("basement-door", 608, WALL, { frame: "taped" }),
    mount("poster", 168, WALL, { frame: "safety" }),
    // Behind the glass: two servers on the line.
    { prop: "cook", anim: "serve", play: true, at: [100, 88] },
    { prop: "cook", anim: "serve", play: true, index: 1, at: [164, 88], flip: true },
    ...servingLine(),
    // The back corner: tray trolley, the leftover bin, rice sacks, the cook's stool.
    place("tray-trolley", 31, 4),
    place("scrap-bin", 34, 4),
    place("rice-sacks", 39, 4),
    { prop: "cook-stool", at: [584, 94] },
    ...tables(),
    // The entrance: wash troughs either side of the walk in, water by the wall.
    place("sink-row", 13, 26),
    place("sink-row", 25, 26),
    place("water-cooler", 37, 25, { anim: "glug", play: true }),
    place("water-cooler", 38, 25),
    // What lunch leaves on the floor: bags dropped by the benches, umbrellas by the door.
    { prop: "bag", frame: "navy", at: [150, 240] },
    { prop: "bag", frame: "red", at: [400, 316] },
    { prop: "bag", frame: "green", at: [610, 236] },
    { prop: "bag", frame: "slump", at: [260, 396] },
    { prop: "umbrella", at: [292, 466] },
    { prop: "umbrella", at: [372, 466], flip: true },
    place("sad-plant", 1, 29),
    place("sad-plant", 40, 29),
  ],
  overhead: [
    ...pendants,
    // 엔트로피 under the cook's stool, waiting for the break to start.
    { prop: "entropy", anim: "idle", play: true, at: [566, 108], raw: true },
  ],
  lights,
  emitters: [
    {
      sprite: "steam",
      anim: "rise",
      area: { x: 70, y: 74, w: 140, h: 8 },
      count: 4,
      life: 2.4,
      velocity: [1, -7],
    },
  ],
  spawns: {
    main: { tile: [20, 28], facing: "up" },
    yard: { tile: [20, 28], facing: "up" },
    lounge: { tile: [2, 25], facing: "right" },
  },
  landmark: { name: "배식대", tile: [8, 6] },
  portals: [
    { id: "yard", rect: { x: 19, y: 30, w: 4, h: 1 }, to: "campus-yard", spawn: "cafeteria" },
    { id: "lounge", rect: { x: 0, y: 25, w: 1, h: 2 }, to: "lounge", spawn: "cafeteria" },
  ],
  interactables: [
    { id: "serving-line", kind: "shop", rect: { x: 4, y: 6, w: 10, h: 1 } },
    { id: "cook-window", kind: "lore", rect: { x: 15, y: 3, w: 3, h: 1 } },
    { id: "menu", kind: "notice", rect: { x: 19, y: 3, w: 2, h: 1 } },
    { id: "tray-return", kind: "lore", rect: { x: 33, y: 3, w: 3, h: 1 } },
    { id: "basement-door", kind: "locked", rect: { x: 37, y: 3, w: 2, h: 1 } },
    { id: "water", kind: "lore", rect: { x: 37, y: 25, w: 2, h: 1 } },
    ...seats(),
  ],
  zones: [
    { id: "cafeteria", kind: "safe", rect: { x: 0, y: 0, w: 42, h: 31 } },
    { id: "line", kind: "gather", rect: { x: 3, y: 7, w: 13, h: 2 } },
    { id: "tables", kind: "gather", rect: { x: 2, y: 9, w: 39, h: 14 } },
  ],
  npcs: [
    { speaker: "cook", tile: [36, 5] },
    { speaker: "sagam", tile: [33, 6], facing: "left" },
  ],
};

export default map;
