import { type Decal, type Legend, type Tone, terrain } from "../../format.ts";
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
 * The ground of the Page 1 hunting fields, its own set so it can be as busy as Stardew's without
 * touching the campus: sun-baked dust that is never one flat fill (packed tracks, wind ripples,
 * scoured pale stretches, tufts, scrub, chips of marble), dry grass in tussocks, the temple's
 * stepped marble, the agora's warm limestone flags, limestone crags, and a shore where wet sand
 * meets shallow water that drops off into the deep. Drawn in the campus colours each era theme
 * repaints; baked into the Greek themes only.
 */
const GREEK = [
  "greece",
  "greece-shade",
  "olive-morning",
  "greece-dusk",
  "dusk-fire",
  "greece-noon",
] as const;

const palette: Legend = {
  ".": null,
  // dust (the campus dirt's ramp, which every Greek theme bleaches)
  b: "wood.pale",
  m: "wood.light",
  n: "wood.mid",
  E: "wood.dark",
  c: "clay.pale",
  // dry grass
  g: "grass.light",
  q: "grass.soft",
  G: "grass.mid",
  h: "grass.pale",
  H: "grass.bright",
  D: "grass.dark",
  // scrub and poppies
  l: "olive.light",
  o: "olive.mid",
  O: "olive.dark",
  r: "red.mid",
  R: "red.dark",
  // stone
  w: "stone.bright",
  k: "stone.pale",
  K: "stone.light",
  v: "stone.vein",
  M: "stone.mid",
  S: "stone.dark",
  d: "stone.deep",
  // warm limestone flags
  f: "clay.pale",
  F: "clay.dust",
  j: "clay.light",
  J: "clay.mid",
  y: "gold.pale",
  // water, shallow to deep
  "1": "sea.pale",
  "2": "sea.light",
  "3": "sea.mid",
  "4": "sea.dark",
  // working cells
  x: null,
  X: null,
};

/** Poppies and the odd glint stand alone on purpose. */
const lone = "rR";

const P = (src: string): Pic => Pic.of(src);

function h(x: number, y: number, s: number): number {
  let v = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
}

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

/**
 * Tone pictures: a soft patch over one side of a pair. The core is filled with `solid` (or left
 * clear for marks only) and textured with `core` marks; a three-pixel fringe gets sparser
 * `fringe` marks, so the patch frays out instead of ending on a line.
 */
const TONE_SHAPE: Shape = {
  top: [0, 0, 1, 2, 2, 1, 0, -1, -1, 0, 1, 1, 0, 0, 0, 0],
  bottom: [0, 0, 0, -1, -2, -2, -1, 0, 1, 1, 0, -1, 0, 0, 0, 0],
  left: [0, 0, -1, -1, 0, 1, 2, 2, 1, 0, 0, -1, 0, 0, 0, 0],
  right: [0, 0, 1, 1, 0, -1, -2, -1, 0, 1, 1, 0, 0, 0, 0, 0],
  radius: 7,
  holeRadius: 5,
};

function tone(
  name: string,
  on: "upper" | "lower",
  band: readonly [number, number],
  core: readonly (readonly Mark[])[],
  fringe: readonly (readonly Mark[])[],
  solid?: string,
): Tone {
  const fill = solid ?? "X";
  const make = (pic: Pic, v: number): string => {
    texture(pic, core, fill, (cx, cy) => cx + cy * 2 + v);
    texture(pic, fringe, "x", (cx, cy) => cx * 3 + cy + v);
    return pic.swap("xX", "..").toString();
  };
  const picture = (kind: "outer" | "inner", size: number, v: number) =>
    make(paint(size, size, inside(kind, TONE_SHAPE), { fill, band: ["x", "x", "x"] }), v);
  return {
    name,
    on,
    band,
    outer: [picture("outer", 48, 0)],
    inner: [picture("inner", 32, 1)],
    fill: [make(Pic.blank(16, 16, fill), 5)],
  };
}

