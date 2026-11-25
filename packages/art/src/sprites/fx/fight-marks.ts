import { type Legend, sprite } from "../../format.ts";
import { clean, ell, paintAt } from "../../fx.ts";

/**
 * Marks the fight lays on the ground at any angle. Dots never turn, so a line of them stays crisp
 * at ×1 however it runs: the client plants them along a charge's path or a forecast fault, lights
 * them from the start outward over the wind-up, and flashes them on the strike. Enemy dots are
 * hazard red like every enemy tell; the player's own forecast is amber, never red. The ring is the
 * local player's footing, so they find themselves in a crowd of students.
 */
const MARKS: Legend = {
  ".": null,
  o: "red.deep",
  d: "red.dark",
  m: "red.mid",
  l: "red.light",
  p: "red.pale",
  W: "stone.bright",
  // Amber, for the player's own 예보.
  u: "clay.dark",
  g: "gold.mid",
  Y: "gold.light",
  y: "gold.pale",
};

const fx = { group: "combat", outline: false, palette: MARKS } as const;

/**
 * A dot of a monster's charge lane: a hazard chip, red and dark red in diagonal stripes, so a run
 * of them reads as danger tape and never as a player's trail. Lit for the wind-up, white-hot on
 * the strike.
 */
const tellDot = sprite({
  ...fx,
  name: "tell-dot",
  size: [6, 6],
  origin: [3, 3],
  frames: {
    dim: ".oooo.\noddmmo\nodmmdo\nommddo\nomdddo\n.oooo.",
    lit: ".oooo.\noddllo\nodlldo\nollddo\noldddo\n.oooo.",
    fire: ".dddd.\ndppWWd\ndpWWpd\ndWWppd\ndWpppd\n.dddd.",
  },
  anim: { dim: { frames: ["dim"], fps: 1, loop: false } },
});

const forecastDot = sprite({
  ...fx,
  name: "forecast-dot",
  size: [4, 4],
  origin: [2, 2],
  frames: {
    dim: ".uu.\nugYu\nuYgu\n.uu.",
    lit: ".uu.\nuyYu\nuYyu\n.uu.",
    fire: ".gg.\ngWyg\ngyWg\n.gg.",
  },
  anim: { dim: { frames: ["dim"], fps: 1, loop: false } },
});

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

export default [tellDot, forecastDot, selfRing];
