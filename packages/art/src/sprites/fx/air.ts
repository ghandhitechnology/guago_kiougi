import { type Legend, sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";

/**
 * Atmosphere: small looping sprites drawn over everything, raw. Each frame moves its specks a
 * little, so a few of them give a scene air and motion without an effects system. Specks are
 * single pixels on purpose.
 */
const palette: Legend = {
  ".": null,
  w: "stone.bright",
  k: "stone.pale",
  Y: "gold.pale",
  d: "board.dark",
  m: "board.mid",
};
const lone = "wkYdm";

/** Draws one frame from a list of [x, y, piece] placements. */
function frame(
  w: number,
  h: number,
  marks: readonly (readonly [number, number, string])[],
): string {
  const pic = Pic.blank(w, h);
  for (const [x, y, piece] of marks) pic.put(piece, x, y);
  return pic.toString();
}

/** Two moths circling a lamp, wings open and shut. */
const MOTH_OPEN = "w.w\n.k.";
const MOTH_SHUT = ".w.\n.k.";
const orbit = (i: number, r: number, phase: number): [number, number] => {
  const a = (i / 8) * Math.PI * 2 + phase;
  return [Math.round(10 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r * 0.55)];
};
const moths = Array.from({ length: 8 }, (_, i) => {
  const [ax, ay] = orbit(i, 8, 0);
  const [bx, by] = orbit(7 - i, 5, 2);
  return frame(24, 18, [
    [ax, ay, i % 2 ? MOTH_OPEN : MOTH_SHUT],
    [bx, by, i % 2 ? MOTH_SHUT : MOTH_OPEN],
  ]);
});

/** A pair of needles drifting down on the sea wind, west and down, turning as they fall. */
const NEEDLE = ["d.\n.m", ".d\nm.", "dm", "m.\n.d"];
const needles = Array.from({ length: 8 }, (_, i) =>
  frame(20, 36, [
    [14 - i, 2 + i * 4, NEEDLE[i % 4] as string],
    [Math.max(0, 6 - Math.floor(i / 2)), (20 + i * 2) % 34, NEEDLE[(i + 2) % 4] as string],
  ]),
);

export default [
  sprite({
    name: "moths",
    size: [24, 18],
    origin: [10, 8],
    palette,
    lone,
    outline: false,
    frames: Object.fromEntries(moths.map((g, i) => [`fly${i}`, g])),
    anim: { fly: { frames: moths.map((_, i) => `fly${i}`), fps: 8 } },
  }),
  sprite({
    name: "needles-drift",
    size: [20, 36],
    origin: [0, 0],
    palette,
    lone,
    outline: false,
    frames: Object.fromEntries(needles.map((g, i) => [`fall${i}`, g])),
    anim: { fall: { frames: needles.map((_, i) => `fall${i}`), fps: 5 } },
  }),
];
