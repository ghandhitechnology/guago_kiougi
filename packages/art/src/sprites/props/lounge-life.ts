import { sprite } from "../../format.ts";
import {
  boxShadow,
  finish,
  frames,
  hline,
  IL,
  mounted,
  ovalShadow,
  rect,
  vline,
} from "../../interior.ts";
import { lobes, Pic, shade } from "../../paint.ts";

/**
 * More of 쉼표 라운지, the room people come to on purpose: floor lamps with fabric shades,
 * bean bags with somebody's shape still in them, a pool table, the karaoke machine under a sheet
 * since the booth broke, a shelf of board games and far too much manga, a fish tank, a monstera
 * that is thriving, a coat rack of 과잠, the wall of club photos.
 */

/** A standing lamp, a pleated shade glowing warm, its bulb humming. */
function floorLamp(f: number): Pic {
  const p = Pic.blank(16, 42);
  // Shade.
  rect(p, 3, 2, 10, 9, "P");
  hline(p, 4, 1, 8, "P");
  for (let x = 4; x < 13; x += 2) vline(p, x, 2, 9, "p");
  vline(p, 3, 2, 9, "E");
  hline(p, 3, 10, 10, f === 1 ? "y" : "Y");
  hline(p, 4, 11, 8, f === 1 ? "o" : "y");
  // Pole and base.
  vline(p, 7, 12, 27, "I");
  vline(p, 8, 12, 27, "i");
  rect(p, 3, 38, 10, 3, "I");
  hline(p, 3, 38, 10, "i");
  return finish(p, "Yyo");
}

/** A bean bag, sagging where someone sat for three hours. */
function beanBag(dark: string, mid: string, light: string): Pic {
  const p = shade(
    22,
    16,
    lobes([
      { x: 11, y: 10, rx: 10, ry: 5.5 },
      { x: 8, y: 6, rx: 6, ry: 4.5 },
      { x: 15, y: 7, rx: 5, ry: 4 },
    ]),
    { outline: dark, dark: mid, mid, light },
  );
  // The dent.
  rect(p, 9, 7, 5, 2, dark === "A" ? "a" : "q");
  return finish(p);
}

/** The pool table: green felt, wooden rails, the pockets, a rack of balls and two cues. */
const poolTable = (() => {
  const W = 66;
  const p = Pic.blank(W, 40);
  rect(p, 1, 1, W - 2, 24, "U");
  hline(p, 1, 1, W - 2, "u");
  vline(p, 1, 1, 24, "u");
  rect(p, 4, 4, W - 8, 18, "G");
  rect(p, 5, 5, W - 10, 16, "g");
  hline(p, 5, 5, W - 10, "G");
  vline(p, 5, 5, 16, "G");
  // Pockets.
  for (const [x, y] of [
    [3, 3],
    [31, 3],
    [W - 6, 3],
    [3, 20],
    [31, 20],
    [W - 6, 20],
  ] as const)
    rect(p, x, y, 3, 2, "J");
  // A rack of balls, a few loose, the white.
  const balls: [number, number, string][] = [
    [44, 11, "y"],
    [46, 10, "R"],
    [46, 12, "N"],
    [48, 9, "X"],
    [48, 11, "t"],
    [48, 13, "G"],
    [18, 14, "R"],
    [26, 8, "o"],
    [14, 9, "w"],
  ];
  for (const [x, y, c] of balls) rect(p, x, y, 2, 2, c);
  // Cues lying across.
  for (let i = 0; i < 26; i++) p.set(8 + i, 17 - Math.floor(i / 6), "W");
  // Front rail, apron, legs.
  rect(p, 1, 25, W - 2, 6, "b");
  hline(p, 1, 25, W - 2, "U");
  rect(p, 28, 27, 10, 2, "o");
  for (const x of [3, W - 8]) {
    rect(p, x, 31, 5, 8, "b");
    vline(p, x, 31, 8, "U");
  }
  return finish(p, "yRNXtGwo");
})();

