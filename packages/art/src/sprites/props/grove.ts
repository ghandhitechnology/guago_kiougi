import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, shade, smooth, tidy } from "../../paint.ts";

/**
 * 올리브 숲길: a grove in harvest on a morning that never warms. The thousand-year olive at the
 * crossroads, the press beside it, dry-stone terraces, hives, a well, a cart that lost its load,
 * and the stone where the road warns of tortoises. Lit from the top left like everything else.
 */
const palette: Legend = {
  ".": null,
  // stone
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  v: "stone.vein",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // bark
  t: "olive.deep",
  T: "olive.dark",
  // leaves: grey-green, silver where the light turns them
  f: "board.deep",
  z: "board.dark",
  N: "board.mid",
  n: "board.light",
  // wood
  B: "wood.deep",
  b: "wood.dark",
  u: "wood.mid",
  U: "wood.light",
  e: "wood.pale",
  // terracotta
  Q: "clay.deep",
  q: "clay.dark",
  R: "clay.mid",
  r: "clay.light",
  // ripe olives, oil
  p: "plum.deep",
  P: "plum.dark",
  o: "plum.mid",
  // water in the well
  A: "sea.deep",
  a: "sea.dark",
  // wings
  y: "gold.light",
  Y: "gold.pale",
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

function finish(pic: Pic, outline: string, fill: string, keep = ""): string {
  return tidy(tidy(seal(pic, outline), fill, outline + keep), fill, outline + keep).toString();
}

function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "d");
  return pic.toString();
}

// The thousand-year olive ------------------------------------------------------------------------

const GW = 136;
const GH = 128;
const G_ORIGIN = [68, 126] as const;
/** The great tree is drawn on the plan of an ordinary old olive, scaled up. */
const GS = 1.3;
const gx = (x: number) => GW / 2 + (x - 52) * GS;
const gy = (y: number) => GH - 2 - (98 - y) * GS;

/**
 * Its trunk: three boles that twisted apart centuries ago, one split open into a hollow a child
 * could hide in, roots heaving out of the ground at the foot.
 */
function giantTrunk(): string {
  const pic = Pic.blank(GW, GH);
  const stems: [number, number, number][] = [];
  for (let y = 40; y < 98; y += 1 / GS) {
    const up = (98 - y) / 58;
    if (y >= 78) {
      stems.push([
        gx(52 - Math.sin(up * 6) * 3),
        gy(y),
        (13 - up * 6 + (y > 92 ? (y - 92) * 1.6 : 0)) * GS,
      ]);
    } else {
      const k = (78 - y) / 38;
      stems.push([gx(44 - k * 13 - Math.sin(k * 5) * 2), gy(y), (6.5 - k * 2.6) * GS]);
      stems.push([gx(60 + k * 12 + Math.sin(k * 4) * 2), gy(y), (6 - k * 2.4) * GS]);
      if (y > 58) stems.push([gx(52 + Math.sin(k * 7) * 2), gy(y), (4.5 - k * 2) * GS]);
    }
  }
  for (const [cx, fy, hw] of stems) {
    const y = Math.round(fy);
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw);
    for (let x = x0; x <= x1; x++) {
      const cur = pic.at(x, y);
      if (cur && cur !== ".") continue;
      const u = (x - x0) / Math.max(1, x1 - x0);
      pic.set(x, y, u < 0.18 ? "K" : u > 0.78 ? "S" : (x + y * 3) % 9 === 0 ? "v" : "M");
    }
  }
  // The hollow, dark inside, its lip lit.
  const hollow = lobes([{ x: gx(50), y: gy(84), rx: 5 * GS, ry: 8 * GS }]);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      if (!hollow(x, y)) continue;
      pic.set(x, y, hollow(x - 1, y) && hollow(x, y - 1) ? "t" : "K");
    }
  // Bark ridges spiralling up.
  for (let y = 40; y < GH - 2; y++)
    for (let x = 0; x < GW; x++)
      if (pic.at(x, y) === "M" && (x * 2 + y) % 7 === 0 && pic.at(x + 1, y) === "M")
        pic.set(x, y, "S").set(x + 1, y, "S");
  return tidy(tidy(seal(pic, "d"), "M", "dt"), "M", "dt").toString();
}

