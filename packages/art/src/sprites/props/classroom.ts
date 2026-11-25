import {
  boxShadow,
  finish,
  frames,
  hline,
  mounted,
  ovalShadow,
  rect,
  shadows,
  vline,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 교실: wooden-topped desks on green steel frames with the book shelf under the top, chairs to
 * match, the 교탁, the blackboard and its chalk tray, the 사물함 cubbies at the back, the 청소함
 * with the mop that never dries.
 */

/** Desk top and shelf box, drawn at (x, y): 18 wide, 21 tall. */
function deskAt(p: Pic, x: number, y: number, items: "none" | "books" | "open"): void {
  // Top.
  rect(p, x, y, 18, 9, "W");
  hline(p, x, y, 18, "P");
  vline(p, x, y, 9, "P");
  vline(p, x + 17, y + 1, 8, "u");
  hline(p, x, y + 9, 18, "u");
  hline(p, x, y + 10, 18, "U");
  if (items === "books") {
    rect(p, x + 3, y + 3, 8, 4, "N");
    hline(p, x + 3, y + 3, 8, "n");
    rect(p, x + 12, y + 2, 3, 5, "w");
  }
  if (items === "open") {
    rect(p, x + 3, y + 2, 11, 6, "w");
    vline(p, x + 8, y + 2, 6, "K");
    hline(p, x + 4, y + 4, 3, "K");
    hline(p, x + 10, y + 4, 3, "K");
    hline(p, x + 4, y + 6, 3, "K");
    hline(p, x + 15, y + 5, 2, "R");
  }
  // Shelf box under the top, books inside.
  rect(p, x + 2, y + 11, 14, 4, "6");
  hline(p, x + 2, y + 11, 14, "D");
  rect(p, x + 4, y + 12, 3, 2, "R");
  rect(p, x + 8, y + 12, 4, 2, "w");
  // Green steel legs.
  for (const lx of [x + 1, x + 15]) {
    rect(p, lx, y + 11, 2, 10, "6");
    vline(p, lx + 1, y + 11, 10, "D");
  }
  hline(p, x + 3, y + 18, 12, "D");
}

/** Chair seen from behind, as it sits at its desk. */
function chairBackAt(p: Pic, x: number, y: number): void {
  rect(p, x, y, 12, 6, "u");
  hline(p, x, y, 12, "W");
  vline(p, x + 11, y, 6, "U");
  for (const lx of [x + 1, x + 9]) {
    rect(p, lx, y + 6, 2, 9, "6");
    vline(p, lx + 1, y + 6, 9, "D");
  }
  rect(p, x, y + 8, 12, 2, "W");
  hline(p, x, y + 9, 12, "u");
}

function desk(items: "none" | "books" | "open"): Pic {
  const p = Pic.blank(20, 23);
  deskAt(p, 1, 1, items);
  return finish(p);
}

function chair(view: "back" | "front"): Pic {
  const p = Pic.blank(14, 18);
  if (view === "back") chairBackAt(p, 1, 1);
  else {
    rect(p, 2, 1, 10, 5, "u");
    hline(p, 2, 1, 10, "W");
    rect(p, 1, 6, 12, 4, "W");
    hline(p, 1, 6, 12, "P");
    hline(p, 1, 9, 12, "u");
    for (const lx of [2, 10]) {
      rect(p, lx, 10, 2, 6, "6");
      vline(p, lx + 1, 10, 6, "D");
    }
  }
  return finish(p);
}

/** A desk with its chair tucked in, one piece. */
function deskChair(items: "none" | "books" | "open"): Pic {
  const p = Pic.blank(20, 30);
  deskAt(p, 1, 1, items);
  chairBackAt(p, 4, 14);
  return finish(p);
}

/** 교탁: a wooden lectern, the attendance book and the chalk box on top. */
const lectern = (() => {
  const p = Pic.blank(30, 26);
  rect(p, 1, 1, 28, 9, "W");
  hline(p, 1, 1, 28, "P");
  vline(p, 1, 1, 9, "P");
  // Attendance book, chalk box, a pointer.
  rect(p, 4, 3, 9, 5, "N");
  hline(p, 4, 3, 9, "n");
  vline(p, 8, 3, 5, "w");
  rect(p, 16, 3, 6, 4, "w");
  hline(p, 17, 4, 4, "k");
  rect(p, 17, 5, 1, 1, "R");
  rect(p, 19, 5, 1, 1, "y");
  hline(p, 3, 8, 22, "U");
  // Front panel with an inset.
  rect(p, 1, 10, 28, 15, "u");
  hline(p, 1, 10, 28, "U");
  vline(p, 28, 10, 15, "U");
  rect(p, 5, 13, 20, 9, "U");
  rect(p, 6, 14, 18, 7, "u");
  hline(p, 6, 14, 18, "W");
  rect(p, 13, 16, 4, 3, "o");
  hline(p, 1, 24, 28, "b");
  return finish(p, "Ry");
})();

/**
 * 칠판: a green board in an aluminium frame, chalk tray with stubs and the eraser. `written`
 * has today's lesson as marks nobody needs to read: a diagram, an arrow, rows of working.
 */
function blackboard(written: boolean): Pic {
  const W = 100;
  const p = Pic.blank(W, 34);
  rect(p, 0, 0, W, 30, "K");
  hline(p, 0, 0, W, "k");
  rect(p, 2, 2, W - 4, 26, "D");
  // Old chalk dust in wiped arcs.
  for (const [x, y, w] of [
    [10, 20, 14],
    [44, 9, 18],
    [70, 22, 12],
  ] as const) {
    hline(p, x, y, w, "6");
    hline(p, x + 2, y + 1, w - 4, "6");
  }
  if (written) {
    // A circuit-ish diagram on the left: a box, a loop, an arrow.
    rect(p, 8, 6, 12, 1, "w");
    rect(p, 8, 6, 1, 8, "w");
    rect(p, 19, 6, 1, 8, "w");
    rect(p, 8, 13, 12, 1, "w");
    for (let i = 0; i < 8; i++) p.set(21 + i, 9, "w");
    p.set(27, 8, "w").set(27, 10, "w").set(26, 7, "w").set(26, 11, "w");
    // Rows of working.
    for (const [x, y, w] of [
      [34, 5, 20],
      [34, 9, 26],
      [38, 13, 18],
      [34, 17, 22],
      [34, 21, 14],
      [66, 5, 16],
      [66, 9, 24],
      [70, 13, 12],
    ] as const) {
      for (let i = 0; i < w; i += 3) {
        p.set(x + i, y, "w").set(x + i + 1, y, "w");
        if (i % 6 === 0) p.set(x + i, y + 1, "w");
      }
    }
    // The answer, boxed in yellow chalk.
    rect(p, 70, 18, 14, 1, "y");
    rect(p, 70, 23, 14, 1, "y");
    rect(p, 70, 18, 1, 6, "y");
    rect(p, 83, 18, 1, 6, "y");
    hline(p, 73, 20, 2, "w");
    hline(p, 77, 20, 3, "w");
    hline(p, 74, 21, 5, "w");
  }
  // Frame shadow and the chalk tray.
  vline(p, W - 1, 1, 29, "M");
  hline(p, 0, 29, W, "M");
  rect(p, 0, 30, W, 2, "k");
  hline(p, 0, 31, W, "M");
  rect(p, 12, 28, 4, 2, "w");
  rect(p, 20, 28, 3, 2, "y");
  rect(p, 26, 28, 2, 2, "r");
  rect(p, 60, 27, 10, 3, "N");
  hline(p, 60, 27, 10, "w");
  return finish(p);
}

/** 사물함: two rows of steel cubbies, name slots, one door hanging open. */
function lockers(open: boolean): Pic {
  const W = 50;
  const p = Pic.blank(W, 32);
  rect(p, 1, 1, W - 2, 4, "k");
  hline(p, 1, 1, W - 2, "w");
  rect(p, 1, 5, W - 2, 26, "K");
  vline(p, W - 2, 5, 26, "M");
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const x = 2 + c * 12;
      const y = 6 + r * 12;
      rect(p, x, y, 11, 11, "K");
      hline(p, x, y, 11, "k");
      vline(p, x, y, 11, "k");
      vline(p, x + 10, y, 11, "M");
      hline(p, x, y + 10, 11, "M");
      rect(p, x + 3, y + 2, 5, 2, "w");
      hline(p, x + 2, y + 6, 6, "M");
      hline(p, x + 2, y + 8, 6, "M");
      rect(p, x + 8, y + 4, 1, 3, "S");
    }
  }
  // Stickers.
  rect(p, 16, 20, 3, 3, "+");
  rect(p, 40, 9, 3, 2, "c");
  if (open) {
    // Door swung open: the cubby inside, a gym bag spilling out.
    rect(p, 26, 6, 11, 11, "I");
    rect(p, 27, 7, 9, 3, "N");
    rect(p, 27, 10, 9, 6, "R");
    hline(p, 27, 10, 9, "r");
    rect(p, 37, 5, 3, 13, "k");
    vline(p, 39, 5, 13, "M");
  }
  hline(p, 1, 30, W - 2, "S");
  return finish(p);
}

