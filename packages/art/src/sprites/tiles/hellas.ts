import { type Legend, terrain } from "../../format.ts";
import {
  despeckle,
  inside,
  type Mark,
  Pic,
  paint,
  type Shape,
  smooth,
  texture,
  tidy,
  tileOf,
} from "../../paint.ts";

/**
 * Page 1 land past the agora: the shore where the dust meets the Aegean, and the limestone that
 * breaks through the hills. Both sit on the same dust as the campus dirt and the marble paving,
 * drawn in the campus colours that each era theme bleaches, so a field can run from paving to
 * beach to cliff without a seam.
 */
const palette: Legend = {
  ".": null,
  // dust (the campus dirt, bleached by the theme)
  b: "wood.pale",
  m: "wood.light",
  n: "wood.mid",
  E: "wood.dark",
  c: "clay.pale",
  // limestone
  w: "stone.bright",
  k: "stone.pale",
  K: "stone.light",
  v: "stone.vein",
  M: "stone.mid",
  S: "stone.dark",
  d: "stone.deep",
  // water, shallow to deep
  q: "sea.pale",
  s: "sea.light",
  a: "sea.mid",
  A: "sea.dark",
  // scrub and lichen on the rock
  r: "clay.light",
  l: "olive.light",
  o: "olive.mid",
  O: "olive.dark",
  // working cells
  x: null,
};

const P = (src: string): Pic => Pic.of(src);

/** A small deterministic hash in [0, 1). */
function h(x: number, y: number, s: number): number {
  let v = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
}

/** Distance from (x, y) to the nearest pixel where `want` holds, up to `cap`. */
function distTo(
  x: number,
  y: number,
  test: (x: number, y: number) => boolean,
  want: boolean,
  cap: number,
): number {
  let best = cap + 1;
  for (let dy = -cap; dy <= cap; dy++)
    for (let dx = -cap; dx <= cap; dx++)
      if (test(x + dx, y + dy) === want) best = Math.min(best, Math.hypot(dx, dy));
  return best;
}

// Dust ----------------------------------------------------------------------------------------

const crack = P(`
  n...
  .nn.
  ...n
`);
const pebble = P(`
  .kK.
  kKKM
  .MM.
`);
const dry = P(`
  cc.
  .cc
`);
const rut = P(`
  mm....
  ..mmmm
`);

const DUST: readonly (readonly Mark[])[] = [
  [[3, 4, crack]],
  [[9, 9, pebble]],
  [[2, 11, dry]],
  [],
  [[8, 2, rut]],
];

// The shore -----------------------------------------------------------------------------------

/** Two coastlines: long bays and short headlands between the fixed seam points. */
const SHORE_SHAPES: readonly Shape[] = [
  {
    top: [0, 0, 1, 2, 2, 1, 0, -1, -2, -2, -1, 0, 1, 1, 0, 0],
    bottom: [0, 0, -1, -1, 0, 1, 2, 2, 1, 0, -1, -2, -1, 0, 0, 0],
    left: [0, 0, 1, 2, 1, 0, -1, -2, -2, -1, 0, 1, 1, 0, 0, 0],
    right: [0, 0, -1, -2, -2, -1, 0, 1, 2, 2, 1, 0, -1, 0, 0, 0],
    radius: 6,
    holeRadius: 5,
  },
  {
    top: [0, 0, -1, -2, -1, 0, 1, 2, 2, 1, 0, -1, -1, 0, 0, 0],
    bottom: [0, 0, 1, 2, 2, 1, 0, -1, -2, -1, 0, 1, 1, 0, 0, 0],
    left: [0, 0, -1, -1, 0, 1, 2, 2, 1, 0, -1, -1, 0, 0, 0, 0],
    right: [0, 0, 1, 2, 1, 0, -1, -1, 0, 1, 2, 1, 0, 0, 0, 0],
    radius: 5,
    holeRadius: 4,
  },
];

/**
 * Dust standing over water, lit from the top left. The land's edge darkens where the sea wets
 * it; under its south edge a low bank face drops to the water and shades it; the sea foams pale
 * where it touches the land on the other sides, then runs shallow and light for a few pixels,
 * ragged so the shallows never trace the tile, before the deep fill shows through.
 */
function shorePicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = paint(size, size, isIn, {
    fill: "b",
    top: "m",
    left: "m",
    right: "m",
    bottom: ["m"],
    lip: ["n", "E"],
    under: "A",
    beside: "A",
    ring: "q",
  });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isIn(x, y) || pic.at(x, y) !== ".") continue;
      const d = distTo(x, y, isIn, true, 5);
      // The shallows swell and narrow in long smooth waves, never in steps.
      const reach =
        3 + 1.2 * Math.sin((x + y) * 0.45 + v * 1.7) + 0.6 * Math.sin(x * 0.9 - y * 0.3);
      if (d <= 1.2) pic.set(x, y, "q");
      else if (d <= reach) pic.set(x, y, "s");
    }
  }
  // Wet sand darkens a second row where the water laps highest.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pic.at(x, y) !== "b") continue;
      const d = distTo(x, y, isIn, false, 2);
      if (d <= 2 && h(x, y, v + 3) < 0.45) pic.set(x, y, "m");
    }
  }
  texture(pic, [DUST[(v + 1) % DUST.length] ?? []], "b");
  return smooth(despeckle(pic, isIn, "b"), "b").toString();
}