/** Leaf clumps of the crown, back to front: wide, low and lopsided, as old olives grow. */
const GIANT_CLUMPS: readonly (readonly [number, number, number])[] = (
  [
    [50, 12, 12],
    [28, 20, 11],
    [74, 18, 12],
    [14, 32, 9],
    [90, 32, 9],
    [40, 28, 13],
    [62, 28, 13],
    [24, 42, 10],
    [80, 42, 10],
    [50, 40, 12],
    [36, 50, 8],
    [66, 50, 8],
  ] as const
).map(([x, y, r]) => [gx(x), gy(y), r * GS] as const);

const clump = (x: number, y: number, r: number) => [
  { x, y, rx: r, ry: r * 0.72 },
  { x: x - r * 0.5, y: y - r * 0.4, rx: r * 0.55, ry: r * 0.45 },
  { x: x + r * 0.35, y: y - r * 0.55, rx: r * 0.55, ry: r * 0.42 },
  { x: x + r * 0.75, y: y + r * 0.05, rx: r * 0.42, ry: r * 0.38 },
];

/**
 * An olive crown from clumps: silver on the lit upper left, grey-green through the middle,
 * blue-green in the shade where clumps overlap, leaf slivers scattered, ripe fruit in the low
 * clumps. `stir` shifts alternate clumps a pixel for the breeze.
 */
function crown(
  w: number,
  h: number,
  clumps: readonly (readonly [number, number, number])[],
  stir: number,
  fruit: boolean,
): string {
  const pic = Pic.blank(w, h);
  const ink = { outline: "f", dark: "N", mid: "n", light: "v", glint: "K" };
  clumps.forEach(([cx, cy, r], i) => {
    const isIn = lobes(clump(cx + (i % 2 ? stir : 0), cy, r));
    const c = shade(w, h, isIn, ink, { light: 2, dark: 3 });
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 2; x++) {
        const hh = (x * 73 + y * 151 + i * 29) % 17;
        const at = c.at(x, y);
        if (at === "n" && hh < 4)
          c.put(Pic.of(hh < 2 ? "xx" : "x.\n.x").swap("x", "v"), x, y, { onto: "n", whole: true });
        else if (at === "N" && hh < 3)
          c.put(Pic.of(hh < 1 ? "xx" : ".x\nx.").swap("x", "n"), x, y, { onto: "N", whole: true });
        else if (fruit && at === "N" && hh === 5 && y > h * 0.4)
          c.put(Pic.of("o\np"), x, y, { onto: "N", whole: true });
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let ch = c.at(x, y) as string;
        if (ch === ".") continue;
        if (ch === "f" && pic.at(x, y) !== "." && (!isIn(x - 1, y) || !isIn(x, y - 1))) ch = "n";
        pic.set(x, y, ch);
      }
    }
  });
  let out = pic;
  for (let pass = 0; pass < 3; pass++) out = seal(smooth(out, "op"), "f");
  return out.toString();
}

// The press, the hives, the well -----------------------------------------------------------------

/**
 * An olive press: a round stone basin, the upright millstone that rolls in it, the wooden beam
 * through its axle, and a jar under the spout catching the first oil.
 */
function press(): string {
  const W = 50;
  const H = 36;
  const pic = Pic.blank(W, H);
  // The basin: an ellipse with a lit rim and a dark, oily floor.
  const outer = lobes([{ x: 24, y: 26, rx: 21, ry: 9 }]);
  const inner = lobes([{ x: 24, y: 25, rx: 16, ry: 6 }]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!outer(x, y)) continue;
      if (inner(x, y)) pic.set(x, y, y < 23 ? "P" : "p");
      else pic.set(x, y, y < 24 ? "k" : y < 30 ? "K" : "M");
    }
  // The millstone, upright on its edge, and the beam through it.
  const stone = lobes([{ x: 24, y: 16, rx: 6, ry: 11 }]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!stone(x, y)) continue;
      pic.set(x, y, x < 22 ? "k" : x > 26 ? "M" : "K");
    }
  for (let x = 4; x < 46; x++) pic.set(x, 14, "u").set(x, 15, "b");
  pic.put("UU\nuu", 3, 14);
  // The spout and the jar.
  pic.put(
    `
      .QQQ.
      QrrRQ
      QrRRQ
      .QQQ.
    `,
    41,
    29,
  );
  return finish(pic, "d", "K", "uUbPpQrR");
}

