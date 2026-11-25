import { type Legend, sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";

/**
 * 새벽관 at 23:40, beyond the field's fence: four floors of rooms, most lights on because 2면
 * just ended and everybody is back, the stairwell lit top to bottom, the green exit sign, and
 * the one corner room that always looks dark from outside. Rooms switch on and off between
 * frames. Drawn in night colours, placed raw.
 */
const palette: Legend = {
  ".": null,
  a: "ink.deep",
  b: "ink.dark",
  c: "ink.mid",
  B: "navy.dark",
  Y: "gold.pale",
  y: "gold.light",
  o: "gold.mid",
  g: "grass.light",
  G: "grass.mid",
};

const W = 200;
const H = 60;
const FLOORS = 4;
const ROOM = 10;

/** Whether room `i` on floor `f` has its light on in frame `k`. */
function lit(f: number, i: number, k: number): boolean {
  if (f === 3 && i === 18) return false; // the corner room that never shows a light
  const v = (i * 7 + f * 13) % 11;
  if (v < 2) return false;
  if (v === 2) return k !== 1;
  if (v === 3) return k === 2;
  return true;
}

function dorm(k: number): string {
  const pic = Pic.blank(W, H);
  const top = 12;
  for (let y = top; y < H; y++) for (let x = 0; x < W; x++) pic.set(x, y, y === top ? "c" : "b");
  // Roof parapet and the water tank on top.
  for (let x = 0; x < W; x++) pic.set(x, top + 1, "B");
  for (let y = 4; y < top; y++) for (let x = 140; x < 156; x++) pic.set(x, y, y === 4 ? "c" : "b");
  // Windows, a floor every 11 pixels.
  for (let f = 0; f < FLOORS; f++) {
    const y0 = top + 4 + f * 11;
    for (let i = 0; i < 19; i++) {
      const x0 = 4 + i * ROOM;
      if (x0 >= 96 && x0 < 106) continue;
      const on = lit(f, i, k);
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 6; x++) {
          const ch = on ? (y < 2 ? "Y" : "y") : "a";
          pic.set(x0 + x, y0 + y, ch);
        }
      }
      if (on && (i + f) % 4 === 0) for (let y = 0; y < 5; y++) pic.set(x0 + 5, y0 + y, "o");
    }
  }
  // The stairwell: a tall lit slot, landing by landing.
  for (let y = top + 3; y < H - 2; y++) {
    for (let x = 98; x < 104; x++) pic.set(x, y, (y - top) % 11 < 2 ? "o" : "y");
  }
  // The exit sign over the door.
  for (let x = 98; x < 104; x++) pic.set(x, H - 9, "g").set(x, H - 8, "G");
  return pic.toString();
}

export default sprite({
  name: "dorm-night",
  size: [W, H],
  origin: [0, H - 1],
  palette,
  outline: false,
  frames: { f0: dorm(0), f1: dorm(1), f2: dorm(2) },
  anim: { lights: { frames: ["f0", "f0", "f1", "f0", "f2"], fps: 0.5, jump: 1 } },
});
