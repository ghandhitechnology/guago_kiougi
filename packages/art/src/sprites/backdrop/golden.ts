import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, smooth, tidy } from "../../paint.ts";

/**
 * What lies past the sea wall at 16:50: a sky going from violet overhead to a white-gold
 * horizon, the sun low over the west, the city across the water flattened to haze with its
 * west faces catching the light, a long bridge, and the water carrying a road of glitter.
 * Drawn in their own colours and placed raw, outside any theme.
 */
const palette: Legend = {
  ".": null,
  // sky, top to horizon
  V: "plum.pale",
  R: "rose.pale",
  C: "clay.pale",
  G: "gold.pale",
  W: "stone.bright",
  // cloud
  r: "rose.light",
  m: "rose.mid",
  // haze city, far and near
  f: "stone.light",
  F: "stone.mid",
  n: "stone.dark",
  N: "plum.dark",
  // sea
  s: "sea.light",
  S: "sea.mid",
  d: "sea.dark",
  D: "sea.deep",
  // light
  y: "gold.light",
  // dots: glints, window sparks, glitter
  "*": "stone.bright",
  "+": "gold.pale",
  "'": "gold.light",
  ",": "rose.pale",
};
const lone = "*+',";

/** A tiny deterministic hash for scattering glints. */
function h(x: number, y: number, s: number): number {
  let v = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
}

// Sky ------------------------------------------------------------------------------------------

const SKY_W = 240;
const SKY_H = 48;
/** Colour bands from the top, with the row each starts on. Two dithered rows between bands. */
const BANDS: readonly (readonly [number, string])[] = [
  [0, "V"],
  [9, "R"],
  [20, "C"],
  [31, "G"],
  [41, "W"],
];

function bandAt(y: number): string {
  let ch = "V";
  for (const [from, c] of BANDS) if (y >= from) ch = c;
  return ch;
}

/** Long low clouds, lit from below by the sun: rose bodies with gold bellies. */
const CLOUDS = [
  [
    { x: 30, y: 13, rx: 22, ry: 2.4 },
    { x: 46, y: 11.5, rx: 12, ry: 2.2 },
  ],
  [
    { x: 120, y: 7, rx: 30, ry: 2 },
    { x: 104, y: 6, rx: 12, ry: 1.8 },
  ],
  [
    { x: 182, y: 18, rx: 26, ry: 2.6 },
    { x: 196, y: 16, rx: 12, ry: 2.2 },
  ],
  [{ x: 84, y: 25, rx: 18, ry: 1.7 }],
  [{ x: 226, y: 4, rx: 16, ry: 1.6 }],
] as const;

function sky(): string {
  const pic = Pic.blank(SKY_W, SKY_H);
  for (let y = 0; y < SKY_H; y++) {
    for (let x = 0; x < SKY_W; x++) {
      let ch = bandAt(y);
      // Two dithered rows above each band edge, so the gradient never shows a step.
      for (const [from] of BANDS) {
        if (from > 0 && (y === from - 1 || y === from - 2) && (x + y) % 2 === 0) ch = bandAt(from);
      }
      pic.set(x, y, ch);
    }
  }
  for (const cloud of CLOUDS) {
    const isIn = lobes(cloud);
    for (let y = 0; y < SKY_H; y++) {
      for (let x = 0; x < SKY_W; x++) {
        if (!isIn(x, y)) continue;
        const below = !isIn(x, y + 1);
        const above = !isIn(x, y - 1);
        pic.set(x, y, below ? "G" : above ? "m" : "r");
      }
    }
  }
  return smooth(pic).toString();
}

/** The sun sitting low, a white core in gold rings. Drawn behind the rooftops. */
function sun(): string {
  const S = 23;
  const c = 11;
  const pic = Pic.blank(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= 5) pic.set(x, y, "W");
      else if (d <= 7.2) pic.set(x, y, "G");
      else if (d <= 11 && (x + y) % 2 === 0) pic.set(x, y, "G");
    }
  }
  return pic.toString();
}

// The city across the water ----------------------------------------------------------------------

const CITY_W = 240;
const CITY_H = 30;

/** Towers as [x, width, height, layer]: layer 0 far haze, 1 nearer. */
const TOWERS: readonly (readonly [number, number, number, 0 | 1])[] = [
  [4, 10, 12, 0],
  [12, 7, 17, 1],
  [22, 12, 9, 0],
  [30, 6, 21, 1],
  [38, 9, 14, 0],
  [49, 8, 25, 1],
  [58, 14, 11, 0],
  [64, 7, 16, 1],
  [76, 10, 19, 0],
  [80, 6, 13, 1],
  [91, 12, 8, 0],
  [150, 11, 10, 0],
  [158, 6, 18, 1],
  [168, 9, 23, 0],
  [176, 7, 14, 1],
  [186, 13, 9, 0],
  [196, 8, 27, 1],
  [206, 10, 15, 0],
  [214, 6, 12, 1],
  [224, 12, 18, 0],
  [232, 7, 10, 1],
];

