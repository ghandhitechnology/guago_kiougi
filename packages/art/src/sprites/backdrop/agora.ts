import { type Legend, sprite } from "../../format.ts";
import { Pic, smooth, tidy } from "../../paint.ts";

/**
 * What lies past the 운동장 at 23:40, when the first rift opens. On the campus side the night:
 * the dorm's lit windows behind a row of pines. In the middle the sky itself is torn like a
 * page, and through the hole the era's afternoon pours in: gold haze, a low sun, olive hills
 * with a temple on the brow, and a bright sea below them. The tear's lip is paper, lit by the
 * day it lets through.
 */
const palette: Legend = {
  ".": null,
  // night
  a: "ink.deep",
  b: "ink.dark",
  B: "navy.dark",
  f: "board.deep",
  F: "board.dark",
  // greek sky
  Y: "gold.pale",
  y: "gold.light",
  t: "clay.pale",
  T: "clay.light",
  w: "stone.bright",
  // hills and temple
  o: "olive.mid",
  O: "olive.dark",
  l: "olive.light",
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  // sea
  s: "sea.mid",
  S: "sea.dark",
  q: "sea.light",
  Q: "sea.pale",
  // paper
  P: "stone.bright",
  p: "stone.pale",
  e: "stone.light",
  n: "navy.light",
  r: "red.light",
  // working cells
  x: null,
  // lit windows and specks are dots on purpose
  "'": "gold.light",
  "*": "gold.pale",
  "+": "clay.pale",
};
const lone = "'*+";

// The torn sky ------------------------------------------------------------------------------

const TEAR_W = 200;
const TEAR_H = 96;

/** A triangle wave: the zigzag of a tear. */
const tri = (v: number, period: number, amp: number): number =>
  amp * (Math.abs(((v / period) % 1) * 2 - 1) * 2 - 1);

/** The hole's left and right edge per row: ripped from a point at the top, open at the bottom. */
function holeSpan(y: number): [number, number] {
  const k = Math.min(1, Math.max(0, (y - 2) / 66));
  const half = 4 + 84 * k ** 1.25;
  const lean = (1 - k) * 10;
  const tearL = tri(y, 8, 5) + tri(y + 3, 3, 1.5);
  const tearR = tri(y + 5, 10, 5) + tri(y, 4, 1.5);
  return [100 + lean - half + tearL, 100 + lean + half + tearR];
}

function inHole(x: number, y: number): boolean {
  const [l, r] = holeSpan(y);
  const top = 2 + Math.abs(x - 112) * 0.9 + tri(x, 6, 2);
  return y >= top && x >= l && x <= r;
}

/** The era's view: banded gold sky, a low sun, hills of olives with a temple, the sea below. */
function eraView(x: number, y: number): string {
  if (y >= 66) {
    // Sea, darker toward the far shore, glints in rows.
    const glint = (x * 3 + y * 5) % 23 < 2 && y % 3 === 0;
    if (y < 69) return "S";
    return glint ? (y < 80 ? "Q" : "q") : "s";
  }
  const hill =
    52 - 16 * Math.exp(-(((x - 106) / 34) ** 2)) - 6 * Math.exp(-(((x - 170) / 26) ** 2));
  if (y >= hill) return y < hill + 1.5 ? "l" : (x * 7 + y * 3) % 17 === 0 ? "O" : "o";
  const sun = Math.hypot(x - 134, (y - 24) * 1.1);
  if (sun < 6) return "w";
  if (sun < 8.5) return (x + y) % 2 ? "Y" : "y";
  if (y < 14) return "T";
  if (y < 18) return (x + y) % 2 ? "T" : "t";
  if (y < 32) return "t";
  if (y < 36) return (x + y) % 2 ? "t" : "Y";
  return "Y";
}

