import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, smooth } from "../../paint.ts";

/**
 * The sky over the cliff at 19:20: violet overhead, rose, then a band of orange where the sun
 * went down behind the hill, a few thin clouds lit from below, and the first stars. Drawn in
 * its own colours and placed raw.
 */
const palette: Legend = {
  ".": null,
  a: "plum.dark",
  b: "plum.mid",
  c: "rose.mid",
  d: "rose.light",
  e: "clay.light",
  f: "gold.light",
  // clouds lit from below
  g: "rose.pale",
  h: "rose.light",
  i: "plum.light",
  "*": "stone.bright",
  "+": "rose.pale",
};
const lone = "*+";

const W = 240;
const H = 64;
const BANDS: readonly (readonly [number, string])[] = [
  [0, "a"],
  [16, "b"],
  [30, "c"],
  [42, "d"],
  [52, "e"],
  [59, "f"],
];

function bandAt(y: number): string {
  let ch = "a";
  for (const [from, c] of BANDS) if (y >= from) ch = c;
  return ch;
}

function h(x: number, y: number): number {
  let v = (x * 374761393 + y * 668265263) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
}

const CLOUDS = [
  [
    { x: 50, y: 38, rx: 22, ry: 1.8 },
    { x: 60, y: 36.5, rx: 9, ry: 1.6 },
  ],
  [
    { x: 160, y: 46, rx: 30, ry: 1.7 },
    { x: 146, y: 44.5, rx: 10, ry: 1.5 },
  ],
  [{ x: 212, y: 30, rx: 16, ry: 1.4 }],
  [{ x: 110, y: 26, rx: 12, ry: 1.2 }],
] as const;

function sky(): string {
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let ch = bandAt(y);
      for (const [from] of BANDS)
        if (from > 0 && (y === from - 1 || y === from - 2) && (x + y) % 2 === 0) ch = bandAt(from);
      if (y < 24 && h(x, y) < 0.012) ch = h(x + 1, y) < 0.5 ? "*" : "+";
      pic.set(x, y, ch);
    }
  for (const cloud of CLOUDS) {
    const isIn = lobes(cloud);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!isIn(x, y)) continue;
        pic.set(x, y, !isIn(x, y + 1) ? "g" : !isIn(x, y - 1) ? "i" : "h");
      }
  }
  return smooth(pic, "*+").toString();
}

export default [
  sprite({
    name: "dusk-sky",
    size: [W, H],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: { still: sky() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
];