function city(): string {
  const pic = Pic.blank(CITY_W, CITY_H);
  for (const layer of [0, 1] as const) {
    for (const [x0, w, hgt, l] of TOWERS) {
      if (l !== layer) continue;
      const body = layer === 0 ? "f" : "F";
      const lit = layer === 0 ? "C" : "r";
      for (let y = CITY_H - hgt; y < CITY_H; y++) {
        for (let x = x0; x < Math.min(CITY_W, x0 + w); x++) {
          // West faces catch the sun in a one-pixel stripe; the top edge does too.
          const edge = x === x0 || y === CITY_H - hgt;
          pic.set(x, y, edge ? lit : body);
        }
      }
      // Window sparks where the sun hits glass.
      for (let y = CITY_H - hgt + 2; y < CITY_H - 2; y += 3) {
        for (let x = x0 + 2; x < Math.min(CITY_W - 1, x0 + w - 1); x += 2) {
          if (h(x, y, 5 + layer) < 0.16) pic.set(x, y, layer === 0 ? "," : "+");
        }
      }
    }
  }
  // The bridge: two pylons, fanned stays, a long deck low over the water.
  const deckY = CITY_H - 5;
  for (let x = 96; x < 152; x++) pic.set(x, deckY, "n").set(x, deckY + 1, "N");
  for (const px of [110, 138]) {
    for (let y = deckY - 16; y < CITY_H; y++) pic.set(px, y, "n").set(px + 1, y, "N");
    pic.set(px, deckY - 16, "C");
    for (let k = 1; k <= 12; k += 2) {
      for (const dir of [-1, 1]) {
        // A stay from the pylon top down to the deck.
        for (let t = 0; t <= 14; t++) {
          const x = Math.round(px + (dir * k * t) / 14);
          const y = Math.round(deckY - 15 + (t * 15) / 14) - Math.round((14 - t) * 0.0);
          if (y < deckY && (x + y + k) % 3 !== 0) pic.set(x, y, "f");
        }
      }
    }
  }
  return smooth(pic, lone).toString();
}

// Sea ------------------------------------------------------------------------------------------

const SEA_W = 64;
const SEA_H = 24;

/** Water with ripples and a road of glitter under the sun. `frame` slides the glitter. */
function sea(frame: number): string {
  const pic = Pic.blank(SEA_W, SEA_H, "S");
  for (let y = 0; y < SEA_H; y++) {
    const spacing = y < 6 ? 5 : y < 14 ? 7 : 9;
    for (let x = 0; x < SEA_W; x++) {
      const xx = (x + frame * 3 + y * 5) % SEA_W;
      if (y % 2 === 1 && xx % (spacing * 3) < 3) pic.set(x, y, "d");
      else if (y % 2 === 0 && (xx + 7) % (spacing * 4) < 2) pic.set(x, y, "s");
    }
  }
  for (let y = 0; y < SEA_H; y++) {
    for (let x = 0; x < SEA_W; x++) {
      const v = h(x, y, 11 + frame);
      if (v < 0.035 * (1 - y / (SEA_H * 1.4))) pic.set(x, y, v < 0.012 ? "*" : "+");
    }
  }
  return tidy(pic, "S", "*+").toString();
}

// Gull ------------------------------------------------------------------------------------------

/** A gull gliding on the sea wind: wings up, level, down, level. */
const GULL = [
  `
    W.......W
    .W.....W.
    ..WWWWW..
    ....n....
  `,
  `
    .........
    WWW...WWW
    ..WWWWW..
    ....n....
  `,
  `
    .........
    ..WWWWW..
    .W..n..W.
    W.......W
  `,
  `
    .........
    nWW...WWn
    ..WWWWW..
    ....n....
  `,
];

export default [
  sprite({
    name: "golden-sky",
    size: [SKY_W, SKY_H],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: { still: sky() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "golden-sun",
    size: [23, 23],
    origin: [11, 11],
    palette,
    lone: "G",
    outline: false,
    frames: { still: sun() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "golden-city",
    size: [CITY_W, CITY_H],
    origin: [0, CITY_H - 1],
    palette,
    lone,
    outline: false,
    frames: { still: city() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "golden-sea",
    size: [SEA_W, SEA_H],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: { ripple0: sea(0), ripple1: sea(1), ripple2: sea(2) },
    anim: { ripple: { frames: ["ripple0", "ripple1", "ripple2"], fps: 2 } },
  }),
  sprite({
    name: "gull",
    size: [9, 4],
    origin: [4, 2],
    palette,
    lone: "n",
    outline: false,
    frames: Object.fromEntries(GULL.map((g, i) => [`glide${i}`, g])),
    anim: { glide: { frames: GULL.map((_, i) => `glide${i}`), fps: 5, jump: 1 } },
  }),
];