function skyTear(): string {
  const pic = Pic.blank(TEAR_W, TEAR_H);
  for (let y = 0; y < TEAR_H; y++)
    for (let x = 0; x < TEAR_W; x++) if (inHole(x, y)) pic.set(x, y, eraView(x, y));
  // The temple on the brow of the first hill.
  pic.put(
    `
      ....kkkkkkkkkkkk....
      ..wwwwwwwwwwwwwwww..
      ..KKKKKKKKKKKKKKKK..
      ...wK.wK.wK.wK.wK...
      ...wK.wK.wK.wK.wK...
      ...wK.wK.wK.wK.wK...
      ..kkkkkkkkkkkkkkkk..
      .KKKKKKKKKKKKKKKKKK.
    `,
    96,
    31,
  );
  // The paper lip around the hole: lit torn edge, pale page, crease, fibres.
  const lip = Pic.blank(TEAR_W, TEAR_H);
  for (let y = 0; y < TEAR_H; y++) {
    for (let x = 0; x < TEAR_W; x++) {
      if (inHole(x, y)) continue;
      let d = 9;
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++)
          if (inHole(x + dx, y + dy)) d = Math.min(d, Math.hypot(dx, dy));
      const w = 3 + 2.5 * (0.5 + 0.5 * Math.sin(y * 0.21 + x * 0.05));
      const fibre = (x * 5 + y * 3) % 7 === 0;
      if (d <= 1.01) lip.set(x, y, "e");
      else if (d <= w - 1) lip.set(x, y, "P");
      else if (d <= w || (fibre && d <= w + 1.5)) lip.set(x, y, "p");
    }
  }
  pic.put(smooth(lip), 0, 0);
  return smooth(pic, "'").toString();
}

// The campus side ---------------------------------------------------------------------------

/** 새벽관 at night beyond the field: a long dark block with its corridors lit, pines in front. */
function nightDorm(): string {
  const W = 240;
  const H = 36;
  const pic = Pic.blank(W, H);
  for (let x = 6; x < 200; x++) {
    const top = x < 90 ? 8 : x < 100 ? 8 - (x - 90) * 0.6 : x < 110 ? 2 + (x - 100) * 0.6 : 8;
    for (let y = Math.round(top); y < H; y++) pic.set(x, y, y === Math.round(top) ? "B" : "b");
  }
  // Corridor lights in rows, some rooms awake.
  for (let row = 0; row < 3; row++) {
    const y = 12 + row * 7;
    for (let x = 10; x < 196; x += 6) {
      const on = (x * 7 + row * 13) % 5 < (row === 1 ? 3 : 1);
      if (on) pic.set(x, y, "'").set(x + 1, y, "'");
    }
  }
  // Pines in front, cones with ragged sides.
  for (const [cx, hgt] of [
    [6, 24],
    [28, 18],
    [50, 28],
    [76, 20],
    [104, 26],
    [128, 17],
    [150, 29],
    [176, 22],
    [204, 27],
    [228, 19],
  ] as const) {
    for (let y = H - hgt; y < H; y++) {
      const half = Math.max(1, Math.round(((y - (H - hgt)) / hgt) * 7 + Math.sin(y * 1.7) * 1.3));
      for (let x = cx - half; x <= cx + half; x++)
        if (x >= 0 && x < W) pic.set(x, y, x === cx - half ? "F" : "f");
    }
  }
  return tidy(pic, "f", "'").toString();
}

/** Marble balustrade along the far edge of the agora's terrace, where the ground drops to the sea. */
const TERRACE = `
  KKKKKKKKKKKKKKKK
  wwwwwwwwwwwwwwww
  kkkkkkkkkkkkkkkk
  MMMMMMMMMMMMMMMM
  .wK..wK..wK..wK.
  .wK..wK..wK..wK.
  .wK..wK..wK..wK.
  .wK..wK..wK..wK.
  kkkkkkkkkkkkkkkk
  KKKKKKKKKKKKKKKK
  MMMMMMMMMMMMMMMM
`;