// Dust --------------------------------------------------------------------------------------------

const pebble = P(`
  .kK
  kKM
  .MM
`);
const grit = P(`
  m.m
  .m.
`);
const crack = P(`
  n...
  .nn.
  ...n
`);
const ripple = P(`
  mm....
  ..mmm.
  .....m
`);
const ripple2 = P(`
  ...mmm
  mmm...
`);
const scour = P(`
  cc.
  .cc
`);

/**
 * A grainy fill: two-pixel grains of a lighter and a darker step scattered by hash over `base`,
 * plus the given marks, so a stretch of ground is never one flat colour.
 */
function grains(
  base: string,
  light: string,
  dark: string,
  count: number,
  v: number,
  marks: readonly Mark[],
): string {
  const pic = Pic.blank(16, 16, base);
  for (let k = 0; k < count; k++) {
    const x = Math.floor(h(k, v, 61) * 15);
    const y = Math.floor(h(v, k, 62) * 16);
    const ch = h(k, k + v, 63) < 0.55 ? light : dark;
    const diag = h(k, v, 64) < 0.3;
    pic.put(diag && y < 15 ? `${ch}.\n.${ch}` : `${ch}${ch}`, x, y, { onto: base, whole: true });
  }
  texture(pic, [marks], base);
  return tidy(pic, base, light + dark).toString();
}

/** The dust's own fill: mostly plain, a pebble or a crack here and there. */
const DUST: readonly (readonly Mark[])[] = [
  [],
  [[9, 9, pebble]],
  [[3, 4, crack]],
  [],
  [[2, 11, scour]],
  [[10, 3, grit]],
];

/** Dust under feet and wheels: grit pressed into it, thick in the middle, thinning out. */
const PACKED_CORE: readonly (readonly Mark[])[] = [
  [
    [1, 1, P("mm.\n.mm")],
    [7, 3, grit],
    [12, 1, P("m.\n.m")],
    [3, 8, P(".mm\nmm.")],
    [10, 9, P("nn.\n.nn")],
    [5, 13, grit],
    [12, 13, P("mm")],
  ],
  [
    [3, 2, grit],
    [9, 1, P("mm.\n.mm")],
    [1, 7, P("m.\n.m")],
    [7, 8, P("nn")],
    [12, 7, grit],
    [3, 12, P(".mm\nmm.")],
    [10, 13, P("m.\n.m")],
  ],
];
const PACKED_FRINGE: readonly (readonly Mark[])[] = [
  [
    [5, 5, grit],
    [11, 11, P("m.\n.m")],
  ],
  [[9, 10, grit]],
  [[3, 3, P("mm")]],
];

/** Wind ripples: long parallel lines, one shade darker, combed across the dust. */
const RIPPLE_CORE: readonly (readonly Mark[])[] = [
  [
    [1, 2, ripple],
    [8, 7, ripple],
    [2, 12, ripple2],
  ],
  [
    [6, 1, ripple2],
    [0, 7, ripple],
    [9, 12, ripple],
  ],
];
const RIPPLE_FRINGE: readonly (readonly Mark[])[] = [[[4, 6, ripple2]], [[7, 9, ripple2]]];

/** Scoured stretches: the wind took the fine dust and left it pale. */
const PALE_CORE: readonly (readonly Mark[])[] = [
  [
    [1, 2, scour],
    [8, 1, P("cc")],
    [4, 7, scour],
    [11, 6, scour],
    [2, 12, P("cc")],
    [9, 12, scour],
  ],
  [
    [5, 1, scour],
    [12, 3, P("cc")],
    [1, 7, scour],
    [8, 8, scour],
    [5, 13, scour],
    [12, 12, P("cc")],
  ],
];
const PALE_FRINGE: readonly (readonly Mark[])[] = [
  [
    [3, 3, scour],
    [10, 10, scour],
  ],
  [[7, 6, scour]],
];

