import { type Legend, overlay, terrain } from "../../format.ts";
import { inside, type Mark, Pic, paint, type Shape, texture, tidy, tileOf } from "../../paint.ts";

/**
 * Page 1 ground. The agora's marble paving sits a hand's height above the dust, slabs chipped
 * at the corners. The dust is the campus dirt drawn in the same colours, which the `greece`
 * theme bleaches pale, so paving, paths and dry grass all share one ground.
 *
 * The rift edge is an overlay drawn over both worlds: where the field's sand tears open onto
 * the era's ground, a lip of torn earth, then a seam of light.
 */
const palette: Legend = {
  ".": null,
  // marble
  w: "stone.bright",
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  S: "stone.dark",
  // dust (the campus dirt, bleached by the theme)
  b: "wood.pale",
  m: "wood.light",
  n: "wood.mid",
  e: "wood.mid",
  E: "wood.dark",
  c: "clay.pale",
  // shards
  r: "clay.light",
  R: "clay.mid",
  // rift light
  W: "stone.bright",
  q: "sea.pale",
  Q: "sea.light",
  s: "sea.mid",
  p: "plum.light",
  P: "plum.mid",
  // the rift's halo on the ground outside it
  h: "sea.pale",
  // moss
  G: "grass.mid",
  D: "grass.dark",
  // working cells
  x: null,
};

const P = (src: string): Pic => Pic.of(src);

// Marble paving --------------------------------------------------------------------------------

/**
 * One slab per tile, joints on its right and bottom edges so slabs repeat into a grid of
 * squares. Variants crack, chip and stain differently.
 */
function slab(marks: readonly Mark[], chip: "none" | "tl" | "br"): string {
  const pic = Pic.blank(16, 16, "w");
  for (let i = 0; i < 16; i++) pic.set(15, i, "K").set(i, 15, "K").set(14, i, "k").set(i, 14, "k");
  pic.set(15, 14, "K").set(14, 15, "K");
  if (chip === "tl") pic.put(P("KK\nK."), 0, 0);
  if (chip === "br") pic.put(P(".kK\nkKK\nKKK"), 13, 13);
  texture(pic, [marks], "w");
  return tidy(pic, "w", "kKM").toString();
}

const vein = P(`
  k...
  .kk.
  ...k
`);
const crackSlab = P(`
  K..
  .K.
  .KK
`);
const stain = P(`
  .kk
  kkk
  .k.
`);

const SLABS = [
  slab([[4, 5, vein]], "none"),
  slab([[8, 3, crackSlab]], "tl"),
  slab([[3, 8, stain]], "none"),
  slab([], "br"),
];

/** Slab edges over dust: the slab's chipped face under its south edge, its shadow beyond. */
const MARBLE_SHAPES: readonly Shape[] = [
  {
    top: [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bottom: [0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0],
    left: [0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0],
    right: [0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    radius: 1,
    holeRadius: 1,
  },
  {
    top: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0],
    bottom: [0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    left: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0],
    right: [0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0],
    radius: 2,
    holeRadius: 1,
  },
];

/** Picture of marble over dust: slab texture inside, edge rules, then the slabs' grid. */
function marblePicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = paint(size, size, isIn, {
    fill: "x",
    right: "k",
    bottom: ["K"],
    lip: ["k", "M"],
    under: "m",
    beside: "m",
  });
  // Paint the slab tiles under the rim: every inside fill pixel takes its slab's colour.
  const slabs = SLABS.map((g) => Pic.of(g));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pic.at(x, y) !== "x") continue;
      const which = slabs[(Math.floor(x / 16) + Math.floor(y / 16) * 2 + v) % slabs.length] as Pic;
      pic.set(x, y, which.at(x % 16, y % 16) as string);
    }
  }
  return tidy(pic, "w", "kKMSm").toString();
}

const pebble = P(`
  .kK
  kKM
  .MM
`);
const DUST = [
  tileOf("b", [[9, 9, pebble]]),
  tileOf("b", []),
  tileOf("b", [
    [3, 4, P("cc.\n.cc")],
    [10, 11, P("mm..\n.mmm")],
  ]),
  tileOf("b", [[5, 2, P("n...\n.nn.\n...n")]]),
];

