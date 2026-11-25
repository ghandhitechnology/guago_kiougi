import { type Legend, sprite } from "../../format.ts";
import { clean, ell, framesOf, line, names, Pic, paintAt, path, put, rng } from "../../fx.ts";
import { EARTH, EARTH_LONE } from "./earth.ts";

/**
 * 지구과학, the rest of the launch kit: 일기도 분석 노트's storm cloud, its rain and its
 * lightning, 천체 관측 일지's meteor and crater, 조석 예보표's tide, 화산 탐구 보고서's vent and
 * lava, and the round 예보 mark the circle telegraphs share. Amber and umber; weather is slate
 * grey lit gold from inside, water is a sunset tide with white foam.
 */
export const SKY: Legend = {
  ...EARTH,
  // Storm cloud.
  k: "ink.dark",
  i: "ink.mid",
  n: "stone.dark",
  // Lava.
  r: "clay.mid",
  R: "clay.light",
  c: "clay.dark",
  // Rain.
  w: "stone.pale",
  v: "stone.light",
};
const fx = { group: "combat", outline: false, palette: SKY, lone: EARTH_LONE } as const;

// 일기도 분석 노트 ----------------------------------------------------------------------------

/** Puffs of a storm cloud: slate, lit grey on top, dark below, gold flickering in its belly. */
export function cloud(w: number, h: number, k: number, flash: boolean, seed = 3): Pic {
  const r = rng(seed);
  const n = Math.round(w / 8);
  const puffs = Array.from({ length: n }, (_, i) => {
    const edge = Math.min(i, n - 1 - i);
    const rr = 4 + r() * 3 + Math.min(edge, 2) * 1.6;
    return {
      x: 5 + (i / Math.max(1, n - 1)) * (w - 10) + (r() - 0.5) * 3,
      y: h - 6 - rr * 0.55 - r() * 2,
      rr,
    };
  });
  const pic = paintAt(w, h, (x, y) => {
    let best = 9;
    let near = puffs[0] as (typeof puffs)[number];
    for (const p of puffs) {
      const dx = x - p.x - Math.sin(k * 1.7 + p.x) * 0.8;
      const d = Math.hypot(dx, (y - p.y) * 1.15) - p.rr;
      if (d < best) {
        best = d;
        near = p;
      }
    }
    if (y > h - 5) return null;
    if (best > 0) return null;
    if (best > -1) return "k";
    if (y > h - 8) return flash ? "l" : "i";
    // Each puff lit on its top-left, shaded under.
    const up = (y - near.y) / near.rr;
    const left = (x - near.x) / near.rr;
    if (up + left * 0.5 < -0.55) return "s";
    if (up < -0.1) return "a";
    return "i";
  });
  if (flash) {
    path(
      pic,
      [
        [w / 2 - 3, h * 0.4],
        [w / 2 + 1, h * 0.55],
        [w / 2 - 2, h * 0.6],
        [w / 2 + 3, h * 0.78],
      ],
      "p",
      false,
      "ia",
    );
  }
  return clean(pic, EARTH_LONE);
}

const cloudSprite = sprite({
  ...fx,
  name: "atk-cloud",
  size: [52, 24],
  origin: [26, 20],
  frames: {
    ...framesOf(
      "c",
      [0, 1, 2].map((k) => cloud(52, 24, k, false)),
    ),
    flash: cloud(52, 24, 1, true).toString(),
  },
  anim: {
    drift: { frames: names("c", 3), fps: 3, jump: 1 },
    flash: { frames: ["flash", "c1", "flash"], fps: 14, loop: false, jump: 1 },
  },
});

/** Rain under the cloud: slanting streaks over a radius-40 patch and the rings they leave. */
export function rain(rx: number, k: number): Pic {
  const ry = rx * 0.5;
  const w = Math.ceil(rx * 2 + 4);
  const h = Math.ceil(ry * 2 + 24);
  const cx = w / 2;
  const cy = h - ry - 2;
  const pic = Pic.blank(w, h);
  const r = rng(Math.round(rx));
  const drops = Math.round(rx * 0.6);
  for (let i = 0; i < drops; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const gx = cx + Math.cos(a) * rx * d;
    const gy = cy + Math.sin(a) * ry * d;
    const fall = ((r() * 24 + k * 8) % 24) | 0;
    const top = gy - 22 + fall;
    if (fall < 18) line(pic, gx + 3, top, gx, top + 4, i % 3 ? "v" : "w");
    else put(pic, "v.v", gx - 1, gy);
  }
  return clean(pic, `${EARTH_LONE}vw`);
}