const DUST_TONES: readonly Tone[] = [
  tone("packed", "lower", [0, 0.26], PACKED_CORE, PACKED_FRINGE),
  tone("ripples", "lower", [0.42, 0.58], RIPPLE_CORE, RIPPLE_FRINGE),
  tone("scoured", "lower", [0.76, 1], PALE_CORE, PALE_FRINGE),
];

const DUST_DECALS: Readonly<Record<string, Decal>> = {
  tuft: {
    on: "lower",
    density: 0.15,
    grid: `
      .h...h
      .hg.hg
      ..ggg.
      .GGGG.
    `,
  },
  scrub: {
    on: "lower",
    density: 0.07,
    grid: `
      ..ll.l.
      .lloOl.
      lOoooOO
      .OOoOO.
      ..mmm..
    `,
  },
  stones: {
    on: "lower",
    density: 0.07,
    grid: `
      .kK.....
      kKMM..kK
      .MM..kKM
      ......MM
    `,
  },
  chips: {
    on: "lower",
    density: 0.04,
    grid: `
      ww...
      kk.ww
      ...kk
    `,
  },
  rut: {
    on: "lower",
    density: 0,
    grid: `
      nn..........
      .nnnn....nn.
      .....nnnn..n
    `,
  },
};

// Dry grass ---------------------------------------------------------------------------------------

const tussock = P(`
  .h.h
  hhGh
  .GG.
`);
const blade = P(`
  h.
  .h
`);
const seed = P(`
  hh
  h.
`);
const darkV = P(`
  G.G
  .G.
`);

const DRY: readonly (readonly Mark[])[] = [
  [
    [2, 2, tussock],
    [10, 10, darkV],
  ],
  [[8, 4, blade]],
  [
    [4, 8, seed],
    [11, 2, blade],
  ],
  [[6, 11, tussock]],
  [],
];

const DRY_SHAPES: readonly Shape[] = [
  {
    top: [0, 0, 1, 2, 1, 0, -1, -2, -1, 0, 1, 2, 1, 0, 0, 0],
    bottom: [0, 0, -1, -1, 0, 1, 2, 2, 1, 0, -1, -1, 0, 0, 0, 0],
    left: [0, 0, 1, 2, 2, 1, 0, -1, -2, -1, 0, 1, 0, 0, 0, 0],
    right: [0, 0, -1, -2, -1, 0, 1, 2, 2, 1, 0, -1, 0, 0, 0, 0],
    radius: 5,
    holeRadius: 4,
  },
  {
    top: [0, 0, -1, -1, 0, 1, 2, 2, 1, 0, -1, -1, 0, 0, 0, 0],
    bottom: [0, 0, 1, 2, 1, 0, -1, -2, -1, 0, 1, 1, 0, 0, 0, 0],
    left: [0, 0, -1, -2, -1, 0, 1, 2, 1, 0, -1, -1, 0, 0, 0, 0],
    right: [0, 0, 1, 1, 0, -1, -2, -1, 0, 1, 2, 1, 0, 0, 0, 0],
    radius: 4,
    holeRadius: 3,
  },
];

/**
 * Dry grass over dust: no lip, the grass simply thins out into tufts that reach over the dust,
 * with a ring of darker, shaded dust where the stems hold moisture.
 */
function dryPicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = paint(size, size, isIn, { fill: "g", right: "G", bottom: ["G"] });
  // Tufts reaching out over the dust on every side.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isIn(x, y)) continue;
      const lx = x % 16;
      const ly = y % 16;
      const near = (dx: number, dy: number) => !isIn(x + dx, y + dy);
      if (near(0, -1) && (lx * 3 + v) % 5 === 1)
        pic.put(P("h.\n.h"), x, y - 2, { onto: ".m", whole: true });
      if (near(0, 1) && (lx * 5 + v) % 6 === 2)
        pic.put(P("G.\nGG"), x, y + 1, { onto: ".m", whole: true });
      if (near(-1, 0) && (ly * 3 + v) % 5 === 0)
        pic.put(P("hh.\n..g"), x - 3, y - 1, { onto: ".m", whole: true });
      if (near(1, 0) && (ly * 7 + v) % 5 === 3)
        pic.put(P(".GG\nG.."), x + 1, y - 1, { onto: ".m", whole: true });
    }
  }
  despeckle(pic, isIn, "g");
  texture(pic, DRY, "g", (cx, cy) => cx * 2 + cy * 3 + v);
  return pic.toString();
}

