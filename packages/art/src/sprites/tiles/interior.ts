import { type Decal, type Legend, overlay, type Tone, terrain } from "../../format.ts";
import { IL } from "../../interior.ts";
import { inside, type Mark, Pic, paint, type Shape, texture, tileOf } from "../../paint.ts";

/**
 * The school's floors, and the tops of its walls.
 *
 * Every floor is the lower side of a pair whose upper side is something laid on it: the
 * lounge's rug on the wooden floor, a rubber mat on the others. Waxed sheen and scuffed patches
 * are tones, so a long corridor never repeats a tile at a glance.
 *
 * Walls are an overlay drawn over the floor around cells marked as wall: the wall's top seen
 * from above, dark beyond a pale cap. Back walls hang their faces (`wall-*` sprites) from the
 * cap's lower edge; side walls are just the cap, a thin edge seen from above.
 */
const palette: Legend = {
  ...IL,
  // working cells, never left in a finished picture
  "?": null,
  "*": null,
};

const P = (src: string): Pic => Pic.of(src);

// Tones ---------------------------------------------------------------------------------------

const TONE_SHAPE: Shape = {
  top: [0, 0, 1, 2, 2, 1, 0, -1, -1, 0, 1, 1, 0, 0, 0, 0],
  bottom: [0, 0, 0, -1, -2, -2, -1, 0, 1, 1, 0, -1, 0, 0, 0, 0],
  left: [0, 0, -1, -1, 0, 1, 2, 2, 1, 0, 0, -1, 0, 0, 0, 0],
  right: [0, 0, 1, 1, 0, -1, -2, -1, 0, 1, 1, 0, 0, 0, 0, 0],
  radius: 7,
  holeRadius: 5,
};

/**
 * A patch drawn as marks only: dense in its core, sparse in a three-pixel fringe, clear
 * elsewhere so the floor shows through.
 */
function tonePictures(
  core: readonly (readonly Mark[])[],
  fringe: readonly (readonly Mark[])[],
): Pick<Tone, "outer" | "inner" | "fill"> {
  const make = (pic: Pic, v: number): string => {
    texture(pic, core, "*", (cx, cy) => cx + cy * 2 + v);
    texture(pic, fringe, "?", (cx, cy) => cx * 3 + cy + v);
    return pic.swap("?*", "..").toString();
  };
  const picture = (kind: "outer" | "inner", size: number, v: number) =>
    make(paint(size, size, inside(kind, TONE_SHAPE), { fill: "*", band: ["?", "?", "?"] }), v);
  return {
    outer: [picture("outer", 48, 0), picture("outer", 48, 2)],
    inner: [picture("inner", 32, 1), picture("inner", 32, 3)],
    fill: [1, 2].map((v) => make(Pic.blank(16, 16, "*"), v + 4)),
  };
}

// Wooden floor ----------------------------------------------------------------------------------

/**
 * 마루: varnished boards running across the room, four pixels each, the seam under every
 * board. A tile has one or two end joints, so boards run long and stagger irregularly.
 */
function boards(joints: readonly (readonly [row: number, x: number])[], marks: readonly Mark[]) {
  const pic = Pic.blank(16, 16, "W");
  for (let b = 0; b < 4; b++) for (let x = 0; x < 16; x++) pic.set(x, b * 4 + 3, "u");
  for (const [row, x] of joints) for (let y = 0; y < 3; y++) pic.set(x, row * 4 + y, "u");
  texture(pic, [marks], "W");
  return pic.toString();
}

const grain = P("PPPP");
const grainShort = P("PP");
const grainDark = P("uu");
const knot = P(`
  .uu.
  uUUu
`);

const WOOD_BASES = [
  boards(
    [[1, 6]],
    [
      [2, 1, grain],
      [9, 9, grainShort],
    ],
  ),
  boards(
    [
      [0, 11],
      [2, 3],
    ],
    [
      [5, 5, grainDark],
      [10, 13, grain],
    ],
  ),
  boards([[3, 9]], [[1, 9, grain]]),
  boards(
    [[2, 13]],
    [
      [6, 1, grainShort],
      [8, 5, knot],
    ],
  ),
  boards([[0, 4]], [[11, 9, grainShort]]),
];

