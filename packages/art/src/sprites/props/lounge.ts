import { boxShadow, finish, frames, hline, mounted, rect, vline } from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 쉼표 라운지: a mustard sofa that has seen every exam season, an armchair, a grand piano
 * nobody plays with dust on its lid, the low table with a game of 오목 left half finished, the
 * 대자보 board, the snack machine beside the drinks machine.
 */

/** The sofa facing the room (`front`) or seen from behind (`back`). */
function sofa(view: "front" | "back"): Pic {
  const W = 50;
  const p = Pic.blank(W, 26);
  if (view === "front") {
    // Back cushions, arms, seat cushions, the base.
    rect(p, 4, 1, W - 8, 9, "o");
    hline(p, 4, 1, W - 8, "y");
    vline(p, Math.floor(W / 2), 2, 8, "O");
    rect(p, 1, 6, 5, 16, "o");
    rect(p, W - 6, 6, 5, 16, "o");
    hline(p, 1, 6, 5, "y");
    hline(p, W - 6, 6, 5, "y");
    vline(p, W - 2, 7, 15, "O");
    rect(p, 6, 10, W - 12, 7, "y");
    hline(p, 6, 10, W - 12, "Y");
    vline(p, Math.floor(W / 2), 10, 7, "o");
    rect(p, 6, 17, W - 12, 5, "o");
    hline(p, 6, 21, W - 12, "O");
    // A cushion someone hugged flat, a dent.
    rect(p, 8, 7, 7, 6, "X");
    hline(p, 8, 7, 7, "x");
    rect(p, 32, 12, 6, 2, "o");
  } else {
    rect(p, 1, 4, W - 2, 18, "o");
    hline(p, 1, 4, W - 2, "y");
    rect(p, 1, 1, 5, 6, "o");
    rect(p, W - 6, 1, 5, 6, "o");
    hline(p, 1, 1, 5, "y");
    hline(p, W - 6, 1, 5, "y");
    vline(p, W - 2, 2, 20, "O");
    hline(p, 1, 21, W - 2, "O");
    hline(p, 4, 12, W - 8, "O");
  }
  rect(p, 3, 22, 3, 3, "b");
  rect(p, W - 6, 22, 3, 3, "b");
  return finish(p);
}

/** An armchair to match, facing the room. */
const armchair = (() => {
  const p = Pic.blank(24, 26);
  rect(p, 4, 1, 16, 9, "o");
  hline(p, 4, 1, 16, "y");
  rect(p, 1, 6, 5, 16, "o");
  rect(p, 18, 6, 5, 16, "o");
  hline(p, 1, 6, 5, "y");
  hline(p, 18, 6, 5, "y");
  vline(p, 22, 7, 15, "O");
  rect(p, 6, 10, 12, 7, "y");
  hline(p, 6, 10, 12, "Y");
  rect(p, 6, 17, 12, 5, "o");
  hline(p, 6, 21, 12, "O");
  rect(p, 3, 22, 3, 3, "b");
  rect(p, 18, 22, 3, 3, "b");
  return finish(p);
})();

/**
 * The grand piano, lid shut and dusty, keyboard toward the room, its bench pushed in. The
 * curve of the case is drawn from above.
 */