const DRY_TONES: readonly Tone[] = [
  tone(
    "thick",
    "upper",
    [0, 0.34],
    [
      [
        [2, 2, darkV],
        [9, 8, tussock],
        [4, 12, darkV],
      ],
      [
        [8, 2, tussock],
        [2, 9, darkV],
        [11, 12, darkV],
      ],
    ],
    [[[5, 5, darkV]], [[10, 10, darkV]]],
  ),
  tone(
    "straw",
    "upper",
    [0.68, 1],
    [
      [
        [2, 3, seed],
        [9, 2, blade],
        [5, 9, seed],
        [12, 11, blade],
      ],
      [
        [7, 1, seed],
        [1, 8, blade],
        [10, 7, seed],
        [4, 13, blade],
      ],
    ],
    [[[6, 6, blade]], [[3, 10, seed]]],
  ),
];

const DRY_DECALS: Readonly<Record<string, Decal>> = {
  poppies: {
    on: "upper",
    density: 0.035,
    grid: `
      .r...
      rRr.r
      .G.rR
      .G...
    `,
  },
  thistle: {
    on: "upper",
    density: 0.03,
    grid: `
      .oo.
      oOOo
      .GG.
      .G..
    `,
  },
};

const dryDust = terrain({
  name: "dry-dust",
  upper: "dry",
  lower: "dust",
  themes: [...GREEK],
  bake: GREEK,
  palette,
  lone,
  outer: DRY_SHAPES.map((s, v) => dryPicture("outer", s, v)),
  inner: DRY_SHAPES.map((s, v) => dryPicture("inner", s, v + 1)),
  base: DUST.map((marks, v) => grains("b", "c", "m", 7 + (v % 3) * 3, v, marks)),
  fill: DRY.map((marks, v) => grains("g", "h", "G", 9 + (v % 2) * 4, v + 20, marks)),
  tones: [...DUST_TONES, ...DRY_TONES],
  decals: { ...DUST_DECALS, ...DRY_DECALS },
});

// The temple's marble -------------------------------------------------------------------------------

/** One slab per tile, joints on its right and bottom edges. Variants crack, chip, stain, lichen. */
function slab(marks: readonly Mark[], chip: "none" | "tl" | "br"): string {
  const pic = Pic.blank(16, 16, "w");
  for (let i = 0; i < 16; i++) pic.set(15, i, "v").set(i, 15, "v").set(14, i, "k").set(i, 14, "k");
  pic.set(15, 14, "v").set(14, 15, "v");
  if (chip === "tl") pic.put(P("vv\nv."), 0, 0);
  if (chip === "br") pic.put(P(".kv\nkvv\nvvv"), 13, 13);
  texture(pic, [marks], "w");
  return tidy(pic, "w", "kKMvlo").toString();
}

const SLABS = [
  slab([[4, 5, P("k...\n.kk.\n...k")]], "none"),
  slab([[8, 3, P("v..\n.v.\n.vv")]], "tl"),
  slab([[3, 8, P(".kk\nkkk\n.k.")]], "none"),
  slab([], "br"),
];

const SLAB_SHAPES: readonly Shape[] = [
  { top: [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0], radius: 1, holeRadius: 1 },
  { bottom: [0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0], radius: 2, holeRadius: 1 },
];

