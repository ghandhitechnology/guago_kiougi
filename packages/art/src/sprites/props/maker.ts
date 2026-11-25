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
  shadows,
  vline,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 메이커실, 가설관 1F: where study materials are made and made stronger (PLAN §8). Two
 * stations people stand at for hours: the 제본대, a heavy bench with a cast-iron press, and the
 * 제련기, a fire-brick forge under a steel hood. Around them a 3D printer that is always
 * printing something, the tool wall, a vise bench, shelves of stock.
 *
 * The forge's coals and mouth are drawn in `gold.light` and `gold.pale`, which no theme dims.
 */

// 제련기 -----------------------------------------------------------------------------------------

/** Coal bed seen from above, frame by frame: which cells burn brightest moves around. */
const COALS = [
  ["oyYyo", "yYwYy", "oyYyo"],
  ["yYyoo", "Ywyyo", "oyYYy"],
  ["oyYYy", "yyYwY", "ooyYy"],
  ["oyyYo", "yYwYy", "yYyoo"],
];

function forge(f: number): Pic {
  const W = 64;
  const p = Pic.blank(W, 50);
  // Hearth top: a steel plate around the fire pot.
  rect(p, 1, 1, W - 2, 14, "M");
  hline(p, 1, 1, W - 2, "k");
  vline(p, 1, 1, 14, "K");
  rect(p, 2, 2, W - 4, 12, "K");
  hline(p, 2, 13, W - 4, "M");
  // Fire pot: firebrick rim, the coals.
  rect(p, 16, 3, 32, 10, "C");
  rect(p, 17, 4, 30, 8, "O");
  const rows = COALS[f % COALS.length] as string[];
  rows.forEach((row, ry) => {
    for (let cx = 0; cx < 15; cx++) {
      const ch = row[(cx + ry) % row.length] as string;
      rect(p, 18 + cx * 2, 5 + ry * 2, 2, 2, ch);
    }
  });
  // Tools resting on the plate: tongs, a poker.
  hline(p, 4, 5, 9, "I");
  hline(p, 4, 7, 9, "I");
  rect(p, 4, 5, 1, 3, "I");
  hline(p, 51, 10, 9, "i");
  rect(p, 50, 9, 2, 2, "I");
  // Front: firebrick in courses, lit from the left.
  rect(p, 1, 15, W - 2, 33, "T");
  for (let y = 15; y < 48; y++) {
    const course = Math.floor((y - 15) / 4);
    if ((y - 15) % 4 === 3) hline(p, 1, y, W - 2, "C");
    else {
      for (let x = 1 + (course % 2) * 4; x < W - 1; x += 8) p.set(x, y, "C");
    }
  }
  hline(p, 1, 15, W - 2, "t");
  vline(p, W - 2, 15, 33, "C");
  // The mouth: an arched opening in an iron frame, glowing.
  rect(p, 21, 21, 24, 19, "J");
  rect(p, 22, 22, 22, 17, "I");
  hline(p, 23, 21, 20, "i");
  const glow = ["Y", "Y", "y", "Y"][f % 4] as string;
  rect(p, 24, 24, 18, 14, "o");
  rect(p, 25, 23, 16, 1, "o");
  rect(p, 26, 26, 14, 11, "y");
  rect(p, 28, 28, 10, 9, glow);
  rect(p, 30, 30, 6, 6, "w");
  // Embers in the mouth.
  const embers = [
    [25, 34],
    [37, 28],
    [27, 27],
    [36, 35],
  ];
  const [ex, ey] = embers[f % embers.length] as [number, number];
  rect(p, ex, ey, 2, 1, "r");
  // Ash lip and the iron sill.
  rect(p, 20, 40, 26, 2, "I");
  hline(p, 20, 40, 26, "i");
  // The hand-crank blower on the left.
  rect(p, 3, 20, 10, 10, "I");
  rect(p, 4, 21, 8, 8, "i");
  rect(p, 6, 23, 4, 4, "I");
  const crank = [
    [7, 17],
    [12, 21],
    [7, 30],
    [2, 25],
  ][f % 4] as [number, number];
  hline(p, 7, 25, 1, "M");
  p.set(crank[0], crank[1], "R").set(crank[0] + 1, crank[1], "R");
  vline(p, 7, 30, 6, "I");
  // Plinth.
  rect(p, 0, 46, W, 3, "C");
  hline(p, 0, 46, W, "T");
  return finish(p, "R");
}

