import { type Legend, sprite } from "../../format.ts";

/**
 * A charge's path, laid down dot by dot: the client plants these along any angle (they never
 * turn, so the line stays crisp at ×1), lights them from the monster outward over the wind-up,
 * and flashes them all on `fire`. Hazard red like every other enemy tell.
 */
const DANGER: Legend = {
  ".": null,
  o: "red.deep",
  d: "red.dark",
  m: "red.mid",
  l: "red.light",
  p: "red.pale",
  W: "stone.bright",
};

const tellDot = sprite({
  group: "combat",
  outline: false,
  palette: DANGER,
  name: "tell-dot",
  size: [4, 4],
  origin: [2, 2],
  frames: {
    dim: ".oo.\nodmo\nomdo\n.oo.",
    lit: ".oo.\nolmo\nomlo\n.oo.",
    fire: ".dd.\ndWpd\ndpWd\n.dd.",
  },
  anim: {
    dim: { frames: ["dim"], fps: 1, loop: false },
  },
});

export default [tellDot];
