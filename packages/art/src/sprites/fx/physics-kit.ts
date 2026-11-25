import { type Legend, sprite } from "../../format.ts";
import {
  aimed,
  aimedFrames,
  clean,
  framesOf,
  line,
  names,
  Pic,
  paintAt,
  put,
  rng,
} from "../../fx.ts";
import { shade } from "../../paint.ts";
import { PHYS, PHYS_LONE } from "./physics.ts";

/**
 * 물리, the rest of the launch kit: 역학 실험 키트's pendulum, 광학 노트's laser and its
 * reflections, 운동량 문제집's dash, 중력 탐구 보고서's apple and well, and 광학 노트's
 * evolution, the spectrum. Plum light with a white-hot core; weight shown by size, speed by
 * streaks.
 */
const fx = { group: "combat", outline: false, palette: PHYS, lone: PHYS_LONE } as const;

/** Directions every aimed 물리 shape is drawn in. */
export const DIRS = 16;

// 역학 실험 키트 ------------------------------------------------------------------------------

/** A plum iron bob, lit from the top left, with a hot glint. */
export function bob(d: number): Pic {
  const c = d / 2;
  const pic = shade(
    d,
    d,
    (x, y) => Math.hypot(x + 0.5 - c, y + 0.5 - c) <= c - 0.3,
    { outline: "o", dark: "d", mid: "m", light: "l", glint: "p" },
    { light: 3, dark: 2 },
  );
  put(pic, "WW\nW.", Math.round(c - c * 0.55), Math.round(c - c * 0.55));
  return clean(pic, PHYS_LONE);
}

const pendulum = sprite({
  ...fx,
  name: "atk-pendulum",
  size: [16, 16],
  origin: [8, 8],
  frames: {
    bob: bob(16).toString(),
    // The rod: a tile the client stretches from the pivot to the bob and turns with the swing.
    rod: put(Pic.blank(16, 16), "dld\ndld\ndld\ndld", 6, 6).toString(),
    pivot: put(Pic.blank(16, 16), ".oo.\nollo\nommo\n.oo.", 6, 6).toString(),
  },
  anim: {
    bob: { frames: ["bob"], fps: 1, loop: false },
    rod: { frames: ["rod"], fps: 1, loop: false },
    pivot: { frames: ["pivot"], fps: 1, loop: false },
  },
});

// 광학 노트 -----------------------------------------------------------------------------------

/**
 * The laser: one 16-pixel tile of a straight beam, white along its core, plum to either side and
 * plum mid on its lower edge so it holds on bright ground. Two frames flicker its width.
 */
function laser(k: number, core = "W", glow = "p", edge = "l"): Pic {
  const pic = Pic.blank(16, 7);
  for (let x = 0; x < 16; x++) {
    const thin = k === 1 && x % 8 >= 6;
    pic.set(x, 3, core);
    if (!thin) pic.set(x, 2, glow);
    pic.set(x, 4, edge);
    if (!thin) pic.set(x, 5, "m");
  }
  return pic;
}

const laserSprite = sprite({
  ...fx,
  name: "atk-laser",
  blend: "add",
  size: [16, 7],
  origin: [0, 3],
  frames: framesOf(
    "seg",
    [0, 1].map((k) => laser(k)),
  ),
  anim: { beam: { frames: ["seg0", "seg1"], fps: 20, jump: 1 } },
});

/** Where the laser turns off a wall: a flare with a short cross. */
function reflect(k: number): Pic {
  const pic = Pic.blank(13, 13);
  const r = [3, 5, 4][k] as number;
  line(pic, 6 - r, 6, 6 + r, 6, k === 2 ? "l" : "p");
  line(pic, 6, 6 - r, 6, 6 + r, k === 2 ? "l" : "p");
  put(pic, k === 1 ? "WWW\nWWW\nWWW" : ".W.\nWWW\n.W.", 5, 5);
  return clean(pic, PHYS_LONE);
}

const reflectSprite = sprite({
  ...fx,
  name: "fx-reflect",
  blend: "add",
  size: [13, 13],
  origin: [6, 6],
  frames: framesOf("r", [0, 1, 2].map(reflect)),
  anim: { flash: { frames: names("r", 3), fps: 20, loop: false, jump: 1 } },
});

/**
 * 스펙트럼: the beam split in seven, 빨주노초파남보, a white core in each. The first band is rose,
 * not red: red stays the enemy's.
 */
const BANDS = [
  ["rose.mid", "rose.light"],
  ["clay.mid", "clay.light"],
  ["gold.mid", "gold.light"],
  ["grass.mid", "grass.light"],
  ["sea.mid", "sea.light"],
  ["navy.mid", "navy.light"],
  ["plum.mid", "plum.light"],
] as const;
const SPECTRUM: Legend = {
  ".": null,
  W: "stone.bright",
  ...Object.fromEntries(
    BANDS.flatMap(([mid, light], i) => [
      [`${i}`, light],
      [`abcdefg`[i] as string, mid],
    ]),
  ),
};

const spectrum = sprite({
  name: "atk-spectrum",
  group: "combat-evolved",
  outline: false,
  blend: "add",
  palette: SPECTRUM,
  size: [16, 7],
  origin: [0, 3],
  frames: Object.fromEntries(
    BANDS.flatMap((_, i) =>
      [0, 1].map((k) => [
        `c${i}-${k}`,
        laser(k, "W", `${i}`, `${i}`)
          .swap("m", "abcdefg"[i] as string)
          .toString(),
      ]),
    ),
  ),
  anim: Object.fromEntries(
    BANDS.map((_, i) => [`c${i}`, { frames: [`c${i}-0`, `c${i}-1`], fps: 20, jump: 1 }]),
  ),
});