/** The hood over the forge: a steel cone and its duct up through the ceiling, glow underneath. */
function hood(f: number): Pic {
  const p = Pic.blank(68, 56);
  // Duct up into the ceiling, banded at its joints.
  rect(p, 27, 0, 14, 36, "M");
  vline(p, 27, 0, 36, "K");
  vline(p, 28, 0, 36, "k");
  vline(p, 40, 0, 36, "S");
  for (let y = 4; y < 36; y += 10) {
    hline(p, 27, y, 14, "K");
    hline(p, 27, y + 1, 14, "S");
  }
  // The cone.
  for (let y = 34; y < 51; y++) {
    const half = 8 + Math.floor((y - 34) * 1.45);
    const x0 = 34 - half;
    rect(p, x0, y, half * 2, 1, "K");
    p.set(x0, y, "k")
      .set(x0 + 1, y, "k")
      .set(x0 + 2, y, "w");
    p.set(x0 + half * 2 - 1, y, "S").set(x0 + half * 2 - 2, y, "M");
  }
  for (const x of [16, 25, 34, 43, 52]) for (let y = 47; y < 51; y++) p.set(x, y, "M");
  // Lip: soot, and the coals' glow caught underneath.
  hline(p, 9, 51, 50, "S");
  hline(p, 9, 52, 50, f % 2 ? "O" : "o");
  hline(p, 11, 53, 46, "I");
  return finish(p);
}

const FORGE_FRAMES = Array.from({ length: 4 }, (_, i) => `burn${i}`);

const forgeSprite = sprite({
  name: "forge",
  group: "interior",
  size: [64, 50],
  palette: IL,
  lone: "R",
  shadow: boxShadow(64, 50, 0, 40, 63, 49, 3, 0),
  frames: Object.fromEntries(FORGE_FRAMES.map((k, i) => [k, forge(i).toString()])),
  anim: {
    idle: { frames: ["burn0"], fps: 1 },
    burn: { frames: FORGE_FRAMES, fps: 6 },
  },
});

/** Overhead art: placed at the forge's own anchor, it hangs over the hearth. */
const hoodSprite = sprite({
  name: "forge-hood",
  group: "interior",
  size: [68, 56],
  origin: [34, 56 + 47],
  palette: IL,
  frames: { glow0: hood(0).toString(), glow1: hood(1).toString() },
  anim: { idle: { frames: ["glow0"], fps: 1 }, glow: { frames: ["glow0", "glow1"], fps: 3 } },
});

/** The anvil on its stump. */
const anvil = (() => {
  const p = Pic.blank(24, 20);
  // Face and horn seen from above-front.
  rect(p, 2, 2, 18, 3, "i");
  hline(p, 2, 2, 18, "K");
  hline(p, 1, 3, 2, "i");
  p.set(0, 3, "I");
  rect(p, 20, 2, 3, 3, "I");
  rect(p, 3, 5, 16, 3, "I");
  rect(p, 7, 8, 8, 3, "I");
  vline(p, 7, 8, 3, "i");
  rect(p, 4, 11, 14, 2, "I");
  hline(p, 4, 11, 14, "i");
  // Stump.
  rect(p, 5, 13, 12, 6, "U");
  hline(p, 5, 13, 12, "u");
  vline(p, 16, 13, 6, "b");
  vline(p, 8, 14, 4, "b");
  vline(p, 12, 15, 3, "b");
  return finish(p);
})();

/** The quench bucket, water dark, a ring of rust. */
const quench = (() => {
  const p = Pic.blank(14, 14);
  rect(p, 1, 1, 12, 4, "M");
  rect(p, 2, 2, 10, 2, "8");
  hline(p, 3, 2, 4, "9");
  rect(p, 1, 5, 12, 8, "K");
  vline(p, 1, 5, 8, "k");
  vline(p, 12, 5, 8, "M");
  hline(p, 1, 7, 12, "T");
  hline(p, 1, 11, 12, "M");
  return finish(p);
})();

// 제본대 ----------------------------------------------------------------------------------------

