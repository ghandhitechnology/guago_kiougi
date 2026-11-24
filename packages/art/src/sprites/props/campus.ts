import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, shade, texture, tidy } from "../../paint.ts";

/**
 * Campus props. Lit from the top left, outlined in the darkest step of their own ramps, anchored
 * at their feet. Lights (lamp head, lit windows, the vending machine's panel) are drawn in
 * `gold.light`, `gold.pale`, `sea.light` and `sea.pale`, which the night theme leaves bright.
 */
const ink: Legend = {
  ".": null,
  // metal and dark
  J: "ink.deep",
  j: "ink.dark",
  I: "ink.mid",
  i: "ink.light",
  // concrete
  w: "stone.bright",
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  S: "stone.dark",
  d: "stone.deep",
  // wood
  W: "wood.pale",
  u: "wood.light",
  U: "wood.mid",
  b: "wood.dark",
  B: "wood.deep",
  // light
  Y: "gold.pale",
  y: "gold.light",
  o: "gold.mid",
  O: "gold.dark",
  // screen glow
  c: "sea.pale",
  C: "sea.light",
  e: "sea.mid",
  E: "sea.dark",
  // red body, awning
  r: "red.light",
  R: "red.mid",
  q: "red.dark",
  Q: "red.deep",
  // navy glass
  n: "navy.light",
  N: "navy.mid",
  v: "navy.dark",
  // cork
  t: "clay.light",
  T: "clay.mid",
  // paper accents, pins
  p: "rose.pale",
  "^": "ink.deep",
  "!": "red.light",
  // greens
  g: "grass.light",
  G: "grass.mid",
  h: "grass.pale",
  D: "grass.dark",
  F: "grass.deep",
};

/** A sprite with one still frame. */
const still = (
  name: string,
  size: [number, number],
  grid: string,
  extra: Partial<Parameters<typeof sprite>[0]> = {},
) =>
  sprite({
    name,
    size,
    palette: ink,
    frames: { still: grid },
    anim: { idle: { frames: ["still"], fps: 1 } },
    ...extra,
  });

/** A soft oval ground shadow the size of a sprite, as a shadow grid. */
function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "J");
  return pic.toString();
}

// Bench ---------------------------------------------------------------------------------------

const bench = still(
  "bench",
  [26, 18],
  `
    ..JJ..................JJ..
    .JIIJBBBBBBBBBBBBBBBBJIIJ.
    .JIjBWWWWWWWWWWWWWWWWBIjJ.
    .JIjBuuuuuuuuuuuuuuuuBIjJ.
    .JIjBBBBBBBBBBBBBBBBBBIjJ.
    .JIjBWWWWWWWWWWWWWWWWBIjJ.
    .JIjBuuuuuuuuuuuuuuuuBIjJ.
    .JIjBbbbbbbbbbbbbbbbbBIjJ.
    JBBBBBBBBBBBBBBBBBBBBBBBBJ
    JBWWWWWWWWWWWWWWWWWWWWWWBJ
    JBuuuuuuuuuuuuuuuuuuuuuuBJ
    JBWWWWWWWWWWWWWWWWWWWWWWBJ
    JBuuuuuuuuuuuuuuuuuuuuuuBJ
    JBUUUUUUUUUUUUUUUUUUUUUUBJ
    JBBBBBBBBBBBBBBBBBBBBBBBBJ
    .JIjJ................JIjJ.
    .JIjJ................JIjJ.
    .JJJJ................JJJJ.
  `,
  { shadow: oval(26, 18, 14, 16.5, 13, 2.6) },
);

// Street lamp ---------------------------------------------------------------------------------

const lampPost = (rows: number): string =>
  Array.from({ length: rows }, () => "....JiIJ....").join("\n");

const lamp = still(
  "lamp",
  [12, 49],
  `
    ...JJJJJJ...
    ..JiiIIIjJ..
    .JiIIIIIIjJ.
    .JJJJJJJJJJ.
    ..JYYYYYYJ..
    ..JYYYYYYJ..
    ..JyyYYyyJ..
    ..JooyyooJ..
    ...JJJJJJ...
    ....JIIJ....
    ${lampPost(36)}
    ...JiIIjJ...
    ..JiIIIIjJ..
    ..JJJJJJJJ..
  `,
  { shadow: oval(12, 49, 6.5, 47.5, 6, 2) },
);

// 자판기 ------------------------------------------------------------------------------------

/** Display shelves: cans in a row on a lit back panel. */
const shelf = (cans: string): string => `.QRJ${cans}JqQ.`;

