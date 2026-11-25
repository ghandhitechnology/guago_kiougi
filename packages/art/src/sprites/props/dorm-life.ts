import { sprite } from "../../format.ts";
import {
  boxShadow,
  finish,
  frames,
  hline,
  IL,
  ovalShadow,
  rect,
  vline,
  WALL_H,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 새벽관 at night: the 신발장 by the door with somebody's shoes always sticking out, the row of
 * washing machines with one still spinning before 점호, the railing that rings the courtyard
 * everybody calls the 콜로세움 and the lines painted on its floor, the lintel over every doorway,
 * and the clothes that pile up on any chair.
 */

/** The 신발장: two rows of cubbies, trainers and slippers, one pair never put away. */
const shoeCabinet = (() => {
  const W = 50;
  const p = Pic.blank(W, 34);
  rect(p, 1, 1, W - 2, 4, "W");
  hline(p, 1, 1, W - 2, "P");
  rect(p, 1, 5, W - 2, 28, "u");
  vline(p, W - 2, 5, 28, "U");
  const shoes = ["w", "N", "R", "j", "w", "G", "n", "R"];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const x = 3 + c * 8;
      const y = 7 + r * 8;
      rect(p, x, y, 7, 7, "U");
      rect(p, x + 1, y + 1, 5, 5, "b");
      const s = shoes[(r * 6 + c) % shoes.length] as string;
      if ((r + c) % 4 !== 3) {
        rect(p, x + 1, y + 3, 5, 3, s);
        hline(p, x + 1, y + 3, 5, s === "j" ? "I" : "w");
      }
    }
  }
  // A pair left half out of its cubby.
  rect(p, 27, 30, 6, 3, "R");
  hline(p, 27, 30, 6, "w");
  return finish(p);
})();

/** Three front loaders, the middle one spinning: someone's gym kit, ten minutes to 점호. */
function washers(f: number): Pic {
  const W = 50;
  const p = Pic.blank(W, 34);
  for (let k = 0; k < 3; k++) {
    const x0 = 1 + k * 16;
    rect(p, x0, 1, 16, 5, "k");
    hline(p, x0, 1, 16, "w");
    rect(p, x0, 6, 16, 26, "w");
    vline(p, x0 + 15, 6, 26, "K");
    vline(p, x0, 1, 31, "K");
    // Panel and the knob.
    rect(p, x0 + 2, 7, 12, 3, "K");
    rect(p, x0 + 10, 8, 2, 1, k === 1 ? "c" : "M");
    // The door: a ring, the glass, the drum.
    for (let y = 12; y < 28; y++) {
      for (let x = x0 + 1; x < x0 + 15; x++) {
        const d = Math.hypot(x + 0.5 - (x0 + 8), y + 0.5 - 20);
        if (d <= 6.5) p.set(x, y, d > 5 ? "M" : k === 1 ? "8" : "I");
      }
    }
    if (k === 1) {
      // Clothes tumbling: colours swap places frame to frame.
      const c = ["R", "N", "y"];
      for (let i = 0; i < 3; i++) {
        const a = (f * 2 + i * 2.1) % 6.28;
        rect(
          p,
          x0 + 7 + Math.round(Math.cos(a) * 3),
          19 + Math.round(Math.sin(a) * 3),
          2,
          2,
          c[i] as string,
        );
      }
    } else hline(p, x0 + 5, 16, 3, "S");
    hline(p, x0, 31, 16, "M");
  }
  // A basket of wet laundry on top of the last one.
  rect(p, 36, 0, 10, 3, "c");
  return finish(p, "c");
}

/**
 * The railing between the galleries and the courtyard, pieces joining edge to edge: `h` runs
 * east to west seen from the front, `v` runs north to south seen from above, `post` stands
 * where they meet and either side of a gap.
 */
const RAIL_H = Array.from({ length: 16 }, (_, y) => {
  if (y < 4) return "................";
  if (y === 4) return "JJJJJJJJJJJJJJJJ";
  if (y === 5) return "kkkkkkkkkkkkkkkk";
  if (y === 6) return "KKKKKKKKKKKKKKKK";
  if (y === 7) return "JJJJJJJJJJJJJJJJ";
  if (y === 15) return "................";
  return "...JKJ.....JKJ..";
}).join("\n");

const RAIL_V = Array.from({ length: 16 }, (_, y) =>
  y % 8 === 3 || y % 8 === 4 ? "......JkKJ......" : ".......kKJ......",
).join("\n");

const RAIL_POST = Array.from({ length: 16 }, (_, y) => {
  if (y < 2) return "................";
  if (y === 2) return "......JJJJ......";
  if (y < 5) return "......JkKJ......";
  if (y === 15) return "................";
  return ".......JKJ......";
}).join("\n");

const rail = sprite({
  name: "rail",
  group: "interior",
  size: [16, 16],
  origin: [0, 15],
  palette: IL,
  outline: false,
  frames: { h: RAIL_H, v: RAIL_V, post: RAIL_POST },
  anim: { idle: { frames: ["h"], fps: 1 } },
});

