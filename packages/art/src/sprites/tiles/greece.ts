import { type Legend, overlay, terrain } from "../../format.ts";
import {
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
 * Page 1 ground. The agora's marble paving sits a hand's height above the dust, slabs chipped
 * at the corners. The dust is the campus dirt drawn in the same colours, which the `greece`
 * theme bleaches pale, so paving, paths and dry grass all share one ground.
 *
 * The rift edge is an overlay drawn over both worlds: the campus ground torn like a page,
 * its paper lip curling over the era's ground below.
 */
const palette: Legend = {
  ".": null,
  // marble, with its warm shadow
  v: "stone.vein",
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
  // the torn edge of the page
  W: "stone.bright",
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
  for (let i = 0; i < 16; i++) pic.set(15, i, "v").set(i, 15, "v").set(14, i, "k").set(i, 14, "k");
  pic.set(15, 14, "v").set(14, 15, "v");
  if (chip === "tl") pic.put(P("vv\nv."), 0, 0);
  if (chip === "br") pic.put(P(".kv\nkvv\nvvv"), 13, 13);
  texture(pic, [marks], "w");
  return tidy(pic, "w", "kKMv").toString();
}

const vein = P(`
  k...
  .kk.
  ...k
`);
const crackSlab = P(`
  v..
  .v.
  .vv
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
    bottom: ["v"],
    lip: ["k", "v"],
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
  return tidy(pic, "w", "kKMSmv").toString();
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
 * Where the world tears like a notebook page. Outside the hole, the campus ground ends in a
 * ragged paper lip: where it is wide enough to curl, the underside in shade at the tear, then
 * the page's white body, a crease where it leaves the ground, loose fibres beyond. Inside, the curl throws a thin shadow on the era's
 * ground. The lip's width swells and narrows inside each tile but is the same at every tile
 * edge, so any two tiles join. The overlay also carries its shape, so scenes cut the two
 * grounds along the torn line, never along the cell grid.
 */
function riftPicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = Pic.blank(size, size);
  const swell = (l: number) => Math.sin((Math.PI * (l + 0.5)) / 16);
  const width = (x: number, y: number): number => {
    const lx = x % 16;
    const ly = y % 16;
    if (lx < 2 || lx > 13 || ly < 2 || ly > 13) return 2.5;
    return (
      2.5 + 4.4 * swell(lx) * swell(ly) * (0.55 + 0.45 * Math.sin(lx * 1.3 + ly * 0.7 + v * 2.1))
    );
  };
  const dist = (x: number, y: number, want: boolean): number => {
    let best = 9;
    for (let dy = -7; dy <= 7; dy++)
      for (let dx = -7; dx <= 7; dx++)
        if (isIn(x + dx, y + dy) === want) best = Math.min(best, Math.hypot(dx, dy));
    return best;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isIn(x, y)) {
        pic.set(x, y, dist(x, y, false) <= 1.6 ? "S" : "x");
        continue;
      }
      const d = dist(x, y, true);
      const w = width(x, y);
      const lx = x % 16;
      const ly = y % 16;
      const fibre =
        lx > 1 &&
        lx < 14 &&
        ly > 1 &&
        ly < 14 &&
        ((lx * 5 + ly * 3 + v * 7) % 6 === 0 || (lx + ly * 7 + v) % 9 === 0);
      if (d <= 1.01 && w > 3.4) pic.set(x, y, "K");
      else if (d <= w - 1) pic.set(x, y, "W");
      else if (d <= w || (fibre && d <= w + 1.5)) pic.set(x, y, "k");
    }
  }
  return smooth(tidy(pic, "W", "x"), "x").toString();
}

/** Two tears: big bulges between the seam points and rounded steps, so no edge runs on the grid. */
const RIFT_SHAPES: readonly Shape[] = [
  {
    top: [0, 0, 1, 3, 4, 3, 1, 0, -1, -2, -1, 1, 2, 1, 0, 0],
    bottom: [0, 0, -1, -3, -3, -1, 1, 3, 4, 3, 1, 0, -1, -1, 0, 0],
    left: [0, 0, 2, 3, 2, 0, -2, -3, -2, 0, 1, 2, 1, 0, 0, 0],
    right: [0, 0, -1, -2, -1, 1, 3, 4, 3, 1, -1, -2, -1, 0, 0, 0],
    radius: 8,
    holeRadius: 7,
  },
  {
    top: [0, 0, -1, -2, -1, 1, 3, 4, 3, 1, 0, -1, -1, 0, 0, 0],
    bottom: [0, 0, 2, 3, 2, 0, -1, -3, -3, -1, 1, 2, 1, 0, 0, 0],
    left: [0, 0, -1, -3, -3, -1, 1, 3, 3, 1, -1, -1, 0, 0, 0, 0],
    right: [0, 0, 1, 3, 3, 1, 0, -2, -3, -2, 0, 1, 1, 0, 0, 0],
    radius: 8,
    holeRadius: 6,
  },
];

const rift = overlay({
  name: "rift",
  palette,
  themes: ["rift-sun"],
  inside: "xS",
  outer: RIFT_SHAPES.map((sh, v) => riftPicture("outer", sh, v)),
  inner: RIFT_SHAPES.map((sh, v) => riftPicture("inner", sh, v)),
});

export default [marbleDust, rift];