/** The karaoke machine under a sheet, taped shut since the booth broke. */
const karaoke = (() => {
  const p = Pic.blank(26, 34);
  rect(p, 3, 2, 20, 30, "k");
  hline(p, 4, 1, 18, "w");
  vline(p, 3, 2, 30, "w");
  vline(p, 22, 2, 30, "K");
  for (const x of [8, 13, 18]) vline(p, x, 4, 27, "K");
  // The sheet's hem spreading on the floor.
  rect(p, 1, 30, 24, 3, "k");
  hline(p, 1, 32, 24, "K");
  // A speaker's edge where the sheet slipped, and the tape across.
  rect(p, 18, 22, 4, 6, "I");
  rect(p, 19, 23, 2, 4, "j");
  for (let i = 0; i < 18; i++)
    p.set(4 + i, 12 + Math.floor(i / 3), "o").set(4 + i, 13 + Math.floor(i / 3), "o");
  return finish(p);
})();

/** A low shelf: board game boxes stacked flat, then manga, many volumes of the same three series. */
const gameShelf = (() => {
  const W = 50;
  const p = Pic.blank(W, 30);
  rect(p, 1, 1, W - 2, 3, "W");
  hline(p, 1, 1, W - 2, "P");
  rect(p, 1, 4, W - 2, 25, "u");
  rect(p, 3, 5, W - 6, 10, "U");
  rect(p, 3, 17, W - 6, 10, "U");
  hline(p, 3, 15, W - 6, "W");
  hline(p, 3, 16, W - 6, "u");
  // Game boxes, flat.
  for (const [y, w, c, l] of [
    [12, 18, "R", "r"],
    [10, 16, "N", "n"],
    [8, 14, "G", "g"],
    [6, 12, "o", "y"],
  ] as const) {
    rect(p, 4, y, w, 2, c);
    hline(p, 4, y, w, l);
  }
  // Manga: three series, numbered spines in runs.
  const series = [
    ["w", "R"],
    ["k", "N"],
    ["P", "X"],
  ];
  let x = 24;
  for (let i = 0; x < W - 4; i++) {
    const [paper, ink] = series[Math.floor(i / 5) % 3] as [string, string];
    rect(p, x, 7, 2, 8, paper);
    p.set(x, 9, ink).set(x + 1, 9, ink);
    x += 2;
  }
  x = 4;
  for (let i = 0; x < W - 4; i++) {
    const [paper, ink] = series[(Math.floor(i / 7) + 1) % 3] as [string, string];
    rect(p, x, 19, 2, 8, paper);
    p.set(x, 21, ink).set(x + 1, 21, ink);
    x += 2;
  }
  hline(p, 1, 28, W - 2, "U");
  return finish(p);
})();

/** The fish tank on its stand: weed, a castle, three fish going round. */
function fishTank(f: number): Pic {
  const p = Pic.blank(36, 34);
  rect(p, 1, 1, 34, 18, "8");
  rect(p, 2, 2, 32, 16, "9");
  hline(p, 2, 2, 32, "c");
  rect(p, 2, 15, 32, 3, "p");
  hline(p, 2, 15, 32, "P");
  // Weed and a castle.
  for (const [x, h] of [
    [5, 8],
    [8, 6],
    [29, 9],
  ] as const) {
    vline(p, x, 15 - h, h, "G");
    vline(p, x + 1, 16 - h, h - 1, "g");
  }
  rect(p, 18, 9, 6, 6, "K");
  rect(p, 18, 8, 2, 1, "K");
  rect(p, 22, 8, 2, 1, "K");
  rect(p, 20, 11, 2, 4, "M");
  // Fish going round.
  const fish = [
    [8 + f * 4, 6, "t"],
    [28 - f * 3, 10, "r"],
    [12 + ((f * 5) % 14), 12, "y"],
  ] as const;
  for (const [x, y, c] of fish) {
    rect(p, x, y, 3, 2, c);
    p.set(x + (f % 2 ? -1 : 3), y, c);
  }
  // Bubbles off the stone.
  rect(p, 26, 13 - f * 3, 1, 1, "~");
  rect(p, 27, 11 - ((f * 3) % 8), 1, 1, "~");
  // Lid with its light, and the stand.
  hline(p, 1, 1, 34, "I");
  rect(p, 2, 19, 32, 14, "U");
  hline(p, 2, 19, 32, "u");
  rect(p, 5, 22, 12, 9, "b");
  rect(p, 19, 22, 12, 9, "b");
  return finish(p, "~yrt");
}