/**
 * The bindery bench: thick maple, a green cutting mat with its grid, the cast-iron press in the
 * middle with its red wheel, signatures stacked to be sewn, thread, the glue pot, a finished
 * book. Drawers below for everything else.
 */
const bindery = (() => {
  const W = 80;
  const p = Pic.blank(W, 53);
  const top = 16;
  const y0 = 20;
  // Top.
  rect(p, 1, y0, W - 2, top, "W");
  hline(p, 1, y0, W - 2, "P");
  vline(p, 1, y0, top, "P");
  vline(p, W - 2, y0 + 1, top - 1, "u");
  // Cutting mat, its grid.
  rect(p, 4, y0 + 2, 22, 12, "6");
  for (let x = 4; x < 26; x += 4) vline(p, x, y0 + 2, 12, "D");
  for (let y = y0 + 4; y < y0 + 14; y += 4) hline(p, 4, y, 22, "D");
  hline(p, 4, y0 + 2, 22, "s");
  // A folded signature and the bone folder on the mat.
  rect(p, 9, y0 + 5, 10, 6, "w");
  vline(p, 14, y0 + 5, 6, "K");
  hline(p, 17, y0 + 11, 7, "k");
  // Press: base plate, two columns under an arched crown, the screw, the handwheel on top,
  // a book block clamped between boards.
  const cx = 41;
  for (let y = 0; y < 7; y++) {
    for (let x = cx - 11; x <= cx + 11; x++) {
      const d = ((x + 0.5 - (cx + 0.5)) / 11) ** 2 + ((y + 0.5 - 3.5) / 3.5) ** 2;
      if (d <= 1 && d > 0.42) p.set(x, y, y < 3 ? (x < cx ? "r" : "R") : x > cx ? "q" : "R");
    }
  }
  hline(p, cx - 9, 3, 19, "q");
  rect(p, cx - 1, 2, 3, 3, "I");
  rect(p, cx - 1, 6, 3, 6, "M");
  vline(p, cx - 1, 6, 6, "K");
  rect(p, cx - 9, 11, 19, 2, "I");
  rect(p, cx - 11, 13, 23, 3, "I");
  hline(p, cx - 9, 11, 19, "i");
  hline(p, cx - 11, 13, 2, "i");
  for (const x of [cx - 11, cx + 9]) {
    rect(p, x, 13, 3, y0 + 6 - 13, "I");
    vline(p, x, 13, y0 + 6 - 13, "i");
  }
  rect(p, cx - 7, 16, 15, 2, "i");
  hline(p, cx - 7, 17, 15, "I");
  rect(p, cx - 7, 18, 15, 2, "U");
  rect(p, cx - 6, 20, 13, y0 - 16, "w");
  for (let y = 21; y < y0 + 3; y += 2) hline(p, cx - 6, y, 13, "k");
  rect(p, cx - 7, y0 + 3, 15, 2, "U");
  rect(p, cx - 12, y0 + 5, 25, 5, "I");
  hline(p, cx - 12, y0 + 5, 25, "i");
  // Stacked signatures waiting to be sewn, thread spools, glue pot, a finished book.
  for (let i = 0; i < 4; i++) {
    rect(p, 55, y0 + 9 - i * 2, 11, 2, i % 2 ? "k" : "w");
    vline(p, 65, y0 + 9 - i * 2, 2, "K");
  }
  rect(p, 55, y0 + 11, 11, 1, "K");
  rect(p, 69, y0 + 2, 2, 3, "R");
  rect(p, 72, y0 + 2, 2, 3, "N");
  rect(p, 75, y0 + 2, 2, 3, "o");
  rect(p, 69, y0 + 8, 5, 5, "w");
  rect(p, 70, y0 + 9, 3, 2, "P");
  vline(p, 73, y0 + 5, 4, "U");
  rect(p, 56, y0 + 2, 8, 4, "N");
  hline(p, 56, y0 + 2, 8, "n");
  vline(p, 57, y0 + 2, 4, "w");
  // Front: drawers.
  rect(p, 1, y0 + top, W - 2, 15, "u");
  hline(p, 1, y0 + top, W - 2, "U");
  vline(p, W - 2, y0 + top, 15, "U");
  for (const x of [4, 28, 52]) {
    rect(p, x, y0 + top + 3, 22, 8, "U");
    rect(p, x + 1, y0 + top + 4, 20, 6, "u");
    hline(p, x + 1, y0 + top + 4, 20, "W");
    rect(p, x + 9, y0 + top + 6, 4, 2, "K");
  }
  hline(p, 1, y0 + top + 14, W - 2, "U");
  return finish(p);
})();