const rainArea = sprite({
  ...fx,
  name: "fx-rain",
  lone: `${EARTH_LONE}vw`,
  size: [84, 64],
  origin: [42, 42],
  frames: framesOf(
    "r",
    [0, 1, 2].map((k) => rain(40, k)),
  ),
  anim: { fall: { frames: names("r", 3), fps: 10, jump: 1 } },
});

/**
 * The strike the storm saves up: a gold bolt straight down from the cloud base to the ground,
 * a flash where it lands, then the afterimage. Drawn tall; the client scales it in y only.
 */
function thunder(k: number): Pic {
  const w = 24;
  const h = 64;
  const pic = Pic.blank(w, h);
  if (k === 2) {
    put(
      pic,
      paintAt(w, h, (x, y) =>
        ell(x, y, 12, 60, 9, 3) < 1 && ell(x, y, 12, 60, 7, 2) > 1 ? "l" : null,
      ),
      0,
      0,
    );
    return clean(pic, EARTH_LONE);
  }
  const r = rng(11 + k);
  const pts: [number, number][] = [[12, 0]];
  for (let y = 6; y < 58; y += 6) pts.push([12 + Math.round((r() - 0.5) * 8), y]);
  pts.push([12, 60]);
  path(pic, pts, k === 0 ? "W" : "p");
  path(
    pic,
    pts.map(([x, y]) => [x + 1, y] as [number, number]),
    k === 0 ? "p" : "l",
    false,
    ".",
  );
  // A gold glow either side, and an umber edge outside it so the strike holds on bright dirt.
  const glow = pic.clone();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (pic.at(x, y) !== ".") continue;
      if (pic.at(x - 1, y) !== "." || pic.at(x + 1, y) !== ".") glow.set(x, y, k === 0 ? "l" : "m");
    }
  const edged = glow.clone();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (glow.at(x, y) !== ".") continue;
      if (glow.at(x - 1, y) !== "." || glow.at(x + 1, y) !== ".") edged.set(x, y, "o");
    }
  put(
    glow,
    paintAt(w, h, (x, y) => (ell(x, y, 12, 60, 7, 2.5) < 1 ? (k === 0 ? "W" : "p") : null)),
    0,
    0,
  );
  return clean(glow, EARTH_LONE);
}

const thunderSprite = sprite({
  ...fx,
  name: "fx-thunder",
  blend: "add",
  size: [24, 64],
  origin: [12, 60],
  frames: framesOf("t", [0, 1, 2].map(thunder)),
  anim: { strike: { frames: names("t", 3), fps: 16, loop: false, jump: 1 } },
});

// The round forecast ---------------------------------------------------------------------------

/**
 * 예보 for a circle: an amber survey ring on the ground with a crosshair, its dashes closing up
 * and its ticks lengthening as the strike nears, then a solid white ring that says now. Drawn at
 * radius 32; the client scales it (in whole pixels) to the mark's radius.
 */
function forecastRing(k: number): Pic {
  const w = 72;
  const h = 40;
  const cx = w / 2;
  const cy = h / 2;
  const rx = 32;
  const ry = 16;
  const gaps = [0.5, 0.35, 0.2, 0.08, 0][k] as number;
  const pic = paintAt(w, h, (x, y) => {
    const e = (ell(x, y, cx, cy, rx, ry) - 1) * ry;
    if (e > 0.6 || e < (k >= 2 ? -1.6 : -0.6)) return null;
    const a = (Math.atan2(y - cy, (x - cx) * 0.5) + Math.PI) / (Math.PI * 2);
    if ((a * 16) % 1 < gaps) return null;
    if (k === 4) return e > -0.4 ? "o" : "W";
    return e > 0 ? "o" : k >= 2 ? "l" : "m";
  });
  const tick = [2, 3, 4, 5, 5][k] as number;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const ex = cx + dx * rx;
    const ey = cy + dy * ry;
    line(pic, ex - dx * tick, ey - dy * Math.ceil(tick / 2), ex + dx, ey + dy, k === 4 ? "W" : "d");
  }
  line(pic, cx - 3, cy, cx + 3, cy, k >= 3 ? "l" : "m");
  line(pic, cx, cy - 2, cx, cy + 2, k >= 3 ? "l" : "m");
  return clean(pic, EARTH_LONE);
}

