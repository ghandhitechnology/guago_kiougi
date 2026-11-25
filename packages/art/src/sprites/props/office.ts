import {
  boxShadow,
  finish,
  frames,
  hline,
  ovalShadow,
  rect,
  shadows,
  vline,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 교무실: grey steel desks under glass, each a different depth of paper; the document tower
 * that is load-bearing by now, the copier, the kettle that is always on, and the plant nobody
 * waters.
 */

/** A sheet stack: lit top, edges below. */
function papers(p: Pic, x: number, y: number, w: number, n: number): void {
  for (let i = 0; i < n; i++) hline(p, x + (i % 2), y + n - i, w, i % 3 === 0 ? "K" : "k");
  rect(p, x, y, w, 2, "w");
}

/**
 * A teacher's desk: steel, a glass top over a timetable, a low partition behind with memos
 * stuck on it. `buried` is most desks; `tidy` is the one teacher everyone is afraid of.
 */
function teacherDesk(kind: "buried" | "tidy"): Pic {
  const W = 44;
  const p = Pic.blank(W, 40);
  // Partition behind the desk with memos.
  rect(p, 1, 1, W - 2, 12, "M");
  hline(p, 1, 1, W - 2, "K");
  rect(p, 3, 3, W - 6, 9, "S");
  if (kind === "buried") {
    for (const [x, y, c] of [
      [5, 4, "Y"],
      [10, 5, "+"],
      [16, 4, "Y"],
      [30, 5, "c"],
      [35, 4, "Y"],
    ] as const) {
      rect(p, x, y, 4, 4, c);
    }
  } else rect(p, 18, 5, 8, 5, "w");
  // Top: glass over grey steel.
  rect(p, 1, 13, W - 2, 13, "K");
  hline(p, 1, 13, W - 2, "k");
  vline(p, 1, 13, 13, "k");
  vline(p, W - 2, 14, 12, "M");
  if (kind === "buried") {
    papers(p, 3, 12, 10, 5);
    papers(p, 4, 18, 12, 3);
    papers(p, 18, 10, 8, 7);
    papers(p, 28, 15, 11, 4);
    // Binders lying open, a mug, the red pen.
    rect(p, 18, 19, 9, 5, "N");
    rect(p, 19, 20, 7, 3, "w");
    rect(p, 36, 9, 4, 5, "w");
    vline(p, 39, 10, 3, "K");
    rect(p, 37, 10, 2, 1, "U");
    hline(p, 6, 24, 6, "R");
  } else {
    rect(p, 18, 17, 9, 6, "w");
    hline(p, 18, 22, 9, "K");
    hline(p, 30, 20, 7, "N");
  }
  // Front: drawers on the right, the knee hole, steel legs.
  rect(p, 1, 26, W - 2, 13, "M");
  hline(p, 1, 26, W - 2, "K");
  rect(p, 4, 28, 20, 10, "S");
  rect(p, 26, 28, 16, 10, "M");
  for (const y of [28, 33]) {
    hline(p, 26, y, 16, "K");
    rect(p, 32, y + 2, 4, 1, "k");
  }
  return finish(p, "Y+c");
}

/** The document tower: paper on paper, binders sideways, a box at the bottom holding it up. */
const tower = (() => {
  const p = Pic.blank(20, 46);
  rect(p, 2, 34, 16, 11, "P");
  hline(p, 2, 34, 16, "E");
  vline(p, 17, 34, 11, "p");
  hline(p, 2, 39, 16, "t");
  let y = 34;
  const layers: [number, number, string][] = [
    [3, 4, "w"],
    [2, 3, "N"],
    [4, 5, "k"],
    [3, 3, "R"],
    [2, 4, "w"],
    [4, 3, "G"],
    [3, 5, "k"],
    [5, 3, "o"],
  ];
  layers.forEach(([x, h, c], i) => {
    y -= h;
    const w = 14 - (i % 3);
    rect(p, x, y, w, h, c);
    if (c === "w" || c === "k") for (let ly = y + 1; ly < y + h; ly += 2) hline(p, x, ly, w, "K");
    else hline(p, x, y, w, c === "N" ? "n" : c === "R" ? "r" : c === "G" ? "g" : "y");
  });
  // A sticky note on the top that says this is somebody's.
  rect(p, 8, y - 1, 3, 2, "Y");
  return finish(p, "Y");
})();

/** The copier: lid, glass, the panel's little screen, paper coming out the side. */
function copier(f: number): Pic {
  const p = Pic.blank(32, 34);
  // Lid and panel seen from above.
  rect(p, 1, 1, 30, 10, "k");
  hline(p, 1, 1, 30, "w");
  rect(p, 3, 3, 18, 6, "K");
  rect(p, 23, 3, 7, 6, "M");
  rect(p, 24, 4, 5, 2, f % 2 ? "c" : "9");
  p.set(25, 7, "R").set(27, 7, "g");
  // Body and drawers.
  rect(p, 1, 11, 30, 22, "K");
  hline(p, 1, 11, 30, "k");
  vline(p, 30, 11, 22, "M");
  for (const y of [18, 24]) {
    hline(p, 2, y, 28, "M");
    rect(p, 12, y + 2, 8, 1, "S");
  }
  // Output tray with a sheet riding out.
  rect(p, 0, 13, 3, 4, "M");
  rect(p, 0, 12 - (f % 2), 2, 3, "w");
  hline(p, 1, 32, 30, "S");
  return finish(p, "Rg");
}

/** The kettle on its base, steam going up in curls. */
function kettle(f: number): Pic {
  const p = Pic.blank(14, 20);
  rect(p, 3, 9, 8, 9, "K");
  hline(p, 4, 8, 6, "k");
  vline(p, 3, 9, 9, "k");
  vline(p, 10, 9, 9, "M");
  rect(p, 11, 10, 2, 5, "M");
  rect(p, 1, 10, 2, 2, "K");
  rect(p, 2, 18, 10, 2, "S");
  rect(p, 5, 13, 2, 1, "R");
  const puffs: [number, number][] = [
    [1, 5],
    [2, 3],
    [1, 1],
  ];
  puffs.forEach(([x, y], i) => {
    const t = (f + i) % 4;
    rect(p, x + (t % 2), y - (t > 1 ? 1 : 0), 2, 2, "w");
  });
  return finish(p, "Rw");
}

/** The plant: three leaves still up, the rest giving up, one on the floor already. */
const plant = (() => {
  const p = Pic.blank(20, 28);
  // Pot.
  rect(p, 5, 19, 10, 7, "t");
  hline(p, 4, 19, 12, "p");
  vline(p, 14, 20, 6, "T");
  rect(p, 6, 19, 8, 1, "U");
  // Stems and leaves: a few upright, most drooping, two brown.
  vline(p, 9, 8, 11, "2");
  vline(p, 11, 11, 8, "2");
  rect(p, 7, 4, 3, 5, "3");
  vline(p, 7, 4, 5, "4");
  rect(p, 11, 7, 3, 5, "3");
  for (let i = 0; i < 5; i++) {
    p.set(8 - i, 12 + Math.floor(i / 2), "3").set(8 - i, 13 + Math.floor(i / 2), "2");
    p.set(12 + i, 13 + Math.floor(i / 2), "3").set(12 + i, 14 + Math.floor(i / 2), "2");
  }
  rect(p, 2, 15, 3, 2, "U");
  rect(p, 16, 16, 3, 2, "u");
  // The fallen leaf.
  rect(p, 15, 26, 3, 1, "U");
  return finish(p);
})();

export default [
  frames(
    "teacher-desk",
    { buried: teacherDesk("buried"), tidy: teacherDesk("tidy") },
    { lone: "Y+c", shadow: shadows(boxShadow(44, 40, 1, 27, 42, 39, 3, 0)) },
  ),
  frames(
    "document-tower",
    { still: tower },
    { lone: "Y", shadow: boxShadow(20, 46, 2, 41, 17, 45, 2, 0) },
  ),
  frames(
    "copier",
    { idle0: copier(0), idle1: copier(1) },
    {
      lone: "Rg",
      shadow: boxShadow(32, 34, 1, 28, 30, 33, 2, 0),
      anim: { idle: { frames: ["idle0"], fps: 1 }, print: { frames: ["idle0", "idle1"], fps: 2 } },
    },
  ),
  frames("kettle", Object.fromEntries([0, 1, 2, 3].map((i) => [`steam${i}`, kettle(i)])), {
    lone: "Rw",
    shadow: ovalShadow(14, 20, 7, 19, 5, 1.2),
    anim: {
      idle: { frames: ["steam0"], fps: 1 },
      steam: { frames: ["steam0", "steam1", "steam2", "steam3"], fps: 4 },
    },
  }),
  frames("sad-plant", { still: plant }, { shadow: ovalShadow(20, 28, 11, 26, 6, 1.5) }),
];
