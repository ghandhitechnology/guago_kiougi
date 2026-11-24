import { type Decal, type Legend, type Tone, terrain } from "../../format.ts";
import {
  despeckle,
  inside,
  type Mark,
  Pic,
  paint,
  type Rim,
  type Shape,
  texture,
  tileOf,
} from "../../paint.ts";

/**
 * The campus ground: the 잔디 lawn raised a little above three lower grounds, each its own
 * dual-grid pair. The lawn's texture, tones and flowers are shared so every pair's lawn is the
 * same lawn, and the scene renderer can mix pairs on one map.
 */
const palette: Legend = {
  ".": null,
  // lawn
  g: "grass.light",
  G: "grass.mid",
  h: "grass.pale",
  H: "grass.bright",
  D: "grass.dark",
  // earth face under the lawn's lip
  e: "wood.mid",
  E: "wood.dark",
  // dirt path
  b: "wood.pale",
  m: "wood.light",
  n: "wood.mid",
  c: "clay.pale",
  // stone: pebbles, kerb, pavers
  w: "stone.bright",
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  S: "stone.dark",
  // red pavers
  r: "clay.light",
  R: "clay.mid",
  // 운동장 sand
  s: "stone.pale",
  // flowers
  y: "gold.light",
  Y: "gold.mid",
  v: "plum.light",
  V: "plum.mid",
  // needles and cones
  N: "board.dark",
  B: "board.mid",
  o: "wood.dark",
  O: "wood.mid",
  // working cells, never left in a finished grid
  x: null,
  X: null,
};
/** Flower heads and centres are single dots on purpose. */
const lone = "yYvV";

const P = (src: string): Pic => Pic.of(src);

// Lawn texture ---------------------------------------------------------------------------------

const tuft = {
  /** A clump lit on its tip. */
  clump: P(`
    .h..
    hGh.
    .GG.
  `),
  /** Two blades leaning apart. */
  fork: P(`
    G..G
    .GG.
  `),
  /** A small dark V. */
  vee: P(`
    G.G
    .G.
  `),
  /** A lit blade. */
  glint: P(`
    .h
    h.
  `),
  /** Three lit tips. */
  sprig: P(`
    h.h
    .h.
  `),
  /** A dense dark clump for shaded patches. */
  thick: P(`
    .GG.
    GDDG
    .GG.
  `),
  /** A sunny tuft for bright patches. */
  sun: P(`
    .HH
    hhH
  `),
};

/** Mark sets for the lawn fill, one per 16×16 tile. Sparse: tones add the density. */
const LAWN_MARKS: readonly (readonly Mark[])[] = [
  [
    [2, 2, tuft.clump],
    [10, 10, tuft.vee],
  ],
  [[9, 3, tuft.fork]],
  [
    [4, 6, tuft.vee],
    [12, 12, tuft.glint],
  ],
  [],
  [[7, 9, tuft.clump]],
  [[12, 2, tuft.glint]],
  [
    [3, 11, tuft.sprig],
    [11, 5, tuft.vee],
  ],
];

const lawnTile = (marks: readonly Mark[]): string => tileOf("g", marks);

// Edge shapes ----------------------------------------------------------------------------------