const piano = (() => {
  const W = 56;
  const p = Pic.blank(W, 48);
  // The lid seen from above: straight on the bass side, the bentside curving in to the tail.
  const KEYS = 30;
  for (let y = 1; y <= KEYS; y++) {
    const t = (KEYS - y) / (KEYS - 1);
    const u = Math.max(0, (t - 0.16) / 0.84);
    let right = Math.round(53 - 31 * u ** 1.3);
    let left = 2;
    const round = [5, 3, 2, 1][y - 1];
    if (round !== undefined) {
      left += round;
      right -= round;
    }
    rect(p, left, y, right - left + 1, 1, "j");
  }
  // Lacquer: lit along the bass side and the tail, a window's reflection across the lid.
  for (let y = 1; y <= KEYS; y++) {
    const row = [...Array(W).keys()].filter((x) => p.at(x, y) === "j");
    const l = row[0] ?? 2;
    p.set(l + 1, y, "I");
    const d = 46 - y * 1.4;
    for (const x of row) if (Math.abs(x - d) < 1.5 && y > 4) p.set(x, y, "I");
    for (const x of row) if (Math.abs(x - (d + 7)) < 0.6 && y > 8) p.set(x, y, "I");
  }
  hline(p, 7, 2, 12, "I");
  // What lives on a piano nobody plays: a vase, a stack of sheet music, dust.
  rect(p, 34, 21, 3, 5, "m");
  vline(p, 34, 21, 5, "~");
  rect(p, 33, 18, 2, 3, "G");
  rect(p, 36, 17, 2, 2, "x");
  rect(p, 10, 20, 9, 6, "w");
  hline(p, 10, 25, 9, "K");
  hline(p, 11, 22, 6, "K");
  rect(p, 22, 8, 4, 2, "i");
  rect(p, 14, 13, 3, 2, "i");
  // Front: the keyslip, the keys, the case below.
  rect(p, 2, KEYS + 1, 52, 3, "j");
  hline(p, 2, KEYS + 1, 52, "I");
  rect(p, 5, KEYS + 4, 46, 4, "w");
  hline(p, 5, KEYS + 7, 46, "k");
  for (let x = 5; x < 51; x += 3) vline(p, x + 2, KEYS + 4, 4, "k");
  // Black keys in twos and threes.
  for (let o = 0; o < 3; o++) {
    for (const k of [0, 1, 3, 4, 5]) {
      const x = 5 + (o * 7 + k) * 3 + 2;
      if (x < 49) rect(p, x, KEYS + 4, 2, 2, "J");
    }
  }
  rect(p, 2, KEYS + 4, 3, 4, "j");
  rect(p, 51, KEYS + 4, 3, 4, "j");
  rect(p, 2, KEYS + 8, 52, 3, "J");
  hline(p, 2, KEYS + 8, 52, "j");
  // Legs, and the lyre with its pedals.
  for (const x of [4, 48]) {
    rect(p, x, KEYS + 11, 4, 5, "J");
    vline(p, x, KEYS + 11, 5, "j");
  }
  rect(p, 26, KEYS + 11, 4, 4, "J");
  rect(p, 24, KEYS + 15, 8, 1, "o");
  hline(p, 25, KEYS + 15, 2, "y");
  return finish(p, "oy");
})();

/** The piano bench. */
const pianoBench = (() => {
  const p = Pic.blank(22, 12);
  rect(p, 1, 1, 20, 4, "j");
  hline(p, 1, 1, 20, "I");
  rect(p, 1, 5, 20, 2, "J");
  rect(p, 2, 7, 2, 4, "J");
  rect(p, 18, 7, 2, 4, "J");
  return finish(p);
})();

/** The low table: magazines, two cans, an 오목 board with the game left half played. */
const lowTable = (() => {
  const p = Pic.blank(38, 18);
  rect(p, 1, 1, 36, 10, "u");
  hline(p, 1, 1, 36, "W");
  vline(p, 1, 1, 10, "W");
  // 오목 board and stones.
  rect(p, 4, 2, 13, 8, "W");
  for (let x = 5; x < 17; x += 2) vline(p, x, 2, 8, "U");
  for (let y = 3; y < 10; y += 2) hline(p, 4, y, 13, "U");
  for (const [x, y, c] of [
    [6, 3, "J"],
    [8, 5, "J"],
    [10, 5, "w"],
    [10, 7, "J"],
    [12, 3, "w"],
    [12, 7, "w"],
    [14, 5, "J"],
  ] as const)
    p.set(x, y, c);
  // Magazines, a can.
  rect(p, 21, 3, 8, 6, "m");
  rect(p, 22, 4, 8, 6, "+");
  hline(p, 22, 4, 8, "=");
  rect(p, 32, 3, 3, 4, "R");
  hline(p, 32, 3, 3, "K");
  rect(p, 1, 11, 36, 2, "U");
  rect(p, 3, 13, 3, 4, "b");
  rect(p, 32, 13, 3, 4, "b");
  return finish(p, "Jw");
})();