/** Open water: sea.mid with short lit ripples, sparse so a horde reads over it. */
const ripple = P(`
  ss.
  .ss
`);
const swell = P(`
  .sss
  ss..
`);
const WATER: readonly (readonly Mark[])[] = [
  [
    [3, 4, ripple],
    [10, 11, swell],
  ],
  [[8, 6, swell]],
  [],
  [[2, 10, ripple]],
];

const shore = terrain({
  name: "shore",
  upper: "dirt",
  lower: "water",
  themes: ["greece", "olive-morning"],
  palette,
  outer: SHORE_SHAPES.map((s, v) => shorePicture("outer", s, v)),
  inner: SHORE_SHAPES.map((s, v) => shorePicture("inner", s, v + 2)),
  base: WATER.map((marks) => tileOf("a", marks)),
  fill: DUST.slice(1).map((marks) => tileOf("b", marks)),
  decals: {
    glint: {
      on: "lower",
      density: 0.05,
      grid: `
        .qq..
        ss.ss
      `,
    },
    rocks: {
      on: "lower",
      density: 0,
      grid: `
        ..dd....
        .dkKd...
        dkKKMSd.
        dKMMMSSd
        .dddddd.
      `,
    },
  },
});

// Limestone outcrops ----------------------------------------------------------------------------

/** Rock edges: blocky, fractured lines, never round. */
const ROCK_SHAPES: readonly Shape[] = [
  {
    top: [0, 0, 1, 1, 1, 2, 2, 0, 0, -1, -1, 0, 1, 1, 0, 0],
    bottom: [0, 0, 0, 1, 1, 1, 0, 0, -1, -1, -1, 0, 0, 1, 0, 0],
    left: [0, 0, -1, -1, 0, 0, 1, 2, 2, 1, 0, 0, -1, 0, 0, 0],
    right: [0, 0, 1, 1, 0, -1, -1, -1, 0, 1, 1, 1, 0, 0, 0, 0],
    radius: 2,
    holeRadius: 2,
  },
  {
    top: [0, 0, -1, -1, 0, 1, 1, 1, 0, 0, 2, 2, 1, 0, 0, 0],
    bottom: [0, 0, 1, 1, 0, 0, -1, -1, -1, 0, 1, 1, 0, 0, 0, 0],
    left: [0, 0, 1, 1, 1, 0, 0, -1, -1, 0, 1, 1, 0, 0, 0, 0],
    right: [0, 0, -1, 0, 1, 1, 1, 0, -1, -1, 0, 1, 1, 0, 0, 0],
    radius: 1,
    holeRadius: 2,
  },
];

/** Scrub and fissures on a rock's top: thyme and sage clumps, cracks along the bedding. */
const scrub = P(`
  .ll.
  llOo
  .OOo
`);
const sprig = P(`
  ll.
  .oo
`);
const fissure = P(`
  M...
  .MM.
  ...M
`);
const ledge = P(`
  kkk.
  .vvv
`);
const lichen = P(`
  rr.
  .rr
`);
const pocket = P(`
  .vv.
  vMMv
  .vv.
`);
const ROCK_TOPS: readonly (readonly Mark[])[] = [
  [
    [3, 3, scrub],
    [10, 10, fissure],
    [11, 2, lichen],
  ],
  [
    [8, 4, ledge],
    [2, 10, scrub],
  ],
  [
    [2, 9, sprig],
    [9, 2, fissure],
    [10, 11, pocket],
  ],
  [
    [10, 9, scrub],
    [3, 3, lichen],
    [4, 11, sprig],
  ],
  [
    [6, 6, pocket],
    [12, 1, sprig],
  ],
];

/**
 * A limestone outcrop standing six pixels over the dust. Its top is pale and lit along the
 * north and west edges; its south face falls in strata, broken by vertical joints where it
 * split, and throws a contact shadow on the ground; the east side shades the dust beside it.
 */
function rockPicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const lip = ["k", "v", "v", "M", "M", "S"];
  const pic = paint(size, size, isIn, {
    fill: "K",
    top: "k",
    left: "k",
    right: "v",
    bottom: ["v"],
    lip,
    under: "n",
    beside: "m",
    ring: "m",
  });
  // Joints down the face: a darker column every few pixels, offset per variant.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = pic.at(x, y);
      if (ch !== "v" && ch !== "M") continue;
      if (isIn(x, y)) continue;
      if ((x * 3 + v * 5) % 11 === 0 || ((x * 7 + v) % 13 === 0 && y % 3 !== 0)) pic.set(x, y, "S");
    }
  }
  texture(pic, ROCK_TOPS, "K", (cx, cy) => cx * 2 + cy + v);
  return smooth(despeckle(tidy(pic, "K", "kvMSnm"), isIn, "K"), "K").toString();
}

const cliff = terrain({
  name: "cliff",
  upper: "rock",
  lower: "dirt",
  themes: ["greece", "olive-morning"],
  palette,
  outer: ROCK_SHAPES.map((s, v) => rockPicture("outer", s, v)),
  inner: ROCK_SHAPES.map((s, v) => rockPicture("inner", s, v + 1)),
  base: DUST.map((marks) => tileOf("b", marks)),
  fill: ROCK_TOPS.slice(1).map((marks) => tileOf("K", marks)),
  decals: {
    scree: {
      on: "lower",
      density: 0,
      grid: `
        .kK...kk
        kKMM.kkM
        .MM...MM
        ...kK...
        ..kKMM..
        ...MM...
      `,
    },
  },
});

export default [shore, cliff];
