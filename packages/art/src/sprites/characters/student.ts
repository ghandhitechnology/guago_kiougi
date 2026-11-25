import {
  type Dir,
  type Legend,
  type PartDef,
  type Piece,
  type PieceGrids,
  type PoseGrid,
  part,
  rig,
  type Vec,
} from "../../format.ts";
import { gridRows } from "../../grid.ts";

/**
 * The student: a first-year two weeks into dorm life, textbook always in hand.
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
        ...OOsssssskOO..
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

// Faces -------------------------------------------------------------------------------------
// Down grids sit on the face at [5, 6]; side grids at [3, 6]. Rows: eyes, eyes, cheeks, chin.

const hurt = {
  down: `
    ...*......*...
    ....*....*....
    ......--......
  `,
  side: `
    ............*..
    ...........*...
    ...............
    .............-.
  `,
};

const yawn = {
  down: `
    ..............
    ...**....**...
    ...'..!!..'...
    ......!!......
  `,
  side: `
    ...............
    ...........**..
    ...........'...
    ............!!.
  `,
};

/** Profile for the knocked-out pose, drawn upright; it is transposed with the head. */
const koSide = `
  ...............
  ...........**..
  ...............
  .............!.
`;

function face(own: {
  down: Record<"rest" | "shout" | "read", string>;
  side: Record<"rest" | "shout" | "read", string>;
}): PartDef {
  return withKo(
    part({
      palette: ink,
      lone,
      pieces: {
        head: {
          at: { down: [5, 8], up: [5, 8], side: [3, 8] },
          down: { ...own.down, hurt: hurt.down, yawn: yawn.down },
          up: null,
          side: { ...own.side, hurt: hurt.side, yawn: yawn.side, ko: koSide },
        },
      },
    }),
  );
}

/** 밝음: eager, round eyes with a glint, always a little flushed. */
const bright = face({
  down: {
    rest: `
      ...^e....^e...
      ...ee....ee...
      ...'..--..'...
    `,
    shout: `
      ...^e....^e...
      ...ee....ee...
      ...'..!!..'...
      ......!!......
    `,
    read: `
      ..............
      ...ee....ee...
      ...'..--..'...
    `,
  },
  side: {
    rest: `
      ...........^e..
      ...........ee..
      ...........'...
      .............-.
    `,
    shout: `
      ...........^e..
      ...........ee..
      ...........'...
      ............!!.
    `,
    read: `
      ...............
      ...........ee..
      ...........'...
      .............-.
    `,
  },
});

/** 졸림: heavy lids, a sideways look, rings under the eyes. Has not slept since March. */
const sleepy = face({
  down: {
    rest: `
      ...**....**...
      ...*,....*,...
      ...,,.-..,,...
    `,
    shout: `
      ...**....**...
      ...ee....ee...
      ...,,.!!.,,...
    `,
    read: `
      ..............
      ...**....**...
      ...,,..-.,,...
    `,
  },
  side: {
    rest: `
      ...........**..
      ...........*,..
      ...........,,..
      .............-.
    `,
    shout: `
      ...........**..
      ...........ee..
      ...........,,..
      ............!!.
    `,
    read: `
      ...............
      ...........**..
      ...........,,..
      .............-.
    `,
  },
});

/** 승부: eyes angled down to the nose, a one-sided grin. Treats every quiz as a duel. */
const sharp = face({
  down: {
    rest: `
      ...e,....,e...
      ...ee....ee...
      .......--.....
    `,
    shout: `
      ...e,....,e...
      ...ee....ee...
      .....!^^!.....
      ......!!......
    `,
    read: `
      ..............
      ...ee....ee...
      .......--.....
    `,
  },
  side: {
    rest: `
      ...........e,..
      ...........ee..
      ...............
      ............--.
    `,
    shout: `
      ...........e,..
      ...........ee..
      ............^..
      ............!!.
    `,
    read: `
      ...............
      ...........ee..
      ...............
      ............--.
    `,
  },
});

// Hair --------------------------------------------------------------------------------------
// Down and up heads span x 5..18; the side head spans x 3..17 with the face at the right.

function hair(pieces: Record<string, Piece>): PartDef {
  return withKo(part({ palette: ink, pieces }));
}

const none = { down: null, up: null, side: null } as const;