// 3D printer ------------------------------------------------------------------------------------

function printer(f: number): Pic {
  const p = Pic.blank(26, 32);
  // Frame of black extrusion.
  rect(p, 1, 1, 24, 30, "I");
  rect(p, 3, 3, 20, 22, "j");
  vline(p, 1, 1, 30, "i");
  hline(p, 1, 1, 24, "i");
  // Bed and the half-printed thing on it.
  rect(p, 4, 19, 18, 3, "S");
  hline(p, 4, 19, 18, "M");
  rect(p, 9, 13, 8, 6, "t");
  rect(p, 10, 12, 6, 1, "t");
  hline(p, 9, 13, 8, "p");
  for (let y = 14; y < 19; y += 2) hline(p, 9, y, 8, "T");
  // Gantry and print head, moving.
  hline(p, 3, 8, 20, "M");
  const hx = [5, 9, 13, 9][f % 4] as number;
  rect(p, hx, 6, 6, 5, "w");
  rect(p, hx + 2, 11, 2, 1, "y");
  // Spool on top.
  rect(p, 8, 0, 10, 3, "t");
  hline(p, 8, 0, 10, "p");
  // Control panel and LED.
  rect(p, 4, 26, 12, 3, "J");
  rect(p, 5, 27, 6, 1, "c");
  rect(p, 18, 27, 2, 1, f % 2 ? "c" : "9");
  return finish(p, "y");
}

const printerSprite = sprite({
  name: "printer-3d",
  group: "interior",
  size: [26, 32],
  palette: IL,
  lone: "y",
  shadow: boxShadow(26, 32, 1, 27, 24, 31, 2, 0),
  frames: Object.fromEntries([0, 1, 2, 3].map((i) => [`print${i}`, printer(i).toString()])),
  anim: {
    idle: { frames: ["print0"], fps: 1 },
    print: { frames: ["print0", "print1", "print2", "print3"], fps: 3 },
  },
});

// Tool wall ---------------------------------------------------------------------------------------

/** A pegboard with every tool's outline drawn behind it, and most of the tools still there. */
const toolWall = (() => {
  const W = 64;
  const p = Pic.blank(W, 30);
  rect(p, 0, 0, W, 30, "u");
  hline(p, 0, 0, W, "W");
  vline(p, 0, 0, 30, "W");
  // Peg holes in pairs.
  for (let y = 3; y < 28; y += 4) for (let x = 3; x < W - 2; x += 6) rect(p, x, y, 2, 1, "U");
  // Hammer.
  rect(p, 4, 4, 2, 14, "U");
  vline(p, 4, 4, 14, "W");
  rect(p, 2, 3, 6, 3, "I");
  hline(p, 2, 3, 6, "i");
  // Saw.
  rect(p, 11, 4, 12, 6, "K");
  hline(p, 11, 4, 12, "k");
  for (let x = 11; x < 23; x += 2) p.set(x, 10, "M").set(x + 1, 10, "M");
  rect(p, 23, 3, 3, 8, "R");
  // Pliers, the missing one's outline beside them.
  rect(p, 29, 4, 2, 6, "R");
  rect(p, 32, 4, 2, 6, "R");
  rect(p, 30, 10, 3, 5, "I");
  for (let y = 4; y < 15; y++) p.set(37, y, "U").set(41, y, "U");
  hline(p, 37, 4, 5, "U");
  hline(p, 37, 14, 5, "U");
  // Wrenches.
  for (const [x, h] of [
    [46, 12],
    [50, 10],
    [54, 8],
  ] as const) {
    rect(p, x, 4, 2, h, "K");
    rect(p, x - 1, 3, 4, 2, "M");
  }
  // Screwdrivers.
  for (const [x, c] of [
    [5, "o"],
    [9, "N"],
    [13, "R"],
    [17, "G"],
  ] as const) {
    rect(p, x + 16, 18, 2, 4, c);
    rect(p, x + 16, 22, 1, 5, "M");
  }
  // Tape measure, a coil of wire, safety goggles.
  rect(p, 4, 21, 6, 6, "o");
  rect(p, 5, 22, 4, 4, "O");
  hline(p, 4, 21, 6, "y");
  rect(p, 42, 18, 8, 8, "T");
  rect(p, 44, 20, 4, 4, "u");
  hline(p, 42, 18, 8, "t");
  rect(p, 53, 19, 8, 4, "c");
  rect(p, 53, 21, 8, 1, "I");
  hline(p, 53, 19, 8, "~");
  return finish(p, "y~");
})();

