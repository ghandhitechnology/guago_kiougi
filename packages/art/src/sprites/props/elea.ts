import { clean, hline, rect } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";

/**
 * 엘레아 경주로 at 12:30: stone tiers for whoever comes to watch a race that never ends, and the
 * starting sill, a line of stone slabs with the grooves runners set their toes in. Both join end
 * to end.
 */

/** Three tiers of stone seats seen from the track: each a lit seat top and a riser in shade. */
function tiers(): Pic {
  const W = 32;
  const H = 44;
  const p = Pic.blank(W, H);
  for (let t = 0; t < 3; t++) {
    const y = t * 13;
    rect(p, 0, y, W, 6, "k");
    hline(p, 0, y, W, "w");
    rect(p, 0, y + 6, W, 7, "K");
    hline(p, 0, y + 12, W, "M");
    // Joints between the blocks, offset tier by tier, and wear on the seats.
    const off = t * 11;
    for (let k = 0; k < 2; k++) {
      const x = (off + k * 16) % W;
      for (let yy = y; yy < y + 13; yy++) p.set(x, yy, yy < y + 6 ? "V" : "M");
    }
    for (let x = 0; x < W; x++)
      if (hash(x, t, 4) > 0.9) p.set(x, y + 2, "V").set(x + 1, y + 2, "V");
  }
  rect(p, 0, 39, W, 4, "V");
  hline(p, 0, 43, W, "d");
  hline(p, 0, 0, W, "d");
  return clean(p);
}

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
  greek("tiers", { still: tiers() }, { origin: [0, 43], outline: false }),
  greek("balbis", { still: balbis() }, { origin: [0, 0], outline: false }),
];