/**
 * 대자보: the big board where anyone with 층장 rights pins a notice. Hand-written sheets in
 * dense lines, one with a red headline, one photocopied a few too many times.
 */
const bigBoard = (() => {
  const W = 72;
  const p = Pic.blank(W, 38);
  rect(p, 0, 0, W, 38, "U");
  rect(p, 2, 2, W - 4, 32, "t");
  hline(p, 0, 0, W, "u");
  for (const [x, y] of [
    [10, 30],
    [40, 4],
    [62, 28],
  ] as const)
    hline(p, x, y, 2, "T");
  const sheet = (
    x: number,
    y: number,
    w: number,
    h: number,
    paper: string,
    head: string | null,
  ) => {
    rect(p, x, y, w, h, paper);
    vline(p, x + w - 1, y + 1, h - 1, "K");
    let ly = y + 2;
    if (head) {
      rect(p, x + 2, y + 2, w - 4, 3, head);
      ly = y + 7;
    }
    for (; ly < y + h - 2; ly += 2) hline(p, x + 2, ly, w - 4 - ((ly * 3) % 5), "M");
    p.set(x + Math.floor(w / 2), y, "R");
  };
  sheet(4, 4, 20, 28, "w", "R");
  sheet(27, 3, 16, 14, "P", null);
  sheet(27, 19, 16, 13, "w", "N");
  sheet(46, 5, 22, 26, "k", null);
  rect(p, 0, 34, W, 4, "b");
  hline(p, 0, 34, W, "u");
  return finish(p, "R");
})();

/** The snack machine: a navy body, rows of packets behind glass, the pickup flap. */
function snackVending(f: number): Pic {
  const p = Pic.blank(24, 34);
  rect(p, 1, 1, 22, 32, "N");
  hline(p, 1, 1, 22, "n");
  vline(p, 22, 1, 32, "v");
  rect(p, 3, 3, 14, 20, "j");
  const packs = ["R", "o", "G", "+", "c", "y"];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const ch = packs[(r * 3 + c) % packs.length] as string;
      rect(p, 4 + c * 3, 4 + r * 5, 2, 3, ch);
    }
    hline(p, 3, 7 + r * 5, 14, "M");
  }
  for (let i = 0; i < 6; i++) p.set(5 + i, 18 - i, "m");
  // Panel, coin slot, the lit keypad.
  rect(p, 18, 4, 3, 10, "v");
  rect(p, 19, 5, 1, 2, f % 2 ? "c" : "9");
  rect(p, 19, 9, 1, 3, "K");
  // Pickup flap.
  rect(p, 4, 26, 13, 4, "j");
  hline(p, 4, 26, 13, "I");
  return finish(p, "c9");
}

export default [
  frames(
    "sofa",
    { front: sofa("front"), back: sofa("back") },
    { shadow: boxShadow(50, 26, 1, 20, 48, 25, 3, 0) },
  ),
  frames("armchair", { still: armchair }, { shadow: boxShadow(24, 26, 1, 20, 22, 25, 3, 0) }),
  frames("piano", { still: piano }, { lone: "oy", shadow: boxShadow(56, 48, 2, 30, 53, 46, 3, 0) }),
  frames("piano-bench", { still: pianoBench }, { shadow: boxShadow(22, 12, 1, 6, 20, 11, 2, 0) }),
  frames(
    "low-table",
    { still: lowTable },
    { lone: "Jw", shadow: boxShadow(38, 18, 1, 11, 36, 17, 2, 0) },
  ),
  frames("daejabo", { still: bigBoard }, { lone: "R", origin: mounted([72, 38], 8) }),
  frames(
    "snack-vending",
    { glow0: snackVending(0), glow1: snackVending(1) },
    {
      lone: "c9",
      shadow: boxShadow(24, 34, 1, 28, 22, 33, 2, 0),
      anim: { idle: { frames: ["glow0"], fps: 1 }, glow: { frames: ["glow0", "glow1"], fps: 2 } },
    },
  ),
];