/** 청소함: a tall steel cupboard; open, the mop, the broom and the dustpan inside. */
function cleaningCupboard(open: boolean): Pic {
  const p = Pic.blank(22, 44);
  rect(p, 1, 1, 20, 4, "m");
  hline(p, 1, 1, 20, "~");
  rect(p, 1, 5, 20, 37, "n");
  vline(p, 20, 5, 37, "N");
  vline(p, 11, 5, 37, "N");
  for (const y of [8, 10]) {
    hline(p, 3, y, 6, "N");
    hline(p, 13, y, 6, "N");
  }
  rect(p, 9, 22, 1, 4, "w");
  rect(p, 13, 22, 1, 4, "w");
  if (open) {
    rect(p, 12, 5, 9, 37, "j");
    // Mop head down in its bucket, the handle up; a broom beside it.
    vline(p, 14, 7, 28, "W");
    vline(p, 18, 9, 22, "u");
    rect(p, 16, 31, 5, 4, "o");
    rect(p, 12, 35, 8, 6, "N");
    hline(p, 12, 35, 8, "n");
    rect(p, 13, 33, 4, 3, "K");
    // The open door seen edge on.
    rect(p, 21, 5, 1, 37, "m");
  }
  hline(p, 1, 41, 20, "v");
  return finish(p);
}