// Benches and stock ---------------------------------------------------------------------------

/** A steel-legged bench with a vise on one end, a box of offcuts under it. */
const viseBench = (() => {
  const W = 52;
  const p = Pic.blank(W, 32);
  rect(p, 1, 6, W - 2, 11, "u");
  hline(p, 1, 6, W - 2, "W");
  vline(p, 1, 6, 11, "W");
  // Vise.
  rect(p, 38, 1, 12, 6, "R");
  hline(p, 38, 1, 12, "r");
  rect(p, 40, 4, 8, 3, "I");
  hline(p, 36, 3, 3, "M");
  // Scraps on the top.
  rect(p, 6, 9, 9, 4, "W");
  hline(p, 6, 12, 9, "U");
  rect(p, 18, 8, 6, 3, "K");
  rect(p, 27, 10, 6, 2, "o");
  // Edge and legs.
  rect(p, 1, 17, W - 2, 3, "U");
  hline(p, 1, 17, W - 2, "u");
  for (const x of [2, W - 5]) {
    rect(p, x, 20, 3, 11, "M");
    vline(p, x, 20, 11, "K");
  }
  // Box underneath.
  rect(p, 14, 22, 20, 8, "P");
  hline(p, 14, 22, 20, "p");
  rect(p, 16, 20, 4, 2, "W");
  rect(p, 24, 19, 3, 3, "u");
  return finish(p);
})();

/** Steel shelving: planks, sheet stock, rolls of paper and boxes of parts. */
const stockShelf = (() => {
  const W = 38;
  const p = Pic.blank(W, 46);
  for (const x of [1, W - 4]) {
    rect(p, x, 1, 3, 44, "M");
    vline(p, x, 1, 44, "K");
  }
  for (const y of [11, 23, 35]) {
    rect(p, 1, y, W - 2, 3, "K");
    hline(p, 1, y, W - 2, "k");
    hline(p, 1, y + 2, W - 2, "M");
  }
  rect(p, 1, 43, W - 2, 2, "M");
  // Top shelf: paper rolls.
  for (const [x, c] of [
    [5, "w"],
    [12, "P"],
    [19, "w"],
    [26, "m"],
  ] as const) {
    rect(p, x, 4, 6, 7, c);
    rect(p, x + 2, 4, 2, 2, "K");
  }
  // Middle: boxes of parts.
  rect(p, 5, 15, 12, 8, "p");
  hline(p, 5, 15, 12, "P");
  rect(p, 9, 17, 4, 2, "w");
  rect(p, 19, 17, 14, 6, "N");
  hline(p, 19, 17, 14, "n");
  // Bottom: planks and sheet metal on edge.
  for (let x = 5; x < 20; x += 3) {
    rect(p, x, 26, 2, 9, "W");
    vline(p, x + 1, 26, 9, "u");
  }
  rect(p, 22, 27, 11, 8, "K");
  vline(p, 22, 27, 8, "k");
  vline(p, 27, 27, 8, "M");
  // Floor level: a crate.
  rect(p, 6, 38, 14, 5, "U");
  hline(p, 6, 38, 14, "u");
  return finish(p);
})();

/** A pendant lamp on a long cord: enamel shade, the bulb glowing under it. Overhead art. */
function pendant(on: boolean): Pic {
  const p = Pic.blank(14, 26);
  vline(p, 6, 0, 16, "I");
  rect(p, 5, 15, 3, 2, "I");
  rect(p, 2, 17, 10, 4, "6");
  hline(p, 3, 17, 8, "s");
  rect(p, 1, 20, 12, 2, "D");
  hline(p, 1, 21, 12, "5");
  if (on) {
    rect(p, 4, 22, 6, 2, "Y");
    hline(p, 5, 24, 4, "y");
  } else rect(p, 4, 22, 6, 2, "K");
  return finish(p, "Yy");
}

