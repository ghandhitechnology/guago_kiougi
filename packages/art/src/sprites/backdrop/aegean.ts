import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, smooth, tidy } from "../../paint.ts";

/**
 * What lies past the Greek coast at 14:40: a high clear sky going pale and minty toward a hazy
 * horizon, islands floating in the haze, the open Aegean darkening to the line and lightening
 * to the shore, where it meets the sea tiles in the same colour. In the sky over the headland a
 * tear in the day, and through it the 운동장 at night with the dorm still lit. Drawn in their
 * own colours and placed raw, outside any theme.
 */
const palette: Legend = {
  ".": null,
  // sky, top to horizon
  B: "navy.light",
  b: "navy.pale",
  m: "sea.pale",
  W: "stone.bright",
  // cloud
  c: "stone.bright",
  C: "stone.pale",
  // islands
  i: "navy.light",
  I: "navy.pale",
  t: "stone.pale",
  // sea, far to near
  N: "navy.mid",
  D: "sea.dark",
  s: "sea.mid",
  S: "sea.light",
  // night through the tear
  a: "ink.deep",
  A: "ink.dark",
  n: "navy.dark",
  // paper lip
  P: "stone.bright",
  p: "stone.pale",
  e: "stone.light",
  v: "stone.vein",
  // ship
  h: "wood.dark",
  H: "wood.deep",
  // dots: glints, stars, lit windows
  "*": "stone.bright",
  "+": "gold.pale",
  "'": "gold.light",
  ",": "sea.pale",
};
const lone = "*+',";

function h(x: number, y: number, s: number): number {
  let v = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
}

// Sky ------------------------------------------------------------------------------------------

const SKY_W = 240;
const SKY_H = 52;
const BANDS: readonly (readonly [number, string])[] = [
  [0, "B"],
  [12, "b"],
  [32, "m"],
  [44, "W"],
];

function bandAt(y: number): string {
  let ch = "B";
  for (const [from, c] of BANDS) if (y >= from) ch = c;
  return ch;
}

/** Fair-weather clouds: flat bottoms, bright tops, a pale grey belly. */
const CLOUDS = [
  [
    { x: 40, y: 22, rx: 16, ry: 3 },
    { x: 34, y: 19.5, rx: 7, ry: 3.2 },
    { x: 46, y: 19, rx: 6, ry: 3 },
  ],
  [
    { x: 150, y: 14, rx: 20, ry: 2.6 },
    { x: 144, y: 11.5, rx: 8, ry: 3 },
    { x: 158, y: 12, rx: 6, ry: 2.6 },
  ],
  [
    { x: 206, y: 30, rx: 12, ry: 2.2 },
    { x: 210, y: 28, rx: 5, ry: 2.2 },
  ],
  [{ x: 96, y: 36, rx: 14, ry: 1.6 }],
] as const;

function sky(): string {
  const pic = Pic.blank(SKY_W, SKY_H);
  for (let y = 0; y < SKY_H; y++) {
    for (let x = 0; x < SKY_W; x++) {
      let ch = bandAt(y);
      for (const [from] of BANDS)
        if (from > 0 && (y === from - 1 || y === from - 2) && (x + y) % 2 === 0) ch = bandAt(from);
      pic.set(x, y, ch);
    }
  }
  for (const cloud of CLOUDS) {
    const isIn = lobes(cloud);
    const bottom = Math.max(...cloud.map((l) => l.y)) + 0.5;
    for (let y = 0; y < SKY_H; y++) {
      for (let x = 0; x < SKY_W; x++) {
        if (!isIn(x, y) || y > bottom) continue;
        pic.set(x, y, y >= bottom - 1 ? "C" : "c");
      }
    }
  }
  return smooth(pic).toString();
}

// Islands and the sea ---------------------------------------------------------------------------

const ISLE_W = 240;
const ISLE_H = 14;

/** Islands in the haze: long low humps, one with a pale temple on its brow. */
function isles(): string {
  const pic = Pic.blank(ISLE_W, ISLE_H);
  const humps: readonly (readonly [number, number, number])[] = [
    [30, 22, 7],
    [52, 12, 4],
    [128, 30, 11],
    [156, 14, 6],
    [214, 18, 5],
  ];
  for (let x = 0; x < ISLE_W; x++) {
    let top = ISLE_H;
    for (const [cx, half, height] of humps) {
      const u = (x - cx) / half;
      if (Math.abs(u) < 1) top = Math.min(top, ISLE_H - Math.round(height * (1 - u * u) ** 0.7));
    }
    for (let y = top; y < ISLE_H; y++) pic.set(x, y, y === top ? "I" : "i");
  }
  pic.put(
    `
      .tttt.
      tttttt
      t.t.tt
    `,
    125,
    ISLE_H - 14,
  );
  return tidy(pic, "i", "t").toString();
}

const SEA_W = 240;
const SEA_H = 30;

/**
 * The open sea from the horizon down: a dark line, deep blue, then the sea's own colour by the
 * bottom rows, so it runs on into the sea tiles. Glints drift along each frame.
 */