const forecastRingSprite = sprite({
  ...fx,
  name: "fx-forecast-ring",
  size: [72, 40],
  origin: [36, 20],
  frames: framesOf("f", [0, 1, 2, 3, 4].map(forecastRing)),
  anim: {
    warn: { frames: names("f", 4), fps: 2, loop: false, jump: 1 },
    break: { frames: ["f4", "f3", "f4"], fps: 12, jump: 1 },
  },
});

// 천체 관측 일지 ------------------------------------------------------------------------------

/**
 * The meteor coming down out of the top right: a white-hot head in an amber shell, its tail of
 * embers behind it. Falls along its own diagonal, so the client only moves it.
 */
export function meteor(size: number, k: number): Pic {
  const pic = Pic.blank(size, size);
  const hx = size * 0.3;
  const hy = size * 0.7;
  const hr = size * 0.14;
  const tail = size * 0.62;
  put(
    pic,
    paintAt(size, size, (x, y) => {
      // Distance along the tail (up and to the right of the head) and across it.
      const u = (x - hx) * Math.SQRT1_2 - (y - hy) * Math.SQRT1_2;
      const v = (x - hx) * Math.SQRT1_2 + (y - hy) * Math.SQRT1_2;
      if (u < 0 || u > tail) return null;
      const width = hr * (1 - u / tail) * 1.1;
      if (Math.abs(v) > width) return null;
      return Math.abs(v) < width * 0.4 && u < tail * 0.5 ? "p" : u < tail * 0.6 ? "l" : "m";
    }),
    0,
    0,
  );
  put(
    pic,
    paintAt(size, size, (x, y) => {
      const d = Math.hypot(x - hx, y - hy);
      if (d > hr) return null;
      if (d > hr - 1) return "d";
      return d < hr * 0.45 ? "W" : "p";
    }),
    0,
    0,
  );
  const r = rng(size + k);
  for (let i = 0; i < 4; i++) {
    const u = tail * (0.3 + r() * 0.8);
    pic.set(
      Math.round(hx + u * Math.SQRT1_2 + (r() - 0.5) * 4),
      Math.round(hy - u * Math.SQRT1_2 + (r() - 0.5) * 4),
      i % 2 ? "'" : ",",
    );
  }
  return clean(pic, EARTH_LONE);
}

const meteorSprite = sprite({
  ...fx,
  name: "atk-meteor",
  blend: "add",
  size: [28, 28],
  origin: [8, 20],
  frames: {
    ...framesOf(
      "m",
      [0, 1, 2].map((k) => meteor(28, k)),
    ),
    ...framesOf(
      "s",
      [0, 1, 2].map((k) => put(Pic.blank(28, 28), meteor(18, k), 3, 9)),
    ),
  },
  anim: {
    fall: { frames: names("m", 3), fps: 14, jump: 1 },
    // 유성우's smaller stones.
    small: { frames: names("s", 3), fps: 14, jump: 1 },
  },
});

/** The meteor's landing: a white flash, a crater with a molten rim, dust thrown out, the scar. */
function crater(k: number): Pic {
  const w = 60;
  const h = 34;
  const cx = 30;
  const cy = 20;
  const pic = Pic.blank(w, h);
  if (k === 0) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = ell(x, y, cx, cy - 2, 13, 8);
        return e < 0.6 ? "W" : e < 1 ? "p" : null;
      }),
      0,
      0,
    );
    return clean(pic, EARTH_LONE);
  }
  // Dust ring.
  if (k <= 2) {
    const rx = [0, 20, 26][k] as number;
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = (ell(x, y, cx, cy, rx, rx * 0.45) - 1) * rx * 0.45;
        if (e > 0.6 || e < -1.4) return null;
        if (k === 2 && Math.floor((Math.atan2(y - cy, (x - cx) * 0.45) + 4) * 2.2) % 2 === 0)
          return null;
        return y < cy ? "t" : "s";
      }),
      0,
      0,
    );
  }
  // The bowl: far wall in shadow, near wall lit, a rim that glows while hot.
  put(
    pic,
    paintAt(w, h, (x, y) => {
      const e = ell(x, y, cx, cy, 11, 5.5);
      if (e > 1.3) return null;
      if (e > 1) return k <= 2 ? "l" : "d";
      if (e > 0.75) return y < cy ? "K" : "o";
      return y < cy ? "K" : k <= 1 ? "p" : "o";
    }),
    0,
    0,
  );
  return clean(pic, EARTH_LONE);
}