/** The stylobate: marble paving stepping down to the dust in three treads, lit on each. */
function slabPicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = paint(size, size, isIn, {
    fill: "x",
    right: "k",
    bottom: ["v"],
    lip: ["w", "M", "k", "M", "S"],
    under: "m",
    beside: "m",
  });
  const slabs = SLABS.map((g) => Pic.of(g));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (pic.at(x, y) !== "x") continue;
      const which = slabs[(Math.floor(x / 16) + Math.floor(y / 16) * 2 + v) % slabs.length] as Pic;
      pic.set(x, y, which.at(x % 16, y % 16) as string);
    }
  return tidy(pic, "w", "kKMSmvlo").toString();
}

const slabDust = terrain({
  name: "slab-dust",
  upper: "slab",
  lower: "dust",
  themes: [...GREEK],
  bake: GREEK,
  palette,
  outer: [slabPicture("outer", SLAB_SHAPES[0] as Shape, 0)],
  inner: [slabPicture("inner", SLAB_SHAPES[1] as Shape, 1)],
  base: DUST.map((marks) => tileOf("b", marks)),
  fill: SLABS.slice(1),
});

// The agora's flags ---------------------------------------------------------------------------------

/**
 * Warm limestone flags in running courses: every course runs on across tiles, so the paving has
 * no grid; the joints inside a course fall at different places in each variant. Mid-valued and
 * warm on purpose, so grey and dark monsters read on it as well as on the dust.
 */
function flags(v: number): string {
  const pic = Pic.blank(16, 16, "f");
  for (const [y0, y1] of [
    [0, 7],
    [8, 15],
  ] as const) {
    for (let x = 0; x < 16; x++) pic.set(x, y1, "F");
    const c = y0 / 8;
    const cut = (v * 7 + c * 9 + 3) % 16;
    for (let y = y0; y < y1; y++) pic.set(cut, y, "F");
    // A lit lip along each flag's top edge where it sits proud of its neighbour.
    for (let x = 0; x < 16; x++)
      if (x !== cut && (x + v + c) % 5 !== 0) pic.set(x, y0, pic.at(x, y0) === "F" ? "F" : "f");
  }
  return smooth(pic).toString();
}

const FLAGS = [0, 1, 2, 3, 4].map(flags);

const FLAG_SHAPES: readonly Shape[] = [
  {
    top: [0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0],
    bottom: [0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0],
    left: [0, 0, 0, -1, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0],
    right: [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0],
    radius: 2,
    holeRadius: 2,
  },
];

/** Flags over dust: a low kerb on the south face, sand drifted up against every other side. */
function flagPicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = paint(size, size, isIn, { fill: "x", lip: ["J", "E"], under: "m", ring: "b" });
  const tiles = FLAGS.map((g) => Pic.of(g));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (pic.at(x, y) !== "x") continue;
      const t = tiles[(Math.floor(x / 16) + Math.floor(y / 16) * 3 + v) % tiles.length] as Pic;
      pic.set(x, y, t.at(x % 16, y % 16) as string);
    }
  // Sand drifted over the flags' edges: feathering in, never a line.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!isIn(x, y)) continue;
      const d = distTo(x, y, isIn, false, 4);
      if (d <= 4 && h(x, y, v + 5) < 0.75 - d * 0.18) pic.set(x, y, d <= 1.5 ? "b" : "c");
    }
  return smooth(despeckle(pic, isIn, "f"), "JE").toString();
}

const FLAG_TONES: readonly Tone[] = [
  // Sunken and stained: a darker dip where water stands after rain.
  tone(
    "sunken",
    "upper",
    [0, 0.2],
    [[[4, 4, P("jj\njj")]], [[9, 10, P(".j\njj")]]],
    [[[7, 7, P("jj")]], []],
    "F",
  ),
];