const vendingFrame = (sign: string, glow: string): string => `
  ..QQQQQQQQQQQQQQQQQQ..
  .QrrrrrrrrrrrrrrrrrrQ.
  .QrRRRRRRRRRRRRRRRRqQ.
  .QRJJJJJJJJJJJJJJJJqQ.
  .QRJ${sign}JqQ.
  .QRJ${sign}JqQ.
  .QRJJJJJJJJJJJJJJJJqQ.
  .QRJ${glow}JqQ.
  ${shelf("YRRYooYggYNNYY")}
  ${shelf("YRRYooYggYNNYY")}
  ${shelf("JJJJJJJJJJJJJJ")}
  .QRJ${glow}JqQ.
  ${shelf("YggYRRYNNYooYY")}
  ${shelf("YggYRRYNNYooYY")}
  ${shelf("JJJJJJJJJJJJJJ")}
  .QRJ${glow}JqQ.
  ${shelf("YNNYwwYRRYggYY")}
  ${shelf("YNNYwwYRRYggYY")}
  .QRJJJJJJJJJJJJJJJJqQ.
  .QRRRRRRRRRRRRRRRRRqQ.
  .QRyyRyyRyyRyyRyyRRqQ.
  .QRRRRRRRRRRRRRRRRRqQ.
  .QRRRRRRRRRRRRJJRRRqQ.
  .QRRRRRRRRRRRRjjRRRqQ.
  .QRRRRRRRRRRRRRRRRRqQ.
  .QRqqqqqqqqqqqqqqRRqQ.
  .QRqJJJJJJJJJJJJqRRqQ.
  .QRqJjjjjjjjjjjjqRRqQ.
  .QRrrrrrrrrrrrrrrRRqQ.
  .QqqqqqqqqqqqqqqqqqqQ.
  ..QQQQQQQQQQQQQQQQQQ..
`;

const vending = sprite({
  name: "vending",
  size: [22, 31],
  palette: ink,
  lone: "",
  shadow: oval(22, 31, 11.5, 30, 11, 2.2),
  frames: {
    glow0: vendingFrame("ccCCccCCccCCcc", "YYYYYYYYYYYYYY"),
    glow1: vendingFrame("CCccCCccCCccCC", "YYYYYYYYYYYYYY"),
    glow2: vendingFrame("cccccccccccccc", "yyYYYYYYYYYYyy"),
  },
  anim: { glow: { frames: ["glow0", "glow1", "glow0", "glow1", "glow2"], fps: 2 } },
});

// 매점 게시판 ---------------------------------------------------------------------------------

/**
 * The school finally got a 매점, and it is a corkboard: a striped shop awning bolted on top,
 * a price list, sticky notes, and one notice torn half off and hanging by its last pin.
 */
function corkboardPic(): string {
  const pic = Pic.of(`
    ..QQQQQQQQQQQQQQQQQQQQQQQQQQ..
    .QrrwwrrwwrrwwrrwwrrwwrrwwrrQ.
    .QRRwwRRwwRRwwRRwwRRwwRRwwRRQ.
    QRRkkRRkkRRkkRRkkRRkkRRkkRRRQQ
    QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ
    .BBBBBBBBBBBBBBBBBBBBBBBBBBBB.
    .BWWWWWWWWWWWWWWWWWWWWWWWWWUB.
    .BWBBBBBBBBBBBBBBBBBBBBBBBBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBttttttttttttttttttttttBUB.
    .BWBBBBBBBBBBBBBBBBBBBBBBBBUB.
    .BUUUUUUUUUUUUUUUUUUUUUUUUUUB.
    .BBBBBBBBBBBBBBBBBBBBBBBBBBBB.
    ...BuUB..............BuUB.....
    ...BuUB..............BuUB.....
    ...BuUB..............BuUB.....
    ...BuUB..............BuUB.....
    ...BuUB..............BuUB.....
    ...BuUB..............BuUB.....
    ...BuUB..............BuUB.....
    ...BuUB..............BuUB.....
    ..BBuUBB............BBuUBB....
    ..BBBBBB............BBBBBB....
  `);
  // Cork grain.
  texture(
    pic,
    [
      [
        [1, 1, Pic.of("T.\n.T")],
        [7, 4, Pic.of("TT")],
        [12, 2, Pic.of(".T\nT.")],
        [3, 9, Pic.of("TT")],
        [10, 11, Pic.of("T.\n.T")],
      ],
      [
        [2, 3, Pic.of("TT")],
        [9, 1, Pic.of("T.\n.T")],
        [5, 8, Pic.of(".T\nT.")],
        [12, 10, Pic.of("TT")],
      ],
    ],
    "t",
    (cx, cy) => cx + cy,
  );
  const cork = pic;
  // Price list, sticky note, a flyer, and the torn notice.
  pic.put(
    `
      ^wwwwww^
      wKKKKKKw
      wwwwwwww
      wKKKwKKw
      wwwwwwww
      wKKwKKKw
      wwwwwwww
      wKKKKwwM
      wwwwwwwM
      .MMMMMMM
    `,
    5,
    9,
  );
  pic.put(
    `
      YYY^
      YooY
      YYYY
      YooO
      .OOO
    `,
    15,
    9,
  );
  pic.put(
    `
      pp^p
      pKKp
      pppp
      pKKp
    `,
    15,
    16,
  );
  pic.put(
    `
      !^...
      wwJ..
      wKKJ.
      wwwwJ
      .wKKw
      ..ww.
      ..w..
    `,
    21,
    9,
  );
  return tidy(cork, "t", "BWUuQRrwkJ^!YoOpKM").toString();
}

