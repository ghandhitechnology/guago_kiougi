import {
  boxShadow,
  finish,
  frames,
  hline,
  mounted,
  ovalShadow,
  rect,
  vline,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * The back of the 급식실: the steel door down to the storeroom that is not a storeroom, the rice
 * sacks stacked against it, the stool where the cook takes her break with a thermos and the
 * paper, the hand-wash trough by the entrance, the trolley of dirty trays.
 */

/**
 * The door to the basement stairs: grey steel, a chain through the handle, a padlock, hazard
 * tape across it that someone has peeled a corner of. Hung on a back wall, floor to lintel.
 */
function basementDoor(taped: boolean): Pic {
  const p = Pic.blank(26, 40);
  rect(p, 0, 0, 26, 40, "S");
  rect(p, 1, 1, 24, 39, "M");
  // The leaf, its panel and a kick plate.
  rect(p, 3, 3, 20, 37, "K");
  vline(p, 3, 3, 37, "k");
  vline(p, 22, 3, 37, "M");
  rect(p, 6, 6, 14, 14, "M");
  rect(p, 7, 7, 12, 12, "K");
  rect(p, 4, 33, 18, 5, "M");
  hline(p, 4, 33, 18, "k");
  // A small wired-glass window, dark: nothing lit down there.
  rect(p, 10, 9, 6, 7, "j");
  hline(p, 10, 12, 6, "I");
  vline(p, 13, 9, 7, "I");
  // Handle, chain looped through it, the padlock hanging.
  rect(p, 18, 21, 3, 2, "k");
  for (let i = 0; i < 7; i++)
    p.set(17 - i, 22 + (i % 2), "i").set(18 + Math.floor(i / 3), 23 + i, "i");
  rect(p, 19, 29, 4, 4, "o");
  hline(p, 19, 29, 4, "y");
  rect(p, 20, 27, 2, 2, "M");
  if (taped) {
    // Hazard tape in an X, one end hanging loose.
    for (let i = 0; i < 20; i++) {
      const c = Math.floor(i / 3) % 2 ? "j" : "o";
      p.set(3 + i, 10 + i, c).set(3 + i, 11 + i, c);
      if (i < 15) p.set(22 - i, 10 + i, c).set(22 - i, 11 + i, c);
    }
    rect(p, 7, 25, 2, 4, "o");
  }
  hline(p, 0, 39, 26, "I");
  return finish(p, "y");
}

/** Rice sacks stacked two high, a printed band on each, one slumped. */
const riceSacks = (() => {
  const p = Pic.blank(34, 24);
  const sack = (x: number, y: number, w: number) => {
    rect(p, x, y, w, 9, "k");
    hline(p, x + 1, y, w - 2, "w");
    vline(p, x + w - 1, y + 1, 8, "K");
    hline(p, x, y + 8, w, "K");
    rect(p, x + 2, y + 3, w - 4, 3, "R");
    hline(p, x + 3, y + 4, w - 6, "r");
    p.set(x, y, ".").set(x + w - 1, y, ".");
  };
  sack(1, 14, 16);
  sack(17, 14, 16);
  sack(5, 6, 16);
  sack(20, 7, 13);
  // A bag of something else on top: dried kelp, by the colour.
  rect(p, 10, 1, 10, 6, "5");
  hline(p, 10, 1, 10, "D");
  return finish(p);
})();

/** The cook's break spot: a plastic stool, a thermos, the paper folded to the crossword. */
const cookStool = (() => {
  const p = Pic.blank(20, 20);
  rect(p, 2, 9, 12, 4, "R");
  hline(p, 2, 9, 12, "r");
  hline(p, 2, 12, 12, "q");
  for (const x of [3, 11]) {
    rect(p, x, 13, 2, 6, "R");
    vline(p, x + 1, 13, 6, "q");
  }
  // The paper on the seat.
  rect(p, 4, 7, 8, 3, "w");
  hline(p, 5, 8, 2, "K");
  rect(p, 8, 8, 3, 1, "K");
  // Thermos on the floor beside it.
  rect(p, 15, 7, 4, 11, "6");
  vline(p, 15, 7, 11, "s");
  vline(p, 18, 7, 11, "D");
  rect(p, 15, 5, 4, 2, "K");
  return finish(p);
})();

/** The hand-wash trough at the entrance: a steel basin on legs, four taps, soap on a rope. */
const sinkRow = (() => {
  const W = 66;
  const p = Pic.blank(W, 26);
  // Taps along the back rail.
  hline(p, 2, 3, W - 4, "M");
  hline(p, 2, 4, W - 4, "S");
  for (let x = 8; x < W - 4; x += 15) {
    vline(p, x, 0, 4, "K");
    rect(p, x - 1, 0, 3, 1, "k");
    rect(p, x, 4, 1, 3, "K");
  }
  // Basin seen from above, and its front.
  rect(p, 1, 5, W - 2, 8, "k");
  rect(p, 3, 6, W - 6, 5, "M");
  hline(p, 3, 6, W - 6, "S");
  for (let x = 8; x < W - 4; x += 15) rect(p, x - 1, 9, 3, 1, "9");
  rect(p, 1, 13, W - 2, 5, "K");
  hline(p, 1, 13, W - 2, "w");
  hline(p, 1, 17, W - 2, "M");
  // Soap on its rope, the legs.
  rect(p, 30, 14, 4, 3, "+");
  vline(p, 31, 11, 3, "w");
  for (const x of [3, W - 6]) {
    rect(p, x, 18, 3, 7, "M");
    vline(p, x, 18, 7, "K");
  }
  return finish(p);
})();

/** A trolley of dirty trays on its way to the dish room, a spoon about to fall off. */
const trayTrolley = (() => {
  const p = Pic.blank(22, 30);
  for (const x of [1, 18]) {
    rect(p, x, 1, 3, 26, "M");
    vline(p, x, 1, 26, "K");
  }
  for (let k = 0; k < 4; k++) {
    const y = 4 + k * 6;
    rect(p, 4, y, 14, 2, "K");
    hline(p, 4, y, 14, "k");
    rect(p, 5 + (k % 2), y - 1, 3, 1, k % 2 ? "R" : "t");
    rect(p, 11, y - 1, 2, 1, "G");
  }
  hline(p, 2, 25, 18, "S");
  vline(p, 19, 22, 4, "K");
  rect(p, 2, 27, 3, 2, "I");
  rect(p, 17, 27, 3, 2, "I");
  return finish(p);
})();

export default [
  frames(
    "basement-door",
    { taped: basementDoor(true), bare: basementDoor(false) },
    { lone: "y", origin: mounted([26, 40], 0) },
  ),
  frames("rice-sacks", { still: riceSacks }, { shadow: boxShadow(34, 24, 1, 17, 32, 23, 2, 0) }),
  frames("cook-stool", { still: cookStool }, { shadow: ovalShadow(20, 20, 10, 18.5, 8, 1.6) }),
  frames("sink-row", { still: sinkRow }, { shadow: boxShadow(66, 26, 1, 14, 64, 25, 3, 0) }),
  frames(
    "tray-trolley",
    { still: trayTrolley },
    { shadow: boxShadow(22, 30, 1, 25, 20, 29, 2, 0) },
  ),
];
