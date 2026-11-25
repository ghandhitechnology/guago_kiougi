import {
  boxShadow,
  finish,
  frames,
  hline,
  mounted,
  rect,
  vline,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 새벽관: steel bunk beds and single beds with the school's issue blankets, the desk with its
 * hutch, the wardrobe with a blazer on the door, the 빨래건조대 everyone dries everything on, the
 * 삼선 slipper pile at the door, and the 사감실 window with the whistle hanging beside it.
 */

/** A mattress with its blanket, seen from above with its front edge: at (x, y), w wide. */
function bedding(p: Pic, x: number, y: number, w: number, blanket: [string, string, string]): void {
  const [dark, mid, light] = blanket;
  rect(p, x, y, w, 12, "w");
  rect(p, x + 1, y + 1, 8, 4, "k");
  hline(p, x + 1, y + 1, 8, "w");
  rect(p, x + 10, y, w - 10, 12, mid);
  hline(p, x + 10, y, w - 10, light);
  for (let bx = x + 12; bx < x + w - 1; bx += 4) vline(p, bx, y + 1, 10, dark);
  rect(p, x, y + 12, w, 3, "k");
  hline(p, x, y + 14, w, "K");
}

/** A two-tier steel bunk: upper bunk above the lower, ladder on the end. */
const bunk = (() => {
  const W = 50;
  const p = Pic.blank(W, 56);
  // Posts.
  for (const x of [1, W - 4]) {
    rect(p, x, 1, 3, 54, "M");
    vline(p, x, 1, 54, "K");
  }
  // Upper bunk and its rail.
  hline(p, 4, 2, W - 8, "M");
  hline(p, 4, 3, W - 8, "K");
  bedding(p, 4, 6, W - 8, ["N", "n", "m"]);
  rect(p, 4, 21, W - 8, 2, "M");
  // Lower bunk in the shade of the upper.
  rect(p, 4, 23, W - 8, 8, "j");
  bedding(p, 4, 31, W - 8, ["X", "x", "%"]);
  rect(p, 4, 46, W - 8, 3, "M");
  hline(p, 4, 46, W - 8, "K");
  // Ladder on the right end.
  for (let y = 24; y < 46; y += 5) hline(p, W - 10, y, 6, "K");
  vline(p, W - 10, 22, 26, "M");
  // A charger cable dangling from the top bunk.
  vline(p, 20, 22, 9, "J");
  rect(p, 19, 31, 3, 2, "w");
  return finish(p);
})();

/** A single bed with a wooden frame. */
const singleBed = (() => {
  const p = Pic.blank(32, 26);
  rect(p, 1, 1, 30, 4, "u");
  hline(p, 1, 1, 30, "W");
  bedding(p, 2, 5, 28, ["5", "6", "s"]);
  rect(p, 1, 20, 30, 4, "u");
  hline(p, 1, 20, 30, "W");
  vline(p, 1, 1, 23, "U");
  vline(p, 30, 1, 23, "U");
  rect(p, 2, 24, 2, 1, "U");
  rect(p, 28, 24, 2, 1, "U");
  return finish(p);
})();

/** The dorm desk: a hutch of books above, a lamp, a mirror, the phone charging. */
const dormDesk = (() => {
  const p = Pic.blank(34, 40);
  // Hutch.
  rect(p, 1, 1, 32, 14, "u");
  hline(p, 1, 1, 32, "W");
  rect(p, 3, 3, 28, 10, "U");
  let x = 4;
  for (const [w, h, c] of [
    [2, 8, "N"],
    [3, 9, "R"],
    [2, 7, "w"],
    [2, 9, "G"],
    [3, 8, "N"],
  ] as const) {
    rect(p, x, 13 - h, w, h, c);
    x += w;
  }
  rect(p, 22, 5, 7, 7, "m");
  rect(p, 23, 6, 5, 5, "~");
  // Desk top.
  rect(p, 1, 15, 32, 9, "W");
  hline(p, 1, 15, 32, "P");
  rect(p, 4, 17, 9, 5, "w");
  vline(p, 8, 17, 5, "K");
  rect(p, 22, 18, 4, 6, "j");
  rect(p, 23, 19, 2, 3, "c");
  rect(p, 16, 16, 4, 2, "y");
  vline(p, 17, 18, 4, "M");
  // Front and drawers.
  rect(p, 1, 24, 32, 15, "u");
  hline(p, 1, 24, 32, "U");
  rect(p, 22, 26, 10, 12, "U");
  rect(p, 23, 27, 8, 4, "u");
  rect(p, 23, 33, 8, 4, "u");
  rect(p, 26, 28, 2, 1, "K");
  rect(p, 26, 34, 2, 1, "K");
  hline(p, 1, 38, 32, "b");
  return finish(p, "y");
})();

/** The wardrobe, one door ajar with the blazer hanging on it. */
function wardrobe(open: boolean): Pic {
  const p = Pic.blank(28, 52);
  rect(p, 1, 1, 26, 4, "u");
  hline(p, 1, 1, 26, "W");
  rect(p, 1, 5, 26, 46, "u");
  vline(p, 26, 5, 46, "U");
  vline(p, 13, 5, 44, "U");
  for (const x of [3, 15]) {
    rect(p, x, 8, 9, 18, "W");
    rect(p, x, 30, 9, 16, "W");
    vline(p, x + 8, 8, 18, "u");
    vline(p, x + 8, 30, 16, "u");
  }
  rect(p, 11, 26, 1, 4, "K");
  rect(p, 15, 26, 1, 4, "K");
  if (open) {
    rect(p, 14, 6, 12, 43, "B");
    // The blazer on its hanger, the 과잠 behind it.
    hline(p, 16, 8, 8, "K");
    rect(p, 16, 10, 9, 22, "N");
    hline(p, 16, 10, 9, "n");
    rect(p, 19, 10, 3, 6, "w");
    vline(p, 20, 16, 14, "v");
    rect(p, 23, 12, 3, 24, "R");
    rect(p, 26, 6, 2, 43, "W");
  }
  hline(p, 1, 50, 26, "b");
  return finish(p);
}

/** 빨래건조대: the folding rack, socks, a shirt, a towel, the gym kit. */
const dryingRack = (() => {
  const W = 40;
  const p = Pic.blank(W, 30);
  // Wings and rails.
  hline(p, 1, 3, W - 2, "K");
  hline(p, 1, 9, W - 2, "K");
  for (const x of [2, 19, W - 3]) vline(p, x, 3, 25, "M");
  p.set(3, 28, "M").set(W - 4, 28, "M");
  // Laundry.
  rect(p, 4, 3, 10, 11, "w");
  rect(p, 5, 3, 2, 3, "k");
  rect(p, 11, 3, 2, 3, "k");
  hline(p, 4, 13, 10, "k");
  rect(p, 15, 4, 3, 6, "+");
  hline(p, 15, 9, 4, "&");
  rect(p, 21, 3, 9, 14, "c");
  hline(p, 21, 16, 9, "9");
  for (let y = 5; y < 15; y += 3) hline(p, 21, y, 9, "~");
  rect(p, 31, 9, 4, 7, "R");
  rect(p, 35, 9, 3, 5, "N");
  hline(p, 31, 15, 4, "q");
  // A pair of socks on the low rail.
  rect(p, 6, 20, 2, 5, "j");
  rect(p, 9, 20, 2, 5, "j");
  hline(p, 1, 20, W - 2, "K");
  return finish(p);
})();

/** The 삼선 slipper pile at a room door: navy slippers with three white stripes, everywhere. */
const slipperPile = (() => {
  const p = Pic.blank(30, 14);
  const one = (x: number, y: number, flipped: boolean) => {
    rect(p, x, y, 7, 4, "v");
    hline(p, x, y, 7, "N");
    for (const k of [1, 3, 5]) vline(p, x + (flipped ? 6 - k : k), y, 3, "w");
  };
  one(1, 2, false);
  one(9, 1, true);
  one(5, 7, true);
  one(14, 6, false);
  one(21, 3, false);
  one(22, 8, true);
  return finish(p);
})();

/**
 * 사감실 window: a sliding glass hatch in the wall, the desk lamp on inside, the roll call
 * sheet clipped to the sill, the whistle hanging on its red cord by the frame.
 */
function sagamWindow(lit: boolean): Pic {
  const W = 48;
  const p = Pic.blank(W, 32);
  rect(p, 0, 0, W, 26, "d");
  rect(p, 2, 2, W - 4, 22, lit ? "P" : "j");
  // Inside: shelf of binders, the lamp, a monitor's back.
  rect(p, 4, 4, 18, 5, "U");
  for (let x = 5; x < 21; x += 3) rect(p, x, 5, 2, 4, x % 2 ? "N" : "R");
  rect(p, 28, 8, 8, 2, "6");
  vline(p, 31, 10, 6, "M");
  hline(p, 29, 10, 6, lit ? "Y" : "M");
  rect(p, 36, 12, 8, 8, "I");
  // Sliding glass, half open, its frame and glint.
  rect(p, 24, 2, 1, 22, "K");
  for (let i = 0; i < 7; i++) p.set(28 + i, 21 - i, "w").set(29 + i, 21 - i, "w");
  // Sill and the roll call clipboard.
  rect(p, 0, 22, W, 4, "w");
  hline(p, 0, 23, W, "k");
  hline(p, 0, 24, W, "K");
  hline(p, 0, 25, W, "M");
  hline(p, 1, 26, W - 2, "d");
  rect(p, 6, 19, 10, 4, "U");
  rect(p, 7, 18, 8, 4, "w");
  hline(p, 8, 19, 6, "K");
  return finish(p, "Y");
}

/** The whistle on its hook, hung by the window: a red cord and the steel whistle. */
const whistle = (() => {
  const p = Pic.blank(8, 16);
  rect(p, 3, 0, 2, 2, "M");
  for (let y = 2; y < 11; y++) p.set(y % 2 ? 2 : 3, y, "R").set(y % 2 ? 5 : 4, y, "R");
  rect(p, 2, 11, 4, 3, "K");
  hline(p, 2, 11, 4, "w");
  rect(p, 6, 12, 1, 1, "M");
  return finish(p, "M");
})();

/** The 사감 desk: the 벌점 ledger open, the sign-out sheet, the intercom handset. */
const sagamDesk = (() => {
  const W = 40;
  const p = Pic.blank(W, 26);
  rect(p, 1, 1, W - 2, 11, "K");
  hline(p, 1, 1, W - 2, "k");
  rect(p, 4, 3, 12, 7, "w");
  vline(p, 10, 3, 7, "K");
  for (let y = 4; y < 9; y += 2) {
    hline(p, 5, y, 4, "K");
    hline(p, 11, y, 4, "R");
  }
  rect(p, 20, 3, 7, 7, "U");
  rect(p, 21, 4, 5, 5, "w");
  rect(p, 30, 3, 6, 5, "I");
  rect(p, 31, 2, 4, 2, "j");
  rect(p, 1, 12, W - 2, 13, "M");
  hline(p, 1, 12, W - 2, "K");
  rect(p, 4, 14, 14, 9, "S");
  rect(p, 22, 14, 15, 9, "M");
  hline(p, 22, 18, 15, "K");
  return finish(p);
})();

export default [
  frames("bunk-bed", { still: bunk }, { shadow: boxShadow(50, 56, 1, 48, 48, 55, 3, 0) }),
  frames("single-bed", { still: singleBed }, { shadow: boxShadow(32, 26, 1, 20, 30, 25, 3, 0) }),
  frames(
    "dorm-desk",
    { still: dormDesk },
    { lone: "y", shadow: boxShadow(34, 40, 1, 25, 32, 39, 3, 0) },
  ),
  frames(
    "wardrobe",
    { shut: wardrobe(false), open: wardrobe(true) },
    { shadow: boxShadow(28, 52, 1, 46, 26, 51, 3, 0) },
  ),
  frames("drying-rack", { still: dryingRack }, { shadow: boxShadow(40, 30, 2, 26, 37, 29, 2, 0) }),
  frames("slipper-pile", { still: slipperPile }),
  frames(
    "sagam-window",
    { lit: sagamWindow(true), dark: sagamWindow(false) },
    { lone: "Y", origin: mounted([48, 32], 12) },
  ),
  frames("whistle-hook", { still: whistle }, { lone: "M", origin: mounted([8, 16], 22) }),
  frames("sagam-desk", { still: sagamDesk }, { shadow: boxShadow(40, 26, 1, 12, 38, 25, 3, 0) }),
];