/** Waxed sheen: the window light caught along the boards. */
const WOOD_SHEEN: readonly (readonly Mark[])[] = [
  [
    [1, 0, P("PPPPPP")],
    [8, 4, P("PPPPP")],
    [3, 8, P("PPPP")],
    [9, 12, P("PPPPPP")],
  ],
  [
    [6, 0, P("PPPPP")],
    [0, 5, P("PPPP")],
    [8, 8, P("PPPPPP")],
    [2, 13, P("PPPP")],
  ],
];
const WOOD_SHEEN_FRINGE: readonly (readonly Mark[])[] = [
  [
    [4, 4, P("PPP")],
    [10, 12, P("PP")],
  ],
  [[8, 8, P("PPP")]],
];
/** Worn boards where chairs scrape: darker grain, scuffs. */
const WOOD_WORN: readonly (readonly Mark[])[] = [
  [
    [2, 1, P("uuu")],
    [9, 5, P("uu.uu")],
    [4, 9, P("uuuu")],
    [11, 13, P("uu")],
  ],
  [
    [7, 1, P("uuuu")],
    [1, 6, P("uu")],
    [10, 9, P("uuu")],
    [3, 13, P("uu.uu")],
  ],
];

// Linoleum --------------------------------------------------------------------------------------

/** School linoleum: one sheet, flecked faintly, black heel marks where shoes skid. */
const flecks = P("VV");
const heel = P(`
  I...
  .II.
`);
const heel2 = P(`
  ..I
  II.
`);

const LINO_BASES = [
  tileOf("K", [
    [3, 3, flecks],
    [11, 10, flecks],
  ]),
  tileOf("K", [[8, 5, flecks]]),
  tileOf("K", [
    [2, 11, flecks],
    [12, 2, flecks],
  ]),
  tileOf("K", []),
  tileOf("K", [[6, 12, flecks]]),
];

/** Wax caught in long diagonal streaks. */
const streak = P(`
  ...kk
  .kk..
  k....
`);
const streakLong = P(`
  .....kk
  ...kk..
  .kk....
  k......
`);
const glint = P(`
  .w
  w.
`);
const LINO_SHEEN: readonly (readonly Mark[])[] = [
  [
    [1, 1, streakLong],
    [9, 5, streak],
    [4, 10, streak],
    [11, 11, glint],
  ],
  [
    [8, 1, streak],
    [2, 6, streakLong],
    [10, 10, streakLong],
  ],
];
const LINO_SHEEN_FRINGE: readonly (readonly Mark[])[] = [
  [
    [4, 3, streak],
    [10, 11, P("kk")],
  ],
  [[7, 7, P(".k\nk.")]],
];
const LINO_SCUFF: readonly (readonly Mark[])[] = [
  [
    [2, 2, heel],
    [10, 6, heel2],
    [5, 12, P("MMM")],
  ],
  [
    [9, 1, P("MM")],
    [3, 7, heel2],
    [11, 12, heel],
  ],
];

// Terrazzo --------------------------------------------------------------------------------------

/** 인조석 갈기: stone chips set in pale cement, ground flat and polished. */
function terrazzo(seed: number): string {
  const chips: Mark[] = [];
  const kinds = [P("ww"), P("K\nK"), P("LL"), P("w\nw"), P("pp"), P("KK"), P("LL"), P("K\nK")];
  let s = seed * 9301 + 49297;
  const rnd = (n: number) => {
    s = (s * 9301 + 49297) % 233280;
    return Math.floor((s / 233280) * n);
  };
  for (let i = 0; i < 6; i++) {
    const kind = i < 4 ? i % 4 : rnd(kinds.length);
    chips.push([1 + rnd(13), 1 + rnd(13), kinds[kind] as Pic]);
  }
  return tileOf("k", chips);
}

const TERRAZZO_BASES = [terrazzo(1), terrazzo(2), terrazzo(3), terrazzo(4), terrazzo(5)];

const TERRAZZO_SHEEN: readonly (readonly Mark[])[] = [
  [
    [2, 2, P("..ww\nww..")],
    [9, 8, P("..ww\nww..")],
    [4, 12, P("ww")],
  ],
  [
    [8, 2, P("ww")],
    [1, 7, P("..ww\nww..")],
    [11, 12, P("..ww\nww..")],
  ],
];
const TERRAZZO_SHEEN_FRINGE: readonly (readonly Mark[])[] = [[[6, 6, P("ww")]], []];

// Cafeteria tile ------------------------------------------------------------------------------

/** Small quarry tiles, eight pixels with their grout, a few lighter and a few chipped. */
function tiles(light: readonly number[], chip: readonly number[]): string {
  const pic = Pic.blank(16, 16, "P");
  for (let i = 0; i < 16; i++) {
    pic.set(7, i, "p").set(15, i, "p").set(i, 7, "p").set(i, 15, "p");
  }
  [
    [0, 0],
    [8, 0],
    [0, 8],
    [8, 8],
  ].forEach(([tx, ty], k) => {
    if (light.includes(k)) {
      for (let y = 1; y < 5; y++)
        for (let x = 1; x < 5; x++)
          if (x + y < 6) pic.set((tx as number) + x, (ty as number) + y, "E");
    }
    if (chip.includes(k)) pic.put(P("pp\np."), (tx as number) + 4, (ty as number) + 4);
  });
  return pic.toString();
}