// 운동량 문제집 -------------------------------------------------------------------------------

/**
 * The dash's bow wave: a plum crescent of pushed air in front of the student with speed lines
 * trailing back, drawn in sixteen directions so it is never turned by the client.
 */
function bow(a: number, k: number): Pic {
  const s = 36;
  const c = s / 2;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const pic = paintAt(s, s, (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    // The crescent: a band ahead of the body, bent back at its tips.
    const bend = along - 7 + across * across * 0.09;
    if (Math.abs(across) < 10 && bend > -1.9 && bend < 1.5)
      return bend > 0.4 ? "W" : bend > -0.7 ? "l" : "m";
    if (Math.abs(across) < 8 && bend > 1.5 && bend < 2.5 && k === 0) return "p";
    return null;
  });
  // Speed lines behind.
  for (const [off, len] of [
    [-5, 10],
    [0, 14],
    [5, 9],
  ] as const) {
    const sx = c - ux * (4 + k * 2) - uy * off;
    const sy = c - uy * (4 + k * 2) + ux * off;
    line(pic, sx, sy, sx - ux * len, sy - uy * len, k === 0 ? "p" : "l");
  }
  return clean(pic, PHYS_LONE);
}

const dash = sprite({
  ...fx,
  name: "atk-dash",
  blend: "add",
  size: [36, 36],
  origin: [18, 18],
  frames: aimedFrames(
    "d",
    aimed(DIRS, (a) => bow(a, 0)).map((p, i) => [p, bow((i / DIRS) * Math.PI * 2, 1)]),
  ),
  anim: Object.fromEntries(
    Array.from({ length: DIRS }, (_, d) => [
      `d${d}`,
      { frames: [`d${d}-0`, `d${d}-1`], fps: 16, jump: 1 },
    ]),
  ),
});

// 중력 탐구 보고서 ----------------------------------------------------------------------------

/** The apple that marks the well: it falls, squashes on landing, and the well opens under it. */
const APPLE: Legend = {
  ...PHYS,
  A: "rose.dark",
  B: "rose.mid",
  C: "rose.light",
  g: "grass.mid",
  w: "wood.mid",
};
function apple(k: number): Pic {
  const pic = Pic.blank(14, 18);
  const body = shade(
    10,
    9,
    (x, y) => ((x + 0.5 - 5) / 4.8) ** 2 + ((y + 0.5 - 4.5) / (k === 2 ? 3.6 : 4.4)) ** 2 <= 1,
    { outline: "A", dark: "A", mid: "B", light: "C" },
  );
  const y = [2, 6, 9][k] as number;
  put(pic, body, 2, y);
  put(pic, "w\nw", 7, y - 2);
  put(pic, "gg", 8, y - 2);
  if (k < 2) {
    line(pic, 3, y - 4, 3, y - 1, "l");
    line(pic, 10, y - 5, 10, y - 2, "l");
  }
  return clean(pic, PHYS_LONE);
}

const well = sprite({
  name: "atk-well",
  group: "combat",
  outline: false,
  palette: APPLE,
  lone: PHYS_LONE,
  size: [14, 18],
  origin: [7, 17],
  frames: framesOf("a", [0, 1, 2].map(apple)),
  anim: { drop: { frames: names("a", 3), fps: 12, loop: false, jump: 1 } },
});

/**
 * The well on the ground: spiral arms of plum light turning in toward a dark centre, motes being
 * pulled along them. `rx` sets its size: 48 for the book, 80 for 만유인력.
 */
export function spiral(rx: number, k: number, arms = 3): Pic {
  const ry = rx * 0.5;
  const w = Math.ceil(rx * 2 + 4);
  const h = Math.ceil(ry * 2 + 4);
  const cx = w / 2;
  const cy = h / 2;
  const turn = (k / 4) * ((Math.PI * 2) / arms);
  const pic = paintAt(w, h, (x, y) => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    const r = Math.hypot(dx, dy);
    if (r > 1) return null;
    if (r < 0.16) return "o";
    if (r < 0.26) return "d";
    const a = Math.atan2(dy, dx);
    // Logarithmic arms: the angle along an arm grows as the radius shrinks.
    const phase = (((a + turn + Math.log(r) * 2.4) * arms) / (Math.PI * 2)) % 1;
    const p = (phase + 1) % 1;
    if (p < 0.12) return r > 0.75 ? "m" : "l";
    if (p < 0.2 && r < 0.7) return "p";
    if (r > 0.94) return "d";
    return null;
  });
  const r = rng(Math.round(rx) + k);
  for (let i = 0; i < Math.round(rx / 6); i++) {
    const a = r() * Math.PI * 2;
    const d = 0.35 + r() * 0.55;
    pic.set(
      Math.round(cx + Math.cos(a) * d * rx),
      Math.round(cy + Math.sin(a) * d * ry),
      i % 2 ? "'" : ",",
    );
  }
  return clean(pic, PHYS_LONE);
}

const wellArea = sprite({
  ...fx,
  name: "fx-well",
  size: [100, 52],
  origin: [50, 26],
  frames: framesOf(
    "w",
    [0, 1, 2, 3].map((k) => spiral(48, k)),
  ),
  anim: { pull: { frames: names("w", 4), fps: 10, jump: 1 } },
});

export default [pendulum, laserSprite, reflectSprite, spectrum, dash, well, wellArea];
