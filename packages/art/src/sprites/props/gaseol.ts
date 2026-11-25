import {
  block,
  boxShadow,
  clean,
  finish,
  frames,
  hline,
  mounted,
  rect,
  rim,
  still,
  vline,
  WHITE,
  WOOD,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 가설관 and 증명관 furniture the kit did not have: the 수행평가 board everyone checks every day,
 * the steel door to places students are not meant to go, the 신발장 at the front door, the
 * trophy case nobody dusts, the 시청각실's seats and screen, the 풍동실's very expensive fan,
 * the gym's stage and curtain and wall bars, the 보건실's folding screen.
 */

// The 수행평가 board ---------------------------------------------------------------------------

/**
 * 수행평가 게시판: a long green felt board in an aluminium frame, rows of task cards pinned in
 * three colours (daily, weekly, repeatable), a header strip, the ones already taken torn off to
 * their pins. Hangs on a wall.
 */
const questBoard = (() => {
  const W = 80;
  const H = 40;
  const p = Pic.blank(W, H);
  rect(p, 0, 0, W, H, "K");
  hline(p, 0, 0, W, "w");
  vline(p, 0, 0, H, "w");
  vline(p, W - 1, 0, H, "M");
  hline(p, 0, H - 1, W, "M");
  rect(p, 2, 2, W - 4, H - 4, "D");
  hline(p, 2, 2, W - 4, "5");
  // Header strip.
  rect(p, 4, 4, W - 8, 5, "w");
  hline(p, 4, 8, W - 8, "K");
  for (let x = 8; x < W - 10; x += 5) hline(p, x, 6, 3, "M");
  // Cards: white dailies, yellow weeklies, blue repeatables; a few taken.
  const kinds = ["w", "Y", "m"] as const;
  const ink = { w: "K", Y: "o", m: "n" } as const;
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const x = 5 + col * 10 + (row % 2);
      const y = 12 + row * 8;
      k++;
      if (k % 9 === 4) {
        p.set(x + 3, y, "r").set(x + 4, y, "r");
        continue;
      }
      const c = kinds[(col + row * 2) % 3] as (typeof kinds)[number];
      rect(p, x, y, 8, 6, c);
      hline(p, x + 1, y + 2, 5, ink[c]);
      hline(p, x + 1, y + 4, 3, ink[c]);
      vline(p, x + 7, y + 1, 5, c === "w" ? "K" : c === "Y" ? "o" : "n");
      p.set(x + 3, y, "r").set(x + 4, y, "r");
    }
  }
  return rim(clean(p, "r"), { keep: "r" });
})();

// Doors ------------------------------------------------------------------------------------------

/**
 * A steel door painted grey, a hazard stripe across its foot, a warning triangle, a padlock on
 * a hasp. For the 전기실 and the roof.
 */
const steelDoor = (() => {
  const p = Pic.blank(22, 40);
  rect(p, 0, 0, 22, 40, "S");
  rect(p, 1, 1, 20, 39, "M");
  rect(p, 2, 2, 18, 38, "K");
  vline(p, 2, 2, 38, "k");
  vline(p, 19, 2, 38, "M");
  // Warning triangle, no words.
  for (let r = 0; r < 6; r++) hline(p, 11 - r, 8 + r, 1 + r * 2, r === 5 ? "o" : "y");
  p.set(11, 10, "J").set(11, 11, "J").set(11, 12, "J");
  // Hasp and padlock.
  rect(p, 15, 20, 4, 2, "I");
  rect(p, 15, 22, 5, 5, "o");
  hline(p, 15, 22, 5, "y");
  p.set(17, 24, "O").set(17, 25, "O");
  // Hazard stripe at the foot.
  for (let x = 2; x < 20; x++)
    for (let y = 33; y < 37; y++) p.set(x, y, (x + y) % 6 < 3 ? "y" : "J");
  hline(p, 0, 39, 22, "S");
  return rim(clean(p));
})();

// Front door things ---------------------------------------------------------------------------------