/** Clay hives on a stone bench, three horizontal pipes, a bee or two at the mouths. */
const HIVES = `
  ..QQQQQQQQQQQQQQQQQQQQ..
  .QrrrrRRRqQrrrrrRRRRqQ..
  QrrRRRRRRqQrRRRRRRRRqqQ.
  QppQRRRRqqQppQRRRRRqqqQ.
  QppQRRRqqqQppQRRRRqqqQQ.
  QrRRRRqqqqQrRRRRRqqqqQ..
  .QQQQQQQQQQQQQQQQQQQQ...
  dddddddddddddddddddddddd
  dwwwwwwwwwwwwwwwwwwwwwkd
  dKKKKKKKKKKKKKKKKKKKKKMd
  dd.dd..............dd.dd
  dMMd................dMMd
  dddd................dddd
`;

/** A well: a round curb of stone, a wooden frame over it, a rope and a bucket. */
const WELL = `
  ..bb..............bb...
  .bUub............bUub..
  .bUubBBBBBBBBBBBBbUub..
  .bUubUUUUUUUUUUUUbUub..
  .bUubbbbbbbbbbbbbbUub..
  .bUub.....bUb....bUub..
  .bUub.....bUb....bUub..
  .bUub.....bUb....bUub..
  .bUub....QQQQQ...bUub..
  .bUub....QrrrQ...bUub..
  .bUub....QQQQQ...bUub..
  ddddddddddddddddddddddd
  dwwwwwwwwwwwwwwwwwwwkkd
  dkkdAAAAAAAAAAAAAAAdKKd
  dkdAaaaaaaaaaaaaaaaAdKd
  dKdAaaaaaaaaaaaaaaaAdMd
  dKKdAAAAAAAAAAAAAAAdMMd
  dKKKKKKKKKKKKKKKKKKKMMd
  dMMMMMMMMMMMMMMMMMMMMSd
  ddddddddddddddddddddddd
`;

/**
 * A roadside shrine: a little marble house on a post with a pediment, a clay lamp and a sprig
 * left in front of it.
 */
const SHRINE = `
  ......dd......
  ....ddwkdd....
  ..ddwwkkKMdd..
  .dwwkkkkkKMMd.
  dddddddddddddd
  .dKddddddddMd.
  .dkdPPPPPPdMd.
  .dkdPpQQpPdMd.
  .dkdPprRpPdMd.
  .dkdddddddMMd.
  dwwwwwwwwwwkkd
  dKKKKKKKKKKKMd
  dddddddddddddd
  .....dKMd.....
  .....dKMd.....
  .....dKMd.....
  ....ddKMdd....
  ...dwkkkKMd...
  ...dddddddd...
`;

/** A boundary stone with a tortoise cut into it: the road's warning that they cross here. */
const TORTOISE_STONE = `
  ...dddddd...
  ..dwkkkkKd..
  .dwkkkkkKMd.
  .dkkSSSSkMd.
  .dkSvvvvSMd.
  .dSvSvvSvSd.
  .dkSvvvvSMd.
  .dkkSkkSkMd.
  .dkkkkkkKMd.
  .dKKKKKKKMd.
  .dMMMMMMMSd.
  ..dddddddd..
`;

// The road --------------------------------------------------------------------------------------

/**
 * The cart that lost its load: two wheels, one off the ground, the bed tipped toward the ditch,
 * the shafts in the air.
 */
const CART = `
  ...................bb.......
  ..................bUb.......
  .................bUb........
  ................bUb.........
  BBBBBBBBBBBBBBBBUbB.........
  BeeeeeeeeeeeeeeeeeeB........
  BUUUUUUUUUUUUUUUUUUUB.......
  BuuuuuuuuuuuuuuuuuuuuB......
  BbbbbbbbbbbbbbbbbbbbbbB.....
  .BBBBBBBBBBBBBBBBBBBBB......
  ...bbbb.......bbbb..........
  ..bUuubb.....bUuubb.........
  .bUbbbuUb...bUbbbuUb........
  .bubbbbub...bubbbbub........
  .bUbbbuub...bUbbbuub........
  ..buuubb.....buuubb.........
  ...bbbb.......bbbb..........
`;

