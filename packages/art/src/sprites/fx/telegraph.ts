import { type Legend, sprite } from "../../format.ts";
import {
  aimedFrames,
  clean,
  ell,
  framesOf,
  line,
  names,
  Pic,
  paintAt,
  path,
  put,
  rng,
} from "../../fx.ts";

/**
 * Enemy danger: red, and only here. Every enemy warning is filled with diagonal hazard stripes
 * that no player effect ever uses, its edge is a red dashed line, and its last frame (`fire`) is
 * a solid flash that means "now". The player's own 예보 is amber and traced, never striped.
 */
export const DANGER: Legend = {
  ".": null,
  o: "red.deep",
  d: "red.dark",
  m: "red.mid",
  l: "red.light",
  p: "red.pale",
  W: "stone.bright",
  K: "ink.deep",
  // Lone sparks.
  "*": "stone.bright",
  "'": "red.pale",
  ",": "red.light",
};
export const DANGER_LONE = "*',";
const fx = { group: "combat", outline: false, palette: DANGER, lone: DANGER_LONE } as const;

/** Hazard stripes: dark and darker red bands running down to the right. */
export const stripe = (x: number, y: number): string =>
  Math.floor((x + y) / 3) % 2 === 0 ? "d" : "o";

/**
 * A circular area that fills from the centre: the dashed rim, then stripes growing outward in
 * four steps with a bright front, then the flash.
 */
function circle(k: number): Pic {
  const w = 48;
  const h = 26;
  const cx = 24;
  const cy = 13;
  const rx = 22;
  const ry = 11;
  const fill = [0, 0.3, 0.55, 0.8, 1, 1][k] as number;
  return clean(
    paintAt(w, h, (x, y, px, py) => {
      const e = ell(x, y, cx, cy, rx, ry);
      if (e > 1) return null;
      const rim = e > 1 - 1.4 / ry;
      if (k === 5) return rim ? "W" : e > 0.75 ? "p" : "l";
      if (rim) {
        if (k === 0)
          return Math.floor((Math.atan2(y - cy, (x - cx) * 0.5) + 4) * 4) % 2 ? "m" : null;
        return k === 4 ? "l" : "m";
      }
      if (e < fill) return Math.abs(e - fill) < 1.6 / ry && fill < 1 ? "m" : stripe(px, py);
      return null;
    }),
  );
}

const teleCircle = sprite({
  ...fx,
  name: "tele-circle",
  size: [48, 26],
  origin: [24, 13],
  frames: framesOf("t", [0, 1, 2, 3, 4, 5].map(circle)),
  anim: {
    // The client paces `fill` over the attack's wind-up, then plays `fire`.
    fill: { frames: names("t", 5), fps: 4, loop: false, jump: 1 },
    fire: { frames: ["t5", "t4", "t5"], fps: 15, loop: false, jump: 1 },
  },
});

/**
 * A charge lane, tiled along the charge: dashed edges and chevrons marching in the charge's
 * direction (+x), then a solid flash.
 */
function lane(k: number): Pic {
  const w = 32;
  const h = 13;
  const pic = Pic.blank(w, h);
  const fire = k === 4;
  for (let x = 0; x < w; x++) {
    const dash = (x + k * 2) % 6 < 4;
    if (fire || dash) {
      pic.set(x, 0, fire ? "W" : "m");
      pic.set(x, h - 1, fire ? "W" : "m");
    }
  }
  if (fire) {
    for (let y = 1; y < h - 1; y++)
      for (let x = 0; x < w; x++) pic.set(x, y, y === 1 || y === h - 2 ? "p" : "l");
  } else {
    for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) pic.set(x, y, stripe(x - k * 2, y));
  }
  for (let c = 0; c < w; c += 8) {
    const x = (c + k * 2) % w;
    const ch = fire ? "W" : "m";
    path(
      pic,
      [
        [x, 2],
        [x + 4, 6],
        [x, 10],
      ],
      ch,
    );
    path(
      pic,
      [
        [x + 1, 2],
        [x + 5, 6],
        [x + 1, 10],
      ],
      ch,
    );
  }
  return clean(pic);
}

const teleLine = sprite({
  ...fx,
  name: "tele-line",
  size: [32, 13],
  origin: [0, 6],
  frames: framesOf("t", [0, 1, 2, 3, 4].map(lane)),
  anim: {
    charge: { frames: names("t", 4), fps: 10, jump: 1 },
    fire: { frames: ["t4", "t0", "t4"], fps: 15, loop: false, jump: 1 },
  },
});

/**
 * A cone from the apex at the canvas centre, ±32°, filling outward like the circle. Drawn in
 * sixteen aims so the client never turns it: the stripes stay screen-aligned and the edges stay
 * clean at every angle.
 */
function cone(aim: number, k: number): Pic {
  const w = 88;
  const h = 88;
  const ax = 44;
  const ay = 44;
  const len = 40;
  const half = 0.56;
  const fill = [0, 0.3, 0.55, 0.8, 1, 1][k] as number;
  return clean(
    paintAt(w, h, (x, y, px, py) => {
      const dx = x - ax;
      const dy = y - ay;
      const d = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx) - aim;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (d > len || Math.abs(a) > half || d < 1) return null;
      const side = (half - Math.abs(a)) * d < 1.3;
      const arc = d > len - 1.4;
      if (k === 5) return side || arc ? "W" : d / len > 0.8 ? "p" : "l";
      if (side || arc) {
        if (k === 0) return Math.floor(d / 3) % 2 ? "m" : null;
        return k === 4 ? "l" : "m";
      }
      const f = d / len;
      if (f < fill) return Math.abs(f - fill) < 1.6 / len && fill < 1 ? "m" : stripe(px, py);
      return null;
    }),
  );
}

