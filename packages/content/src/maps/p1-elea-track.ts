import type { LightSource, MapSource } from "./format.ts";
import { GREEK_LEGEND, merge, px, settle, trees } from "./greek.ts";
import type { Actor, Prop, Vec } from "./layers.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 엘레아 경주로, 12:30, no shadow to speak of and the air shaking over the sand. A stadium cut
 * along the shore below the town: stone tiers on the north side, olives and cypresses on the
 * south, and between them a track a hundred tiles long with a starting sill and no finish line.
 * Its lanes run on into the glare. Posts mark the half, then half of what is left, then half of
 * that, closer and closer, never the end. 제논 waits far down the track where the marks crowd
 * together, the space round him kept clear for his circles. The tortoise set off before anyone
 * and is still ahead, its prints in the second lane all the way from the start.
 */

const T = 16;
const W = 100;
const H = 32;

/** The track: its first and last rows, the sill's column, and the lane lines' rows. */
const TRACK = { top: 11, bottom: 22, start: 7 };
const LINES = [11, 14, 17, 20, 23] as const;
/** Where the end would be, if it came: the east edge. */
const END = W - 1;
/** Halving posts: the half, then half of what is left, and so on. */
const HALVES = [
  ["half", 1 / 2],
  ["quarter", 3 / 4],
  ["eighth", 7 / 8],
  ["sixteenth", 15 / 16],
] as const;
const at = (f: number) => Math.round(TRACK.start + (END - TRACK.start) * f);
const ZENO: Vec = [at(0.94), 17];
const TORTOISE: Vec = [W - 3, 15];

function paintPlan(): string {
  const g = new PlanGrid(W, H, ",");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (y < 4) g.set(x, y, "~");
      else if (y < 9) g.set(x, y, "%");
      else if (y > H - 4) g.set(x, y, "%");
    }
  // The track and the walks along both sides of it, all beaten sand.
  g.rect(0, 9, W, TRACK.bottom - 9 + 3, "_");
  g.patches(",", "_", { scale: 4, threshold: 0.72, seed: 4 });
  g.fray(",", "_", { seed: 5, passes: 1, scale: 2.2 });
  g.majority(",", "_", 2);
  return settle(g, [3, 17]).toString();
}

const PLAN = paintPlan();

// The track ---------------------------------------------------------------------------------------

function track(): Prop[] {
  const out: Prop[] = [];
  // Lane lines from the sill on, to the edge of the map and past it.
  for (const y of LINES)
    for (let x = TRACK.start; x < W; x += 2)
      out.push({
        prop: "p1-track",
        frame: x === TRACK.start ? "start" : "line",
        at: [x * T, y * T - 4],
        raw: true,
      });
  // The starting sill, slab by slab across the track.
  for (let y = TRACK.top; y < TRACK.bottom + 1; y += 2)
    out.push({ prop: "balbis", at: [TRACK.start * T - 12, y * T] });
  // The halving posts' marks on the sand under the south line.
  for (const [frame, f] of HALVES)
    out.push({
      prop: "p1-mark",
      frame,
      at: [at(f) * T - 16, (TRACK.bottom + 1) * T + 2],
      raw: true,
    });
  // The tortoise's prints in the second lane, from the sill to where it is now.
  for (let x = TRACK.start + 1; x < TORTOISE[0] - 1; x += 2)
    out.push({ prop: "tracks", frame: "h", at: [x * T, TORTOISE[1] * T + 4] });
  return out;
}

const OLIVES: readonly Vec[] = [
  [6, 26],
  [24, 26],
  [41, 26],
  [63, 26],
  [86, 26],
];
const CYPRESSES: readonly Vec[] = [
  [13, 26],
  [32, 26],
  [55, 26],
  [72, 26],
  [94, 26],
  [2, 8],
];

const grove = merge(trees("olive", OLIVES, 1), trees("cypress", CYPRESSES, 2));

const tortoise: Actor = {
  actor: "tortoise",
  anim: "walk",
  play: true,
  at: [TORTOISE[0] * T + 8, TORTOISE[1] * T + 12],
  shadow: "shadow-s/blob",
};