/** Sparks rising off the forge: atmosphere, drawn over everything. */
function sparks(f: number): Pic {
  const p = Pic.blank(24, 30);
  const paths: [number, number, number][] = [
    [6, 0, 0],
    [14, 2, 7],
    [19, 1, 13],
    [10, 3, 19],
  ];
  for (const [x, drift, phase] of paths) {
    const t = (f * 5 + phase) % 26;
    const y = 28 - t;
    const xx = x + Math.round(Math.sin((t + phase) / 4) * drift);
    p.set(xx, y, t < 8 ? "Y" : t < 18 ? "y" : "o");
  }
  return p;
}

const sparkSprite = sprite({
  name: "sparks",
  group: "interior",
  size: [24, 30],
  palette: IL,
  lone: "Yyo",
  outline: false,
  frames: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`s${i}`, sparks(i).toString()])),
  anim: {
    idle: { frames: ["s0"], fps: 1 },
    rise: { frames: Array.from({ length: 6 }, (_, i) => `s${i}`), fps: 8, jump: 1 },
  },
});

/** Marks on the floor, to lay in `details`: offcuts and sawdust, a scorch, a puddle. */
const floorMarks = sprite({
  name: "floor-marks",
  group: "interior",
  size: [24, 12],
  origin: [0, 0],
  palette: IL,
  lone: "w~",
  outline: false,
  frames: {
    scraps: `
      ........................
      ..ww.......pp...........
      .wwk......ppp.....kk....
      ..k.............kkw.....
      .......LL.........k.....
      ......LLLL..ww..........
      .......LL..wkk.....pp...
      ............k.....ppp...
      ..pp....................
      .ppp......kk...LL.......
      .........kwk..LLLL......
      ..........k....LL.......
    `,
    scorch: `
      ........................
      ........MMMM............
      .....MMMSSSSMM..........
      ....MMSSIISSSMM.........
      ...MMSSIIIISSSM.........
      ....MSSSIISSSMM.........
      .....MMSSSSMMM..........
      .......MMMM.............
      ........................
      ........................
      ........................
      ........................
    `,
    puddle: `
      ........................
      .....999999.............
      ...99cc99999999.........
      ..999~c999999999........
      ...99999999cc999........
      .....99999999999........
      ........99999...........
      ........................
      ........................
      ........................
      ........................
      ........................
    `,
  },
  anim: { idle: { frames: ["scraps"], fps: 1 } },
});

/** The big worktable: clamps, a laptop, the cardboard robot some club has been building since March. */
const worktable = (() => {
  const W = 72;
  const p = Pic.blank(W, 40);
  const y0 = 8;
  rect(p, 1, y0, W - 2, 16, "u");
  hline(p, 1, y0, W - 2, "W");
  vline(p, 1, y0, 16, "W");
  vline(p, W - 2, y0 + 1, 15, "U");
  // Blueprint and pencil.
  rect(p, 5, y0 + 4, 18, 10, "m");
  for (let x = 7; x < 22; x += 4) vline(p, x, y0 + 5, 8, "n");
  hline(p, 6, y0 + 8, 16, "w");
  hline(p, 10, y0 + 12, 8, "o");
  // Laptop, open, the screen lit.
  rect(p, 27, y0 - 2, 14, 8, "j");
  rect(p, 28, y0 - 1, 12, 6, "c");
  hline(p, 28, y0 - 1, 12, "~");
  rect(p, 30, y0 + 1, 6, 1, "8");
  rect(p, 30, y0 + 3, 8, 1, "8");
  rect(p, 26, y0 + 6, 16, 4, "K");
  hline(p, 26, y0 + 6, 16, "k");
  // The cardboard robot: body, head, an arm held on with tape.
  rect(p, 49, y0 - 6, 14, 14, "P");
  hline(p, 49, y0 - 6, 14, "E");
  vline(p, 62, y0 - 6, 14, "p");
  rect(p, 52, y0 - 13, 8, 7, "P");
  hline(p, 52, y0 - 13, 8, "E");
  rect(p, 53, y0 - 10, 2, 2, "c");
  rect(p, 57, y0 - 10, 2, 2, "c");
  rect(p, 45, y0 - 2, 4, 3, "p");
  rect(p, 63, y0 - 4, 5, 3, "p");
  rect(p, 51, y0 + 1, 10, 2, "w");
  // A C-clamp on the edge.
  rect(p, 8, y0 + 14, 3, 6, "R");
  // Apron and legs.
  rect(p, 1, y0 + 16, W - 2, 3, "U");
  hline(p, 1, y0 + 16, W - 2, "u");
  for (const x of [3, W - 6]) {
    rect(p, x, y0 + 19, 3, 12, "U");
    vline(p, x, y0 + 19, 12, "u");
  }
  hline(p, 6, y0 + 27, W - 12, "U");
  return finish(p, "c");
})();

