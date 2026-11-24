import { type Legend, sprite } from "../../format.ts";
import { Pic, smooth, tidy } from "../../paint.ts";

/**
 * What lies past the 운동장 while the rift is open. On the campus side a plain afternoon: blue
 * sky, flat clouds, the dorm's roofline and a row of pines. On the rift side the era's sky
 * bleeds through: gold haze, a hill of olives, and a temple on top that has never been finished.
 * A seam of light runs up between the two skies.
 */
const palette: Legend = {
  ".": null,
  // campus sky
  n: "navy.pale",
  N: "navy.light",
  w: "stone.bright",
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  d: "stone.deep",
  // pines and roofs
  f: "board.deep",
  F: "board.dark",
  m: "board.mid",
  r: "clay.mid",
  R: "clay.dark",
  // greek sky
  Y: "gold.pale",
  y: "gold.light",
  t: "clay.pale",
  T: "clay.light",
  o: "olive.mid",
  O: "olive.dark",
  l: "olive.light",
  // rift light
  W: "stone.bright",
  q: "sea.pale",
  Q: "sea.light",
  s: "sea.mid",
  p: "plum.light",
  P: "plum.mid",
  // motes and pages
  "*": "stone.bright",
  "+": "sea.pale",
  ",": "plum.light",
};
const lone = "*+,";

// Campus side --------------------------------------------------------------------------------

/** Flat afternoon clouds, lit along the top. */
const CLOUDS = `
  ..............................................................................
  ..........wwwwww..........................................................
  ......wwwwwwwwwwww..............................www.......................
  ...wwwwwwwwwwwwwwwwww......................wwwwwwwwwww....................
  .wwwwwwwwwwwwwwwwwwwwwww...............wwwwwwwwwwwwwwwwwww...............
  kkkkkkkkkkkkkkkkkkkkkkkkkk...........kkkkkkkkkkkkkkkkkkkkkkkkkk...........
  ..............................................................................
`;

/** The dorm's roof and a row of black pines along the field's far edge. */
function campusEdge(): string {
  const W = 240;
  const H = 40;
  const pic = Pic.blank(W, H);
  // Roofline of 새벽관 far off: a long low block with a gable, in haze.
  for (let x = 20; x < 150; x++) {
    const top = x < 60 ? 14 : x < 70 ? 14 - (x - 60) : x < 80 ? 4 + (x - 70) : 14;
    for (let y = top; y < H; y++)
      pic.set(x, y, y === top ? "M" : y < top + 3 ? "K" : y % 6 === 0 && x % 8 < 5 ? "M" : "k");
  }
  // Pines in front: dark cones with a lit edge.
  for (const [cx, base, hgt] of [
    [8, 40, 26],
    [26, 40, 20],
    [46, 40, 30],
    [70, 40, 22],
    [96, 40, 28],
    [122, 40, 19],
    [148, 40, 31],
    [172, 40, 24],
    [196, 40, 29],
    [222, 40, 21],
  ] as const) {
    for (let y = base - hgt; y < base; y++) {
      const half = Math.max(
        1,
        Math.round(((y - (base - hgt)) / hgt) * 7 + Math.sin(y * 1.3) * 1.2),
      );
      for (let x = cx - half; x <= cx + half; x++) {
        if (x < 0 || x >= W) continue;
        pic.set(x, y, x === cx - half ? "m" : x > cx + half - 2 ? "f" : "F");
      }
    }
  }
  return smooth(pic).toString();
}

// Rift side ----------------------------------------------------------------------------------

/** The era's sky: banded gold haze with a low sun, a hill of olives, a temple on top. */
function greekSky(): string {
  const W = 240;
  const H = 96;
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const band =
        y < 18
          ? "T"
          : y < 22
            ? (x + y) % 2
              ? "T"
              : "t"
            : y < 40
              ? "t"
              : y < 44
                ? (x + y) % 2
                  ? "t"
                  : "Y"
                : "Y";
      pic.set(x, y, band);
    }
  }
  // Sun.
  for (let y = 26; y < 46; y++)
    for (let x = 150; x < 190; x++) {
      const d = Math.hypot(x - 170, (y - 36) * 1.1);
      if (d < 8) pic.set(x, y, "w");
      else if (d < 11) pic.set(x, y, (x + y) % 2 ? "y" : "Y");
    }
  // The hill, olives on its flank, a temple on its brow.
  for (let x = 0; x < W; x++) {
    const top = Math.round(70 - 22 * Math.exp(-(((x - 110) / 70) ** 2)) + Math.sin(x * 0.11) * 1.5);
    for (let y = top; y < H; y++) pic.set(x, y, y === top ? "l" : y < top + 2 ? "o" : "O");
  }
  for (let i = 0; i < 26; i++) {
    const x = 12 + i * 9 + (i % 3) * 2;
    const top = Math.round(70 - 22 * Math.exp(-(((x - 110) / 70) ** 2))) + 4 + (i % 4) * 3;
    pic.put(".oo.\nolOo\n.OO.", x, top);
  }
  const tx = 92;
  const ty = 40;
  pic.put(
    `
      ......kkkkkkkkkkkkkkkkkkkk......
      ....kkkkkkkkkkkkkkkkkkkkkkkk....
      ..wwwwwwwwwwwwwwwwwwwwwwwwwwww..
      ..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..
      ...wK.wK.wK.wK.wK.wK.wK.wK.wK...
      ...wK.wK.wK.wK.wK.wK.wK.wK.wK...
      ...wK.wK.wK.wK.wK.wK.wK.wK.wK...
      ...wK.wK.wK.wK.wK.wK.wK.wK.wK...
      ...wK.wK.wK.wK.wK.wK.wK.wK.wK...
      ..kkkkkkkkkkkkkkkkkkkkkkkkkkkk..
      .KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.
    `,
    tx,
    ty,
  );
  return smooth(pic).toString();
}

