import {
  type Dir,
  type Legend,
  type PartDef,
  type Piece,
  type PieceGrids,
  type PoseGrid,
  part,
  type Vec,
} from "../format.ts";
import { gridRows } from "../grid.ts";

/**
 * The student skeleton and the pieces every student-sized character shares: the legend, the
 * head, the sleeves and trouser legs that every garment paints, the ground shadow, and the
 * helpers that turn one drawing into the knocked-out pose.
 *
 * The body sits in the centre 16×24 of a 24×26 frame so the strike, the knocked-out pose and
 * tall hair can reach past it. Side faces right. Light comes from the top left in every direction.
 */

/** One legend for every student part. Skin, hair and jacket are swap slots. */
export const ink: Legend = {
  ".": null,
  O: "skin.deep",
  k: "skin.dark",
  s: "skin.mid",
  S: "skin.light",
  X: "hair.deep",
  x: "hair.dark",
  h: "hair.mid",
  H: "hair.light",
  J: "jacket.deep",
  j: "jacket.dark",
  c: "jacket.mid",
  C: "jacket.light",
  N: "navy.deep",
  n: "navy.dark",
  v: "navy.mid",
  V: "navy.light",
  G: "stone.deep",
  g: "stone.mid",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  e: "ink.deep",
  z: "ink.dark",
  i: "ink.mid",
  I: "ink.light",
  R: "red.deep",
  r: "red.dark",
  m: "red.mid",
  M: "red.light",
  T: "clay.deep",
  t: "clay.dark",
  u: "clay.mid",
  U: "clay.light",
  y: "clay.pale",
  D: "gold.deep",
  a: "gold.mid",
  W: "wood.deep",
  b: "sea.dark",
  l: "sea.light",
  L: "sea.pale",
  // Lone marks: eye glints, blush, mouths, hands, smears.
  "^": "stone.bright",
  "'": "rose.light",
  "-": "skin.deep",
  ",": "skin.dark",
  "*": "ink.deep",
  "%": "skin.mid",
  "&": "skin.dark",
  "~": "stone.pale",
  "!": "red.dark",
  "@": "skin.deep",
};

export const lone = "^'-,*%&~!@";

// Knocked out ---------------------------------------------------------------------------------

/** Swaps rows and columns: a side-view grid becomes the same body lying face down. */
export function transpose(grid: string): string {
  const rows = gridRows(grid).map((r) => [...r]);
  const w = Math.max(...rows.map((r) => r.length));
  const out: string[] = [];
  for (let x = 0; x < w; x++) out.push(rows.map((r) => r[x] ?? ".").join(""));
  return out.join("\n");
}

/** The lying body is the side frame transposed, then lowered onto the ground. */
const KO_DROP: Vec = [-1, 7];

function sideAt(piece: Piece): Vec {
  const a = piece.at;
  if (a === undefined) return [0, 0];
  if (Array.isArray(a)) return a as Vec;
  return (a as Partial<Record<Dir, Vec>>).side ?? [0, 0];
}

/**
 * Adds a `ko` pose to every piece of a part: its side grid (or its side `ko` grid) transposed.
 * Every hairstyle, garment and face falls over the same way with no extra drawing, and light
 * stays at the top left. The knocked-out frame is the same lying body from every direction.
 */
export function withKo(def: PartDef): PartDef {
  const pieces: Record<string, Piece> = {};
  for (const [bone, piece] of Object.entries(def.pieces)) {
    const side = piece.side;
    if (side === undefined || side === null) {
      pieces[bone] = piece;
      continue;
    }
    const map: Readonly<Record<string, PoseGrid>> =
      typeof side === "string" ? { rest: side } : side;
    const src = (map.ko ?? map.rest) as PoseGrid;
    const at = typeof src === "string" ? sideAt(piece) : src.at;
    const grid = typeof src === "string" ? src : src.grid;
    const ko: PoseGrid = { at: [at[1] + KO_DROP[0], at[0] + KO_DROP[1]], grid: transpose(grid) };
    const add = (g: PieceGrids | null | undefined): PieceGrids => {
      if (g === undefined || g === null) return { rest: ".", ko };
      return typeof g === "string" ? { rest: g, ko } : { ...g, ko };
    };
    pieces[bone] = { ...piece, down: add(piece.down), up: add(piece.up), side: add(piece.side) };
  }
  return { ...def, pieces };
}

// Shadow --------------------------------------------------------------------------------------

const blob = `
  ...zzzzzz...
  .zzzzzzzzzz.
  zzzzzzzzzzzz
  .zzzzzzzzzz.
`;

const shadowPoses: Readonly<Record<string, PoseGrid>> = {
  rest: blob,
  ko: {
    at: [1, 22],
    grid: `
      ..zzzzzzzzzzzzzzzzzz..
      zzzzzzzzzzzzzzzzzzzzzz
      .zzzzzzzzzzzzzzzzzzzz.
    `,
  },
};

