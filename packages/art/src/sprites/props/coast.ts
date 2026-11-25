import { type Legend, sprite } from "../../format.ts";
import { Pic, smooth } from "../../paint.ts";

/**
 * What moves and lies on the Page 1 ground: foam running up the beach and back, sparkle on the
 * deep, wheel ruts and trodden paths, rubble. Foam and sparkle are light on water and are drawn
 * raw; ruts, paths and rubble take the field's theme like the ground they lie on.
 */
const palette: Legend = {
  ".": null,
  // foam and sparkle
  q: "sea.pale",
  w: "stone.bright",
  s: "sea.light",
  // ruts and paths (the dust's ramp)
  b: "wood.pale",
  m: "wood.light",
  n: "wood.mid",
  c: "clay.pale",
  // rubble
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  S: "stone.dark",
  d: "stone.deep",
};

/**
 * Foam along a shore edge, drawn for water lying south of the land (the boundary at the top of
 * the tile): a thin line far out, closer and fuller, washing up to the sand, then breaking up as
 * it runs back. The other three directions are this turned.
 */
function surfSouth(frame: number): Pic {
  const pic = Pic.blank(16, 16);
  const line = [6, 4, 1, 3][frame] ?? 4;
  const solid = [0.55, 0.9, 1, 0.45][frame] ?? 1;
  for (let x = 0; x < 16; x++) {
    const y = line + Math.round(Math.sin(x * 0.55 + frame * 1.3) * 0.9);
    const keep = ((x * 7 + frame * 3) % 10) / 10 < solid;
    if (!keep) continue;
    pic.set(x, y, frame === 2 && x % 3 === 0 ? "w" : "q");
    if (frame === 2) pic.set(x, y + 1, "q");
    if (frame === 1 && x % 2 === 0) pic.set(x, y + 1, "s");
  }
  // The thin film left behind on the sand as the wave runs back.
  if (frame === 3) for (let x = 1; x < 16; x += 3) pic.set(x, 0, "s").set(x + 1, 0, "s");
  return pic;
}

const turn = (pic: Pic, dir: "s" | "n" | "e" | "w"): string => {
  const out = Pic.blank(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ch = pic.at(x, y) as string;
      if (ch === ".") continue;
      if (dir === "s") out.set(x, y, ch);
      else if (dir === "n") out.set(x, 15 - y, ch);
      else if (dir === "e") out.set(y, x, ch);
      else out.set(15 - y, x, ch);
    }
  return out.toString();
};

const DIRS = ["s", "n", "e", "w"] as const;

/** A glint on the deep catching the sun: nothing, a point, a cross, a point. */
const SPARKLE = [
  `
    .....
    .....
    .....
    .....
    .....
  `,
  `
    .....
    .....
    ..w..
    .....
    .....
  `,
  `
    ..q..
    ..w..
    qwwwq
    ..w..
    ..q..
  `,
  `
    .....
    ..q..
    .qwq.
    ..q..
    .....
  `,
];

/**
 * Two wheel ruts pressed into the dust, one tile long: each rut wanders a pixel, breaks where
 * the ground was hard, and has a lit lip on its far side.
 */
function ruts(dir: "h" | "v", v: number): string {
  const pic = Pic.blank(16, 16);
  for (const lane of [4, 10]) {
    for (let t = 0; t < 16; t++) {
      if ((t * 5 + lane + v * 3) % 11 === 0) continue;
      const wob = Math.round(Math.sin((t + v * 4 + lane) * 0.5) * 0.8);
      const a = lane + wob;
      if (dir === "h") pic.set(t, a, "n").set(t, a + 1, "m");
      else pic.set(a, t, "n").set(a + 1, t, "m");
    }
  }
  return smooth(pic).toString();
}

/** A trodden footpath: dust scuffed pale where people cut across, one tile long. */
const PATH = {
  h: `
    ..cc....cc..cc..
    cccccccccccccccc
    .cc..cc...cc..cc
  `,
  v: `
    .cc
    ccc
    cc.
    ccc
    .cc
    ccc
    cc.
    ccc
    .cc
    ccc
    cc.
    ccc
    .cc
    ccc
    cc.
    ccc
  `,
};

/** Broken masonry lying in the dust: a squared block, a split drum, a heap of chips. */
const RUBBLE = {
  a: `
    ...ddddddd...
    ..dwwwkkKKd..
    .dwkkkkkKKMd.
    .dKKKKKKKMMd.
    .dMMMMMMMMSd.
    ..ddddddddd..
  `,
  b: `
    ....dddd.....
    ..ddwkkKd....
    .dwkkKKKMd.dd
    .dKKKKKMMddkd
    .dMMMMMSSddMd
    ..dddddddd.dd
  `,
  c: `
    ..dd.........
    .dkKd..ddd...
    .dMSd.dwkKd..
    ..dd..dKMMd..
    ......ddddd..
    .............
  `,
};

const pad = (grid: string, w: number, h: number): string => {
  const p = Pic.of(grid);
  return Pic.blank(w, h)
    .put(p, 0, h - p.h)
    .toString();
};

export default [
  sprite({
    name: "foam",
    size: [16, 16],
    origin: [0, 0],
    palette,
    lone: "qws",
    outline: false,
    frames: Object.fromEntries(
      DIRS.flatMap((dir) => [0, 1, 2, 3].map((f) => [`${dir}${f}`, turn(surfSouth(f), dir)])),
    ),
    anim: Object.fromEntries(
      DIRS.map((dir) => [
        dir,
        { frames: [0, 1, 2, 3].map((f) => `${dir}${f}`), fps: 2.5, jump: 1 },
      ]),
    ),
  }),
  sprite({
    name: "sparkle",
    size: [5, 5],
    origin: [2, 2],
    palette,
    lone: "qw",
    outline: false,
    frames: Object.fromEntries(SPARKLE.map((g, i) => [`glint${i}`, g])),
    anim: {
      glint: {
        frames: ["glint0", "glint0", "glint1", "glint2", "glint3", "glint0"],
        fps: 6,
        jump: 1,
      },
    },
  }),
  sprite({
    name: "ruts",
    size: [16, 16],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { h: ruts("h", 0), v: ruts("v", 1) },
    anim: { idle: { frames: ["h"], fps: 1 } },
  }),
  sprite({
    name: "footpath",
    size: [16, 16],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { h: pad(PATH.h, 16, 16), v: pad(PATH.v, 16, 16) },
    anim: { idle: { frames: ["h"], fps: 1 } },
  }),
  sprite({
    name: "rubble",
    size: [13, 6],
    palette,
    outline: false,
    frames: {
      a: smooth(Pic.of(pad(RUBBLE.a, 13, 6)), "d").toString(),
      b: smooth(Pic.of(pad(RUBBLE.b, 13, 6)), "d").toString(),
      c: smooth(Pic.of(pad(RUBBLE.c, 13, 6)), "d").toString(),
    },
    anim: { idle: { frames: ["a"], fps: 1 } },
  }),
];