/** Two edge variants: different bulges between the fixed seam points at each tile's ends. */
const SHAPES: readonly Shape[] = [
  {
    top: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0],
    bottom: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    left: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0],
    right: [0, 0, 0, -1, -1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
    radius: 4,
    holeRadius: 3,
  },
  {
    top: [0, 0, 0, 0, -1, -1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
    bottom: [0, 0, 0, 1, 1, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0],
    left: [0, 0, 0, -1, -1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
    right: [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, -1, -1, 0, 0, 0, 0],
    radius: 3,
    holeRadius: 2,
  },
];

/** Blades growing past the lawn's open edges, at these tile-local positions per variant. */
const SPROUTS: readonly { top: number[]; left: number[]; right: number[]; bottom: number[] }[] = [
  { top: [5, 12], left: [3, 10], right: [6, 12], bottom: [3, 9] },
  { top: [2, 9], left: [6, 13], right: [3, 9], bottom: [6, 13] },
];

const blade = {
  up: P(`
    h.
    .h
  `),
  upB: P(`
    .h
    hh
  `),
  left: P(`
    hh.
    ..h
  `),
  right: P(`
    .GG
    G..
  `),
  hang: P(`
    G.
    GG
  `),
};

/**
 * Grows blades out of the lawn where an edge passes a sprout position. Pieces land on clear
 * pixels only, so they never cut the rim.
 */
function sprout(
  pic: Pic,
  isIn: (x: number, y: number) => boolean,
  v: number,
  lipRows: number,
): Pic {
  const at = SPROUTS[v % SPROUTS.length] as (typeof SPROUTS)[number];
  for (let y = 0; y < pic.h; y++) {
    for (let x = 0; x < pic.w; x++) {
      if (!isIn(x, y)) continue;
      const lx = x % 16;
      const ly = y % 16;
      const ground = ".mK";
      if (!isIn(x, y - 1) && at.top.includes(lx))
        pic.put(lx % 2 ? blade.up : blade.upB, x, y - 2, { onto: ground, whole: true });
      if (!isIn(x - 1, y) && at.left.includes(ly))
        pic.put(blade.left, x - 3, y - 1, { onto: ground, whole: true });
      if (!isIn(x + 1, y) && at.right.includes(ly))
        pic.put(blade.right, x + 1, y - 1, { onto: ground, whole: true });
      if (lipRows > 0 && !isIn(x, y + 1) && at.bottom.includes(lx))
        pic.put(blade.hang, x, y + 1, { onto: "eE", whole: true });
    }
  }
  return pic;
}

/** The outer and inner pictures of one lawn pair, one per edge variant. */
function lawnPictures(rim: Rim, lipRows: number): { outer: string[]; inner: string[] } {
  const outer: string[] = [];
  const inner: string[] = [];
  SHAPES.forEach((shape, v) => {
    for (const [kind, list, size] of [
      ["outer", outer, 48],
      ["inner", inner, 32],
    ] as const) {
      const isIn = inside(kind, shape);
      const pic = paint(size, size, isIn, rim);
      despeckle(sprout(pic, isIn, v, lipRows), isIn, rim.fill);
      texture(pic, LAWN_MARKS, "g", (cx, cy) => cx * 2 + cy * 3 + v);
      list.push(pic.toString());
    }
  });
  return { outer, inner };
}

// Lawn tones -------------------------------------------------------------------------------------

const TONE_SHAPE: Shape = {
  top: [0, 0, 1, 2, 2, 1, 0, -1, -1, 0, 1, 1, 0, 0, 0, 0],
  bottom: [0, 0, 0, -1, -2, -2, -1, 0, 1, 1, 0, -1, 0, 0, 0, 0],
  left: [0, 0, -1, -1, 0, 1, 2, 2, 1, 0, 0, -1, 0, 0, 0, 0],
  right: [0, 0, 1, 1, 0, -1, -2, -1, 0, 1, 1, 0, 0, 0, 0, 0],
  radius: 7,
  holeRadius: 5,
};

/**
 * A tone overlay: marks only, dense in the core and sparse in a three-pixel fringe, clear
 * everywhere else so the lawn fill and its own tufts show through.
 */
function tonePictures(core: readonly (readonly Mark[])[], fringe: readonly (readonly Mark[])[]) {
  const make = (pic: Pic, v: number): string => {
    texture(pic, core, "X", (cx, cy) => cx + cy * 2 + v);
    texture(pic, fringe, "x", (cx, cy) => cx * 3 + cy + v);
    return pic.swap("xX", "..").toString();
  };
  const picture = (kind: "outer" | "inner", size: number, v: number) =>
    make(paint(size, size, inside(kind, TONE_SHAPE), { fill: "X", band: ["x", "x", "x"] }), v);
  return {
    outer: [picture("outer", 48, 0), picture("outer", 48, 2)],
    inner: [picture("inner", 32, 1), picture("inner", 32, 3)],
    fill: [1, 2].map((v) => make(Pic.blank(16, 16, "X"), v + 4)),
  };
}

/** Shaded patches: thick dark clumps close together, with the lawn showing between them. */
const LUSH_DENSE: readonly (readonly Mark[])[] = [
  [
    [1, 1, tuft.thick],
    [7, 0, tuft.fork],
    [11, 3, tuft.thick],
    [4, 6, tuft.thick],
    [1, 11, tuft.vee],
    [9, 9, tuft.thick],
    [5, 13, tuft.fork],
    [12, 13, tuft.vee],
  ],
  [
    [2, 0, tuft.fork],
    [9, 1, tuft.thick],
    [0, 5, tuft.thick],
    [6, 5, tuft.vee],
    [11, 7, tuft.thick],
    [3, 10, tuft.thick],
    [9, 13, tuft.thick],
  ],
  [
    [4, 1, tuft.thick],
    [11, 0, tuft.vee],
    [0, 6, tuft.fork],
    [7, 6, tuft.thick],
    [12, 9, tuft.fork],
    [2, 12, tuft.thick],
    [8, 13, tuft.vee],
  ],
];
const LUSH_FRINGE: readonly (readonly Mark[])[] = [
  [
    [3, 3, tuft.vee],
    [10, 11, tuft.fork],
    [12, 2, tuft.vee],
  ],
  [
    [9, 4, tuft.fork],
    [2, 11, tuft.vee],
    [12, 12, tuft.vee],
  ],
  [
    [6, 7, tuft.vee],
    [1, 1, tuft.vee],
  ],
];
const SUNNY_CORE: readonly (readonly Mark[])[] = [
  [
    [2, 1, tuft.sprig],
    [9, 3, tuft.glint],
    [4, 7, tuft.glint],
    [11, 9, tuft.sprig],
    [2, 12, tuft.glint],
    [8, 13, tuft.sun],
  ],
  [
    [6, 2, tuft.glint],
    [12, 1, tuft.glint],
    [1, 6, tuft.sprig],
    [9, 8, tuft.glint],
    [4, 12, tuft.sprig],
    [12, 13, tuft.glint],
  ],
];
const SUNNY_FRINGE: readonly (readonly Mark[])[] = [
  [
    [4, 4, tuft.glint],
    [11, 10, tuft.glint],
  ],
  [[8, 6, tuft.glint]],
];

const LAWN_TONES: readonly Tone[] = [
  { name: "lush", on: "upper", band: [0, 0.38], ...tonePictures(LUSH_DENSE, LUSH_FRINGE) },
  { name: "sunny", on: "upper", band: [0.64, 1], ...tonePictures(SUNNY_CORE, SUNNY_FRINGE) },
];

// Lawn decals ---------------------------------------------------------------------------------

const LAWN_DECALS: Readonly<Record<string, Decal>> = {
  daisies: {
    on: "upper",
    density: 0.07,
    grid: `
      .w.......
      wyw...w..
      .wGw.wyw.
      ..G...wG.
      ..wG...G.
      .wyw.....
      ..w......
    `,
  },
  buttercups: {
    on: "upper",
    density: 0.05,
    grid: `
      .y....
      yYy.y.
      .G.yYy
      .G..G.
      y.G.G.
      YyG...
    `,
  },
  clover: {
    on: "upper",
    density: 0.08,
    grid: `
      .hh.hh..
      hGGhGGh.
      .hGGGh..
      hGGhGGhh
      .hh.hGGh
      .....hh.
    `,
  },
  violets: {
    on: "upper",
    density: 0.04,
    grid: `
      .v.....
      vVv..v.
      .Gv.vVv
      .G...G.
      ..G.G..
    `,
  },
  tall: {
    on: "upper",
    density: 0.06,
    grid: `
      .h...h.
      .hG..h.
      ..hG.hG
      G.hGhG.
      GhGGGG.
      .GGDDG.
    `,
  },
  needles: {
    on: "upper",
    density: 0,
    grid: `
      ....N.....N.
      .N...N...N..
      ..N...N.N...
      ...NN..N..N.
      N...N....N..
      .N.N..NN...N
      ..N..N..N.N.
    `,
  },
  cone: {
    on: "upper",
    density: 0,
    grid: `
      .oOo.
      oOeOo
      oeOeo
      .oOo.
      ..o..
    `,
  },
};

// The three pairs -----------------------------------------------------------------------------

/**
 * Lawn edges over earth: a shaded right rim, an earth lip under the bottom edge with its cast
 * shadow, and a ring of darker ground hugging the other sides. A worn path sits one row below
 * the lawn; the field's sand two.
 */
const LAWN_RIM = (shade: string, lip: readonly string[]): Rim => ({
  fill: "g",
  right: "G",
  bottom: ["G"],
  lip,
  under: shade,
  beside: shade,
  ring: shade,
});

const pebble = P(`
  .kK.
  kKKM
  .MM.
`);
const grit = P(`
  .kk
  KKM
  .MM
`);
const crack = P(`
  n...
  .nn.
  ...n
`);
const rut = P(`
  mm....
  ..mmmm
`);
const dry = P(`
  cc.
  .cc
`);

const DIRT_BASES = [
  [[3, 4, crack]],
  [[9, 9, pebble]],
  [
    [2, 11, dry],
    [11, 3, grit],
  ],
  [],
  [[8, 2, rut]],
] as const satisfies readonly (readonly Mark[])[];

const lawnPath = terrain({
  name: "lawn-path",
  upper: "grass",
  lower: "dirt",
  themes: ["campus", "campus-night", "greece"],
  palette,
  lone,
  ...lawnPictures(LAWN_RIM("m", ["E"]), 1),
  base: DIRT_BASES.map((marks) => tileOf("b", marks)),
  fill: LAWN_MARKS.slice(1).map(lawnTile),
  tones: LAWN_TONES,
  decals: {
    ...LAWN_DECALS,
    pebbles: {
      on: "lower",
      density: 0.12,
      grid: `
        .kk....
        kKKM...
        .MM..kk
        ....KKM
        .kk..MM
        KKM....
        .MM....
      `,
    },
  },
});

/** 보도블록: grey pavers in running bond, flat faces, a paler or worn one here and there. */
function pavers(
  pale: readonly (readonly [number, number])[],
  worn: readonly (readonly [number, number])[],
): string {
  const pic = Pic.blank(16, 16, "K");
  for (let y = 0; y < 16; y++) {
    const row = Math.floor(y / 4);
    const shift = row % 2 ? 4 : 0;
    for (let x = 0; x < 16; x++) {
      const bx = (x + 16 - shift) % 16;
      const brick = Math.floor(bx / 8);
      const joint = y % 4 === 3 || bx % 8 === 7;
      const isPale = pale.some(([r, b]) => r === row && b === brick);
      const isWorn = worn.some(([r, b]) => r === row && b === brick);
      pic.set(x, y, joint ? "M" : isPale ? "k" : isWorn && y % 4 === 2 ? "M" : "K");
    }
  }
  return pic.toString();
}

const lawnWalk = terrain({
  name: "lawn-walk",
  upper: "grass",
  lower: "walk",
  themes: ["campus", "campus-night"],
  palette,
  lone,
  ...lawnPictures({ fill: "g", band: ["k", "k"], lip: ["K", "M"], under: "S", beside: "S" }, 2),
  base: [
    pavers([], []),
    pavers([[1, 0]], []),
    pavers([], []),
    pavers([], [[2, 1]]),
    pavers([[3, 1]], []),
  ],
  fill: LAWN_MARKS.slice(1).map(lawnTile),
  tones: LAWN_TONES,
  decals: LAWN_DECALS,
});

const speck = P(`
  K.
  .K
`);
const shine = P(`
  ww
`);
const warm = P(`
  .c
  cc
`);
const scuff = P(`
  KK..
  .KKK
`);

const lawnField = terrain({
  name: "lawn-field",
  upper: "grass",
  lower: "sand",
  themes: ["campus", "campus-night"],
  palette,
  lone,
  ...lawnPictures(LAWN_RIM("K", ["e", "E"]), 2),
  base: [
    tileOf("s", [
      [2, 2, speck],
      [10, 5, shine],
      [5, 10, warm],
      [12, 12, speck],
    ]),
    tileOf("s", [
      [8, 2, scuff],
      [2, 9, speck],
      [11, 11, shine],
    ]),
    tileOf("s", [
      [3, 4, shine],
      [10, 8, speck],
      [4, 13, scuff],
    ]),
    tileOf("s", [
      [12, 2, warm],
      [6, 7, speck],
      [1, 13, shine],
    ]),
  ],
  fill: LAWN_MARKS.slice(1).map(lawnTile),
  tones: LAWN_TONES,
  decals: {
    ...LAWN_DECALS,
    prints: {
      on: "lower",
      density: 0.06,
      grid: `
        .KK.....
        KKKK....
        .KK..KK.
        ....KKKK
        .....KK.
      `,
    },
  },
});

export default [lawnPath, lawnWalk, lawnField];