/** Neat and short, one tuft that will not lie down. */
const crop = hair({
  head: {
    at: { down: [5, 2], up: [5, 2], side: [0, 2] },
    down: `
      ........XX....
      ....XXXXXXX...
      ..XXHHHHhhXX..
      .XHHhhhhhhhxX.
      XHHhhhhhhhhhxX
      XxxxxhhhhxxhxX
      Xx..........xX
      Xx..........xX
    `,
    up: `
      ........XX....
      ....XXXXXXX...
      ..XXHHHHhhXX..
      .XHHHHhhhhhxX.
      XHHhhhhxhhhhxX
      XHhhhhxhhhhhxX
      XhhhhxhhhxhxxX
      XhhhhxhhhxhxxX
      .XhhxhhhxhhxX.
      ..XhxhhhxhxX..
      ...XXX..XXX...
    `,
    side: `
      .........XXX........
      .......XXHHHXX......
      ......XHHHhhhhX.....
      .....XHHhhhhhhhX....
      .....XHhhhhhhhxxX...
      .....Xhhhhhhhxx.....
      .....Xhhhhhx........
      .....Xhhh..x........
      .....Xhhh...........
      ......XhhX..........
      .......XX...........
    `,
  },
  tail: none,
});

/** Slept on it wrong. Spikes everywhere and one strand that points at the sky. */
const spiky = hair({
  head: {
    at: { down: [4, 1], up: [4, 1], side: [0, 1] },
    down: `
      .........XX.....
      ..X...XXXhhX.X..
      .XHX.XHHhhXXXhX.
      .XHHXHHhhhhhhhX.
      XHHHhhhhhhhhhhxX
      XHhhhhhhhhhhhxxX
      XhhxhhhxxhhhxhxX
      Xhx....xx....xhX
      .Xx..........xX.
    `,
    up: `
      .........XX.....
      ......X.XhhX....
      ..X..XhXXXXXX...
      .XXXXHHhhhXXXX..
      .XHHHhhhhhhhhhX.
      XHHhhhhhxhhhhhxX
      XHhhhhhxhhhhhxxX
      XhhhhhxhhhxhhxxX
      XhhhhxhhhxhhxxxX
      .XhhxhhhxhhhxxX.
      .XhxhhXhhxhxxXX.
      ..XXXXXXXXXXX...
    `,
    side: `
      ..........XX........
      .....X...XhX........
      .....XX.XXhXX.X.....
      ....XHHXHHhhhXhX....
      ....XHHHhhhhhhhhX...
      ...XHHhhhhhhhhxxX...
      ....Xhhhhhhhhxxx....
      ...Xhhhhhhhx........
      ....Xhhhh..x........
      ...Xhhhhh...........
      ....XhXhX...........
      .....X.X............
    `,
  },
  tail: none,
});

/** Chin-length bob with a blunt fringe, cut in the dorm bathroom. */
const bob = hair({
  head: {
    at: { down: [4, 2], up: [4, 2], side: [0, 2] },
    down: `
      ....XXXXXXXX....
      ..XXHHHHhhhhXX..
      .XHHHhhhhhhhhhX.
      XHHhhhhhhhhhhhxX
      XhhhhhhhhhhhhxxX
      XhhhhhhhhhhhhxxX
      Xhx..........xxX
      Xhx..........xxX
      Xhx..........xxX
      XhhX........XxxX
      .XXX........XXX.
    `,
    up: `
      .....XXXXXX.....
      ...XXHHHxHHXX...
      ..XHHHHHxhhhhX..
      .XHHhhhhxhhhhxX.
      .XHhhhhhxhhhhxX.
      XHhhhhhxhxhhhxxX
      XhhhhhxhhhxhhxxX
      XhhhhxhhhhhxhxxX
      XhhhxhhhhhhxxxxX
      XhhxhhhhhhhhxxxX
      .XXXXXXXXXXXXXX.
    `,
    side: `
      ........XXXX........
      ......XXHHHHXX......
      .....XHHHhhhhhX.....
      ....XHHhhhhhhhhX....
      ....XHhhhhhhhhhhX...
      ....Xhhhhhhhhhhxx...
      ....Xhhhhhhhx.......
      ....Xhhhhhhhx.......
      ...Xhhhhhhhhx.......
      ...Xhhhhhhhxx.......
      ...XXXXXXXXXX.......
    `,
  },
  tail: none,
});

