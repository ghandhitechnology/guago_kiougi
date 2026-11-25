import { type Legend, sprite } from "../../format.ts";
import { clean, ell, paintAt } from "../../fx.ts";

/**
 * The local player's footing on the ground, so they find themselves in a crowd of students.
 * Amber like their own 예보, never red.
 */
const MARKS: Legend = {
  ".": null,
  g: "gold.mid",
  y: "gold.pale",
};

const fx = { group: "combat", outline: false, palette: MARKS } as const;

/** The local player's ring: a thin ellipse, bright in front and darker behind, lit from above. */
function ring(bright: string, back: string): string {
  return clean(
    paintAt(20, 8, (x, y) => {
      const e = ell(x + 0.5, y + 0.5, 10, 4, 9.5, 3.6);
      if (e > 1 || e < 0.72) return null;
      return y + 0.5 < 4 ? back : bright;
    }),
  ).toString();
}

const selfRing = sprite({
  ...fx,
  name: "self-ring",
  size: [20, 8],
  origin: [10, 4],
  frames: { idle: ring("y", "g") },
  anim: { idle: { frames: ["idle"], fps: 1, loop: false } },
});

export default [selfRing];