const lights: LightSource[] = [
  { at: [W * T * 0.5, 0], radius: 1600, color: "gold.pale", intensity: 0.3 },
];

const map: MapSource = {
  id: "p1-elea-track",
  name: "엘레아 경주로",
  seed: 1230,
  time: { clock: "12:30", phase: "noon", weather: "haze" },
  theme: "greece",
  shade: "greece-shade",
  sky: "navy.pale",
  ambient: { color: "gold.pale", intensity: 0.96 },
  plan: PLAN,
  legend: GREEK_LEGEND,
  backdrop: [
    { prop: "hellas-sky", at: [0, 0], repeat: 7, raw: true },
    { prop: "aegean", anim: "ripple", play: true, at: [0, 50], repeat: 7, raw: true },
    { prop: "isles", at: [-120, 51], repeat: 7, raw: true },
    { prop: "sail", anim: "bob", play: true, at: [620, 56], raw: true },
  ],
  details: track(),
  shadows: grove.shadows,
  objects: [
    ...grove.objects,
    // The tiers, end to end along the north side.
    ...Array.from({ length: W / 2 }, (_, i) => i * 2).map(
      (x): Prop => ({ prop: "tiers", at: [x * T, 9 * T - 1], sort: 8 * T }),
    ),
    // Herms at the sill, a statue of the teacher who said all is one, water for the runners.
    place("herm", TRACK.start - 2, TRACK.top),
    place("herm", TRACK.start - 2, TRACK.bottom + 1),
    place("statue", 2, 11),
    { prop: "amphora", at: [px(4, 24)[0], px(4, 24)[1] + 4] },
    { prop: "amphora-tipped", at: [px(5, 24)[0] + 6, px(5, 24)[1] + 5] },
    place("pithos", 2, 23),
    // A post at every halving, on the south walk, each nearer the last.
    ...HALVES.map(([, f]) => place("column-stump", at(f), TRACK.bottom + 2, { frame: "high" })),
    tortoise,
  ],
  overhead: grove.overhead,
  lights,
  emitters: [
    // Heat off the sand.
    {
      sprite: "mote",
      area: { x: 0, y: 160, w: W * T, h: 240 },
      count: 50,
      life: 5,
      velocity: [3, -10],
    },
  ],
  spawns: {
    main: { tile: [3, 17], facing: "right" },
    "p1-agora-edge": { tile: [3, 17], facing: "right" },
  },
  landmark: { name: "끝나지 않는 주로", tile: [at(0.75), 17] },
  blocks: [{ x: 0, y: 4, w: W, h: 5 }],
  portals: [
    {
      id: "agora-edge",
      rect: { x: 0, y: 15, w: 1, h: 5 },
      to: "p1-agora-edge",
      spawn: "p1-elea-track",
    },
  ],
  interactables: [
    { id: "teacher", kind: "lore", rect: { x: 2, y: 11, w: 1, h: 1 } },
    { id: "tiers", kind: "sit", rect: { x: 23, y: 9, w: 27, h: 1 } },
  ],
  zones: [
    { id: "sill", kind: "safe", rect: { x: 0, y: 9, w: TRACK.start, h: 16 } },
    { id: "tiers-walk", kind: "gather", rect: { x: 8, y: 9, w: 40, h: 2 } },
  ],
  arenas: [
    {
      id: "track",
      rect: { x: TRACK.start, y: TRACK.top, w: W - TRACK.start, h: TRACK.bottom - TRACK.top + 1 },
      modes: [],
    },
  ],
  marks: {
    start: [TRACK.start + 1, 17],
    // 제논's spot, and the three limit circles laid out in front of him, halving.
    boss: ZENO,
    zeno: ZENO,
    rings: [at(0.85), 17],
    "ring-96": [at(0.78), 17],
    "ring-48": [at(0.85), 17],
    "ring-24": [at(0.885), 17],
    finish: [END, 17],
    tortoise: TORTOISE,
    ...Object.fromEntries(
      HALVES.map(([name, f]) => [`post-${name}`, [at(f), TRACK.bottom] as Vec]),
    ),
  },
};

export default map;