/** A wicker basket of ripe olives. */
const BASKET = `
  ..bbbbbbbb..
  .bpPopPopPb.
  bPoPpoPpoPpb
  bUuUuUuUuUub
  bUuUuUuUuUub
  .buUuUuUuUb.
  ..bbbbbbbb..
`;

/** A harvest ladder: two rails, rungs, leaning on a trunk. */
function ladder(): string {
  const pic = Pic.blank(12, 32);
  for (let y = 1; y < 31; y++) {
    const lean = Math.round((31 - y) * 0.16);
    pic.set(1 + lean, y, "U").set(8 + lean, y, "U");
    if (y % 5 === 3) for (let x = 2 + lean; x < 8 + lean; x++) pic.set(x, y, "u");
  }
  return finish(pic, "B", "U");
}

/**
 * A dry-stone terrace wall, one tile: stacked, unmortared, lit on the top course, its base in
 * the shadow of the step below. Ends are rounded off so a run of tiles reads as one wall.
 */
function wall(kind: "run" | "l" | "r"): string {
  const rows = [
    "dddddddddddddddd",
    "wwkwwkkwwwkwwkkw",
    "KKMKKKMKKKKMKKKM",
    "KkKKMKKkKKMKKkKK",
    "MMSMMMSMMMSMMMSM",
    "KKKMkKKKKMKkKKKM",
    "kKKMKKKkKMKKKKKM",
    "MMMSMMMMMSMMMMMS",
    "KkKKKMKKkKKKMKkK",
    "MSMMMSMMMSMMMSMM",
    "dddddddddddddddd",
  ];
  const pic = Pic.blank(16, 16);
  rows.forEach((r, y) => {
    pic.put(r, 0, 5 + y);
  });
  const cut = (x: number) => {
    for (let y = 5; y < 16; y++) pic.set(x, y, ".");
  };
  if (kind === "l") {
    cut(0);
    cut(1);
    for (let y = 5; y < 16; y++) pic.set(2, y, "d");
  }
  if (kind === "r") {
    cut(15);
    cut(14);
    for (let y = 5; y < 16; y++) pic.set(13, y, "d");
  }
  return tidy(pic, "K", "d").toString();
}

/** Nets spread under a tree to catch the beaten olives, flat. */
function groundNet(): string {
  const W = 56;
  const H = 26;
  const pic = Pic.blank(W, H);
  const isIn = lobes([{ x: 28, y: 13, rx: 27, ry: 12 }]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isIn(x, y)) continue;
      if ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) pic.set(x, y, "K");
      else if ((x * 7 + y * 13) % 23 === 0) pic.put("o\np", x, y);
    }
  return tidy(pic, "K", "op").toString();
}

/** Oil soaked into the road where the cart's jars broke. Flat. */
const OIL = `
  ....pppp.......
  ..pppPPppp.....
  .ppPPPPPPpp..p.
  ppPPPPPPPPpppp.
  .ppPPPPPPPpp...
  ..pppPPppp.....
  .....ppp.......
`;

/**
 * A plank bridge over the stream, flat for the details layer: boards across, a beam along each
 * side with posts, the far beam lit and the near one in shade.
 */
function bridge(): string {
  const W = 96;
  const H = 72;
  const pic = Pic.blank(W, H);
  for (let y = 4; y < H - 4; y++)
    for (let x = 0; x < W; x++) {
      const board = Math.floor(x / 5);
      const seam = x % 5 === 4;
      const knot = (board * 7 + y) % 23 === 0 && x % 5 < 3 && x < W - 2;
      pic.set(x, y, seam ? "u" : knot ? "b" : board % 3 === 0 ? "e" : "U");
    }
  for (let x = 0; x < W; x++) {
    pic.set(x, 0, "B").set(x, 1, "e").set(x, 2, "U").set(x, 3, "b");
    pic
      .set(x, H - 4, "B")
      .set(x, H - 3, "u")
      .set(x, H - 2, "b")
      .set(x, H - 1, "B");
  }
  for (const px of [2, 46, 90])
    for (const py of [0, H - 5])
      pic.put(
        `
          BBBB
          BeUB
          BUuB
          BBBB
        `,
        px,
        py,
      );
  return tidy(pic, "U", "Bb").toString();
}