const CONE_SETS = Array.from({ length: 16 }, (_, d) =>
  [0, 1, 2, 3, 4, 5].map((k) => cone((d / 16) * Math.PI * 2, k)),
);

const teleCone = sprite({
  ...fx,
  name: "tele-cone",
  size: [88, 88],
  origin: [44, 44],
  frames: aimedFrames("d", CONE_SETS),
  anim: {
    // `fill` and `fire` aim right; `fill0`..`fill15` and `fire0`..`fire15` aim clockwise.
    fill: { frames: names("d0-", 5), fps: 4, loop: false, jump: 1 },
    fire: { frames: ["d0-5", "d0-4", "d0-5"], fps: 15, loop: false, jump: 1 },
    ...Object.fromEntries(
      CONE_SETS.flatMap((_, d) => [
        [`fill${d}`, { frames: names(`d${d}-`, 5), fps: 4, loop: false, jump: 1 }],
        [`fire${d}`, { frames: [`d${d}-5`, `d${d}-4`, `d${d}-5`], fps: 15, loop: false, jump: 1 }],
      ]),
    ),
  },
});

// Elites and field bosses ----------------------------------------------------------------------

/**
 * An elite's aura: a red-pen ring under its feet that turns, and red sparks rising from it,
 * drawn behind the monster.
 */
function aura(k: number): Pic {
  const w = 32;
  const h = 30;
  const cx = 16;
  const cy = 25;
  const pic = paintAt(w, h, (x, y) => {
    const e = (ell(x, y, cx, cy, 13, 4.5) - 1) * 4.5;
    if (e > 0.5 || e < -1.2) return null;
    const a = Math.atan2(y - cy, (x - cx) * 0.35);
    const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 10 + k * 0.5) % 2;
    return seg ? (y < cy ? "m" : "l") : y < cy ? "d" : "m";
  });
  const r = rng(77);
  for (let i = 0; i < 6; i++) {
    const x = 4 + r() * 24;
    const rise = (r() * 4 + k * 4) % 16;
    const y = cy - 2 - rise;
    put(pic, rise < 8 ? "l\nm" : rise < 13 ? "p" : "'", x, y);
  }
  return clean(pic, DANGER_LONE);
}

const eliteAura = sprite({
  ...fx,
  name: "fx-elite-aura",
  size: [32, 30],
  origin: [16, 25],
  frames: framesOf("a", [0, 1, 2, 3].map(aura)),
  anim: { aura: { frames: names("a", 4), fps: 8, jump: 1 } },
});

/**
 * Where a field boss will come up: a red-pen circle scrawled round on the ground, then the pen's
 * cross through it, the way a wrong answer is marked, then the whole mark throbbing until the
 * boss breaks through.
 */
function bossMark(k: number): Pic {
  const w = 72;
  const h = 36;
  const cx = 36;
  const cy = 18;
  const rx = 32;
  const ry = 15;
  const sweep = [0.35, 0.7, 1.05, 1.05, 1.05, 1.05][k] as number;
  const pic = paintAt(w, h, (x, y) => {
    const e = (ell(x, y, cx, cy, rx, ry) - 1) * ry;
    if (e > 0.6 || e < -1.6) return null;
    const a = (Math.atan2(y - cy, (x - cx) * (ry / rx)) + Math.PI * 1.5) % (Math.PI * 2);
    if (a / (Math.PI * 2) > sweep) return null;
    if (k === 5) return e > -0.6 ? "l" : "p";
    return e > -0.5 ? "m" : "d";
  });
  // The pen overshoots where the loop closes.
  if (sweep > 1)
    path(
      pic,
      [
        [cx - 3, cy - ry - 1],
        [cx + 6, cy - ry - 2],
      ],
      k === 5 ? "l" : "m",
    );
  if (k >= 3) {
    const ch = k === 5 ? "p" : "m";
    const n = k === 3 ? 1 : 2;
    const strokes: [number, number, number, number][] = [
      [cx - 12, cy - 9, cx + 12, cy + 9],
      [cx + 12, cy - 9, cx - 12, cy + 9],
    ];
    for (const [x0, y0, x1, y1] of strokes.slice(0, n)) {
      line(pic, x0, y0, x1, y1, ch);
      line(pic, x0 + 1, y0, x1 + 1, y1, ch);
      line(pic, x0, y0 + 1, x1, y1 + 1, "d");
    }
  }
  return clean(pic);
}

const bossMarkSprite = sprite({
  ...fx,
  name: "fx-boss-mark",
  size: [72, 36],
  origin: [36, 18],
  frames: framesOf("m", [0, 1, 2, 3, 4, 5].map(bossMark)),
  anim: {
    draw: { frames: ["m0", "m1", "m2", "m3", "m4"], fps: 8, loop: false, jump: 1 },
    throb: { frames: ["m4", "m5"], fps: 4, jump: 1 },
  },
});

export default [teleCircle, teleLine, teleCone, eliteAura, bossMarkSprite];