/** A monstera in a big pot, the one plant on campus that is doing well. */
const monstera = (() => {
  const p = Pic.blank(28, 34);
  const leaves = shade(
    28,
    26,
    lobes([
      { x: 9, y: 10, rx: 7, ry: 6 },
      { x: 18, y: 8, rx: 8, ry: 6.5 },
      { x: 14, y: 16, rx: 10, ry: 6 },
      { x: 6, y: 18, rx: 5, ry: 4 },
      { x: 22, y: 17, rx: 5, ry: 4 },
    ]),
    { outline: "Z", dark: "D", mid: "G", light: "g", glint: "h" },
  );
  p.put(leaves, 0, 0);
  // The splits in the leaves.
  for (const [x, y] of [
    [9, 6],
    [18, 4],
    [14, 13],
  ] as const) {
    vline(p, x, y, 4, "D");
  }
  rect(p, 8, 24, 12, 9, "T");
  hline(p, 7, 24, 14, "t");
  vline(p, 19, 25, 8, "C");
  hline(p, 8, 32, 12, "C");
  return finish(p, "h");
})();

/** A coat rack with three 과잠 on it, the colours of three clubs. */
const coatRack = (() => {
  const p = Pic.blank(20, 42);
  vline(p, 9, 2, 36, "U");
  vline(p, 10, 2, 36, "u");
  rect(p, 8, 0, 4, 2, "U");
  rect(p, 4, 38, 12, 3, "U");
  hline(p, 4, 38, 12, "u");
  // Jackets hanging off the hooks.
  for (const [x, c, l] of [
    [3, "R", "r"],
    [12, "N", "n"],
    [7, "G", "g"],
  ] as const) {
    rect(p, x, 4, 6, 14, c);
    hline(p, x, 4, 6, l);
    vline(p, x + 2, 6, 11, "w");
    rect(p, x, 17, 6, 1, "w");
  }
  return finish(p);
})();

/** A wall of club photos in frames, faces as dots of colour, one picture crooked. */
const photoWall = (() => {
  const p = Pic.blank(44, 24);
  const frame = (x: number, y: number, w: number, h: number, sky: string) => {
    rect(p, x, y, w, h, "U");
    rect(p, x + 1, y + 1, w - 2, h - 2, sky);
    hline(p, x + 1, y + h - 3, w - 2, "G");
    for (let k = 0; k < Math.floor((w - 3) / 3); k++) rect(p, x + 2 + k * 3, y + h - 5, 2, 2, "f");
  };
  frame(1, 1, 14, 10, "m");
  frame(17, 3, 12, 9, "n");
  frame(31, 1, 12, 11, "P");
  frame(5, 13, 10, 9, "c");
  frame(18, 14, 14, 9, "m");
  frame(34, 14, 9, 8, "p");
  return finish(p);
})();

/** A side table with a little lamp and a mug nobody came back for. */
const sideTable = (() => {
  const p = Pic.blank(16, 26);
  rect(p, 2, 13, 12, 4, "W");
  hline(p, 2, 13, 12, "P");
  rect(p, 2, 17, 12, 2, "u");
  for (const x of [3, 11]) rect(p, x, 19, 2, 6, "U");
  // Lamp.
  rect(p, 4, 3, 7, 6, "P");
  hline(p, 5, 2, 5, "P");
  hline(p, 4, 8, 7, "Y");
  vline(p, 7, 9, 4, "o");
  rect(p, 5, 12, 5, 2, "o");
  rect(p, 11, 11, 3, 3, "w");
  return finish(p, "Y");
})();