/** Straight and long, centre parting, falls over the shoulders and down the back. */
const long = hair({
  head: {
    at: { down: [4, 2], up: [4, 2], side: [0, 2] },
    down: `
      ....XXXXXXXX....
      ..XXHHHxhHHhXX..
      .XHHhhhxXhhhhhX.
      XHHhhhhXhhhhhhxX
      XHhhhhxXxhhhhhxX
      XhhhhhxhhxhhhxxX
      Xhhx........xhxX
      Xhx..........xxX
      Xhx..........xxX
      Xhx..........xxX
      XhX..........XxX
      XhX..........XxX
      XhX..........XxX
      XhX..........XxX
      .XX..........XX.
    `,
    up: `
      .....XXXXXX.....
      ...XXHHHxHHXX...
      ..XHHHHhxhHHhX..
      .XHHhhhhxhhHhxX.
      .XHhhhhhxhhhhxX.
      XHhhhhhhxhhhhxxX
      XhHhhhhhxhhhhxxX
      XhHhhhhxhxhhhxxX
      XhhhhhhxhxhhhxxX
      XhhhhhxhhhxhxxxX
      XhhhhhxhhhxhxxxX
      XhhhxhhhhhhxxxxX
      .XhhxhhhhhxhxxX.
      ..XhXhhhhXhxXX..
      ...X.XXXX.XX....
    `,
    side: `
      ........XXXX........
      ......XXHHHHXX......
      .....XHHHhhhhhX.....
      ....XHHhhhhhhhhX....
      ....XHhhhhhhhhxxX...
      ....Xhhhhhhhhxx.....
      ....Xhhhhhhhx.......
      ....Xhhhhhhhx.......
      ....Xhhhhhhhx.......
      ....Xhhhhhhxx.......
      ....Xhhhhhhx........
    `,
  },
  tail: {
    at: { down: [4, 11], up: [4, 11], side: [4, 12] },
    down: null,
    up: null,
    side: `
      XhhhhX
      XhhhhX
      XhhhxX
      XhhhxX
      XhhxX.
      .XxX..
      ..X...
    `,
  },
});

/** High ponytail and side-swept bangs. The tail swings a beat behind every step. */
const ponytail = hair({
  head: {
    at: { down: [5, 2], up: [5, 2], side: [0, 2] },
    down: `
      ....XXXXXX....
      ..XXHHHHhhXX..
      .XHHhhhhhhhxX.
      XHHhhhhhhhhhxX
      XHhhhhhhhhhxxX
      XhhhhhxxhxxhxX
      Xhx.......xxxX
      Xx..........xX
    `,
    up: `
      ....XXXXXX....
      ..XXHHHHhhXX..
      .XHHhhXXhhhxX.
      XHHhhXmmXhhxxX
      XHhhhXrrXhhxxX
      XhhhxXhhXxhxxX
      XhhxhXhhXhxxxX
      XhhhhXhhXhhxxX
      .XhhhXhhXhxxX.
      ..XhhXhhXhxX..
      ...XXXhhXXX...
    `,
    side: `
      .........XXXX.......
      ........XHHHHXX.....
      .......XHHhhhhhX....
      .......XHhhhhhhhX...
      ......XhhhhhhhhxX...
      ......Xhhhhhhxx.....
      ......Xhhhhhx.......
      .......Xhh..x.......
      .......Xhh..........
      ........XX..........
      .........XX.........
    `,
  },
  tail: {
    at: { down: [17, 5], up: [9, 12], side: [1, 3] },
    down: `
      XX..
      XhX.
      XhxX
      XXxX
      XXxX
      .XxX
      .XX.
    `,
    up: `
      XhhhxX
      XhhhxX
      .XhhxX
      .XhhX.
      ..XX..
    `,
    side: `
      ...XX..
      ..XmmX.
      .XhrrX.
      .XhhX..
      XhhxX..
      XhxX...
      XhxX...
      XhX....
      XhX....
      .X.....
    `,
  },
});

