import { type Legend, sprite } from "../../format.ts";
import {
  type Axis,
  aimedFrames,
  capFrames,
  clean,
  ell,
  framesOf,
  line,
  lineFrames,
  names,
  Pic,
  paintAt,
  path,
  put,
  rng,
  wrap,
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
 * four steps with a bright front, then the flash. Drawn once per radius, so the dashes stay
 * about four pixels long and the stripes three wide at every size.
 */
function circle(r: number, k: number): Pic {
  const w = r * 2 + 4;
  const h = r + 4;
  const cx = w / 2;
  const cy = h / 2;
  const rx = r;
  const ry = r / 2;
  const rimW = r >= 48 ? 2.2 : 1.4;
  const fill = [0, 0.3, 0.55, 0.8, 1, 1][k] as number;
  return clean(
    paintAt(w, h, (x, y, px, py) => {
      const e = ell(x, y, cx, cy, rx, ry);
      if (e > 1) return null;
      const rim = e > 1 - rimW / ry;
      if (k === 5) return rim ? "W" : e > 0.75 ? "p" : "l";
      if (rim) {
        if (k === 0) {
          const a = Math.atan2(y - cy, (x - cx) * 0.5) + 4;
          return Math.floor((a * r) / 5) % 2 ? "m" : null;
        }
        return k === 4 ? "l" : "m";
      }
      if (e < fill) return Math.abs(e - fill) < 1.6 / ry && fill < 1 ? "m" : stripe(px, py);
      return null;
    }),
  );
}

/** Every radius a monster or boss draws: 32 the bomber, 56 the golem, 80 its enraged 78. */
export const CIRCLE_R = [16, 24, 32, 48, 56, 64, 80] as const;

const teleCircle = sprite({
  ...fx,
  name: "tele-circle",
  size: [164, 84],
  origin: [82, 42],
  frames: Object.fromEntries(
    CIRCLE_R.flatMap((r) =>
      [0, 1, 2, 3, 4, 5].map((k) => [
        `r${r}-${k}`,
        put(
          Pic.blank(164, 84),
          circle(r, k),
          82 - (r + 2),
          42 - Math.floor((r + 4) / 2),
        ).toString(),
      ]),
    ),
  ),
  anim: Object.fromEntries(
    CIRCLE_R.flatMap((r) => [
      // The client paces `fill` over the attack's wind-up, then plays `fire`.
      [`fill${r}`, { frames: names(`r${r}-`, 5), fps: 4, loop: false, jump: 1 }],
      [`fire${r}`, { frames: [`r${r}-5`, `r${r}-4`, `r${r}-5`], fps: 15, loop: false, jump: 1 }],
      ...(r === 24
        ? [
            ["fill", { frames: names("r24-", 5), fps: 4, loop: false, jump: 1 }],
            ["fire", { frames: ["r24-5", "r24-4", "r24-5"], fps: 15, loop: false, jump: 1 }],
          ]
        : []),
    ]),
  ),
});

/** A charge lane's half width: the charger's radius and two, as the server tests it. */
const LANE_HW = 8;
const LANE_LENGTH = 12;

/**
 * A charge lane, laid tile by tile along the charge at the nearest of sixteen aims: dashed
 * edges, hazard stripes and chevrons marching the way the monster will come, then a solid
 * flash. Stripes and chevrons are drawn across the lane's own axis, so they meet from tile to
 * tile at any angle.
 */
function lane(ax: Axis, k: number): Pic {
  const fire = k === 4;
  const pic = paintAt(ax.size, ax.size, (_x, _y, px, py) => {
    const { t, n } = ax.of(px, py);
    const an = Math.abs(n);
    if (an >= LANE_HW) return null;
    if (an > LANE_HW - 1.2) return fire ? "W" : wrap(t - k * 1.5, 6) < 4 ? "m" : "o";
    if (wrap(t + an * 0.8 - k * 3, 12) < 2 && an < LANE_HW - 2.5) return fire ? "W" : "m";
    if (fire) return an > LANE_HW - 2.5 ? "p" : "l";
    return wrap(t - n - k * 1.5, 6) < 3 ? "d" : "o";
  });
  return clean(pic, DANGER_LONE);
}

const LANE_ANIMS = {
  charge: { stages: [0, 1, 2, 3], fps: 10 },
  fire: { stages: [4, 0, 4], fps: 15, loop: false },
} as const;

const teleLine = sprite({
  ...fx,
  name: "tele-line",
  size: [44, 44],
  origin: [22, 22],
  ...lineFrames(
    { length: LANE_LENGTH, canvas: 44, lone: DANGER_LONE, draw: (ax, k) => lane(ax, k) },
    LANE_ANIMS,
  ),
});

/**
 * Where the charge stops: a bar across the lane a pixel wider than it, and brackets reaching
 * back along both edges. It blinks while the lane charges.
 */
function laneEnd(ax: Axis, k: number): Pic {
  const fire = k === 4;
  return clean(
    paintAt(ax.size, ax.size, (_x, _y, px, py) => {
      const { t, n } = ax.of(px, py);
      const an = Math.abs(n);
      if (an >= LANE_HW + 1) return null;
      if (t >= -0.5 && t < 1.5) return fire ? "W" : k % 2 ? "l" : "m";
      if (t >= -1.5 && t < -0.5) return fire ? "p" : "d";
      if (t >= -5 && t < -1.5 && an > LANE_HW - 1.5) return fire ? "W" : "m";
      return null;
    }),
    DANGER_LONE,
  );
}

const teleLineEnd = sprite({
  ...fx,
  name: "tele-line-end",
  size: [24, 24],
  origin: [12, 12],
  ...capFrames(24, laneEnd, LANE_ANIMS, DANGER_LONE),
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

export default [teleCircle, teleLine, teleLineEnd, teleCone, eliteAura, bossMarkSprite];