/** 신발장: cubbies of outdoor shoes, one pair to a cubby, a couple missing, one in the wrong one. */
const shoeLockers = (() => {
  const W = 50;
  const H = 34;
  const p = Pic.blank(W, H);
  block(p, 1, 1, W - 2, 4, H - 7, WOOD);
  const shoes = ["w", "J", "N", "R", "w", "S", "6", "w", "J", "x"];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const x = 3 + c * 8;
      const y = 7 + r * 6;
      rect(p, x, y, 7, 5, "b");
      const i = (r * 6 + c) % 10;
      if ((r * 6 + c) % 7 === 3) continue;
      const s = shoes[i] as string;
      rect(p, x + 1, y + 2, 2, 2, s);
      rect(p, x + 4, y + 2, 2, 2, s);
      hline(p, x + 1, y + 2, 5, s === "J" ? "I" : s === "w" ? "w" : "K");
    }
  }
  rect(p, 2, H - 4, 4, 3, "b");
  rect(p, W - 6, H - 4, 4, 3, "b");
  return finish(p);
})();

/** The trophy case in the lobby: cups, a plaque, a pennant, last dusted for 해솔제. */
const trophyCase = (() => {
  const W = 40;
  const H = 46;
  const p = Pic.blank(W, H);
  block(p, 1, 1, W - 2, 3, H - 4, WOOD);
  rect(p, 4, 6, W - 8, 30, "m");
  rect(p, 5, 7, W - 10, 28, "n");
  for (const y of [16, 26]) hline(p, 4, y, W - 8, "W");
  // Cups and plaques on three shelves.
  for (const [x, y, ch] of [
    [8, 10, "y"],
    [16, 11, "k"],
    [26, 9, "y"],
    [9, 20, "o"],
    [22, 20, "y"],
    [28, 21, "k"],
    [10, 30, "y"],
    [24, 30, "K"],
  ] as const) {
    rect(p, x, y, 4, 3, ch);
    hline(p, x + 1, y + 3, 2, ch);
    hline(p, x, y + 5, 4, ch === "k" || ch === "K" ? "M" : "O");
  }
  rect(p, 16, 21, 4, 4, "U");
  rect(p, 17, 22, 2, 2, "o");
  // Glass glints.
  vline(p, 6, 8, 6, "~");
  vline(p, 7, 9, 4, "~");
  rect(p, 4, 38, W - 8, 4, "b");
  return finish(p, "~");
})();

// 시청각실 ------------------------------------------------------------------------------------------

/** A row of auditorium seats seen from behind, tip-up, in faded red, four to a piece. */
const avSeats = (() => {
  const W = 64;
  const H = 20;
  const p = Pic.blank(W, H);
  for (let s = 0; s < 4; s++) {
    const x = 1 + s * 16;
    rect(p, x + 1, 1, 13, 10, "R");
    hline(p, x + 1, 1, 13, "r");
    vline(p, x + 1, 1, 10, "r");
    vline(p, x + 13, 2, 9, "q");
    rect(p, x + 2, 11, 11, 3, "q");
    // Armrest between seats.
    rect(p, x + 14, 6, 2, 10, "I");
    vline(p, x + 14, 6, 10, "i");
  }
  rect(p, 0, 14, W, 2, "I");
  for (let x = 4; x < W; x += 16) rect(p, x, 16, 3, 3, "j");
  return finish(p);
})();

/** The projection screen on the 시청각실 wall: dark, or showing the night the page tore. */
function screen(lit: boolean): Pic {
  const W = 112;
  const H = 44;
  const p = Pic.blank(W, H);
  rect(p, 0, 0, W, 4, "I");
  hline(p, 0, 0, W, "i");
  rect(p, 2, 4, W - 4, H - 6, lit ? "j" : "K");
  if (!lit) {
    hline(p, 2, 4, W - 4, "k");
    vline(p, W - 3, 4, H - 6, "M");
  } else {
    // A still of 23:40: the field, the tear of light, the stands.
    for (let y = 4; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const dx = (x - 70) / 20;
        const dy = (y - 18) / 22;
        const inTear = Math.abs(dx) < 1 - Math.abs(dy) * 0.8 && y < 34;
        if (inTear) p.set(x, y, Math.abs(dx) < 0.4 ? "Y" : "y");
        else if (y > 30) p.set(x, y, "a");
      }
    }
    for (let x = 6; x < 40; x++)
      for (let y = 26; y < 31; y++) if ((x + y) % 4 !== 0) p.set(x, y, "I");
  }
  hline(p, 2, H - 2, W - 4, "I");
  hline(p, 0, H - 1, W, "J");
  return rim(clean(p, "Yy"), { keep: "Yy" });
}

