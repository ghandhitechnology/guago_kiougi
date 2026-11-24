import { type Legend, sprite } from "../../format.ts";
import { Pic, tidy } from "../../paint.ts";

/**
 * What lies past the island's sea wall at 23:38: stars over a far city skyline, city glow on
 * the horizon, and black water carrying the lights back. Backdrops are drawn in their night
 * colours directly and placed raw, outside any theme.
 */
const palette: Legend = {
  ".": null,
  // sky and water
  a: "ink.deep",
  b: "ink.dark",
  B: "navy.dark",
  m: "navy.mid",
  n: "navy.light",
  N: "navy.pale",
  p: "plum.deep",
  P: "plum.dark",
  // lights
  w: "stone.bright",
  Y: "gold.pale",
  y: "gold.light",
  o: "gold.mid",
  r: "red.light",
  // single stars, window lights and beacons are dots on purpose
  "*": "stone.bright",
  "+": "navy.pale",
  ",": "navy.light",
  "'": "gold.light",
  "!": "red.light",
  "~": "plum.deep",
};
const lone = "*+,'!~";

/** A small deterministic hash for placing stars and windows. */
function h(x: number, y: number, s: number): number {
  let v = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
}

// Stars --------------------------------------------------------------------------------------

const SKY_W = 160;
const SKY_H = 40;

function stars(frame: number): string {
  const pic = Pic.blank(SKY_W, SKY_H);
  for (let y = 0; y < SKY_H; y++) {
    for (let x = 0; x < SKY_W; x++) {
      const v = h(x, y, 3);
      // Fewer stars toward the horizon, where the city washes them out.
      const density = 0.022 * (1 - y / (SKY_H * 1.3));
      if (v < density) {
        const twinkle = h(x, y, 9) < 0.25 && frame === 1;
        pic.set(x, y, v < density * 0.25 ? (twinkle ? "," : "*") : twinkle ? "," : "+");
      }
    }
  }
  // A few bright ones with a cross of light.
  for (const [x, y] of [
    [23, 6],
    [71, 3],
    [118, 11],
    [146, 5],
  ] as const) {
    const arm = frame === 0 ? "n" : "m";
    pic
      .set(x, y, "*")
      .set(x - 1, y, arm)
      .set(x + 1, y, arm)
      .set(x, y - 1, arm)
      .set(x, y + 1, arm);
    pic.set(x - 2, y, ".").set(x + 2, y, ".");
  }
  return pic.toString();
}

/** A thin moon low over the sea, lit from the west. */
const MOON = `
  ...wwYY..
  ..wY.....
  .wY......
  .wY......
  .wY......
  ..wY.....
  ...wwYY..
`;

// Skyline ------------------------------------------------------------------------------------

const CITY_W = 160;
const CITY_H = 30;

/**
 * The far shore: two rows of towers, the back row in haze. City glow fades up behind them in
 * stepped bands. Windows are scattered single lights; a crane and a mast carry red beacons.
 */
function skyline(): string {
  const pic = Pic.blank(CITY_W, CITY_H);
  // Glow bands behind the towers.
  for (let x = 0; x < CITY_W; x++) {
    for (let y = 8; y < CITY_H; y++) {
      if (y >= 20) pic.set(x, y, "P");
      else if (y >= 15) pic.set(x, y, (x + y) % 2 === 0 ? "P" : "p");
      else if (y >= 12) pic.set(x, y, "p");
      else if (y >= 10 && (x + y) % 2 === 0) pic.set(x, y, "~");
    }
  }
  const tower = (x0: number, w: number, top: number, fill: string, lit: number) => {
    for (let x = x0; x < x0 + w; x++) {
      for (let y = top; y < CITY_H; y++) {
        if (x < 0 || x >= CITY_W) continue;
        pic.set(x, y, fill);
        if (y > top + 1 && x > x0 && x < x0 + w - 1 && (y - top) % 2 === 0 && h(x, y, 5) < lit)
          pic.set(x, y, "'");
      }
    }
  };
  // Back row, in haze.
  let x = 0;
  let i = 0;
  while (x < CITY_W) {
    const w = 5 + Math.floor(h(i, 1, 2) * 9);
    const top = 9 + Math.floor(h(i, 2, 2) * 10);
    tower(x, w, top, "B", 0.12);
    x += w + ([0, 2, 3][Math.floor(h(i, 3, 2) * 3)] ?? 0);
    i++;
  }
  // Front row, darker and lower.
  x = 3;
  i = 0;
  while (x < CITY_W) {
    const w = 6 + Math.floor(h(i, 4, 7) * 10);
    const top = 16 + Math.floor(h(i, 5, 7) * 9);
    tower(x, w, top, "b", 0.22);
    x += w + 2 + Math.floor(h(i, 6, 7) * 6);
    i++;
  }
  // A crane and a mast with beacons.
  for (let y = 4; y < 18; y++) pic.set(52, y, "B");
  for (let xx = 44; xx < 66; xx++) pic.set(xx, 5, "B");
  pic.set(65, 6, "B").set(65, 7, "B").set(52, 3, "!");
  for (let y = 1; y < 16; y++) pic.set(121, y, "b");
  pic.set(120, 6, "b").set(122, 6, "b").set(121, 0, "!");
  // Slits of glow left between overlapping towers close up.
  return tidy(pic, "B", "'!~").toString();
}

// Sea ----------------------------------------------------------------------------------------

const SEA_W = 64;
const SEA_H = 32;

/** Black water with ripples. `frame` slides the ripples; the lights' reflections stay put. */
function sea(frame: number): string {
  const pic = Pic.blank(SEA_W, SEA_H, "b");
  for (let y = 0; y < SEA_H; y++) {
    const spacing = y < 6 ? 5 : y < 12 ? 7 : 9;
    if (y % 2 === 1) continue;
    for (let x = 0; x < SEA_W; x++) {
      const len = y < 6 ? 2 : 3;
      const xx = (x + frame * 2 + y * 3) % SEA_W;
      if (xx % (spacing * 3) < len) pic.set(x, y, y < 4 ? "m" : "B");
    }
  }
  // Reflections of the far shore's lights: short warm dashes stacked under each other.
  for (const [rx, ry, n] of [
    [9, 1, 4],
    [27, 0, 6],
    [44, 2, 4],
    [57, 0, 5],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const y = ry + k * 2;
      const wob = (k + frame) % 2;
      pic.set(rx + wob, y, k < 2 ? "y" : "o").set(rx + wob + 1, y, k < 2 ? "y" : "o");
    }
  }
  return tidy(pic, "b").toString();
}

export default [
  sprite({
    name: "night-stars",
    size: [SKY_W, SKY_H],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: { twinkle0: stars(0), twinkle1: stars(1) },
    anim: { twinkle: { frames: ["twinkle0", "twinkle1"], fps: 1.5, jump: 1 } },
  }),
  sprite({
    name: "night-moon",
    size: [9, 7],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { still: MOON },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "night-city",
    size: [CITY_W, CITY_H],
    origin: [0, CITY_H - 1],
    palette,
    lone,
    outline: false,
    frames: { still: skyline() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "night-sea",
    size: [SEA_W, SEA_H],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { ripple0: sea(0), ripple1: sea(1), ripple2: sea(2) },
    anim: { ripple: { frames: ["ripple0", "ripple1", "ripple2"], fps: 2 } },
  }),
];