const TILE_BASES = [tiles([], []), tiles([1], []), tiles([], [2]), tiles([3], [0]), tiles([0], [])];

/** Mopped, still wet: grout darkened and a shine across the tiles. */
const TILE_WET: readonly (readonly Mark[])[] = [
  [
    [1, 1, P("ww\nw.")],
    [9, 9, P("ww\nw.")],
    [10, 2, P(".w\nww")],
  ],
  [
    [2, 9, P("ww\nw.")],
    [9, 1, P("ww\nw.")],
  ],
];
const TILE_WET_FRINGE: readonly (readonly Mark[])[] = [[[9, 9, P("w.\n.w")]], []];

// Dorm vinyl ----------------------------------------------------------------------------------

/** 장판: glossy, warm, mottled like oiled paper. */
const mottle = P("uu");
const mottle2 = P(".u\nu.");
const VINYL_BASES = [
  tileOf("W", [
    [3, 4, mottle],
    [11, 11, mottle2],
  ]),
  tileOf("W", [[9, 3, mottle2]]),
  tileOf("W", [
    [2, 12, mottle],
    [12, 7, mottle],
  ]),
  tileOf("W", []),
];
const VINYL_GLOSS: readonly (readonly Mark[])[] = [
  [
    [1, 2, P("PPPP\n.PP.")],
    [9, 9, P("PPP")],
  ],
  [
    [8, 2, P("PPP")],
    [2, 8, P("PPPP\n.PP.")],
  ],
];
const VINYL_GLOSS_FRINGE: readonly (readonly Mark[])[] = [[[5, 5, P("PP")]], []];

// What lies on the floors ---------------------------------------------------------------------

const MAT_SHAPE: Shape = { radius: 1, holeRadius: 1 };

/**
 * A rubber mat: ribs across it, a bound edge, a shadow line on the floor to its right and below
 * (`shade`, the floor's own darker step). Drawn as an island over clear floor.
 */
function matPictures(shade: string): { outer: string; inner: string } {
  const make = (kind: "outer" | "inner", size: number): string => {
    const isIn = inside(kind, MAT_SHAPE);
    const pic = paint(size, size, isIn, { fill: "I", band: ["j"], beside: shade, under: shade });
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (pic.at(x, y) === "I" && y % 3 === 1) pic.set(x, y, "i");
      }
    }
    return pic.toString();
  };
  return { outer: make("outer", 48), inner: make("inner", 32) };
}

/**
 * The lounge rug: a plum field with a lattice, a three-band border, cream fringe on its short
 * ends and a soft shadow line where it lifts off the boards.
 */
function rugPictures(): { outer: string; inner: string; fill: string[] } {
  const make = (kind: "outer" | "inner", size: number): Pic => {
    const isIn = inside(kind, { radius: 0, holeRadius: 0 });
    const pic = paint(size, size, isIn, {
      fill: "X",
      band: ["a", "x", "a"],
      beside: "u",
    });
    lattice(pic);
    // Fringe off the top and bottom edges: two-pixel tassels on every other column.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isIn(x, y) || x % 2 === 1) continue;
        const above = isIn(x, y + 1) || (isIn(x, y + 2) && !isIn(x, y + 1));
        const below = isIn(x, y - 1) || isIn(x, y - 2);
        if (above || below) pic.set(x, y, "k");
        else if (pic.at(x, y) === "u" && (isIn(x, y + 3) || isIn(x, y - 3))) pic.set(x, y, ".");
      }
    }
    return pic;
  };
  const fill = Pic.blank(16, 16, "X");
  lattice(fill);
  return {
    outer: make("outer", 48).toString(),
    inner: make("inner", 32).toString(),
    fill: [fill.toString()],
  };
}

/** A diamond lattice on the rug's field, eight pixels across. */
function lattice(pic: Pic): void {
  for (let y = 0; y < pic.h; y++) {
    for (let x = 0; x < pic.w; x++) {
      if (pic.at(x, y) !== "X") continue;
      const u = (x + y) % 8;
      const v = (x - y + 64) % 8;
      if (u === 0 || v === 0) pic.set(x, y, "a");
    }
  }
  // A dot in the middle of every diamond.
  for (let y = 0; y < pic.h; y++) {
    for (let x = 0; x < pic.w; x++) {
      const centre = (x % 8 === 4 && y % 8 === 0) || (x % 8 === 0 && y % 8 === 4);
      if (!centre) continue;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const)
        if (pic.at(x + dx, y + dy) === "X") pic.set(x + dx, y + dy, "%");
    }
  }
}