// Things being pulled in ------------------------------------------------------------------------

/**
 * A page torn out of the 0조 notebook: ruled in blue, a red margin, the ragged edge where it
 * left the spiral. Frames turn it over as it flies: face, foreshortened, edge on, back.
 */
function page(width: number, face: boolean): string {
  const W = 26;
  const H = 16;
  const pic = Pic.blank(W, H);
  const x0 = Math.round((W - width) / 2);
  for (let y = 1; y < H - 1; y++) {
    for (let x = x0; x < x0 + width; x++) {
      const left = x === x0;
      // The torn spiral edge: notches every third row.
      if (left && y % 3 === 0) continue;
      let ch = "P";
      if (y === H - 2) ch = "e";
      else if (x >= x0 + width - 1) ch = "p";
      else if (face && width > 6 && x === x0 + 2) ch = "r";
      else if (face && width > 6 && y % 2 === 0 && x > x0 + 2 && x < x0 + width - 2) ch = "n";
      pic.set(x, y, ch);
    }
  }
  return pic.toString();
}

const PAGES = [page(24, true), page(15, true), page(3, false), page(18, false)];

/** A scrap of the field coming loose at the tear: sand on top, pale page underneath. */
const SCRAPS = [
  `
    ..kkk...
    .kKKkk..
    kKKKKkp.
    .pppppp.
    ..pPP...
  `,
  `
    ...kk...
    ..kKKk..
    .pkKKkp.
    .ppPPpp.
    ........
  `,
  `
    ........
    .pppp...
    pPPPPp..
    .kKKkk..
    ..kkk...
  `,
  `
    ...pp...
    ..pPPp..
    .kkKKkk.
    ..kKKk..
    ........
  `,
];

/** Warm specks of the era's light, rising toward the tear. */
function embers(frame: number): string {
  const pic = Pic.blank(24, 32);
  for (const [x0, y0, ch] of [
    [3, 30, "*"],
    [12, 26, "+"],
    [20, 31, "*"],
    [8, 20, "+"],
    [16, 14, "*"],
  ] as const) {
    const t = (frame * 2 + x0) % 30;
    const x = Math.round(x0 + Math.sin((t + x0) * 0.5) * 2);
    const y = y0 - t;
    if (y >= 0) pic.set(Math.max(0, Math.min(23, x)), y, ch);
  }
  return pic.toString();
}

const four = (grids: readonly string[], prefix: string) =>
  Object.fromEntries(grids.map((g, i) => [`${prefix}${i}`, g]));

export default [
  sprite({
    name: "sky-tear",
    size: [TEAR_W, TEAR_H],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { still: skyTear() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "night-dorm",
    size: [240, 36],
    origin: [0, 35],
    palette,
    lone,
    outline: false,
    frames: { still: nightDorm() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "terrace",
    size: [16, 11],
    origin: [0, 10],
    palette,
    outline: false,
    frames: { run: TERRACE },
    anim: { idle: { frames: ["run"], fps: 1 } },
  }),
  sprite({
    name: "page-big",
    size: [26, 16],
    palette,
    outline: false,
    frames: four(PAGES, "turn"),
    anim: { turn: { frames: ["turn0", "turn1", "turn2", "turn3"], fps: 5, jump: 1 } },
  }),
  sprite({
    name: "scrap",
    size: [8, 5],
    palette,
    outline: false,
    frames: four(SCRAPS, "tumble"),
    anim: { tumble: { frames: ["tumble0", "tumble1", "tumble2", "tumble3"], fps: 6, jump: 1 } },
  }),
  sprite({
    name: "embers",
    size: [24, 32],
    origin: [0, 31],
    palette,
    lone,
    outline: false,
    frames: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`rise${i}`, embers(i)])),
    anim: {
      rise: { frames: Array.from({ length: 15 }, (_, i) => `rise${i}`), fps: 8, jump: 1 },
    },
  }),
];
