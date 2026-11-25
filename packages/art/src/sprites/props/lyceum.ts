import { clean, finish, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { lobes, Pic, shade } from "../../paint.ts";

/**
 * 리케이온 at 16:50, 아리스토텔레스's school, laid out like the one the students came from: a
 * plane tree in a stone ring where the 해솔 stands at home, a timber tower where the flagpole is
 * (for dropping a heavy stone and a light one side by side, which nobody here has thought to do),
 * a syllabus pinned to every column, and racks of scrolls in the library hall.
 */

// The plane tree ------------------------------------------------------------------------------------

const PT_W = 112;
const PT_H = 124;
const PT_ORIGIN: [number, number] = [56, 121];

/** The trunk: bark shedding in patches, cream, olive and grey, roots gripping the ground. */
function planeTrunk(): Pic {
  const p = Pic.blank(PT_W, PT_H);
  const cx = 56;
  for (let y = 70; y < PT_H - 2; y++) {
    const t = (y - 70) / (PT_H - 72);
    const half = 7 + Math.round(t ** 3 * 9) + (y < 80 ? Math.round((80 - y) / 4) : 0);
    for (let x = cx - half; x <= cx + half; x++) {
      const rel = (x - cx) / half;
      const patch = hash(Math.floor((x + 40) / 4), Math.floor(y / 5), 11);
      let ch = patch < 0.3 ? "k" : patch < 0.6 ? "4" : patch < 0.8 ? "V" : "3";
      if (rel > 0.45) ch = ch === "k" ? "V" : ch === "4" ? "3" : "2";
      if (rel < -0.6 && ch !== "3") ch = "k";
      p.set(x, y, ch);
    }
  }
  // Two limbs forking into the crown.
  for (let k = 0; k < 16; k++) {
    for (let w = -2; w <= 2; w++) {
      p.set(cx - 6 - Math.round(k * 0.9) + w, 70 - k, w < 0 ? "k" : "V");
      p.set(cx + 6 + Math.round(k * 0.8) + w, 70 - k, w < 0 ? "4" : "3");
    }
  }
  return finish(p);
}

/** The crown: broad clumps of big lobed leaves, lit on top, shade underneath. */
function planeCrown(frame: number): Pic {
  const clumps = [
    { x: 56, y: 34, rx: 34, ry: 24 },
    { x: 26, y: 52, rx: 24, ry: 18 },
    { x: 86, y: 50, rx: 24, ry: 19 },
    { x: 44, y: 64, rx: 22, ry: 13 },
    { x: 70, y: 64, rx: 22, ry: 13 },
    { x: 40, y: 20, rx: 18, ry: 14 },
    { x: 74, y: 22, rx: 18, ry: 14 },
  ].map((c, i) => ({ ...c, x: c.x + (frame && i % 2 ? 1 : 0) }));
  const p = Pic.blank(PT_W, PT_H);
  // Back to front so the near clumps overlap the far ones, each shaded on its own.
  for (const c of clumps) {
    const isIn = lobes([c]);
    const part = shade(
      PT_W,
      PT_H,
      isIn,
      { outline: "Z", dark: "D", mid: "G", light: "g", glint: "h" },
      { light: 4, dark: 5 },
    );
    p.put(part, 0, 0);
  }
  // Leaf texture: five-pointed leaves catching light, a few gaps where the sky comes through.
  for (let y = 0; y < PT_H; y++)
    for (let x = 0; x < PT_W; x++) {
      const ch = p.at(x, y);
      if (ch === "." || ch === "Z") continue;
      const n = hash(x >> 1, y >> 1, 7 + frame);
      if (n > 0.9) p.set(x, y, ch === "D" ? "G" : "g");
      else if (n < 0.06) p.set(x, y, "D");
    }
  return clean(p, "h");
}

// The tower --------------------------------------------------------------------------------------

const TW_W = 52;
const TW_H = 156;

/**
 * A timber tower, four posts braced in X, a ladder up the front, a platform at the top with a
 * windlass, a basket of stones and a sack of feathers waiting. The top is overhead.
 */
function tower(top: boolean): Pic {
  const p = Pic.blank(TW_W, TW_H);
  const PLAT = 26;
  if (top) {
    // Platform deck, rail, the windlass, the basket and the sack.
    rect(p, 2, PLAT, TW_W - 4, 6, "u");
    hline(p, 2, PLAT, TW_W - 4, "W");
    hline(p, 2, PLAT + 5, TW_W - 4, "b");
    for (let x = 2; x < TW_W - 2; x += 6) vline(p, x, PLAT - 12, 12, "U");
    hline(p, 2, PLAT - 12, TW_W - 4, "u");
    hline(p, 2, PLAT - 6, TW_W - 4, "U");
    // Windlass beam out over the edge.
    rect(p, 8, 4, 3, PLAT - 4, "U");
    rect(p, 8, 4, 24, 3, "u");
    vline(p, 30, 7, 14, "I");
    p.put(".ii.\niIIi\n.ii.", 28, 20);
    // A basket of stones, a sack of feathers.
    p.put(
      `
        .bbbbbb.
        bMKMKSMb
        bUuUuUub
        bUuUuUub
        .bbbbbb.
      `,
      30,
      PLAT - 5,
    );
    p.put(
      `
        ..ww..
        .wkkw.
        wkkkkw
        wkkkKw
        .wKKw.
      `,
      14,
      PLAT - 5,
    );
    return finish(p, "iI");
  }
  // Posts, braces, the ladder.
  for (const x of [4, TW_W - 8]) {
    rect(p, x, PLAT + 4, 4, TW_H - PLAT - 6, "U");
    vline(p, x, PLAT + 4, TW_H - PLAT - 6, "u");
    vline(p, x + 3, PLAT + 4, TW_H - PLAT - 6, "b");
  }
  for (let seg = 0; seg < 4; seg++) {
    const y0 = PLAT + 8 + seg * 30;
    for (let k = 0; k < 30; k++) {
      const x1 = 8 + Math.round((k / 30) * (TW_W - 16));
      p.set(x1, y0 + k, "b").set(x1 + 1, y0 + k, "U");
      p.set(TW_W - 9 - Math.round((k / 30) * (TW_W - 16)), y0 + k, "U");
    }
    hline(p, 4, y0, TW_W - 8, "u");
  }
  for (const x of [20, 30]) vline(p, x, PLAT + 6, TW_H - PLAT - 8, "W");
  for (let y = PLAT + 10; y < TW_H - 4; y += 6) hline(p, 20, y, 11, "u");
  // Feet in stone footings.
  for (const x of [2, TW_W - 10]) p.put("dddddddd\ndKkkkkMd\ndMMMMMSd", x, TW_H - 3);
  return finish(p);
}

// Small things -----------------------------------------------------------------------------------

/** A syllabus pinned to a column: a sheet of the week's lectures, a pin at its top. */
function syllabus(kind: number): Pic {
  const p = Pic.blank(9, 12);
  rect(p, 0, 1, 9, 11, "w");
  vline(p, 8, 1, 11, "k");
  hline(p, 0, 11, 9, "K");
  for (let y = 3; y < 10; y += 2) hline(p, 1, y, 3 + Math.floor(hash(kind, y) * 5), "I");
  p.set(4, 0, "R").set(4, 1, "R");
  return finish(p, "IR");
}

/** Pigeonholes of scrolls, the library's stock, one hole empty where someone is reading. */
function rack(): Pic {
  const W = 34;
  const H = 40;
  const p = Pic.blank(W, H);
  rect(p, 0, 0, W, H, "U");
  hline(p, 0, 0, W, "W");
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const x = 2 + c * 8;
      const y = 3 + r * 9;
      rect(p, x, y, 6, 7, "B");
      if (r === 2 && c === 1) continue;
      p.put(
        `
          .WW.WW
          WPPWPP
          .UU.UU
        `,
        x,
        y + 3,
      );
    }
  vline(p, W - 1, 0, H, "b");
  hline(p, 0, H - 1, W, "b");
  return finish(p);
}

export default [
  greek(
    "plane",
    { still: planeTrunk() },
    { origin: PT_ORIGIN, shadow: ovalShadow(PT_W, PT_H, 58, 120, 16, 3) },
  ),
  greek(
    "plane-crown",
    { sway0: planeCrown(0), sway1: planeCrown(1) },
    { origin: PT_ORIGIN, anim: { sway: { frames: ["sway0", "sway1"], fps: 1 } }, lone: "h" },
  ),
  greek(
    "tower",
    { still: tower(false) },
    { origin: [26, TW_H - 1], shadow: ovalShadow(TW_W, TW_H, 26, TW_H - 2, 25, 3) },
  ),
  greek("tower-top", { still: tower(true) }, { origin: [26, TW_H - 1], lone: "iI" }),
  greek("syllabus", { a: syllabus(1), b: syllabus(2), c: syllabus(3) }, { lone: "IR" }),
  greek("scroll-rack", { still: rack() }, { shadow: ovalShadow(34, 40, 18, 39, 17, 2) }),
];
