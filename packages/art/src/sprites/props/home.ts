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
import { Pic } from "../../paint.ts";

/**
 * Home, for the ten minutes of 명령퇴사: an apartment's kitchen and living room at dinner time.
 * The 찌개 on the stove, the rice cooker keeping rice warm, the fridge with magnets and the
 * 장조림 inside it, the table already laid, the TV on with the sound low, the front door's
 * keypad, shoes at the 현관.
 */

/** The kitchen counter: drawers, the sink, the stove with the pot going, the rice cooker. */
function counter(f: number): Pic {
  const W = 66;
  const p = Pic.blank(W, 40);
  // Steam off the pot.
  for (const [x, y] of [
    [36, 1],
    [40, 4],
  ] as const) {
    const t = (f + (x === 36 ? 0 : 1)) % 3;
    rect(p, x + (t % 2), y + t, 2, 2, "w");
  }
  // Top.
  rect(p, 1, 9, W - 2, 12, "k");
  hline(p, 1, 9, W - 2, "w");
  vline(p, 1, 9, 12, "w");
  // Sink and tap.
  rect(p, 5, 11, 16, 8, "M");
  rect(p, 6, 12, 14, 6, "S");
  hline(p, 6, 12, 14, "I");
  vline(p, 12, 6, 6, "K");
  hline(p, 12, 6, 4, "K");
  rect(p, 7, 14, 4, 2, "w");
  // Stove: two burners, a pot of 찌개 on one, a kettle on the other.
  rect(p, 26, 11, 20, 8, "I");
  hline(p, 26, 11, 20, "i");
  rect(p, 30, 13, 6, 4, "J");
  rect(p, 34, 7, 10, 8, "M");
  hline(p, 34, 7, 10, "K");
  rect(p, 35, 8, 8, 2, "t");
  rect(p, 36, 8, 3, 1, "p");
  rect(p, 31, 9, 3, 2, "J");
  // Rice cooker.
  rect(p, 50, 8, 12, 11, "w");
  hline(p, 50, 8, 12, "w");
  rect(p, 51, 9, 10, 4, "K");
  rect(p, 52, 14, 8, 3, "R");
  rect(p, 54, 15, 2, 1, "c");
  vline(p, 61, 9, 10, "K");
  // Front: drawers and doors.
  rect(p, 1, 21, W - 2, 18, "W");
  hline(p, 1, 21, W - 2, "u");
  vline(p, W - 2, 21, 18, "u");
  for (let x = 3; x < W - 4; x += 16) {
    rect(p, x, 24, 14, 13, "u");
    rect(p, x + 1, 25, 12, 11, "W");
    rect(p, x + 5, 27, 4, 1, "U");
  }
  hline(p, 1, 38, W - 2, "U");
  return finish(p, "c");
}

/** The fridge: two doors, magnets, a takeaway menu, a child's drawing from years ago. */
const fridge = (() => {
  const p = Pic.blank(28, 48);
  rect(p, 1, 1, 26, 46, "k");
  hline(p, 1, 1, 26, "w");
  vline(p, 1, 1, 46, "w");
  vline(p, 26, 1, 46, "K");
  vline(p, 13, 3, 44, "K");
  rect(p, 11, 18, 1, 8, "M");
  rect(p, 15, 18, 1, 8, "M");
  // On the doors.
  rect(p, 3, 6, 7, 9, "w");
  rect(p, 4, 8, 5, 3, "g");
  rect(p, 5, 11, 2, 2, "y");
  hline(p, 4, 13, 5, "N");
  rect(p, 17, 5, 6, 8, "Y");
  for (let y = 6; y < 12; y += 2) hline(p, 18, y, 4, "o");
  rect(p, 5, 28, 3, 3, "R");
  rect(p, 18, 30, 3, 3, "c");
  rect(p, 20, 20, 3, 3, "+");
  hline(p, 1, 46, 26, "M");
  return finish(p);
})();

/** The table, laid: rice, soup, kimchi, the 장조림, three small sides, spoons and chopsticks. */
const diningTable = (() => {
  const W = 52;
  const p = Pic.blank(W, 30);
  rect(p, 1, 1, W - 2, 16, "u");
  hline(p, 1, 1, W - 2, "W");
  vline(p, 1, 1, 16, "W");
  vline(p, W - 2, 2, 15, "U");
  const bowl = (x: number, y: number, fill: string, lit: string) => {
    rect(p, x, y, 6, 4, "w");
    rect(p, x + 1, y + 1, 4, 2, fill);
    hline(p, x + 1, y + 1, 3, lit);
  };
  bowl(6, 9, "w", "k");
  bowl(14, 9, "t", "p");
  bowl(22, 4, "R", "r");
  bowl(30, 4, "b", "U");
  bowl(38, 4, "G", "g");
  bowl(22, 10, "y", "Y");
  bowl(30, 10, "W", "P");
  // Spoon and chopsticks on a rest, the parent's place opposite.
  hline(p, 6, 14, 8, "K");
  hline(p, 15, 14, 6, "K");
  bowl(40, 11, "w", "k");
  rect(p, 1, 17, W - 2, 3, "U");
  hline(p, 1, 17, W - 2, "u");
  for (const x of [3, W - 6]) {
    rect(p, x, 20, 3, 9, "U");
    vline(p, x, 20, 9, "u");
  }
  return finish(p);
})();