const corkboard = still("corkboard", [30, 34], corkboardPic(), {
  lone: "^!",
  shadow: oval(30, 34, 15, 33, 13, 1.8),
});

// Shrub and planter ---------------------------------------------------------------------------

function shrubPic(w: number, h: number, lobesList: Parameters<typeof lobes>[0]): string {
  const pic = shade(
    w,
    h,
    lobes(lobesList),
    { outline: "F", dark: "D", mid: "G", light: "g", glint: "h" },
    {
      light: 2,
      dark: 2,
    },
  );
  texture(
    pic,
    [
      [
        [3, 3, Pic.of("g.\n.g")],
        [9, 5, Pic.of("D.\n.D")],
        [6, 1, Pic.of("hh")],
      ],
      [
        [2, 5, Pic.of("D.\n.D")],
        [8, 2, Pic.of("gg")],
      ],
    ],
    "G",
  );
  return tidy(pic, "G", "F").toString();
}

const shrub = still(
  "shrub",
  [22, 16],
  shrubPic(22, 16, [
    { x: 11, y: 9, rx: 10, ry: 6 },
    { x: 6, y: 7, rx: 5, ry: 4.5 },
    { x: 13, y: 5.5, rx: 6, ry: 4.5 },
    { x: 17, y: 8, rx: 4.5, ry: 4 },
  ]),
  { shadow: oval(22, 16, 12, 14.5, 10, 2) },
);

const planter = still(
  "planter",
  [48, 14],
  `
    dddddddddddddddddddddddddddddddddddddddddddddddd
    dwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwkd
    dwkBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBkKd
    dwkBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkKd
    dwkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkKd
    dddddddddddddddddddddddddddddddddddddddddddddddd
    dKKKKKKKKKKKKKKKdKKKKKKKKKKKKKKKdKKKKKKKKKKKKKMd
    dKKKKKKKKKKKKKKKdKKKKKKKKKKKKKKKdKKKKKKKKKKKKKMd
    dKKKKKKKKKKKKKKKdKKKKKKKKKKKKKKKdKKKKKKKKKKKKKMd
    dMMMMMMMMMMMMMMMdMMMMMMMMMMMMMMMdMMMMMMMMMMMMMMd
    dMMMMMMMMMMMMMMMdMMMMMMMMMMMMMMMdMMMMMMMMMMMMMMd
    dSSSSSSSSSSSSSSSdSSSSSSSSSSSSSSSdSSSSSSSSSSSSSSd
    dddddddddddddddddddddddddddddddddddddddddddddddd
    ................................................
  `,
  { shadow: oval(48, 14, 25, 13, 24, 1.6) },
);

// Fence and sea wall --------------------------------------------------------------------------