/** The bucket with the mop in it, out on the floor. */
const mopBucket = (() => {
  const p = Pic.blank(16, 30);
  vline(p, 8, 0, 18, "W");
  vline(p, 9, 0, 18, "u");
  rect(p, 4, 17, 9, 4, "k");
  hline(p, 5, 18, 7, "K");
  rect(p, 2, 19, 12, 9, "R");
  hline(p, 2, 19, 12, "r");
  vline(p, 13, 19, 9, "q");
  rect(p, 4, 21, 8, 2, "8");
  hline(p, 2, 27, 12, "q");
  return finish(p);
})();

export default [
  frames(
    "school-desk",
    { none: desk("none"), books: desk("books"), open: desk("open") },
    { shadow: boxShadow(20, 23, 2, 13, 17, 22, 2, 0) },
  ),
  frames(
    "school-chair",
    { back: chair("back"), front: chair("front") },
    { shadow: ovalShadow(14, 18, 8, 16.5, 6, 1.5) },
  ),
  frames(
    "desk-chair",
    { none: deskChair("none"), books: deskChair("books"), open: deskChair("open") },
    { shadow: shadows(boxShadow(20, 30, 2, 13, 17, 29, 2, 0)) },
  ),
  frames(
    "lectern",
    { still: lectern },
    { lone: "Ry", shadow: boxShadow(30, 26, 1, 10, 28, 25, 3, 0) },
  ),
  frames(
    "blackboard",
    { written: blackboard(true), clean: blackboard(false) },
    { lone: "w", origin: mounted([100, 34], 12) },
  ),
  frames(
    "lockers",
    { shut: lockers(false), open: lockers(true) },
    { shadow: boxShadow(50, 32, 1, 26, 48, 31, 2, 0) },
  ),
  frames(
    "cleaning-cupboard",
    { shut: cleaningCupboard(false), open: cleaningCupboard(true) },
    { shadow: boxShadow(22, 44, 1, 38, 20, 43, 2, 0) },
  ),
  frames("mop-bucket", { still: mopBucket }, { shadow: ovalShadow(16, 30, 9, 28, 6, 1.6) }),
];