const marbleDust = terrain({
  name: "marble-dust",
  upper: "marble",
  lower: "dirt",
  palette,
  themes: ["greece"],
  outer: MARBLE_SHAPES.map((s, v) => marblePicture("outer", s, v)),
  inner: MARBLE_SHAPES.map((s, v) => marblePicture("inner", s, v + 1)),
  base: DUST,
  fill: SLABS.slice(1),
  decals: {
    shards: {
      on: "lower",
      density: 0.08,
      grid: `
        rr.....
        .RR..rr
        .....RR
      `,
    },
    pebbles: {
      on: "lower",
      density: 0.08,
      grid: `
        .kK..
        kKM..
        .MM.k
        ...kk
      `,
    },
    moss: {
      on: "upper",
      density: 0.06,
      grid: `
        .GG.
        GDDG
        .G..
      `,
    },
  },
});

// The rift's edge ------------------------------------------------------------------------------

/**
 * The tear around an era's ground, which rises a step above the field it replaced: a torn
 * earth face below its south edge, a dark crack around the rest, and on the seam itself a band
 * of light from white through sea to plum. `pulse` shifts the bands, so cycling the two
 * overlays breathes.
 */
function riftPicture(kind: "outer" | "inner", shape: Shape, pulse: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  // Inside pixels near the edge are the glowing seam; outside ones near it are the torn lip.
  const glow = pulse ? ["W", "W", "q", "q", "Q", "s", "p"] : ["W", "q", "q", "Q", "Q", "s", "P"];
  const pic = paint(size, size, isIn, { fill: "x", band: glow, lip: ["e", "E"], ring: "E" });
  // A halo of light spilling onto the ground outside the seam, fading out in a checker.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pic.at(x, y) !== "." || isIn(x, y)) continue;
      let d = 9;
      for (let dy = -5; dy <= 5; dy++)
        for (let dx = -5; dx <= 5; dx++)
          if (isIn(x + dx, y + dy)) d = Math.min(d, Math.hypot(dx, dy));
      const reach = pulse ? 5.2 : 4.4;
      if (d <= reach && (d <= 3.2 || (x + y) % 2 === 0)) pic.set(x, y, "h");
    }
  }
  return tidy(pic.swap("x", "."), "E", "WqQspPeh").toString();
}

const RIFT_SHAPES: readonly Shape[] = [
  {
    top: [0, 0, 1, 2, 1, 0, -1, -2, -1, 0, 1, 1, 0, 0, 0, 0],
    bottom: [0, 0, -1, -2, -1, 0, 1, 2, 2, 1, 0, -1, 0, 0, 0, 0],
    left: [0, 0, 1, 1, 0, -1, -2, -1, 0, 1, 2, 1, 0, 0, 0, 0],
    right: [0, 0, -1, -1, 0, 1, 2, 1, 0, -1, -2, -1, 0, 0, 0, 0],
    radius: 5,
    holeRadius: 3,
  },
  {
    top: [0, 0, -1, -1, 0, 1, 2, 1, 0, -1, -2, -1, 0, 0, 0, 0],
    bottom: [0, 0, 1, 1, 2, 1, 0, -1, -2, -1, 0, 1, 0, 0, 0, 0],
    left: [0, 0, -1, -2, -1, 0, 1, 2, 1, 0, -1, -1, 0, 0, 0, 0],
    right: [0, 0, 1, 2, 1, 0, -1, -1, 0, 1, 1, 0, 0, 0, 0, 0],
    radius: 4,
    holeRadius: 3,
  },
];

const rift = (name: string, pulse: number) =>
  overlay({
    name,
    palette,
    lone: "h",
    themes: ["campus"],
    outer: RIFT_SHAPES.map((s) => riftPicture("outer", s, pulse)),
    inner: RIFT_SHAPES.map((s) => riftPicture("inner", s, pulse)),
  });

export default [marbleDust, rift("rift", 0), rift("rift-pulse", 1)];