const FLAG_DECALS: Readonly<Record<string, Decal>> = {
  crack: {
    on: "upper",
    density: 0.05,
    grid: `
      J.....
      .JJ...
      ...J..
      ....JJ
    `,
  },
  "joint-grass": {
    on: "upper",
    density: 0.06,
    grid: `
      .h...h
      hhgggh
    `,
  },
  sand: {
    on: "upper",
    density: 0.05,
    grid: `
      .bb..
      bbbb.
      ..bbb
    `,
  },
};

const flagsDust = terrain({
  name: "flags-dust",
  upper: "flags",
  lower: "dust",
  themes: [...GREEK],
  bake: GREEK,
  palette,
  outer: FLAG_SHAPES.map((s, v) => flagPicture("outer", s, v)),
  inner: FLAG_SHAPES.map((s, v) => flagPicture("inner", s, v + 1)),
  base: DUST.map((marks) => tileOf("b", marks)),
  fill: FLAGS.slice(1),
  tones: FLAG_TONES,
  decals: FLAG_DECALS,
});

// Crags ----------------------------------------------------------------------------------------------

const CRAG_SHAPES: readonly Shape[] = [
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

const cragScrub = P(`
  .ll.
  llOo
  .OOo
`);
const cragCrack = P(`
  M...
  .MM.
  ...M
`);
const CRAG_TOPS: readonly (readonly Mark[])[] = [
  [
    [3, 3, cragScrub],
    [10, 10, cragCrack],
  ],
  [[8, 4, P("kkk.\n.vvv")]],
  [
    [2, 9, P("ll.\n.oo")],
    [9, 2, cragCrack],
  ],
  [[10, 9, cragScrub]],
];

/**
 * A crag or a terrace edge standing a full figure-height of face over the dust: a pale lit lip
 * along its north and west edges, a seven-pixel face falling in strata with dark joints, a
 * shadow pooled at its foot, scrub on its top.
 */
function cragPicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = paint(size, size, isIn, {
    fill: "K",
    top: "w",
    left: "k",
    right: "v",
    bottom: ["k"],
    lip: ["v", "v", "M", "v", "M", "M", "S"],
    under: "n",
    beside: "m",
    ring: "m",
  });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ch = pic.at(x, y);
      if (isIn(x, y) || (ch !== "v" && ch !== "M")) continue;
      if ((x * 3 + v * 5) % 9 === 0 || ((x * 7 + v) % 11 === 0 && y % 3 !== 0)) pic.set(x, y, "S");
    }
  texture(pic, CRAG_TOPS, "K", (cx, cy) => cx * 2 + cy + v);
  return smooth(despeckle(tidy(pic, "K", "wkvMSnm"), isIn, "K"), "K").toString();
}

const cragDust = terrain({
  name: "crag-dust",
  upper: "crag",
  lower: "dust",
  themes: [...GREEK],
  bake: GREEK,
  palette,
  outer: [cragPicture("outer", CRAG_SHAPES[0] as Shape, 0)],
  inner: [cragPicture("inner", CRAG_SHAPES[1] as Shape, 1)],
  base: DUST.map((marks) => tileOf("b", marks)),
  fill: CRAG_TOPS.map((marks, v) => grains("K", "k", "v", 10, v + 40, marks)),
});

// The shore ------------------------------------------------------------------------------------------

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
 * Dust meeting the shallows. On land, wet sand darkens in a band four pixels deep with a tide
 * line of weed and shell along its top; at the water a thin bank face on the south, a foam rim
 * everywhere else, then the shallows themselves, light over sand.
 */
function shorePicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = paint(size, size, isIn, {
    fill: "b",
    lip: ["n"],
    under: "3",
    beside: "3",
    ring: "1",
  });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!isIn(x, y)) continue;
      const d = distTo(x, y, isIn, false, 8);
      const wave = Math.sin((x + y) * 0.35 + v * 1.9) * 0.8;
      if (d <= 2.2) pic.set(x, y, "n");
      else if (d <= 5.2 + wave) pic.set(x, y, "m");
      else if (d <= 6.4 + wave && h(x, y, v + 11) < 0.5)
        pic.set(x, y, h(x, y, v) < 0.5 ? "O" : "k");
      else if (d <= 7.4 + wave && h(x, y, v + 12) < 0.4) pic.set(x, y, "m");
    }
  // The shallows' lit edge just off the foam.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (isIn(x, y) || pic.at(x, y) !== ".") continue;
      if (distTo(x, y, isIn, true, 3) <= 2.4) pic.set(x, y, "2");
    }
  texture(pic, [DUST[(v + 1) % DUST.length] ?? []], "b");
  return smooth(smooth(despeckle(pic, isIn, "b"))).toString();
}

/** Shallow water over sand: light, ripples catching the sun, sand showing through in places. */
const SHALLOWS: readonly (readonly Mark[])[] = [
  [
    [3, 4, P("11.\n.11")],
    [10, 11, P(".111\n11..")],
  ],
  [[8, 6, P("cc")]],
  [[2, 10, P("11.\n.11")]],
  [[9, 3, P("3.3\n.3.")]],
];

const shoreWet = terrain({
  name: "shore-wet",
  upper: "dust",
  lower: "shallows",
  themes: [...GREEK],
  bake: GREEK,
  palette,
  outer: SHORE_SHAPES.map((s, v) => shorePicture("outer", s, v)),
  inner: SHORE_SHAPES.map((s, v) => shorePicture("inner", s, v + 2)),
  base: SHALLOWS.map((marks) => tileOf("2", marks)),
  fill: DUST.slice(1).map((marks) => tileOf("b", marks)),
});

/**
 * The shelf: shallows over the deep, no bank, the shallows thinning in dithered steps and a
 * darker line where the bottom drops away.
 */
function shelfPicture(kind: "outer" | "inner", shape: Shape, v: number): string {
  const size = kind === "outer" ? 48 : 32;
  const isIn = inside(kind, shape);
  const pic = Pic.blank(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (isIn(x, y)) {
        const d = distTo(x, y, isIn, false, 3);
        pic.set(x, y, d <= 1.5 ? ((x + y) % 2 ? "2" : "3") : "2");
      } else {
        const d = distTo(x, y, isIn, true, 3);
        if (d <= 1.5) pic.set(x, y, "4");
        else if (d <= 2.5 && (x + y + v) % 2 === 0) pic.set(x, y, "4");
      }
    }
  texture(pic, [SHALLOWS[v % SHALLOWS.length] ?? []], "2");
  return smooth(pic, "").toString();
}

/** The deep: the sea's own colour, swells in long darker and lighter dashes. */
const DEEP: readonly (readonly Mark[])[] = [
  [
    [2, 3, P("2222")],
    [8, 10, P("444...\n...444")],
  ],
  [[5, 7, P("444")]],
  [],
  [
    [9, 2, P("22.\n.22")],
    [1, 12, P("444")],
  ],
];

const seaDepth = terrain({
  name: "sea-depth",
  upper: "shallows",
  lower: "sea",
  themes: [...GREEK],
  bake: GREEK,
  palette,
  outer: [shelfPicture("outer", SHORE_SHAPES[0] as Shape, 0)],
  inner: [shelfPicture("inner", SHORE_SHAPES[1] as Shape, 1)],
  base: DEEP.map((marks) => tileOf("3", marks)),
  fill: SHALLOWS.map((marks) => tileOf("2", marks)),
  tones: [
    tone(
      "swell",
      "lower",
      [0.7, 1],
      [
        [
          [1, 4, P("444444")],
          [6, 11, P("44444")],
        ],
        [
          [4, 2, P("44444")],
          [0, 9, P("444444")],
        ],
      ],
      [[[3, 7, P("444")]], []],
    ),
  ],
  decals: {
    glint: {
      on: "lower",
      density: 0.05,
      grid: `
        .11..
        22.22
      `,
    },
  },
});

export default [dryDust, slabDust, flagsDust, cragDust, shoreWet, seaDepth];