export const shadow = part({
  palette: ink,
  pieces: { ground: { at: [6, 22], down: shadowPoses, up: shadowPoses, side: shadowPoses } },
});

// Body --------------------------------------------------------------------------------------

/** Head only: hands are drawn in the sleeves so they sit above the uniform. */
export const skin = part({
  palette: ink,
  pieces: {
    head: {
      at: { down: [5, 3], up: [4, 3], side: [0, 4] },
      down: `
        ....OOOOOO....
        ..OOssssssOO..
        .OssssssssssO.
        OssssssssssssO
        OssssssssssssO
        OssssssssssssO
        OssssssssssssO
        .OssssssssssO.
        ..OOssssssOO..
        ....OOOOOO....
      `,
      up: `
        .....OOOOOO.....
        ...OOssssssOO...
        ..OssssssssssO..
        .OssssssssssssO.
        .OssssssssssssO.
        OOssssssssssssOO
        OOssssssssssssOO
        .OssssssssssssO.
        ...OOssssssOO...
        .....OssssO.....
        .....OssssO.....
      `,
      side: `
        .........OOOO.......
        .......OOssssOO.....
        ......OsssssssssO...
        ......OssssssssssO..
        ......OssssssssssO..
        ......OssOkssssssO..
        ......OssOksssssssO.
        .......OOOOOsssssO..
        ...........OsssOO...
      `,
    },
  },
});

// Garments ----------------------------------------------------------------------------------
// Sleeves are drawn once with digits and painted by each garment's legend: 1 2 3 upper arm
// (outline, lit, shaded), 4 5 6 forearm. Hands are skin in every garment.

/** Flips a grid left to right and swaps lit marks for shaded ones: the arm on the other side. */
export function mirror(grid: string): string {
  const swap: Record<string, string> = { "2": "3", "5": "6", "%": "&" };
  return gridRows(grid)
    .map((r) =>
      [...r]
        .reverse()
        .map((c) => swap[c] ?? c)
        .join(""),
    )
    .join("\n");
}

const armLit = {
  rest: `
    .11
    121
    121
    454
    454
    O%O
    .O.
  `,
  fwd: `
    .11
    121
    121
    454
    454
    454
    O%O
    .O.
  `,
  back: `
    .11
    121
    121
    O%O
    .O.
  `,
};
const armShade = {
  rest: mirror(armLit.rest),
  fwd: mirror(armLit.fwd),
  back: mirror(armLit.back),
};

const armSide = {
  rest: `
    .111.
    .121.
    .121.
    .454.
    .454.
    .O%O.
    ..O..
  `,
  fwd: `
    .111.
    .121.
    .121.
    ..454
    ..454
    ..O%O
    ...O.
  `,
  back: `
    .111.
    .121.
    .121.
    454..
    454..
    O%O..
    .O...
  `,
};
const shaded = (g: string) => g.replaceAll("2", "3").replaceAll("5", "6").replaceAll("%", "&");
const armSideFar = {
  rest: `
    .111.
    .131.
    .131.
    .464.
    .464.
    .O&O.
  `,
  fwd: shaded(armSide.fwd),
  back: { at: [7, 14] as Vec, grid: shaded(armSide.back) },
};

/** The book arm raised beside the head: the wind-up, and both arms in a stretch. */
const raise = `
  .O.....
  O%O....
  454....
  .454...
  ..121..
  ...121.
  ....111
`;
/** The raise turned over: an arm flung out low and wide when a hit lands. */
const fling = `
  ....111
  ...121.
  ..121..
  .454...
  454....
  O%O....
  .O.....
`;
/** Upper arm pointing away from the camera, forearm hidden. */
export const away = `
  11.
  131
  131
  .1.
`;

const armR: Piece = {
  at: { down: [6, 14], up: [15, 14], side: [8, 14] },
  down: {
    ...armLit,
    raise: { at: [1, 8], grid: raise },
    fling: { at: [1, 14], grid: fling },
    strike: {
      at: [6, 14],
      grid: `
        .11.
        121.
        .121
        .454
        .454
        .O%O
        ..O.
      `,
    },
    follow: {
      at: [6, 14],
      grid: `
        .11...
        .121..
        .121..
        ..454.
        ...454
        ...O%O
        ....O.
      `,
    },
    read: {
      at: [6, 14],
      grid: `
        .11.
        121.
        121.
        O%O.
        .O..
      `,
    },
  },
  up: {
    ...armShade,
    raise: { at: [16, 8], grid: mirror(raise) },
    fling: { at: [16, 14], grid: mirror(fling) },
    strike: { at: [15, 14], grid: away },
    follow: { at: [15, 14], grid: away },
    read: { at: [15, 14], grid: away },
  },
  side: {
    ...armSide,
    raise: {
      at: [3, 14],
      grid: `
        .@@44111
        @%%55221
        @%%55221
        .@@4411.
      `,
    },
    strike: {
      at: [9, 13],
      grid: `
        .111444444
        1222555555
        .111444444
      `,
    },
    follow: { at: [8, 14], grid: armSide.fwd },
    mouth: {
      at: [9, 10],
      grid: `
        .........O.
        ........O%O
        ......4454.
        111111454..
        12222254...
        1111114....
      `,
    },
    read: {
      at: [9, 14],
      grid: `
        1111......
        1211......
        1214444O%O
        12555555O.
        11444444..
        111111....
      `,
    },
  },
};