function sea(frame: number): string {
  const pic = Pic.blank(SEA_W, SEA_H);
  for (let y = 0; y < SEA_H; y++) {
    for (let x = 0; x < SEA_W; x++) {
      let ch = y < 2 ? "N" : y < 9 ? "D" : "s";
      if ((y === 8 || y === 9) && (x + y) % 2 === 0) ch = y === 8 ? "s" : "D";
      if ((y === 1 || y === 2) && (x + y) % 2 === 0) ch = y === 1 ? "D" : "N";
      pic.set(x, y, ch);
    }
  }
  // Ripples: short lit dashes, longer and sparser nearer.
  for (let y = 3; y < SEA_H - 1; y += 2) {
    const len = y < 9 ? 2 : 3;
    for (let x = 0; x < SEA_W; x += 1) {
      if (h(Math.floor((x + frame * (y < 9 ? 1 : 2)) / len), y, 5) > (y < 9 ? 0.06 : 0.04))
        continue;
      if (x % len !== 0) continue;
      for (let k = 0; k < len; k++) pic.set(x + k, y, y < 9 ? "s" : "S");
    }
  }
  return smooth(pic).toString();
}

// The tear back to school ------------------------------------------------------------------------

const TEAR_W = 76;
const TEAR_H = 56;

const tri = (v: number, period: number, amp: number): number =>
  amp * (Math.abs(((v / period) % 1) * 2 - 1) * 2 - 1);

/** The hole: ripped to a point at the top, ragged down both sides, closed at the bottom. */
function inTear(x: number, y: number): boolean {
  const k = Math.min(1, Math.max(0, (y - 3) / 46));
  if (y < 3 || y > 50 - tri(x, 7, 2)) return false;
  const half = 3 + 25 * Math.sin(k * Math.PI) ** 0.8;
  const lean = (1 - k) * 6;
  const left = 38 + lean - half + tri(y, 7, 3) + tri(y + 2, 3, 1);
  const right = 38 + lean + half + tri(y + 4, 9, 3) + tri(y, 4, 1);
  return x >= left && x <= right;
}

/** Night through the hole: stars, then the dorm's long roof with its corridors lit. */
function nightView(x: number, y: number): string {
  const roof = 38 + Math.round(tri(x, 40, 1));
  if (y >= roof) {
    if (y === roof) return "n";
    const lit = (y - roof) % 4 === 2 && x % 5 < 2 && h(Math.floor(x / 5), y, 9) < 0.55;
    return lit ? "'" : "A";
  }
  const star = h(x, y, 3);
  if (star < 0.018) return "*";
  if (star < 0.03) return "+";
  return y > roof - 6 && (x + y) % 2 === 0 ? "A" : "a";
}

function tearNight(): string {
  const pic = Pic.blank(TEAR_W, TEAR_H);
  for (let y = 0; y < TEAR_H; y++)
    for (let x = 0; x < TEAR_W; x++) if (inTear(x, y)) pic.set(x, y, nightView(x, y));
  // The sky's paper lip, lit by the day on this side, its shaded underside at the hole.
  const lip = Pic.blank(TEAR_W, TEAR_H);
  for (let y = 0; y < TEAR_H; y++) {
    for (let x = 0; x < TEAR_W; x++) {
      if (inTear(x, y)) continue;
      let d = 9;
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++)
          if (inTear(x + dx, y + dy)) d = Math.min(d, Math.hypot(dx, dy));
      const w = 2.5 + 2 * (0.5 + 0.5 * Math.sin(y * 0.3 + x * 0.11));
      if (d <= 1.01) lip.set(x, y, "v");
      else if (d <= w - 0.6) lip.set(x, y, "P");
      else if (d <= w + 0.6) lip.set(x, y, "p");
      else if (d <= w + 1.6 && (x * 5 + y * 3) % 7 === 0) lip.set(x, y, "e");
    }
  }
  pic.put(smooth(lip), 0, 0);
  return smooth(pic, "*+'").toString();
}

// A ship on the horizon ----------------------------------------------------------------------------

const SAIL = [
  `
    ....W......
    ...WWb.....
    ..WWWb.....
    .WWWWbb....
    WWWWWbb....
    ....h......
    HHHHHHHHHH.
    .hhhhhhhh..
  `,
  `
    ....W......
    ...WWb.....
    ..WWWb.....
    .WWWWbb....
    WWWWWbb....
    ....h......
    .HHHHHHHHHH
    ..hhhhhhhh.
  `,
];

export default [
  sprite({
    name: "hellas-sky",
    size: [SKY_W, SKY_H],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: { still: sky() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "isles",
    size: [ISLE_W, ISLE_H],
    origin: [0, ISLE_H - 1],
    palette,
    outline: false,
    frames: { still: isles() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "aegean",
    size: [SEA_W, SEA_H],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: { ripple0: sea(0), ripple1: sea(1), ripple2: sea(2) },
    anim: { ripple: { frames: ["ripple0", "ripple1", "ripple2"], fps: 2 } },
  }),
  sprite({
    name: "tear-night",
    size: [TEAR_W, TEAR_H],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: { still: tearNight() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "sail",
    size: [11, 8],
    origin: [5, 7],
    palette,
    lone: "hWb",
    outline: false,
    frames: { bob0: SAIL[0] as string, bob1: SAIL[1] as string },
    anim: { bob: { frames: ["bob0", "bob1"], fps: 1 } },
  }),
];