// 풍동실 ---------------------------------------------------------------------------------------------

/**
 * 풍동: the wind tunnel, the most expensive fan in the school. An intake cone, a glass test
 * section with a laser sheet across it and a camera on a tripod, then the fan in its housing,
 * blades turning.
 */
function windTunnel(phase: number): Pic {
  const W = 128;
  const H = 48;
  const p = Pic.blank(W, H);
  // Intake bell: a cone narrowing to the right.
  for (let x = 2; x < 30; x++) {
    const half = Math.round(18 - (x - 2) * 0.32);
    rect(p, x, 24 - half, 1, half * 2, x < 4 ? "K" : "k");
    p.set(x, 24 - half, "w").set(x, 24 + half - 1, "M");
  }
  // Test section: glass box, a model wing on a sting, the laser sheet.
  block(p, 30, 12, 44, 4, 22, WHITE);
  rect(p, 32, 16, 40, 16, "~");
  rect(p, 33, 17, 38, 14, "c");
  hline(p, 33, 24, 38, "r");
  rect(p, 46, 22, 14, 3, "w");
  hline(p, 46, 25, 14, "K");
  vline(p, 53, 25, 6, "I");
  // Diffuser to the fan.
  for (let x = 74; x < 92; x++) {
    const half = Math.round(11 + (x - 74) * 0.45);
    rect(p, x, 24 - half, 1, half * 2, "K");
    p.set(x, 24 - half, "w").set(x, 24 + half - 1, "S");
  }
  // Fan housing and turning blades.
  rect(p, 92, 2, 34, 44, "M");
  rect(p, 93, 3, 32, 42, "S");
  const cx = 109;
  const cy = 24;
  for (let y = 4; y < 44; y++) {
    for (let x = 94; x < 124; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > 17) continue;
      const a = Math.atan2(y - cy, x - cx) + phase * (Math.PI / 6);
      const blade = Math.cos(a * 3) > 0.45;
      p.set(x, y, d < 3 ? "K" : d > 15.5 ? "I" : blade ? "i" : "j");
    }
  }
  // Legs, the camera on its tripod in front of the glass.
  for (const x of [8, 40, 64, 98, 118]) rect(p, x, 44, 3, 4, "I");
  rect(p, 44, 36, 8, 5, "J");
  rect(p, 52, 37, 2, 3, "I");
  vline(p, 47, 41, 6, "I");
  rect(p, 44, 46, 2, 1, "I");
  rect(p, 50, 46, 2, 1, "I");
  return finish(p, "rc~");
}

// 체육관 ---------------------------------------------------------------------------------------------

/** The gym stage's front, sixteen pixels a piece: a varnished top, a panelled face with vents. */
function stage(part: "l" | "m" | "r"): Pic {
  const p = Pic.blank(16, 32);
  rect(p, 0, 0, 16, 10, "u");
  hline(p, 0, 0, 16, "W");
  for (let y = 3; y < 10; y += 3) hline(p, 0, y, 16, "U");
  rect(p, 0, 10, 16, 22, "U");
  hline(p, 0, 10, 16, "W");
  hline(p, 0, 11, 16, "b");
  rect(p, 3, 15, 10, 12, "b");
  rect(p, 4, 16, 8, 10, "U");
  for (let y = 18; y < 25; y += 2) hline(p, 5, y, 6, "b");
  hline(p, 0, 31, 16, "B");
  if (part === "l") vline(p, 0, 0, 32, "B");
  if (part === "r") vline(p, 15, 0, 32, "B");
  return p;
}