/** The seam between the two skies: a ragged column of light. Two frames for its pulse. */
function seam(pulse: number): string {
  const W = 16;
  const H = 96;
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++) {
    const c = 8 + Math.round(Math.sin(y * 0.37 + 1) * 2 + Math.sin(y * 0.11) * 2);
    const half = 2 + ((y * 7 + pulse * 3) % 5 === 0 ? 1 : 0) + pulse;
    for (let x = c - half - 2; x <= c + half + 2; x++) {
      const d = Math.abs(x - c);
      const ch =
        d <= half - 2 ? "W" : d <= half - 1 ? "q" : d <= half ? "Q" : d <= half + 1 ? "s" : "P";
      pic.set(x, y, ch);
    }
  }
  return tidy(pic, "Q", "").toString();
}

/** Motes drawn into the rift: specks sliding inward, one step per frame. */
function motes(frame: number): string {
  const pic = Pic.blank(32, 24);
  const paths: (readonly [number, number, number, number, string])[] = [
    [0, 4, 1, 0.4, "*"],
    [2, 18, 1, -0.5, "+"],
    [6, 10, 1, 0.1, ","],
    [1, 14, 1, -0.1, "*"],
    [4, 2, 1, 0.6, "+"],
  ];
  for (const [x0, y0, vx, vy, ch] of paths) {
    const t = (frame * 3 + x0 * 2) % 26;
    pic.set(Math.round(x0 + vx * t), Math.round(y0 + vy * t), ch);
  }
  return pic.toString();
}

/** A page torn out of the notebook, turning over as it drifts east toward the tear. */
const PAGES = [
  `
    ..........
    .wwwww....
    .wKKKwk...
    .wwwwwwk..
    .wKKKKwk..
    .wwwwwwk..
    ..kkkkkk..
    ..........
  `,
  `
    ..........
    ...wwww...
    ..wKKKwk..
    ..wwwwwk..
    ..wKKKwk..
    ...kkkk...
    ..........
    ..........
  `,
  `
    ..........
    ..........
    ....ww....
    ...wwwk...
    ...wwwk...
    ....kk....
    ..........
    ..........
  `,
  `
    ..........
    ..........
    ..kkkkk...
    ..kwwwwk..
    ..kwKKwk..
    ..kwwwww..
    ...kkkk...
    ..........
  `,
];

export default [
  sprite({
    name: "agora-clouds",
    size: [78, 7],
    origin: [0, 0],
    palette,
    outline: false,
    frames: {
      still: CLOUDS.trim()
        .split("\n")
        .map((r) => r.trim().padEnd(78, "."))
        .join("\n"),
    },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "agora-edge",
    size: [240, 40],
    origin: [0, 39],
    palette,
    outline: false,
    frames: { still: campusEdge() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "greek-sky",
    size: [240, 96],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { still: greekSky() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "rift-seam",
    size: [16, 96],
    origin: [8, 0],
    palette,
    outline: false,
    frames: { pulse0: seam(0), pulse1: seam(1) },
    anim: { pulse: { frames: ["pulse0", "pulse1"], fps: 3 } },
  }),
  sprite({
    name: "motes",
    size: [32, 24],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`drift${i}`, motes(i)])),
    anim: {
      drift: { frames: Array.from({ length: 9 }, (_, i) => `drift${i}`), fps: 8, jump: 1 },
    },
  }),
  sprite({
    name: "page",
    size: [10, 8],
    palette,
    outline: false,
    frames: {
      turn0: PAGES[0] as string,
      turn1: PAGES[1] as string,
      turn2: PAGES[2] as string,
      turn3: PAGES[3] as string,
    },
    anim: { turn: { frames: ["turn0", "turn1", "turn2", "turn3"], fps: 5, jump: 1 } },
  }),
];
