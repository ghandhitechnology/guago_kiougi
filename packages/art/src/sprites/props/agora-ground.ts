import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";

/**
 * Ground for the 아고라, flat and themed like the dust it lies on (drawn in the dust's own raw
 * ramps): paths beaten darker where everyone walks, cart ruts, sand drifted against walls and
 * steps, weeds in the paving's joints, a meander border and a medallion let into the paving,
 * potsherds, sandal prints, and 아리스타르코스's chalk circles with everyone's footprints
 * through them.
 */

/** A blob, dithered at its edge: `fill(x, y, t)` paints a pixel at depth `t` (0 edge, 1 core). */
function patch(
  w: number,
  h: number,
  seed: number,
  fill: (x: number, y: number, t: number) => string | null,
): Pic {
  const p = Pic.blank(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d =
        Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)) +
        (hash(x >> 2, y >> 1, seed) - 0.5) * 0.4;
      if (d >= 1) continue;
      const t = 1 - d;
      if (t < 0.25 && hash(x, y, seed + 1) > t * 3) continue;
      const ch = fill(x, y, t);
      if (ch) p.set(x, y, ch);
    }
  return p;
}

/** Dust beaten flat and darker where the town walks. */
const worn = (seed: number) =>
  patch(56, 22, seed, (x, y, t) => (t > 0.5 && hash(x, y, seed + 2) > 0.9 ? "U" : "u"));

/** Sand drifted up against something, rippled by the wind. */
const drift = (seed: number) =>
  patch(52, 14, seed, (x, y, t) => ((x + Math.round(y * 1.5)) % 7 === 0 && t > 0.3 ? "p" : "P"));

/** Two wheel grooves, a hoof-trodden strip between them. */
function ruts(vertical: boolean): Pic {
  const L = 32;
  const p = vertical ? Pic.blank(14, L) : Pic.blank(L, 14);
  for (let a = 0; a < L; a++) {
    const wob = Math.round(Math.sin(a / 5) * 0.6);
    for (const off of [2, 10]) {
      const at = (o: number, ch: string) =>
        vertical ? p.set(off + o + wob, a, ch) : p.set(a, off + o + wob, ch);
      at(0, "U");
      at(1, "b");
    }
    if (hash(a, 3, 4) > 0.6) vertical ? p.set(6 + wob, a, "u") : p.set(a, 6 + wob, "u");
  }
  return p;
}

/** Weeds come up in the paving's joints. */
const WEEDS = [
  `
    .3..4.
    .34.3.
    3G34..
  `,
  `
    4....
    34.3.
    .343.
  `,
  `
    ..G..
    .GgG.
    G3G3G
  `,
];

/** A medallion let into the paving: a rosette in a meander ring. */
function inlay(): Pic {
  const W = 52;
  const H = 34;
  const p = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot((x + 0.5 - W / 2) / (W / 2), (y + 0.5 - H / 2) / (H / 2));
      if (r > 1) continue;
      let ch = "k";
      if (r > 0.86) ch = "V";
      else if (r > 0.66) {
        const a = Math.atan2(y - H / 2, x - W / 2);
        ch = Math.floor((a + Math.PI) * 6) % 2 === 0 ? (r > 0.76 ? "M" : "K") : "K";
      } else if (r < 0.4) {
        const a = Math.atan2(y - H / 2, x - W / 2);
        ch = Math.cos(a * 8) > 0.2 ? "V" : "w";
        if (r < 0.12) ch = "M";
      }
      p.set(x, y, ch);
    }
  return p;
}

/** A meander border strip for the paving's edge. Joins end to end. */
function border(): Pic {
  const p = Pic.blank(32, 6, "k");
  for (let x = 0; x < 32; x++) {
    p.set(x, 0, "V").set(x, 5, "V");
    const k = x % 8;
    if (k < 6) p.set(x, 2, "M");
    if (k === 0 || k === 5) p.set(x, 3, "M");
    if (k === 0) p.set(x, 4, "M");
    if (k > 1 && k < 6) p.set(x, 4, "M");
  }
  return p;
}

/** A picture turned on its side, rows for columns. */
function transpose(p: Pic): Pic {
  const out = Pic.blank(p.h, p.w);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) out.set(y, x, p.at(x, y) as string);
  return out;
}

const SHERDS = `
  ....CT.........
  ...CtT....TT...
  .........CtC...
  TC....J........
  Ttt...CTT...CT.
  .........C.....
`;

/** Sandal prints going somewhere in a hurry. */
const PRINTS = `
  .UU.........UU..........
  UUUU.......UUUU.........
  UUU.........UUU....UU...
  .U...UU......U....UUUU..
  .....UUUU.........UUU...
  .....UUU...........U....
  ......U.................
`;

/**
 * 아리스타르코스's chalk: the sun as a big circle, the earth a small one and the moon a smaller,
 * the lines between them, an orbit, and everybody's footprints straight through it all.
 */
function orbits(): Pic {
  const W = 120;
  const H = 70;
  const p = Pic.blank(W, H);
  const circle = (cx: number, cy: number, rx: number, ry: number) => {
    for (let k = 0; k < 200; k++) {
      const a = (k / 200) * Math.PI * 2;
      p.set(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), "w");
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let k = 0; k <= n; k++)
      p.set(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), "w");
  };
  circle(30, 34, 22, 14);
  circle(88, 30, 6, 4);
  circle(102, 22, 3, 2);
  circle(88, 30, 16, 10);
  line(30, 34, 88, 30);
  line(88, 30, 102, 22);
  line(30, 34, 102, 22);
  // The right angle at the moon, marked.
  line(98, 22, 98, 26);
  line(98, 26, 102, 26);
  // Feet straight through it.
  for (const [x0, y0] of [
    [8, 64],
    [62, 66],
  ] as const)
    for (let k = 0; k < 7; k++) {
      const x = x0 + k * 7;
      const y = y0 - k * 8;
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 3; dx++) p.set(x + dx + (k % 2) * 4, y + dy, "u");
    }
  return p;
}

export default [
  greek("beaten", { a: worn(1), b: worn(2), c: worn(3) }, { outline: false, lone: "uU" }),
  greek("sand-drift", { a: drift(4), b: drift(5) }, { outline: false, lone: "Pp" }),
  greek("cart-ruts-h", { still: ruts(false) }, { origin: [0, 0], outline: false, lone: "uUb" }),
  greek("cart-ruts-v", { still: ruts(true) }, { origin: [0, 0], outline: false, lone: "uUb" }),
  greek(
    "joint-weeds",
    Object.fromEntries(WEEDS.map((g, i) => [`w${i}`, Pic.blank(6, 3).put(g, 0, 0)])),
    { outline: false, lone: "34Gg" },
  ),
  greek("paving-inlay", { still: inlay() }, { outline: false, lone: "wkKVM" }),
  greek("paving-meander", { still: border() }, { origin: [0, 0], outline: false, lone: "kVM" }),
  greek(
    "paving-meander-v",
    { still: Pic.blank(6, 32).put(transpose(border()), 0, 0) },
    { origin: [0, 0], outline: false, lone: "kVM" },
  ),
  greek("potsherds", { still: Pic.of(SHERDS) }, { outline: false, lone: "CTtJ" }),
  greek("sandal-prints", { still: Pic.of(PRINTS) }, { outline: false, lone: "U" }),
  greek("chalk-orbits", { still: orbits() }, { outline: false, lone: "wu" }),
];
