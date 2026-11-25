import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, smooth, tidy } from "../../paint.ts";

/**
 * 생태공원: the garden built to show off flowers, now weeds to the knee. The water sculpture in
 * the middle stopped running long ago and its basin is green; reeds have the pond; the bugs have
 * everything else. At the gate somebody laid fresh turf. Campus colours, lit from the top left.
 */
const palette: Legend = {
  ".": null,
  // concrete and steel
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  I: "navy.light",
  i: "navy.pale",
  // algae and weeds
  F: "grass.deep",
  D: "grass.dark",
  G: "grass.mid",
  q: "grass.soft",
  g: "grass.light",
  h: "grass.pale",
  H: "grass.bright",
  // fresh turf, brighter than anything else on the lawn
  // reeds
  B: "wood.deep",
  b: "wood.dark",
  u: "wood.mid",
  U: "wood.light",
  // weed flowers
  y: "gold.light",
  v: "plum.light",
  // bugs
  j: "ink.deep",
  J: "ink.dark",
  s: "sea.light",
  x: null,
};

const one = (
  name: string,
  size: [number, number],
  grid: string,
  extra: Partial<Parameters<typeof sprite>[0]> = {},
) =>
  sprite({
    name,
    size,
    palette,
    frames: { still: grid },
    anim: { idle: { frames: ["still"], fps: 1 } },
    ...extra,
  });

function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "d");
  return pic.toString();
}

/**
 * The water sculpture: three steel ribbons twisting up from a concrete drum in a round basin,
 * the basin's water gone green and furred, a tidemark of algae up the drum where it used to run.
 */
function sculpture(): string {
  const W = 64;
  const H = 70;
  const pic = Pic.blank(W, H);
  // The basin: a round concrete lip around green water.
  const lip = lobes([{ x: 32, y: 56, rx: 30, ry: 13 }]);
  const water = lobes([{ x: 32, y: 56, rx: 26, ry: 10 }]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!lip(x, y)) continue;
      if (water(x, y))
        pic.set(x, y, (x * 3 + y * 7) % 11 === 0 ? "q" : (x + y * 5) % 13 === 0 ? "h" : "G");
      else pic.set(x, y, y < 54 ? "k" : y < 64 ? "K" : "M");
    }
  // Scum at the water's edge.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (water(x, y) && !water(x, y - 2) && (x + y) % 3 !== 0) pic.set(x, y, "g");
  // The drum, its tidemark.
  for (let y = 36; y < 56; y++)
    for (let x = 25; x < 39; x++)
      pic.set(x, y, x < 27 ? "k" : x > 36 ? "M" : y > 48 ? "D" : y > 46 ? "G" : "K");
  for (let x = 25; x < 39; x++) pic.set(x, 35, "w").set(x, 36, "k");
  // Three ribbons of steel twisting up out of the drum.
  for (let k = 0; k < 3; k++) {
    for (let y = 2; y < 36; y++) {
      const t = (36 - y) / 34;
      const x = 32 + Math.sin(t * 5.2 + (k * Math.PI * 2) / 3) * (3 + t * 6);
      const front = Math.cos(t * 5.2 + (k * Math.PI * 2) / 3) > 0;
      const xi = Math.round(x);
      pic
        .set(xi, y, front ? "i" : "I")
        .set(xi + 1, y, front ? "w" : "K")
        .set(xi + 2, y, front ? "K" : "M");
    }
  }
  // Algae streaks down the ribbons' low ends.
  for (let y = 26; y < 36; y++)
    for (let x = 20; x < 44; x++) if (pic.at(x, y) === "K" && (x + y) % 4 === 0) pic.set(x, y, "D");
  return smooth(tidy(seal(pic, "d"), "G", "dq"), "d").toString();
}

/** A clump of weeds to the knee, a flower or two in it, leaning in the breeze. */
function weedClump(lean: number, flower: string): string {
  const W = 20;
  const H = 18;
  const pic = Pic.blank(W, H);
  const blades: readonly [number, number][] = [
    [3, 10],
    [5, 15],
    [7, 12],
    [9, 16],
    [11, 13],
    [13, 15],
    [15, 11],
    [17, 8],
    [10, 9],
  ];
  blades.forEach(([x0, hgt], i) => {
    for (let k = 0; k < hgt; k++) {
      const y = H - 1 - k;
      const x = Math.round(x0 + (k / hgt) ** 2 * (lean + (i % 3) - 1) * 2);
      pic.set(x, y, k > hgt - 3 ? "h" : k > hgt / 2 ? "g" : "G");
      if (k < hgt - 2) pic.set(x + 1, y, k > hgt / 2 ? "G" : "D");
    }
  });
  for (let x = 2; x < 18; x++) pic.set(x, H - 1, "D").set(x, H - 2, x % 3 ? "G" : "D");
  pic.put(`${flower}${flower}\n${flower}${flower}`, 8 + lean, 2);
  return smooth(pic, flower).toString();
}