/** Tight curls with a lot of volume. Will not fit under the 기숙사 shower cap. */
const curly = hair({
  head: {
    at: { down: [3, 1], up: [3, 1], side: [0, 1] },
    down: `
      .....XX.XX.XX.....
      ...XXHHXHHXhhXX...
      ..XHHHHhHHhhhhhX..
      .XHHHhhHHhhhhxhhX.
      XHHhhhhhhhhhxxhhxX
      XhhhhhhhhhhhhhhxxX
      XhhhxhhxxhhxxhhxxX
      Xhhx..........xxxX
      XhhX..........XxxX
      XhhX..........XxxX
      .XXX..........XXX.
    `,
    up: `
      .....XX.XXX.XX....
      ...XXHHXHHhXhhXX..
      ..XHHhHHhhhhhhhxX.
      .XHHhhhHHhhhhxxhxX
      XHHhhhhhhhHHhxxhxX
      XHhhHHhhhhhhhhhxxX
      XhhhhhhhHHhhxxhxxX
      XhhHHhhhhhhhhhxxxX
      XhhhhhxxhhxxhhhxxX
      .XhhxxhhhhhhhxxxX.
      .XhhhhxxhxxhhxxxX.
      ..XXXXXXXXXXXXXX..
      ......X....X......
    `,
    side: `
      ......XX.XX.XX......
      ....XXHHXHHXhhXX....
      ...XHHHhHHhhhhhhX...
      ..XHHhhhhhhhhhhhhX..
      ..XHhhHHhhhhhxhhxX..
      .XhhhhhhhhhhhxhxxX..
      .XhhxxhhhhhhxXX.....
      .Xhhhhhhhxxx........
      ..Xhhhxxhhhx........
      ..Xhhhhhhhh.........
      ...Xhhxxhhh.........
      ....XXXXXXX.........
    `,
  },
  tail: none,
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

/** 동복: navy blazer, white collar, red tie, gold buttons. */
const blazer = garment(
  {
    "1": "navy.deep",
    "2": "navy.light",
    "3": "navy.dark",
    "4": "navy.deep",
    "5": "navy.mid",
    "6": "navy.dark",
  },
  {
    down: `
      NNwmmwNN
      NVwmrwvN
      NVVmrvnN
      NVVmrvnN
      NvvvvvnN
      NvvvvvnN
      NNNNNNNN
    `,
    up: `
      NNNNNNNN
      NVvvvvnN
      NVvvvvnN
      NVvvvvnN
      NvvvvvnN
      NvvvvvnN
      NNNNNNNN
    `,
    side: `
      NNwwmN
      NVvwmN
      NVvVmN
      NvvVrN
      NvvVrN
      NvvVrN
      NNNNNN
    `,
  },
  true,
);

/** 하복: short-sleeved white shirt, the same tie, a belt. */
const shirt = garment(
  {
    "1": "stone.deep",
    "2": "stone.bright",
    "3": "stone.light",
    "4": "skin.deep",
    "5": "skin.mid",
    "6": "skin.dark",
  },
  {
    down: `
      GGwmmwGG
      GwwmrwqG
      GpwmrwqG
      GppmrqqG
      GwppppqG
      GwppppqG
      GGGGGGGG
    `,
    up: `
      GGGGGGGG
      GwppppqG
      GwppppqG
      GwppppqG
      GwpppqqG
      GwpppqqG
      GGGGGGGG
    `,
    side: `
      GGwwmG
      GwpwmG
      GwppmG
      GwpprG
      GwpprG
      GwpprG
      GGGGGG
    `,
  },
  true,
);

/** 과잠: the club jacket. Worn open, cream sleeves, a cream panel on the back for the emblem. */
const varsity = garment(
  {
    "1": "jacket.deep",
    "2": "stone.bright",
    "3": "stone.light",
    "4": "jacket.deep",
    "5": "stone.pale",
    "6": "stone.light",
  },
  {
    down: `
      JCj..jcJ
      JCj..jcJ
      JCj..jcJ
      Jwj..jcJ
      Jwj..jcJ
      JJJ..JJJ
      JJJ..JJJ
    `,
    up: `
      JjjjjjjJ
      JCccccjJ
      JCwwwwjJ
      JCwppwjJ
      JCwwwwjJ
      JjjjjjjJ
      JJJJJJJJ
    `,
    side: `
      JJJJJ.
      JcccJ.
      JcccJ.
      JcccJ.
      JcccJ.
      JJJJJ.
      JJJJJ.
    `,
  },
  false,
);

// Accessories -------------------------------------------------------------------------------

/** Round gold frames. */
const glasses = withKo(
  part({
    palette: ink,
    pieces: {
      head: {
        at: { down: [5, 7], up: [5, 7], side: [3, 7] },
        down: `
          ...DD....DD...
          ..D..DDDD..D..
          ..D..D..D..D..
          ..DDD....DDD..
        `,
        up: null,
        side: `
          ..........DDDD.
          .............D.
          .............D.
        `,
      },
    },
  }),
);

/** Lab goggles pushed up on the forehead, never once pulled down. */
const goggles = withKo(
  part({
    palette: ink,
    pieces: {
      head: {
        at: { down: [5, 3], up: [5, 5], side: [3, 5] },
        down: `
          eGGGGGGGGGGGGe
          eGLLllGGLLllGe
          eGGGGGGGGGGGGe
        `,
        up: `
          eeeeeeeeeeeeee
        `,
        side: `
          ..........GGGG.
          ..eeeeeeeeGLLG.
          ..........GGGG.
        `,
      },
    },
  }),
);

// Book --------------------------------------------------------------------------------------

export const closed = `
  TTTT
  TUuT
  TUuT
  TyyT
  TTTT
`;

/** The textbook. Raised, swung, read, and dropped with its owner. */
const textbook = withKo(
  part({
    palette: ink,
    lone,
    pieces: {
      hand: {
        at: { down: [2, 17], up: [18, 17], side: [5, 18] },
        down: {
          rest: closed,
          raise: {
            at: [0, 2],
            grid: `
              .TTTT
              TUuuT
              TUuuT
              TuuuT
              TyyyT
              TTTT.
            `,
          },
          strike: {
            at: [7, 18],
            grid: `
              TTTTTT
              TUuuuT
              TUuuuT
              TyyyyT
              TTTTTT
            `,
          },
          follow: {
            at: [12, 19],
            grid: `
              TTTT
              TUuT
              TUuT
              TTTT
            `,
          },
          fly: {
            at: [1, 1],
            grid: `
              ..TT..
              .TUuT.
              TUuuuT
              TyyuT.
              .TTT..
            `,
          },
          read0: {
            at: [9, 13],
            grid: `
              TTTTTT
              TwwwwT
              TUuTuT
              TUuTuT
              TUuTuT
              TTTTTT
            `,
          },
          read1: {
            at: [9, 11],
            grid: `
              ...T..
              ..TwT.
              TTTwTT
              TwwwwT
              TUuTuT
              TUuTuT
              TUuTuT
              TTTTTT
            `,
          },
          read2: {
            at: [9, 13],
            grid: `
              TTTTTT
              TTwwwT
              TUuTuT
              TUuTuT
              TUuTuT
              TTTTTT
            `,
          },
        },
        up: {
          rest: `
            TTT
            TtT
            TtT
            TtT
            TTT
          `,
          raise: {
            at: [18, 3],
            grid: `
              .TTT.
              TtttT
              TtttT
              TtttT
              TTTTT
            `,
          },
          strike: {
            at: [17, 0],
            grid: `
              ~.TTTT
              .~TttT
              ..TTTT
            `,
          },
          follow: ".",
          fly: {
            at: [18, 1],
            grid: `
              ..TT..
              .TttT.
              TttttT
              .TttT.
              ..TT..
            `,
          },
          read0: ".",
          read1: ".",
          read2: ".",
        },
        side: {
          rest: closed,
          ko: { at: [15, 15], grid: closed },
          raise: {
            at: [0, 12],
            grid: `
              TTTT
              TUuT
              TUuT
              TuuT
              TyyT
              TTTT
            `,
          },
          strike: {
            at: [18, 10],
            grid: `
              .TTTT
              .TUuT
              .TUuT
              OTUuT
              OTuuT
              OTuuT
              .TyyT
              .TTTT
            `,
          },
          follow: {
            at: [12, 19],
            grid: `
              ..TTTTT
              .TUuuuT
              OTUyyyT
              .TTTTT.
            `,
          },
          read0: {
            at: [18, 10],
            grid: `
              ..TT
              .TwT
              TwwT
              TUuT
              TUuT
              TTTT
            `,
          },
          read1: {
            at: [18, 8],
            grid: `
              ..T.
              .TwT
              .TwT
              .TTT
              TwwT
              TUuT
              TUuT
              TTTT
            `,
          },
          read2: {
            at: [18, 10],
            grid: `
              TT..
              TwT.
              TwwT
              TUuT
              TUuT
              TTTT
            `,
          },
        },
      },
    },
  }),
);

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

/** The book held up and a page turning; from behind only the head dips. */
const page = (d: Dir, book: string) =>
  d === "down"
    ? { armR: "read", armL: "read", hand: book, head: "read" }
    : d === "side"
      ? { armR: "read", hand: book, head: "read" }
      : { head: "read" };

const lean = (d: Dir): Vec => (d === "side" ? [1, 0] : d === "down" ? [0, 1] : [0, -1]);

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

export default rig({
  name: "student",
  ...frame,
  parts: {
    shadow: { blob: shadow },
    body: { base: withKo(skin) },
    uniform: { blazer, shirt },
    jacket: { varsity },
    face: { bright, sleepy, sharp },
    hair: { crop, spiky, bob, long, ponytail, curly },
    accessory: { glasses, goggles },
    book: { textbook },
  },
  frames: {
    idle0: {},
    idle1: { torso: [0, 1], hand: [0, 1] },
    walk0: (d) => walkArms(d, "R") as never,
    walk1: { torso: [0, -1], tail: [0, 1], hand: [0, -1] },
    walk2: (d) => walkArms(d, "L") as never,
    walk3: { torso: [0, -1], tail: [0, 1], hand: [0, -1] },
    attack0: { armR: "raise", hand: "raise" },
    attack1: (d) => ({ armR: "strike", hand: "strike", head: "shout", torso: lean(d) }),
    attack2: { armR: "follow", hand: "follow", head: "shout" },
    attack3: (d) => ({ armR: "fwd", hand: d === "side" ? [1, 0] : [0, 1] }),

    hit: (d) =>
      d === "side"
        ? { torso: [-1, 0], hand: [-1, 0], head: "hurt" }
        : {
            torso: [0, -1],
            armR: "fling",
            armL: "raise",
            [d === "down" ? "legR" : "legL"]: "lift",
            hand: "fly",
            head: "hurt",
          },
    ko: {
      ground: "ko",
      armL: "ko",
      legL: "ko",
      legR: "ko",
      torso: "ko",
      armR: "ko",
      tail: "ko",
      head: "ko",
      hand: "ko",
    },
    yawn0: (d) =>
      d === "side"
        ? { armR: "mouth", head: "yawn" }
        : { armR: "raise", armL: "raise", hand: "raise", head: "yawn" },
    yawn1: (d) =>
      d === "side"
        ? { torso: [0, -1], armR: "mouth", head: "yawn", tail: [0, 1], hand: [0, -1] }
        : {
            torso: [0, -1],
            armR: "raise",
            armL: "raise",
            hand: ["raise", 0, -1],
            head: "yawn",
          },

    page0: (d) => page(d, "read0"),
    page1: (d) => page(d, "read1"),
    page2: (d) => page(d, "read2"),
  },
  anim: {
    idle: { frames: ["idle0", "idle1"], fps: 2 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 8 },
    attack: { frames: ["attack0", "attack1", "attack2", "attack3"], fps: 12, loop: false },
    hit: { frames: ["hit"], fps: 1, loop: false },
    ko: { frames: ["ko"], fps: 1, loop: false },
    yawn: { frames: ["yawn0", "yawn1", "yawn1", "yawn1", "yawn0"], fps: 5, loop: false },
    page: { frames: ["page0", "page0", "page1", "page2", "page0"], fps: 5, loop: false },
  },
  looks: {
    blazer: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "blazer",
        face: "bright",
        hair: "crop",
        book: "textbook",
      },
      slots: { skin: "fair", hair: "black" },
    },
    summer: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "shirt",
        face: "bright",
        hair: "ponytail",
        book: "textbook",
      },
      slots: { skin: "warm", hair: "brown" },
    },
    club: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "blazer",
        jacket: "varsity",
        face: "sharp",
        hair: "bob",
        accessory: "goggles",
        book: "textbook",
      },
      slots: { skin: "fair", hair: "chestnut", jacket: "crimson" },
    },
    reader: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "blazer",
        face: "sleepy",
        hair: "long",
        accessory: "glasses",
        book: "textbook",
      },
      slots: { skin: "fair", hair: "black" },
    },
    bedhead: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "shirt",
        jacket: "varsity",
        face: "sleepy",
        hair: "spiky",
        book: "textbook",
      },
      slots: { skin: "deep", hair: "blond", jacket: "navy" },
    },
    curls: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "shirt",
        face: "sharp",
        hair: "curly",
        accessory: "glasses",
        book: "textbook",
      },
      slots: { skin: "warm", hair: "red", jacket: "forest" },
    },
  },
});
