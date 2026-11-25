import { clean, finish, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";

/**
 * 엘레아 경주로 at 12:30: stone tiers for whoever comes to watch a race that never ends, and the
 * starting sill, a line of stone slabs with the grooves runners set their toes in. Both join end
 * to end.
 */

/**
 * A stretch of the stand seen from the track: six rows of stone seats stepping up, each a lit seat
 * with its riser in shade under it, joints between the blocks; `stair` cuts an aisle of narrow
 * steps up through the middle, `left` has what spectators left on the seats (a cloth, a jar, a
 * hat). 32 wide, joins end to end.
 */
function tiers(kind: "plain" | "stair" | "left"): Pic {
  const W = 32;
  const H = 76;
  const p = Pic.blank(W, H);
  const ROW = 12;
  for (let t = 0; t < 6; t++) {
    const y = t * ROW;
    rect(p, 0, y, W, 5, "k");
    hline(p, 0, y, W, "w");
    rect(p, 0, y + 5, W, ROW - 5, "K");
    hline(p, 0, y + ROW - 2, W, "M");
    hline(p, 0, y + ROW - 1, W, "S");
    for (const x of [(t * 11) % W, (t * 11 + 16) % W])
      for (let yy = y; yy < y + ROW; yy++) p.set(x, yy, yy < y + 5 ? "V" : "M");
    for (let x = 0; x < W; x++)
      if (hash(x, t, 4) > 0.9) p.set(x, y + 2, "V").set(Math.min(W - 1, x + 1), y + 2, "V");
  }
  if (kind === "stair") {
    // Narrow steps, two to a row, up the middle.
    rect(p, 11, 0, 10, 6 * ROW, "K");
    for (let y = 0; y < 6 * ROW; y += 6) {
      hline(p, 11, y, 10, "w");
      hline(p, 11, y + 1, 10, "k");
      hline(p, 11, y + 5, 10, "M");
    }
    vline(p, 11, 0, 6 * ROW, "S");
    vline(p, 20, 0, 6 * ROW, "S");
  }
  if (kind === "left") {
    p.put(".RRRR.\nRrrrrR\n.qqqq.", 4, 2 * ROW + 1);
    p.put(".CC.\nCttC\nCTTC\n.CC.", 22, 4 * ROW - 2);
    p.put("..oo..\n.oyyo.\noooooo", 8, 5 * ROW - 2);
  }
  rect(p, 0, 6 * ROW, W, H - 6 * ROW - 1, "V");
  hline(p, 0, H - 1, W, "d");
  hline(p, 0, 0, W, "d");
  return clean(p, "RrqCtTyo");
}

/**
 * The judges' stand: a canopy on four posts over a bench of three chairs, a table in front with
 * an urn of palm fronds for a winner who has not come. Stands in the tiers, facing the track.
 */
function judges(): Pic {
  const W = 72;
  const H = 70;
  const p = Pic.blank(W, H);
  // Canopy, striped, its front edge scalloped.
  for (let y = 4; y < 18; y++) {
    const inset = Math.max(0, 8 - y);
    for (let x = 4 + inset; x < W - 4 - inset; x++)
      p.set(x, y, Math.floor((x - 4) / 8) % 2 ? "R" : "!");
  }
  for (let x = 4; x < W - 4; x++)
    if ((x - 4) % 8 > 1 && (x - 4) % 8 < 6) p.set(x, 18, Math.floor((x - 4) / 8) % 2 ? "q" : "R");
  for (const x of [6, W - 8]) {
    rect(p, x, 18, 3, H - 22, "U");
    vline(p, x, 18, H - 22, "u");
  }
  // The bench and three chairs in the shade under the canopy.
  rect(p, 10, 19, W - 20, 22, "b");
  for (const x of [16, 32, 48]) {
    rect(p, x, 24, 10, 12, "U");
    hline(p, x, 24, 10, "W");
    rect(p, x, 36, 10, 3, "u");
  }
  // The table and the urn of palms.
  rect(p, 12, 44, W - 24, 4, "k");
  hline(p, 12, 44, W - 24, "w");
  rect(p, 12, 48, W - 24, 14, "K");
  vline(p, W - 13, 48, 14, "M");
  p.put(
    `
      .D..D..D.
      DGD.G.DGD
      .DGDGDGD.
      ...DGD...
      ...oyo...
      ..oyyyo..
      ..oyyyo..
      ...ooo...
    `,
    W / 2 - 4,
    33,
  );
  rect(p, 10, H - 6, W - 20, 6, "k");
  hline(p, 10, H - 6, W - 20, "w");
  return finish(p, "!Ry");
}

/**
 * Lane chalk: `fresh` a solid line, `faded` worn to bits, `redrawn` a line gone over again a
 * little off the first. 32 wide, flat.
 */
function chalk(kind: "fresh" | "faded" | "redrawn"): Pic {
  const p = Pic.blank(32, 4);
  for (let x = 0; x < 32; x++) {
    if (kind === "fresh") p.set(x, 1, "w").set(x, 2, "k");
    else if (kind === "faded") {
      if (hash(x >> 1, 1, 3) > 0.45) p.set(x, 1, "k");
    } else {
      p.set(x, 1, "w");
      if (hash(x >> 2, 2, 5) > 0.3) p.set(x, 3, "k");
    }
  }
  return p;
}

/** One bare footprint in the sand, toes ahead. */
const FOOT = `
  .UU.
  UUUU
  UUU.
  .U..
  UU..
`;

/**
 * A slab of the starting sill, flat on the track: two grooves for the toes, a socket for the post
 * that separates the lanes. Runs north to south, 32 px a slab.
 */
function balbis(): Pic {
  const W = 12;
  const H = 32;
  const p = Pic.blank(W, H);
  rect(p, 0, 0, W, H, "k");
  for (let y = 0; y < H; y++) {
    p.set(0, y, "w").set(W - 1, y, "K");
    p.set(4, y, "V").set(7, y, "V");
  }
  hline(p, 0, H - 1, W, "V");
  p.put("MM\nMM", 5, 14);
  return clean(p);
}

export default [
  greek(
    "tiers",
    { plain: tiers("plain"), stair: tiers("stair"), left: tiers("left") },
    { origin: [0, 75], outline: false, lone: "RrqCtTyoVMS" },
  ),
  greek(
    "judges-stand",
    { still: judges() },
    { lone: "!Ry", shadow: ovalShadow(72, 70, 36, 68, 34, 2) },
  ),
  greek(
    "lane-chalk",
    { fresh: chalk("fresh"), faded: chalk("faded"), redrawn: chalk("redrawn") },
    { origin: [0, 0], outline: false, lone: "wk" },
  ),
  greek("footprint", { l: Pic.of(FOOT), r: Pic.of(FOOT).flipX() }, { outline: false, lone: "U" }),
  greek("balbis", { still: balbis() }, { origin: [0, 0], outline: false }),
];