const armL: Piece = {
  at: { down: [15, 14], up: [6, 14], side: [8, 14] },
  down: {
    ...armShade,
    raise: { at: [16, 8], grid: mirror(raise) },
    fling: { at: [16, 14], grid: mirror(fling) },
    mouth: {
      at: [13, 10],
      grid: `
        .O...
        O&O..
        .464.
        .464.
        ..111
        ..11.
      `,
    },
    read: {
      at: [15, 14],
      grid: `
        .11.
        .131
        .131
        .O&O
        ..O.
      `,
    },
  },
  up: {
    ...armLit,
    raise: { at: [1, 8], grid: raise },
    fling: { at: [1, 14], grid: fling },
    read: { at: [6, 14], grid: mirror(away) },
    mouth: { at: [6, 14], grid: mirror(away) },
  },
  side: armSideFar,
};

const legLit = {
  rest: `
    .eIe
    .eIe
    .eIe
    .eIe
    GwwG
    GGGG
  `,
  lift: `
    .eIe
    .eIe
    .eIe
    GwwG
    GGGG
  `,
};
const legShade = {
  rest: `
    eie.
    eie.
    eie.
    eie.
    GwwG
    GGGG
  `,
  lift: `
    eie.
    eie.
    eie.
    GwwG
    GGGG
  `,
};
const legSide = {
  rest: `
    ..eiie..
    ..eiie..
    ..eiie..
    ..eiie..
    ..GwwwG.
    ..GGGGG.
  `,
  fwd: `
    ..eiie..
    ..eiie..
    ...eiie.
    ...eiie.
    ...GwwwG
    ...GGGGG
  `,
  back: `
    ..eiie..
    ..eiie..
    .eiie...
    .eiie...
    GwwwG...
    GGGGG...
  `,
};
const far = (g: string) => g.replaceAll("I", "z").replaceAll("i", "z");
const legSideFar = { rest: far(legSide.rest), fwd: far(legSide.fwd), back: far(legSide.back) };

const legs = {
  legR: {
    at: { down: [8, 19], up: [12, 19], side: [8, 19] },
    down: legLit,
    up: legShade,
    side: legSide,
  },
  legL: {
    at: { down: [12, 19], up: [8, 19], side: [8, 19] },
    down: legShade,
    up: legLit,
    side: legSideFar,
  },
} satisfies Record<string, Piece>;

export type Torso = Record<Dir, string>;

/** Sleeves and trousers are one pixel thick: a limb is allowed to show a single pixel. */
const limb = "123456Iize";

export function garment(sleeve: Legend, torso: Torso, withLegs: boolean): PartDef {
  return withKo(
    part({
      palette: { ...ink, ...sleeve },
      lone: lone + limb,
      pieces: {
        armL,
        ...(withLegs ? legs : {}),
        torso: { at: { down: [8, 13], up: [8, 13], side: [9, 13] }, ...torso },
        armR,
      },
    }),
  );
}

// Book --------------------------------------------------------------------------------------

export const closed = `
  TTTT
  TUuT
  TUuT
  TyyT
  TTTT
`;

// Rig ---------------------------------------------------------------------------------------

export const walkArms = (d: Dir, lead: "R" | "L") => {
  if (d === "side") {
    return lead === "R"
      ? { legR: "fwd", legL: "back", armR: "back", armL: "fwd", hand: [-1, 0], tail: [-1, 0] }
      : { legL: "fwd", legR: "back", armR: "fwd", armL: "back", hand: [1, 0], tail: [-1, 0] };
  }
  return lead === "R"
    ? { legL: "lift", armL: "fwd", armR: "back", hand: [0, -2] }
    : { legR: "lift", armR: "fwd", armL: "back", hand: [0, 1] };
};

/** The skeleton every 16×24 character shares: students and the cast. */
export const frame = {
  size: [24, 26],
  origin: [12, 24],
  directions: ["down", "up", "side"],
  bones: {
    ground: null,
    armL: "torso",
    legL: null,
    legR: null,
    torso: null,
    armR: "torso",
    tail: "head",
    head: "torso",
    hand: null,
  },
  layers: ["shadow", "body", "uniform", "jacket", "face", "hair", "accessory", "book"],
  unchecked: ["shadow"],
} as const;