/** Fairy lights strung across the room, sagging between their hooks, bulbs twinkling in turn. */
function stringLights(f: number): Pic {
  const W = 96;
  const p = Pic.blank(W, 16);
  const bulbs = ["Y", "y", "Y", "o", "Y", "y"];
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const y = Math.round(2 + 10 * 4 * t * (1 - t));
    p.set(x, y, "I");
    if (x % 8 === 4) {
      const k = (Math.floor(x / 8) + f) % bulbs.length;
      const c = (Math.floor(x / 8) + f) % 3 === 0 ? "o" : (bulbs[k] as string);
      p.set(x, y + 1, c)
        .set(x, y + 2, c)
        .set(x + 1, y + 1, c);
    }
  }
  return p;
}

const STRING_LIGHTS = sprite({
  name: "string-lights",
  group: "interior",
  size: [96, 16],
  palette: IL,
  lone: "I",
  outline: false,
  frames: Object.fromEntries([0, 1, 2].map((i) => [`t${i}`, stringLights(i).toString()])),
  anim: { idle: { frames: ["t0"], fps: 1 }, twinkle: { frames: ["t0", "t1", "t2"], fps: 2 } },
});

const FLOOR_LAMP = sprite({
  name: "floor-lamp",
  group: "interior",
  size: [16, 42],
  palette: IL,
  lone: "Yyo",
  shadow: ovalShadow(16, 42, 8, 40, 6, 1.6),
  frames: { on0: floorLamp(0).toString(), on1: floorLamp(1).toString() },
  anim: {
    idle: { frames: ["on0"], fps: 1 },
    glow: { frames: ["on0", "on0", "on0", "on0", "on1", "on0"], fps: 3 },
  },
});

const FISH_TANK = sprite({
  name: "fish-tank",
  group: "interior",
  size: [36, 34],
  palette: IL,
  lone: "~yrt",
  shadow: boxShadow(36, 34, 2, 28, 33, 33, 2, 0),
  frames: Object.fromEntries([0, 1, 2, 3].map((i) => [`swim${i}`, fishTank(i).toString()])),
  anim: {
    idle: { frames: ["swim0"], fps: 1 },
    swim: { frames: ["swim0", "swim1", "swim2", "swim3"], fps: 3 },
  },
});

export default [
  STRING_LIGHTS,
  FLOOR_LAMP,
  frames(
    "bean-bag",
    { plum: beanBag("A", "X", "x"), red: beanBag("Q", "R", "r") },
    { shadow: ovalShadow(22, 16, 12, 14, 9, 2) },
  ),
  frames(
    "pool-table",
    { still: poolTable },
    { lone: "yRNXtGwo", shadow: boxShadow(66, 40, 1, 25, 64, 39, 3, 0) },
  ),
  frames("karaoke", { still: karaoke }, { shadow: boxShadow(26, 34, 1, 30, 24, 33, 2, 0) }),
  frames("game-shelf", { still: gameShelf }, { shadow: boxShadow(50, 30, 1, 25, 48, 29, 2, 0) }),
  FISH_TANK,
  frames(
    "monstera",
    { still: monstera },
    { lone: "h", shadow: ovalShadow(28, 34, 14, 32.5, 8, 1.6) },
  ),
  frames("coat-rack", { still: coatRack }, { shadow: ovalShadow(20, 42, 10, 40, 6, 1.4) }),
  frames("photo-wall", { still: photoWall }, { origin: mounted([44, 24], 14) }),
  frames(
    "side-table",
    { still: sideTable },
    { lone: "Y", shadow: ovalShadow(16, 26, 8, 24.5, 6, 1.4) },
  ),
];