const craterSprite = sprite({
  ...fx,
  name: "fx-crater",
  size: [60, 34],
  origin: [30, 20],
  frames: framesOf("c", [0, 1, 2, 3].map(crater)),
  anim: {
    land: { frames: ["c0", "c1", "c2"], fps: 14, loop: false, jump: 1 },
    linger: { frames: ["c3"], fps: 1, loop: false },
  },
});

// 조석 예보표 ---------------------------------------------------------------------------------

/**
 * The tide as a ring on the ground: an amber band of sunset water with white foam on its leading
 * edge, outward on the way out and inward on the way back. One frame per radius.
 */
export function tide(r: number, outward: boolean, canvas: number): Pic {
  const w = canvas;
  const h = Math.ceil(canvas / 2) + 4;
  const cx = w / 2;
  const cy = h / 2;
  const ry = r * 0.5;
  return clean(
    paintAt(w, h, (x, y) => {
      const e = (ell(x, y, cx, cy, r, ry) - 1) * ry;
      if (e > 1 || e < -4) return null;
      const lead = outward ? e : -4 - e;
      if (lead > 0) return "W";
      if (lead > -1) return "w";
      if (lead > -2.4) return (x + y * 3) % 7 === 0 ? "w" : y < cy ? "l" : "m";
      return "d";
    }),
    EARTH_LONE,
  );
}

const TIDE_R = [24, 36, 48, 60, 72, 84, 96];
const tideSprite = sprite({
  ...fx,
  name: "atk-tide",
  size: [200, 104],
  origin: [100, 52],
  frames: {
    ...Object.fromEntries(TIDE_R.map((r) => [`out${r}`, tide(r, true, 200).toString()])),
    ...Object.fromEntries(TIDE_R.map((r) => [`in${r}`, tide(r, false, 200).toString()])),
  },
  anim: {
    out: { frames: TIDE_R.map((r) => `out${r}`), fps: 14, loop: false, jump: 1 },
    back: { frames: [...TIDE_R].reverse().map((r) => `in${r}`), fps: 14, loop: false, jump: 1 },
  },
});

/** Where the tide meets a monster: a burst of foam and amber spray. */
function surf(k: number): Pic {
  const pic = Pic.blank(21, 17);
  const r = rng(5);
  const t = (k + 1) * 0.12;
  for (let i = 0; i < 8; i++) {
    const vx = (r() - 0.5) * 70;
    const vy = -30 - r() * 50;
    const x = 10 + vx * t;
    const y = 13 + vy * t + 200 * t * t;
    put(pic, i % 2 ? "Ww\nwl" : "wl\nlm", x, Math.min(14, y));
  }
  if (k === 0) put(pic, "WWWW\nwwww", 8, 12);
  return clean(pic, EARTH_LONE);
}

const surfSprite = sprite({
  ...fx,
  name: "fx-surf",
  size: [21, 17],
  origin: [10, 14],
  frames: framesOf("s", [0, 1, 2].map(surf)),
  anim: { splash: { frames: names("s", 3), fps: 14, loop: false, jump: 1 } },
});

// 화산 탐구 보고서 ----------------------------------------------------------------------------

/**
 * The vent: a low cone of umber rock with gold-lit cracks. It smokes, rumbles (the cracks glow),
 * erupts in a fountain of lava, and settles.
 */