/** A white butterfly, two wingbeats. */
const BUTTERFLY = [
  `
    Y...Y
    YY.YY
    .yby.
  `,
  `
    .....
    YYbYY
    .y.y.
  `,
];

/** Dappled shade under a crown: a blotch with sun coming through it, for the shadow layer. */
function dapple(w: number, h: number, seed: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([
    { x: w / 2, y: h / 2, rx: w / 2 - 1, ry: h / 2 - 1 },
    { x: w * 0.3, y: h * 0.45, rx: w * 0.25, ry: h * 0.4 },
  ]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!isIn(x, y)) continue;
      const v = Math.sin(x * 0.7 + seed) * Math.cos(y * 1.1 + seed * 2) + Math.sin((x + y) * 0.35);
      if (v < 1.1) pic.set(x, y, "d");
    }
  return pic.toString();
}

export default [
  sprite({
    name: "olive-giant",
    size: [GW, GH],
    origin: G_ORIGIN,
    palette,
    shadow: oval(GW, GH, 70, 125, 34, 4),
    frames: { base: giantTrunk() },
    anim: { idle: { frames: ["base"], fps: 1 } },
  }),
  sprite({
    name: "olive-giant-crown",
    size: [GW, GH],
    origin: G_ORIGIN,
    palette,
    lone: "op",
    frames: {
      stir0: crown(GW, GH, GIANT_CLUMPS, 0, true),
      stir1: crown(GW, GH, GIANT_CLUMPS, 1, true),
    },
    anim: { stir: { frames: ["stir0", "stir1"], fps: 1.2 } },
  }),
  one("oil-press", [50, 36], press(), { shadow: oval(50, 36, 25, 33, 23, 3) }),
  one("hives", [24, 13], finish(Pic.of(HIVES), "d", "K"), {
    shadow: oval(24, 13, 12.5, 12, 12, 1.6),
  }),
  one("well", [23, 20], finish(Pic.of(WELL), "d", "K", "AaUu"), {
    shadow: oval(23, 20, 12, 19, 11.5, 1.8),
  }),
  one("shrine", [14, 19], finish(Pic.of(SHRINE), "d", "k"), {
    shadow: oval(14, 19, 7, 18, 5, 1.4),
  }),
  one("tortoise-stone", [12, 12], finish(Pic.of(TORTOISE_STONE), "d", "k", "v"), {
    shadow: oval(12, 12, 6.5, 11, 6, 1.4),
  }),
  one("cart", [28, 17], finish(Pic.of(CART), "B", "U"), {
    shadow: oval(28, 17, 13, 15, 12, 2),
  }),
  one("basket", [12, 7], finish(Pic.of(BASKET), "b", "U", "pPo"), { lone: "opP" }),
  one("ladder", [12, 32], ladder()),
  sprite({
    name: "wall-dry",
    size: [16, 16],
    palette,
    outline: false,
    frames: { run: wall("run"), l: wall("l"), r: wall("r") },
    anim: { idle: { frames: ["run"], fps: 1 } },
  }),
  sprite({
    name: "ground-net",
    size: [56, 26],
    origin: [28, 13],
    palette,
    lone: "op",
    outline: false,
    frames: { still: groundNet() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "oil-stain",
    size: [15, 7],
    palette,
    outline: false,
    frames: { still: OIL },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "bridge",
    size: [96, 72],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { still: bridge() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "butterfly",
    size: [5, 3],
    origin: [2, 1],
    palette,
    lone: "Yyb",
    outline: false,
    frames: { flap0: BUTTERFLY[0] as string, flap1: BUTTERFLY[1] as string },
    anim: { flap: { frames: ["flap0", "flap1"], fps: 8, jump: 1 } },
  }),
  sprite({
    name: "dapple",
    size: [72, 30],
    origin: [36, 15],
    palette,
    outline: false,
    frames: { a: dapple(72, 30, 1), b: dapple(72, 30, 4) },
    anim: { idle: { frames: ["a"], fps: 1 } },
  }),
];