/**
 * 재단기: the guillotine paper cutter on its iron stand, the blade arm raised, the red handle at
 * its end. Every book that leaves the 제본대 is trimmed here.
 */
const guillotine = (() => {
  const p = Pic.blank(34, 44);
  // Cutting table with its measuring grid.
  rect(p, 2, 18, 30, 10, "6");
  hline(p, 2, 18, 30, "s");
  for (let x = 6; x < 32; x += 5) vline(p, x, 19, 9, "D");
  rect(p, 2, 28, 30, 3, "I");
  hline(p, 2, 28, 30, "i");
  // A stack of sheets squared against the back fence.
  rect(p, 10, 19, 14, 5, "w");
  hline(p, 10, 23, 14, "K");
  hline(p, 2, 18, 30, "M");
  // The blade bar, pivoting at the back left, raised to the right.
  for (let i = 0; i < 22; i++) {
    const x = 3 + i;
    const y = 17 - Math.floor(i * 0.72);
    p.set(x, y, "K")
      .set(x, y + 1, "M")
      .set(x, y + 2, "S");
  }
  rect(p, 1, 15, 4, 4, "I");
  // Handle.
  rect(p, 24, 0, 3, 3, "R");
  rect(p, 26, 0, 6, 2, "R");
  hline(p, 26, 0, 6, "r");
  // Stand.
  for (const x of [4, 27]) {
    rect(p, x, 31, 3, 12, "I");
    vline(p, x, 31, 12, "i");
  }
  hline(p, 7, 38, 20, "i");
  rect(p, 9, 33, 16, 4, "w");
  hline(p, 9, 36, 16, "K");
  return finish(p);
})();

/** A lab stool: round wooden seat, steel legs, a ring to rest your feet. */
const stool = (() => {
  const p = Pic.blank(12, 14);
  rect(p, 1, 1, 10, 4, "u");
  hline(p, 2, 1, 8, "W");
  hline(p, 1, 4, 10, "U");
  vline(p, 2, 5, 8, "M");
  vline(p, 9, 5, 8, "M");
  vline(p, 5, 5, 7, "S");
  hline(p, 2, 9, 8, "K");
  return finish(p);
})();

/** Lumber leaning on the wall, boards of different lengths. */
const lumber = (() => {
  const p = Pic.blank(22, 44);
  const boards: [number, number, string, string][] = [
    [1, 4, "W", "u"],
    [5, 0, "u", "U"],
    [9, 8, "W", "u"],
    [13, 2, "P", "p"],
    [17, 12, "u", "U"],
  ];
  for (const [x, top, face, side] of boards) {
    rect(p, x, top, 4, 43 - top, face);
    vline(p, x + 3, top, 43 - top, side);
    hline(p, x, top, 4, side === "U" ? "W" : "P");
  }
  return finish(p);
})();