/**
 * The lines painted on the 콜로세움's floor: a ring in the middle, a starting bar at each end,
 * corner marks. Faded, chipped where feet land most. Ground art: lay it in `details`.
 */
function arenaLines(): Pic {
  const W = 320;
  const H = 192;
  const p = Pic.blank(W, H);
  const cx = W / 2;
  const cy = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x + 0.5 - cx) / 1.25, y + 0.5 - cy);
      if (d > 38 && d <= 40 && (Math.floor(Math.atan2(y - cy, x - cx) * 9) & 3) !== 3)
        p.set(x, y, "w");
    }
  }
  // The centre line and the two start bars.
  for (let y = 24; y < H - 24; y++) if (y % 12 < 8) rect(p, cx - 1, y, 2, 1, "w");
  for (const x of [40, W - 42]) rect(p, x, cy - 24, 2, 48, "w");
  // Corner marks.
  for (const [x, y, dx, dy] of [
    [8, 8, 1, 1],
    [W - 9, 8, -1, 1],
    [8, H - 9, 1, -1],
    [W - 9, H - 9, -1, -1],
  ] as const) {
    for (let i = 0; i < 12; i++) {
      p.set(x + dx * i, y, "w").set(x + dx * i, y + dy, "w");
      p.set(x, y + dy * i, "w").set(x + dx, y + dy * i, "w");
    }
  }
  return p;
}

/**
 * The top of a doorway cut through a back wall: the strip of wall over the opening. Overhead
 * art at the wall's floor line, so whoever walks through passes under it.
 */
function lintel(scheme: "cream" | "dorm"): Pic {
  const p = Pic.blank(32, WALL_H);
  const face = scheme === "dorm" ? "P" : "k";
  const shade = scheme === "dorm" ? "p" : "K";
  rect(p, 0, 0, 32, 10, face);
  hline(p, 0, 0, 32, scheme === "dorm" ? "p" : "M");
  hline(p, 0, 9, 32, shade);
  // The frame round the opening.
  hline(p, 0, 10, 32, "U");
  rect(p, 0, 10, 2, WALL_H - 10, "U");
  rect(p, 30, 10, 2, WALL_H - 10, "U");
  vline(p, 1, 11, WALL_H - 11, "u");
  vline(p, 30, 11, WALL_H - 11, "u");
  return p;
}

/** Clothes on a chair, on the floor, everywhere: a hoodie, the 과잠, jeans, a towel. */
const clothesPile = (() => {
  const p = Pic.blank(24, 14);
  rect(p, 2, 6, 10, 6, "N");
  hline(p, 2, 6, 10, "n");
  rect(p, 8, 3, 10, 6, "R");
  hline(p, 8, 3, 10, "r");
  vline(p, 12, 4, 4, "w");
  rect(p, 14, 7, 8, 5, "v");
  hline(p, 14, 7, 8, "N");
  rect(p, 4, 10, 6, 3, "c");
  hline(p, 4, 10, 6, "~");
  return finish(p);
})();

/** A laundry basket, towels folded on top. */
const basket = (() => {
  const p = Pic.blank(18, 14);
  rect(p, 2, 2, 14, 3, "w");
  hline(p, 2, 2, 14, "w");
  rect(p, 4, 1, 6, 2, "c");
  rect(p, 1, 5, 16, 8, "m");
  for (let x = 2; x < 16; x += 3) vline(p, x, 6, 6, "n");
  hline(p, 1, 12, 16, "n");
  return finish(p);
})();

export default [
  frames(
    "shoe-cabinet",
    { still: shoeCabinet },
    { shadow: boxShadow(50, 34, 1, 28, 48, 33, 2, 0) },
  ),
  frames(
    "washers",
    { spin0: washers(0), spin1: washers(1), spin2: washers(2) },
    {
      lone: "c",
      shadow: boxShadow(50, 34, 1, 28, 48, 33, 2, 0),
      anim: {
        idle: { frames: ["spin0"], fps: 1 },
        spin: { frames: ["spin0", "spin1", "spin2"], fps: 6 },
      },
    },
  ),
  rail,
  sprite({
    name: "arena-lines",
    group: "interior",
    size: [320, 192],
    origin: [0, 0],
    palette: IL,
    lone: "w",
    outline: false,
    frames: { still: arenaLines().toString() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "lintel",
    group: "interior",
    size: [32, WALL_H],
    origin: [0, WALL_H - 1],
    palette: IL,
    outline: false,
    frames: { cream: lintel("cream").toString(), dorm: lintel("dorm").toString() },
    anim: { idle: { frames: ["dorm"], fps: 1 } },
  }),
  frames("clothes-pile", { still: clothesPile }, { shadow: ovalShadow(24, 14, 12, 12.5, 10, 1.6) }),
  frames("laundry-basket", { still: basket }, { shadow: ovalShadow(18, 14, 9, 13, 8, 1.4) }),
];