/** Chain-link: a lattice of diamonds between round posts. Pieces join edge to edge. */
const fence = sprite({
  name: "fence",
  size: [16, 26],
  palette: ink,
  outline: false,
  frames: {
    run: `
      JJJJJJJJJJJJJJJJ
      iiiiiiiiiiiiiiii
      IIIIIIIIIIIIIIII
      JJJJJJJJJJJJJJJJ
      M...M...M...M...
      .M.M.M.M.M.M.M.M
      ..M...M...M...M.
      .M.M.M.M.M.M.M.M
      M...M...M...M...
      .M.M.M.M.M.M.M.M
      ..M...M...M...M.
      .M.M.M.M.M.M.M.M
      M...M...M...M...
      .M.M.M.M.M.M.M.M
      ..M...M...M...M.
      .M.M.M.M.M.M.M.M
      M...M...M...M...
      .M.M.M.M.M.M.M.M
      ..M...M...M...M.
      .M.M.M.M.M.M.M.M
      M...M...M...M...
      .M.M.M.M.M.M.M.M
      ..M...M...M...M.
      .M.M.M.M.M.M.M.M
      JJJJJJJJJJJJJJJJ
      ................
    `,
    post: `
      JJJJJJJJJJJJJJJJ
      iiiiiiiJJiiiiiii
      IIIIIIJiIJIIIIII
      JJJJJJJiIJJJJJJJ
      M...M.JiIJ..M...
      .M.M.MJiIJ.M.M.M
      ..M..MJiIJM...M.
      .M.M.MJiIJ.M.M.M
      M...M.JiIJ..M...
      .M.M.MJiIJ.M.M.M
      ..M..MJiIJM...M.
      .M.M.MJiIJ.M.M.M
      M...M.JiIJ..M...
      .M.M.MJiIJ.M.M.M
      ..M..MJiIJM...M.
      .M.M.MJiIJ.M.M.M
      M...M.JiIJ..M...
      .M.M.MJiIJ.M.M.M
      ..M..MJiIJM...M.
      .M.M.MJiIJ.M.M.M
      M...M.JiIJ..M...
      .M.M.MJiIJ.M.M.M
      ..M..MJiIJM...M.
      .M.M.MJiIJ.M.M.M
      JJJJJJJiIJJJJJJJ
      ......JJJJ......
    `,
  },
  anim: { idle: { frames: ["run"], fps: 1 } },
});

/** The island's sea wall: a concrete parapet, its top in light, its face streaked by spray. */
const seawall = sprite({
  name: "seawall",
  size: [16, 14],
  palette: ink,
  outline: false,
  frames: {
    run: `
      dddddddddddddddd
      wwwwwwwwwwwwwwww
      kkkkkkkkkkkkkkkk
      kkkkkkkkkkkkkkkk
      MMMMMMMMMMMMMMMM
      KKKKKKKKKKKKKKKd
      KKKKKKKKKKKKKKKd
      KKKMKKKKKKKKKKKd
      KKKMKKKKKKKKKKKd
      KKKMKKKKKMKKKKKd
      KKKKKKKKKMKKKKKd
      MMMMMMMMMMMMMMMd
      SSSSSSSSSSSSSSSd
      dddddddddddddddd
    `,
  },
  anim: { idle: { frames: ["run"], fps: 1 } },
});

// The club car ------------------------------------------------------------------------------

/**
 * 실험동's abandoned electric car: a club-built single-seater, two years old, retired with a
 * broken suspension. A flat front tyre, dust on the shell, and a note taped to the nose.
 */
const ev = still(
  "ev",
  [36, 19],
  `
    ...............dddd.................
    ..............dKMMd.................
    ..............dKMMd.................
    ........dddddddKMMddddddd...........
    ......ddwwwwwwwdMMMdkkkkKdd.........
    ....ddwwwwwwwwwwwwwwwkkkkKKdd.......
    ..ddwwwwwwwwwwwwwwwwwwkkkKKKKdd.....
    .dwwwppwwwEEEEEEEEwwwwwkkKKKKKMd....
    dwwwppppwEeeeeeeeEwwwwwwkKKKKMMMd...
    dkwwpppwwwEEEEEEEEwwwwwwwKKKKMMMMd..
    dkkkkkkkkkkkkkkkkkkkkkkkkKKKKMMMMMd.
    .dKKKKKKKKKKKKKKKKKKKKKKKKKKMMMMMMd.
    ..dKKKdMMMMMMMMMMMMMMMMMMMMKKKKMMd..
    ..dJJJJddddddddddddddddddJJJJJddd...
    .JjjjjjJ...............JjjjjjjJ.....
    JjIIjjjjJ.............JjIIIjjjjJ....
    JjIjjjjjJ.............JjIjjjjjjJ....
    JjjjjjjjJ..............JjjjjjjJ.....
    .JJJJJJJ................JJJJJJJ.....
  `,
  { shadow: oval(36, 19, 18, 17.5, 17, 2.2) },
);

/** Ground shadows for monsters and small things that bring none of their own. */
const blob = sprite({
  name: "blob",
  size: [16, 5],
  palette: ink,
  outline: false,
  frames: {
    s: `
      ................
      ....JJJJJJJJ....
      ...JJJJJJJJJJ...
      ....JJJJJJJJ....
      ................
    `,
    m: `
      ................
      ..JJJJJJJJJJJJ..
      .JJJJJJJJJJJJJJ.
      ..JJJJJJJJJJJJ..
      ................
    `,
  },
  anim: { idle: { frames: ["s"], fps: 1 } },
});

export default [bench, lamp, vending, corkboard, shrub, planter, fence, seawall, ev, blob];