/** Two sawhorses with a plank across them, half cut through, the saw left in the kerf. */
const sawhorses = (() => {
  const p = Pic.blank(46, 22);
  for (const x of [5, 33]) {
    rect(p, x, 6, 8, 2, "u");
    for (let i = 0; i < 12; i++) {
      p.set(x + 1 - Math.floor(i / 4), 8 + i, "U");
      p.set(x + 6 + Math.floor(i / 4), 8 + i, "U");
    }
  }
  rect(p, 1, 3, 44, 4, "W");
  hline(p, 1, 3, 44, "P");
  hline(p, 1, 6, 44, "u");
  vline(p, 26, 3, 4, "U");
  // The saw, blade down in the cut.
  rect(p, 24, 0, 5, 3, "K");
  rect(p, 29, 0, 4, 2, "R");
  // Sawdust under the cut.
  rect(p, 23, 19, 7, 2, "P");
  hline(p, 25, 18, 3, "P");
  return finish(p);
})();

/** Cardboard boxes, flattened sheets on top: the robot club's supply. */
const boxes = (() => {
  const p = Pic.blank(30, 26);
  rect(p, 1, 9, 16, 16, "P");
  hline(p, 1, 9, 16, "E");
  vline(p, 16, 9, 16, "p");
  hline(p, 1, 13, 16, "p");
  rect(p, 7, 13, 4, 4, "w");
  rect(p, 14, 3, 15, 22, "p");
  hline(p, 14, 3, 15, "P");
  vline(p, 28, 3, 22, "t");
  hline(p, 14, 7, 15, "t");
  rect(p, 18, 9, 7, 3, "w");
  rect(p, 2, 6, 14, 3, "P");
  hline(p, 2, 6, 14, "E");
  return finish(p);
})();

/** A red tool cart, drawers half open, a coil of extension cord on top. */
const cart = (() => {
  const p = Pic.blank(24, 26);
  rect(p, 1, 3, 22, 5, "r");
  hline(p, 1, 3, 22, "!");
  rect(p, 5, 1, 8, 4, "I");
  rect(p, 7, 2, 4, 2, "o");
  rect(p, 1, 8, 22, 14, "R");
  vline(p, 22, 8, 14, "q");
  for (const y of [9, 13, 17]) {
    hline(p, 2, y + 3, 20, "q");
    rect(p, 9, y + 1, 6, 1, "K");
  }
  rect(p, 2, 13, 20, 3, "R");
  hline(p, 2, 13, 20, "r");
  rect(p, 2, 22, 3, 3, "I");
  rect(p, 19, 22, 3, 3, "I");
  return finish(p);
})();

export default [
  forgeSprite,
  hoodSprite,
  frames("anvil", { still: anvil }, { shadow: ovalShadow(24, 20, 12, 18.5, 9, 2) }),
  frames("quench", { still: quench }, { shadow: ovalShadow(14, 14, 8, 13, 6, 1.5) }),
  frames(
    "bindery",
    { still: bindery },
    { shadow: shadows(boxShadow(80, 53, 1, 37, 78, 52, 3, 0)) },
  ),
  printerSprite,
  frames("tool-wall", { still: toolWall }, { origin: mounted([64, 30], 12) }),
  frames("vise-bench", { still: viseBench }, { shadow: boxShadow(52, 32, 1, 17, 50, 31, 3, 0) }),
  frames("stock-shelf", { still: stockShelf }, { shadow: boxShadow(38, 46, 1, 36, 36, 45, 2, 0) }),
  frames("pendant", { on: pendant(true), off: pendant(false) }, { lone: "Yy" }),
  frames(
    "worktable",
    { still: worktable },
    { lone: "c", shadow: boxShadow(72, 40, 1, 24, 70, 39, 3, 0) },
  ),
  frames("guillotine", { still: guillotine }, { shadow: boxShadow(34, 44, 2, 38, 31, 43, 2, 0) }),
  frames("stool", { still: stool }, { shadow: ovalShadow(12, 14, 7, 12.5, 5, 1.5) }),
  frames("lumber", { still: lumber }, { shadow: boxShadow(22, 44, 1, 40, 20, 43, 2, 0) }),
  frames("sawhorses", { still: sawhorses }, { shadow: boxShadow(46, 22, 3, 18, 42, 21, 2, 0) }),
  frames("boxes", { still: boxes }, { shadow: boxShadow(30, 26, 1, 20, 28, 25, 2, 0) }),
  frames("tool-cart", { still: cart }, { shadow: boxShadow(24, 26, 1, 22, 22, 25, 2, 0) }),
  floorMarks,
  sparkSprite,
];