export function vent(k: number, scale = 1): Pic {
  const w = Math.round(32 * scale);
  const h = Math.round(40 * scale);
  const cx = w / 2;
  const base = h - 2;
  const top = base - 10 * scale;
  const pic = paintAt(w, h, (x, y) => {
    if (y > base || y < top) return null;
    const f = (y - top) / (base - top);
    const half = (4 + f * 11) * scale;
    const d = Math.abs(x - cx);
    if (d > half) return null;
    if (d < 2.2 * scale && y < top + 2 * scale) return "K";
    if (d > half - 1 || y > base - 1) return "K";
    return x < cx - f * 2 ? "n" : "a";
  });
  // Cracks down its flanks.
  const glow = k === 1 || k === 2 || k === 3 ? "l" : "d";
  path(
    pic,
    [
      [cx - 2, top + 2],
      [cx - 4, top + 5],
      [cx - 3, top + 8],
    ],
    glow,
    false,
    "na",
  );
  path(
    pic,
    [
      [cx + 2, top + 2],
      [cx + 5, top + 6],
      [cx + 4, top + 9],
    ],
    glow,
    false,
    "na",
  );
  if (k === 0 || k === 4) {
    put(pic, k === 0 ? ".ii.\niiii\n.ii." : ".ss.\nssss", cx - 2, top - 5);
  }
  if (k === 2 || k === 3) {
    // The fountain.
    const height = k === 2 ? 22 : 14;
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const up = top - y;
        if (up < 0 || up > height * scale) return null;
        const half =
          (2.6 - (up / (height * scale)) * 1.4) * scale + (up > height * scale * 0.7 ? 1.5 : 0);
        if (Math.abs(x - cx) > half) return null;
        const core = Math.abs(x - cx) < half - 1;
        if (!core) return "r";
        return up < height * scale * 0.25 ? "p" : (x + up) % 5 < 2 ? "l" : "R";
      }),
      0,
      0,
    );
    const r = rng(k);
    for (let i = 0; i < 5; i++) {
      put(pic, "Rr\nrc", cx + (r() - 0.5) * 18 * scale, top - height * scale * (0.6 + r() * 0.4));
    }
  }
  return clean(pic, EARTH_LONE);
}

const ventSprite = sprite({
  ...fx,
  name: "atk-vent",
  size: [32, 40],
  origin: [16, 38],
  frames: framesOf(
    "v",
    [0, 1, 2, 3, 4].map((k) => vent(k)),
  ),
  anim: {
    smoke: { frames: ["v0", "v4"], fps: 3, jump: 1 },
    rumble: { frames: ["v1", "v0", "v1"], fps: 10, loop: false, jump: 1 },
    erupt: { frames: ["v2", "v3", "v2", "v3"], fps: 10, loop: false, jump: 1 },
  },
});

/** Lava coming down on the marked circle: blobs land and splash, then lie burning. */
function lava(k: number): Pic {
  const w = 44;
  const h = 30;
  const cx = 22;
  const cy = 20;
  const pic = Pic.blank(w, h);
  const r = rng(9);
  if (k <= 1) {
    for (let i = 0; i < 6; i++) {
      const x = cx + (r() - 0.5) * 30;
      const y = cy + (r() - 0.5) * 10 - (k === 0 ? 14 : 4);
      put(pic, k === 0 ? ".R.\nRpR\nrRr\n.c." : "RpR\nrRr", x, y);
    }
    return clean(pic, EARTH_LONE);
  }
  return clean(
    paintAt(w, h, (x, y) => {
      const a = Math.atan2(y - cy, (x - cx) * 0.5);
      const e = ell(x, y, cx, cy, 16, 7) - 0.15 * Math.sin(4 * a + 1) - 0.1 * Math.sin(7 * a);
      if (e > 1) return null;
      if (e > 0.8) return "c";
      if (k === 3) return e > 0.5 ? "r" : "c";
      if (e > 0.55) return "r";
      return (x + y) % 6 < 2 ? "p" : "R";
    }),
    EARTH_LONE,
  );
}

const lavaSprite = sprite({
  ...fx,
  name: "fx-lava",
  size: [44, 30],
  origin: [22, 20],
  frames: framesOf("l", [0, 1, 2, 3].map(lava)),
  anim: {
    land: { frames: ["l0", "l1", "l2"], fps: 12, loop: false, jump: 1 },
    burn: { frames: ["l2", "l3"], fps: 3, loop: false, jump: 1 },
  },
});

export default [
  cloudSprite,
  rainArea,
  thunderSprite,
  forecastRingSprite,
  meteorSprite,
  craterSprite,
  tideSprite,
  surfSprite,
  ventSprite,
  lavaSprite,
];
