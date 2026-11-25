import { finish, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";
import { door, roof, wall, window } from "./agora-town.ts";

/**
 * The 아고라's street, house by house, so no two neighbours are the same box: a house with an
 * upper floor and a wooden balcony, one with its gable end to the street and a round window in
 * it, one with a flat roof terrace reached by a stair up its front (pots and washing on top), one
 * with a dovecote tower, a courtyard wall with its gate and the house's roof behind it, and a
 * shop with its front open under a striped awning. All stand on the same five-by-three footprint
 * and are drawn a little wider, so neighbours overlap. The awning that reaches out over the
 * street is a separate overhead piece players walk under. And the square's own things: a sundial
 * for its middle, a cat, pigeons taking off.
 */

const W = 88;
const H = 112;
const FOOT = H - 2;

type Kind = "balcony" | "gable" | "terrace" | "dovecote" | "gate" | "shop";

function streetHouse(kind: Kind): Pic {
  const p = Pic.blank(W, H);
  if (kind === "balcony") {
    roof(p, 4, W - 5, 8, 34, 6);
    wall(p, 6, W - 7, 35, 66, "white", 11);
    window(p, 16, 42);
    window(p, 38, 42);
    window(p, 62, 42);
    // The balcony: a floor on beams, a rail with turned posts.
    rect(p, 4, 64, W - 8, 3, "U");
    hline(p, 4, 64, W - 8, "u");
    for (let x = 6; x < W - 6; x += 4) vline(p, x, 56, 8, "b");
    hline(p, 4, 56, W - 8, "u");
    wall(p, 6, W - 7, 67, FOOT, "ochre", 12);
    door(p, 14, FOOT - 3, "U");
    window(p, 58, 78);
    // Pots of herbs on the balcony.
    p.put(".GG.\nGDDG\n.TT.\n.CC.", 30, 52);
    p.put(".G.\nGDG\n.T.\n.C.", 70, 53);
  } else if (kind === "gable") {
    // The gable end: two slopes meeting over the street, a round window in the triangle.
    for (let y = 16; y < 56; y++) {
      const half = Math.round(((y - 16) / 40) * (W / 2 - 4));
      for (let x = W / 2 - half; x < W / 2 + half; x++) {
        const lit = x < W / 2;
        p.set(x, y, y > 50 ? "w" : (x + y) % 6 === 0 ? (lit ? "t" : "C") : lit ? "P" : "T");
      }
    }
    for (let y = 22; y < 56; y++) {
      const half = Math.round(((y - 22) / 34) * (W / 2 - 12));
      for (let x = W / 2 - half; x < W / 2 + half; x++) p.set(x, y, x < W / 2 ? "k" : "K");
    }
    p.put(".JJJ.\nJJbJJ\nJbbbJ\nJJbJJ\n.JJJ.", W / 2 - 2, 34);
    wall(p, 8, W - 9, 56, FOOT, "white", 21);
    door(p, W / 2 - 5, FOOT - 3, "q");
    window(p, 16, 66);
    window(p, 64, 66);
  } else if (kind === "terrace") {
    // A flat roof behind a parapet, pots and a line of washing on it, a stair up the front.
    rect(p, 6, 30, W - 12, 6, "k");
    hline(p, 6, 30, W - 12, "w");
    hline(p, 6, 35, W - 12, "M");
    for (const x of [12, 22, 60]) p.put(".CC.\nCttC\nCTTC", x, 24);
    vline(p, 34, 14, 16, "b");
    vline(p, 70, 14, 16, "b");
    for (let x = 35; x < 70; x++)
      p.set(x, 15 + Math.round(Math.sin(((x - 35) / 35) * Math.PI) * 3), "b");
    for (let i = 0; i < 6; i++)
      rect(
        p,
        38 + i * 5,
        17 + Math.round(Math.sin((i / 6) * Math.PI) * 3),
        3,
        6,
        ["n", "R", "w", "o", "n", "w"][i] as string,
      );
    wall(p, 6, W - 7, 36, FOOT, "ochre", 31);
    door(p, 14, FOOT - 3, "U");
    window(p, 34, 48);
    // The stair up the front, right to left, with its wall.
    for (let s = 0; s < 14; s++) {
      const x = W - 12 - s * 3;
      const y = FOOT - 4 - s * 5;
      rect(p, x, y, 6, 3, "k");
      hline(p, x, y, 6, "w");
      rect(p, x, y + 3, 6, FOOT - y - 3, "K");
    }
  } else if (kind === "dovecote") {
    roof(p, 4, 58, 34, 58, 5);
    wall(p, 6, 56, 59, FOOT, "white", 41);
    door(p, 18, FOOT - 3, "N");
    window(p, 40, 70);
    // The tower: squared, tall, rows of dark holes, a little roof, birds on it.
    rect(p, 58, 12, 26, FOOT - 12, "k");
    vline(p, 58, 12, FOOT - 12, "w");
    rect(p, 78, 12, 6, FOOT - 12, "K");
    for (let y = 22; y < 70; y += 8) for (let x = 61; x < 80; x += 5) rect(p, x, y, 2, 3, "J");
    roof(p, 56, 85, 2, 13, 3);
    p.put("KK.KK", 62, 0);
    rect(p, 58, FOOT - 4, 26, 4, "M");
  } else if (kind === "gate") {
    // The house behind, its roof and upper wall over the courtyard wall.
    roof(p, 8, W - 9, 6, 30, 6);
    wall(p, 10, W - 11, 31, 54, "ochre", 51);
    window(p, 20, 38);
    window(p, 58, 38);
    // A fig's crown over the wall.
    for (let y = 40; y < 64; y++)
      for (let x = 56; x < 84; x++) {
        const r = Math.hypot((x - 70) / 14, (y - 52) / 12);
        if (r < 1) p.set(x, y, r < 0.5 && x < 70 ? "g" : hash(x >> 1, y >> 1, 3) > 0.5 ? "G" : "D");
      }
    // The courtyard wall and its gate.
    rect(p, 2, 66, W - 4, 4, "k");
    hline(p, 2, 66, W - 4, "w");
    wall(p, 2, W - 3, 70, FOOT, "white", 52);
    rect(p, W / 2 - 12, 74, 24, FOOT - 74, "b");
    rect(p, W / 2 - 11, 75, 22, FOOT - 75, "U");
    vline(p, W / 2, 75, FOOT - 75, "b");
    for (const y of [80, 92]) hline(p, W / 2 - 11, y, 22, "b");
    rect(p, W / 2 - 14, 71, 28, 3, "K");
  } else {
    // The shop: an upper floor, the front open below, goods in the dark, the awning's frame.
    roof(p, 4, W - 5, 10, 34, 6);
    wall(p, 6, W - 7, 35, FOOT, "ochre", 61);
    window(p, 18, 42);
    window(p, 60, 42);
    rect(p, 10, 64, W - 20, FOOT - 64 - 4, "B");
    rect(p, 12, 66, W - 24, FOOT - 66 - 4, "J");
    for (let x = 16; x < W - 20; x += 9) p.put(".CC.\nCttC\nCTTC\nCTTC\n.CC.", x, FOOT - 15);
    hline(p, 12, FOOT - 18, W - 24, "U");
    for (let x = 16; x < W - 20; x += 7) p.put("oo\nyo", x, FOOT - 22);
  }
  return finish(p, "yRnoJGgDX");
}

/** A striped awning reaching out over the street on two poles. Overhead: people walk under it. */
function awning(stripe: [string, string]): Pic {
  const p = Pic.blank(64, 34);
  for (let y = 0; y < 18; y++) {
    const inset = Math.max(0, 4 - Math.floor(y / 3));
    for (let x = 2 + inset; x < 62 - inset; x++)
      p.set(x, y, Math.floor(x / 6) % 2 ? stripe[0] : stripe[1]);
  }
  for (let x = 2; x < 62; x++)
    if (x % 6 > 0 && x % 6 < 5) p.set(x, 18, Math.floor(x / 6) % 2 ? stripe[0] : stripe[1]);
  for (const x of [3, 59]) {
    vline(p, x, 18, 16, "U");
    vline(p, x + 1, 18, 16, "b");
  }
  return finish(p);
}

/**
 * The plaza's sundial: a stone bowl cut with hour lines on a fluted pillar, on two round steps,
 * its pin throwing the afternoon's shadow across the lines.
 */
function sundial(): Pic {
  const W = 40;
  const H = 52;
  const p = Pic.blank(W, H);
  // Two round steps.
  for (const [y0, rx, ry] of [
    [44, 19, 6],
    [38, 14, 5],
  ] as const)
    for (let y = y0 - ry; y <= y0 + ry; y++)
      for (let x = 0; x < W; x++) {
        const r = Math.hypot((x - W / 2 + 0.5) / rx, (y - y0) / ry);
        if (r <= 1)
          p.set(x, y, y > y0 + ry - 3 ? "M" : x < W / 2 - rx * 0.4 ? "w" : r > 0.8 ? "K" : "k");
      }
  // The pillar, fluted.
  for (let y = 14; y < 38; y++) p.put("dwkKkKVMd", W / 2 - 4, y);
  // The bowl, its hour lines, the pin and its shadow.
  for (let y = 4; y < 16; y++)
    for (let x = 4; x < W - 4; x++) {
      const r = Math.hypot((x - W / 2 + 0.5) / 16, (y - 9) / 6);
      if (r > 1) continue;
      let ch = y < 8 ? "K" : r > 0.8 ? "M" : "k";
      if (y >= 8 && (x - 4) % 5 === 0) ch = "V";
      p.set(x, y, ch);
    }
  for (let y = 2; y < 9; y++) p.set(W / 2, y, "o");
  for (let k = 1; k < 9; k++) p.set(W / 2 + k, 9 + Math.floor(k / 3), "S");
  return finish(p, "o");
}

/** A cat on a warm step, its tail flicking. */
function cat(frame: number): Pic {
  const p = Pic.blank(16, 12);
  p.put(
    `
      .b.b......
      bUbUb.....
      bUUUb.....
      bJUJb.....
      .bUUbbbb..
      .bUUUUUUb.
      .bUuUUUUb.
      ..bbbbbbb.
    `,
    1,
    3,
  );
  if (frame) p.put("..b\n.bU\nbU.", 10, 3);
  else p.put("...\n...\nbbbb\n..Ub", 10, 7);
  return finish(p, "J");
}

/** A pigeon taking off, wings up and down. */
function pigeonFly(frame: number): Pic {
  const p = Pic.blank(12, 8);
  p.put(
    frame
      ? `
        K........K
        .KK....KK.
        ..KKMMKK..
        ...MkkM...
        ....MM....
      `
      : `
        ..........
        ...MkkM...
        KKKKMMKKKK
        .K......K.
        ..........
      `,
    1,
    1,
  );
  return finish(p);
}

export default [
  greek(
    "street-house",
    {
      balcony: streetHouse("balcony"),
      gable: streetHouse("gable"),
      terrace: streetHouse("terrace"),
      dovecote: streetHouse("dovecote"),
      gate: streetHouse("gate"),
      shop: streetHouse("shop"),
    },
    { origin: [44, H - 1], lone: "yRnoJGgDX", shadow: ovalShadow(W, H, 45, H - 2, 42, 2) },
  ),
  greek(
    "street-awning",
    { red: awning(["R", "!"]), blue: awning(["N", "m"]), ochre: awning(["o", "Y"]) },
    { origin: [32, 33] },
  ),
  greek("sundial", { still: sundial() }, { lone: "o", shadow: ovalShadow(40, 52, 21, 49, 19, 3) }),
  greek(
    "cat",
    { sit0: cat(0), sit1: cat(1) },
    { anim: { flick: { frames: ["sit0", "sit1"], fps: 0.8 } }, lone: "J" },
  ),
  greek(
    "pigeon-fly",
    { up: pigeonFly(1), down: pigeonFly(0) },
    { anim: { fly: { frames: ["up", "down"], fps: 6 } } },
  ),
];