const SCUFF_DECALS: Readonly<Record<string, Decal>> = {
  scrape: {
    on: "lower",
    density: 0.02,
    grid: `
      ii....
      .iii..
      ....ii
    `,
  },
};

const mats = (floor: string, shade: string) => ({
  name: `mat-${floor}`,
  upper: "mat",
  lower: floor,
  palette,
  ...matPictures(shade),
});

const wood = terrain({
  name: "rug-wood",
  upper: "rug",
  lower: "wood",
  themes: ["campus", "campus-night", "campus-dusk"],
  palette,
  ...rugPictures(),
  base: WOOD_BASES,
  tones: [
    { name: "sheen", on: "lower", band: [0.66, 1], ...tonePictures(WOOD_SHEEN, WOOD_SHEEN_FRINGE) },
    { name: "worn", on: "lower", band: [0, 0.3], ...tonePictures(WOOD_WORN, []) },
  ],
  decals: {
    knot: {
      on: "lower",
      density: 0.04,
      grid: `
        .uu.
        uUUu
      `,
    },
  },
});

const lino = terrain({
  ...mats("lino", "V"),
  themes: ["campus", "campus-night", "campus-dusk"],
  base: LINO_BASES,
  tones: [
    { name: "sheen", on: "lower", band: [0.62, 1], ...tonePictures(LINO_SHEEN, LINO_SHEEN_FRINGE) },
    { name: "scuffed", on: "lower", band: [0, 0.3], ...tonePictures(LINO_SCUFF, []) },
  ],
  decals: SCUFF_DECALS,
});

const terrazzoFloor = terrain({
  ...mats("terrazzo", "K"),
  themes: ["campus", "campus-night", "campus-dusk"],
  base: TERRAZZO_BASES,
  tones: [
    {
      name: "sheen",
      on: "lower",
      band: [0.6, 1],
      ...tonePictures(TERRAZZO_SHEEN, TERRAZZO_SHEEN_FRINGE),
    },
  ],
});

const tileFloor = terrain({
  ...mats("tile", "p"),
  themes: ["campus", "campus-dusk"],
  base: TILE_BASES,
  tones: [
    { name: "wet", on: "lower", band: [0.64, 1], ...tonePictures(TILE_WET, TILE_WET_FRINGE) },
  ],
});

const vinyl = terrain({
  ...mats("vinyl", "u"),
  themes: ["campus", "campus-night"],
  base: VINYL_BASES,
  tones: [
    {
      name: "gloss",
      on: "lower",
      band: [0.6, 1],
      ...tonePictures(VINYL_GLOSS, VINYL_GLOSS_FRINGE),
    },
  ],
});

// Wall tops ------------------------------------------------------------------------------------

/**
 * The top of a wall seen from above: dark beyond, a pale cap three pixels wide along every edge
 * that meets a room. The cap catches the light on its north and west edges and falls into
 * shadow on its east edge; along its south edge it turns down into a back wall's face.
 */
function wallTop(kind: "outer" | "inner", size: number): string {
  const isIn = inside(kind, { radius: 0, holeRadius: 0 });
  const pic = Pic.blank(size, size);
  const reach = (x: number, y: number, dx: number, dy: number): number => {
    for (let k = 1; k <= 3; k++) if (!isIn(x + dx * k, y + dy * k)) return k;
    return 99;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isIn(x, y)) continue;
      const t = reach(x, y, 0, -1);
      const b = reach(x, y, 0, 1);
      const l = reach(x, y, -1, 0);
      const r = reach(x, y, 1, 0);
      let diag = 99;
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        diag = Math.min(diag, reach(x, y, dx, dy));
      }
      const near = Math.min(t, b, l, r);
      let ch = "j";
      if (near === 1) {
        // The very edge: lit facing north and west, shaded facing east, a crisp lip facing south.
        ch = b === 1 ? "k" : r === 1 ? "M" : "w";
      } else if (near <= 3) ch = b <= 3 ? "K" : r <= 3 ? "M" : "K";
      else if (diag <= 3) ch = "K";
      pic.set(x, y, ch);
    }
  }
  return pic.toString();
}

const wallTops = overlay({
  name: "wall-top",
  palette,
  outer: wallTop("outer", 48),
  inner: wallTop("inner", 32),
});

export default [wood, lino, terrazzoFloor, tileFloor, vinyl, wallTops];