/** A wooden dining chair, from the front or the back. */
function homeChair(view: "front" | "back"): Pic {
  const p = Pic.blank(14, 22);
  if (view === "back") {
    rect(p, 2, 1, 10, 10, "u");
    hline(p, 2, 1, 10, "W");
    for (const x of [4, 7, 10]) vline(p, x, 3, 7, "U");
    rect(p, 1, 11, 12, 3, "W");
    hline(p, 1, 13, 12, "u");
  } else {
    rect(p, 2, 1, 10, 6, "u");
    hline(p, 2, 1, 10, "W");
    rect(p, 1, 7, 12, 6, "W");
    hline(p, 1, 7, 12, "P");
    hline(p, 1, 12, 12, "u");
  }
  for (const x of [2, 10]) {
    rect(p, x, 14, 2, 7, "U");
    vline(p, x, 14, 7, "u");
  }
  return finish(p);
}

/** The TV on its low cabinet, the evening news on with the sound down. */
function tv(f: number): Pic {
  const W = 50;
  const p = Pic.blank(W, 40);
  rect(p, 5, 1, 40, 24, "J");
  rect(p, 7, 3, 36, 20, f === 1 ? "8" : "7");
  rect(p, 9, 5, 14, 9, "n");
  rect(p, 25, 6, 16, 2, "m");
  rect(p, 25, 9, 12, 2, "m");
  rect(p, 7, 18, 36, 3, "N");
  hline(p, 9, 19, 20, "w");
  rect(p, 22, 25, 6, 2, "I");
  // Cabinet.
  rect(p, 1, 27, W - 2, 12, "W");
  hline(p, 1, 27, W - 2, "P");
  vline(p, W - 2, 27, 12, "u");
  rect(p, 4, 30, 20, 7, "u");
  rect(p, 26, 30, 20, 7, "u");
  rect(p, 30, 32, 8, 2, "I");
  return finish(p);
}

/** The front door: steel, a peephole, the digital lock's keypad glowing. */
const frontDoor = (() => {
  const p = Pic.blank(26, 42);
  rect(p, 0, 0, 26, 42, "M");
  rect(p, 2, 2, 22, 40, "N");
  vline(p, 2, 2, 40, "n");
  vline(p, 23, 2, 40, "v");
  rect(p, 5, 6, 16, 14, "v");
  rect(p, 6, 7, 14, 12, "N");
  rect(p, 12, 4, 2, 1, "J");
  rect(p, 18, 21, 4, 8, "I");
  rect(p, 19, 22, 2, 3, "c");
  rect(p, 19, 26, 2, 2, "i");
  rect(p, 4, 24, 5, 2, "K");
  hline(p, 0, 41, 26, "S");
  return finish(p);
})();

/** The calendar from the bank, this month's square for the exam circled in red. */
const calendar = (() => {
  const p = Pic.blank(18, 24);
  rect(p, 0, 0, 18, 24, "w");
  rect(p, 0, 0, 18, 8, "6");
  rect(p, 3, 2, 8, 4, "s");
  for (let y = 10; y < 22; y += 3) for (let x = 2; x < 16; x += 3) rect(p, x, y, 2, 2, "K");
  rect(p, 10, 15, 4, 4, "r");
  rect(p, 11, 16, 2, 2, "w");
  vline(p, 17, 1, 23, "k");
  return finish(p);
})();

/** Shoes at the 현관: school shoes kicked off, a parent's pair side by side. */
const shoes = (() => {
  const p = Pic.blank(30, 12);
  const pair = (x: number, y: number, c: string, l: string, neat: boolean) => {
    rect(p, x, y, 5, 3, c);
    hline(p, x, y, 5, l);
    rect(p, x + (neat ? 6 : 7), y + (neat ? 0 : 2), 5, 3, c);
    hline(p, x + (neat ? 6 : 7), y + (neat ? 0 : 2), 5, l);
  };
  pair(1, 2, "j", "I", false);
  pair(16, 1, "T", "t", true);
  pair(14, 7, "w", "k", true);
  return finish(p);
})();

const COUNTER = sprite({
  name: "kitchen-counter",
  group: "interior",
  size: [66, 40],
  palette: IL,
  lone: "c",
  shadow: boxShadow(66, 40, 1, 33, 64, 39, 2, 0),
  frames: Object.fromEntries([0, 1, 2].map((i) => [`cook${i}`, counter(i).toString()])),
  anim: {
    idle: { frames: ["cook0"], fps: 1 },
    cook: { frames: ["cook0", "cook1", "cook2"], fps: 4 },
  },
});

const TV = sprite({
  name: "tv",
  group: "interior",
  size: [50, 40],
  palette: IL,
  shadow: boxShadow(50, 40, 1, 33, 48, 39, 2, 0),
  frames: { on0: tv(0).toString(), on1: tv(1).toString() },
  anim: {
    idle: { frames: ["on0"], fps: 1 },
    flicker: { frames: ["on0", "on0", "on1", "on0"], fps: 3 },
  },
});

export default [
  COUNTER,
  frames("fridge", { still: fridge }, { shadow: boxShadow(28, 48, 1, 42, 26, 47, 2, 0) }),
  frames(
    "dining-table",
    { still: diningTable },
    { shadow: boxShadow(52, 30, 1, 17, 50, 29, 3, 0) },
  ),
  frames(
    "home-chair",
    { front: homeChair("front"), back: homeChair("back") },
    { shadow: ovalShadow(14, 22, 8, 20.5, 6, 1.4) },
  ),
  TV,
  frames("front-door", { still: frontDoor }, { origin: mounted([26, 42], 0) }),
  frames("calendar", { still: calendar }, { origin: mounted([18, 24], 18) }),
  frames("shoes", { still: shoes }),
];