/** Reeds at the pond's edge: blades and brown cattail heads. */
function reeds(lean: number): string {
  const W = 16;
  const H = 24;
  const pic = Pic.blank(W, H);
  for (const [x0, hgt, head] of [
    [3, 18, true],
    [6, 22, false],
    [8, 20, true],
    [11, 16, false],
    [13, 19, true],
  ] as const) {
    for (let k = 0; k < hgt; k++) {
      const x = Math.round(x0 + (k / hgt) ** 2 * lean * 2);
      pic.set(x, H - 1 - k, k > hgt * 0.7 ? "g" : "G");
    }
    if (head) {
      const x = Math.round(x0 + lean * 2);
      pic.put("bb\nUb\nUb\nbb", x - 1, H - hgt - 1);
    }
  }
  return smooth(seal(pic, "F", "bU"), "F").toString();
}

/** A cloud of gnats, four frames of them milling. Raw. */
function gnats(frame: number): string {
  const pic = Pic.blank(11, 11);
  for (let k = 0; k < 7; k++) {
    const a = k * 2.1 + frame * 1.3 + (k % 2) * frame;
    const r = 2 + ((k * 3) % 4);
    pic.set(Math.round(5 + Math.cos(a) * r), Math.round(5 + Math.sin(a * 1.3) * r * 0.7), "J");
  }
  return pic.toString();
}

/** A dragonfly, two wingbeats. Raw. */
const DRAGONFLY = [
  `
    ..i.i..
    ss.j.ss
    ...j...
    ...j...
  `,
  `
    .i...i.
    ...j...
    ssJjJss
    ...j...
  `,
];

/** Fresh turf laid in rolls at the gate, its seams still showing. Flat. */
function sod(): string {
  const W = 48;
  const H = 30;
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const seam = y % 10 === 9 || (x + (Math.floor(y / 10) % 2) * 12) % 24 === 23;
      const tuft = (x * 7 + y * 11) % 13 === 0;
      pic.set(x, y, seam ? "q" : tuft ? "H" : "h");
    }
  return smooth(pic).toString();
}

/** Lily pads, one with a flower. Flat. */
const LILY = `
  ..GGGG......
  .GggggG.....
  GggGgggG.GG.
  GggGggggGggG
  .GgggggGgvvG
  ..GGGGG.GvvG
  ........GGG.
`;

/** A wisp of morning mist lying on the water, thin dithered streaks. Raw. */
function mist(): string {
  const W = 56;
  const H = 7;
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const body = 1 - Math.abs(y - 3) / 3.5 - Math.abs(x - 28) / 30;
      if (body > 0.35 ? (x + y) % 2 === 0 : body > 0.12 && (x + y * 3) % 4 === 0)
        pic.set(x, y, "w");
    }
  return pic.toString();
}

/** The little plaque on the basin's rim. */
const PLAQUE = `
  dddddddd
  dwkkkkKd
  dkSSSSKd
  dkSSkSKd
  dKKKKKMd
  dddddddd
  ...dd...
  ...dd...
`;

export default [
  one("water-sculpture", [64, 70], sculpture(), {
    lone: "q",
    shadow: oval(64, 70, 34, 67, 30, 3),
  }),
  sprite({
    name: "weed-clump",
    size: [20, 18],
    palette,
    outline: false,
    lone: "yv",
    frames: {
      a0: weedClump(0, "y"),
      a1: weedClump(1, "y"),
      b0: weedClump(-1, "v"),
      b1: weedClump(0, "v"),
    },
    anim: { sway: { frames: ["a0", "a1"], fps: 1.4 }, sway2: { frames: ["b0", "b1"], fps: 1.2 } },
  }),
  sprite({
    name: "reeds",
    size: [16, 24],
    palette,
    outline: false,
    frames: { a: reeds(0), b: reeds(1) },
    anim: { sway: { frames: ["a", "b"], fps: 1.1 } },
  }),
  sprite({
    name: "gnats",
    size: [11, 11],
    origin: [5, 5],
    palette,
    lone: "J",
    outline: false,
    frames: Object.fromEntries([0, 1, 2, 3].map((f) => [`mill${f}`, gnats(f)])),
    anim: { mill: { frames: ["mill0", "mill1", "mill2", "mill3"], fps: 8, jump: 1 } },
  }),
  sprite({
    name: "dragonfly",
    size: [7, 4],
    origin: [3, 2],
    palette,
    lone: "ijsJ",
    outline: false,
    frames: { beat0: DRAGONFLY[0] as string, beat1: DRAGONFLY[1] as string },
    anim: { beat: { frames: ["beat0", "beat1"], fps: 10, jump: 1 } },
  }),
  sprite({
    name: "sod",
    size: [48, 30],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { still: sod() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "lily",
    size: [12, 7],
    palette,
    outline: false,
    frames: { still: tidy(Pic.of(LILY), "g", "Gv").toString() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "mist",
    size: [56, 7],
    origin: [28, 3],
    palette,
    lone: "w",
    outline: false,
    frames: { still: mist() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  one("plaque", [8, 8], smooth(Pic.of(PLAQUE), "dS").toString(), { lone: "S" }),
];