/** The stage curtain, red velvet in heavy folds, sixteen pixels a piece, a valance on top. */
function curtain(part: "l" | "m" | "r"): Pic {
  const p = Pic.blank(16, 44);
  for (let x = 0; x < 16; x++) {
    const fold = (x + (part === "r" ? 3 : 0)) % 8;
    const c = fold < 2 ? "r" : fold < 5 ? "R" : fold < 7 ? "q" : "Q";
    vline(p, x, 8, 36, c);
  }
  rect(p, 0, 0, 16, 8, "q");
  hline(p, 0, 0, 16, "R");
  hline(p, 0, 6, 16, "o");
  hline(p, 0, 7, 16, "Q");
  for (const x of [2, 6, 10]) p.set(x, 6, "y").set(x + 1, 6, "y");
  if (part === "l") vline(p, 0, 0, 44, "Q");
  if (part === "r") vline(p, 15, 0, 44, "Q");
  return clean(p, "Q");
}

/** 늑목: wall bars, wooden rungs between two posts, worn pale where hands go. */
const wallBars = (() => {
  const W = 34;
  const H = 46;
  const p = Pic.blank(W, H);
  for (const x of [1, W - 5]) {
    rect(p, x, 0, 4, H, "U");
    vline(p, x, 0, H, "u");
    vline(p, x + 3, 0, H, "b");
  }
  for (let y = 3; y < H - 2; y += 4) {
    hline(p, 5, y, W - 10, y > 16 && y < 34 ? "W" : "u");
    hline(p, 5, y + 1, W - 10, "U");
  }
  return rim(clean(p));
})();

// 보건실 ---------------------------------------------------------------------------------------------

/** The folding screen between the 보건실's beds: three pale green panels on castors. */
const bedScreen = (() => {
  const W = 40;
  const H = 34;
  const p = Pic.blank(W, H);
  for (let k = 0; k < 3; k++) {
    const x = 1 + k * 13;
    rect(p, x, 2, 12, 26, "I");
    rect(p, x + 1, 3, 10, 24, k === 1 ? "6" : "s");
    hline(p, x + 1, 3, 10, "h");
    vline(p, x + 10, 4, 23, "D");
  }
  for (const x of [3, 18, 33]) rect(p, x, 28, 3, 4, "I");
  hline(p, 1, 31, W - 2, "j");
  return finish(p);
})();

export default [
  still("quest-board", questBoard, { origin: mounted([80, 40], 4), lone: "r" }),
  still("door-steel", steelDoor, { origin: mounted([22, 40], 0) }),
  still("shoe-lockers", shoeLockers, { shadow: boxShadow(50, 34, 1, 28, 48, 32) }),
  still("trophy-case", trophyCase, { lone: "~", shadow: boxShadow(40, 46, 1, 40, 38, 44) }),
  still("av-seats", avSeats),
  frames(
    "screen",
    { dark: screen(false), lit: screen(true) },
    { origin: mounted([112, 44], 2), lone: "Yy" },
  ),
  frames("wind-tunnel", Object.fromEntries([0, 1, 2].map((k) => [`spin${k}`, windTunnel(k)])), {
    lone: "rc~",
    anim: { spin: { frames: ["spin0", "spin1", "spin2"], fps: 10 } },
    shadow: boxShadow(128, 48, 2, 42, 125, 46),
  }),
  frames(
    "stage",
    { m: stage("m"), l: stage("l"), r: stage("r") },
    { origin: [0, 31], outline: false },
  ),
  frames(
    "stage-curtain",
    { m: curtain("m"), l: curtain("l"), r: curtain("r") },
    { origin: [0, 44 + 36], outline: false, lone: "y" },
  ),
  still("wall-bars", wallBars, { origin: mounted([34, 46], 0) }),
  still("bed-screen", bedScreen, { shadow: boxShadow(40, 34, 1, 29, 38, 32) }),
];
