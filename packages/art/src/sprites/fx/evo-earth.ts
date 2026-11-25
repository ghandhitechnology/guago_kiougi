import { sprite } from "../../format.ts";
import {
  type Axis,
  capFrames,
  clean,
  ell,
  framesOf,
  lineFrames,
  names,
  Pic,
  paintAt,
  path,
  put,
  rng,
  turnCw,
  upSide,
  wrap,
} from "../../fx.ts";
import { EARTH_LONE, FL, ROCK, specimen } from "./earth.ts";
import { cloud, SKY, tide, vent } from "./earth-kit.ts";

/** 지구과학's evolved forms, in the `combat-evolved` atlas. */
const evo = { group: "combat-evolved", outline: false, palette: SKY, lone: EARTH_LONE } as const;

/**
 * 판 구조론: the fault does not close; two plates grind past, the near one's edge diving under
 * the far one, and arrows of gold dust run toward the seam where things are pulled in. Laid along
 * the fault like `fx-fault`, at the nearest of sixteen aims, the far plate always on the side
 * that faces up the screen.
 */
function plates(ax: Axis, k: number): Pic {
  const up = upSide(ax);
  const seam = (t: number) => 1.2 * Math.sin((Math.PI * 2 * (t + (k * FL) / 3)) / FL);
  const pic = paintAt(ax.size, ax.size, (_x, _y, px, py) => {
    const { t, n } = ax.of(px, py);
    // Rows below the seam are positive, as on the screen for a line running right.
    const z = -n * up - seam(t);
    if (z < -4.5 || z >= 4.5) return null;
    if (z < -3.5) return "t";
    if (z < -2.5) return "s";
    if (z < -0.5) return "a";
    if (z < 0.5) return "K";
    if (z < 1.5) return wrap(t + (k * FL) / 9, FL / 3) < FL / 6 ? "l" : "d";
    if (z < 2.5) return "K";
    return "q";
  });
  // Pull arrows from both sides toward the seam.
  const off = (k * 2) % 6;
  const arrow = (t: number, h: number, dir: 1 | -1) => {
    const pts = [
      ax.at(t - 2, up * (h + 2 * dir)),
      ax.at(t, up * h),
      ax.at(t + 2, up * (h + 2 * dir)),
    ];
    path(pic, pts, "d");
  };
  arrow(4, 10 - off, 1);
  arrow(12, -10 + off, -1);
  return pic;
}

const PLATE_ANIMS = { grind: { stages: [0, 1, 2], fps: 6 } } as const;

const plateTectonics = sprite({
  ...evo,
  name: "evo-plate-tectonics",
  size: [64, 64],
  origin: [32, 32],
  ...lineFrames(
    { length: FL, canvas: 64, lone: EARTH_LONE, draw: (ax, k) => plates(ax, k) },
    PLATE_ANIMS,
  ),
});

/** Where the plates run out: the far plate broken off in steps, rubble past its end. */
function platesEnd(ax: Axis, k: number): Pic {
  const up = upSide(ax);
  const pic = paintAt(ax.size, ax.size, (_x, _y, px, py) => {
    const { t, n } = ax.of(px, py);
    if (t < -2 || t >= 4) return null;
    const z = -n * up;
    const top = t < 0 ? -4.5 : t < 1.5 ? -3.5 : -2.5;
    const bottom = t < 0 ? 4.5 : t < 1.5 ? 2.5 : 0.5;
    if (z < top || z >= bottom) return null;
    if (z < top + 1) return "t";
    if (z < -0.5) return "a";
    if (z < 0.5) return "K";
    if (z < 1.5) return k === 1 ? "l" : "d";
    if (z < 2.5) return "K";
    return "q";
  });
  const [x, y] = ax.at(5, 0);
  put(pic, ":.;\n.;.", x - 1, y - 1);
  return pic;
}

const plateTectonicsEnd = sprite({
  ...evo,
  name: "evo-plate-tectonics-end",
  size: [24, 24],
  origin: [12, 12],
  ...capFrames(24, platesEnd, PLATE_ANIMS, EARTH_LONE),
});

/**
 * 암석의 순환: the stone flies inside a gold ring of the cycle, its arrow chasing round it; at
 * each hit it becomes the next rock, so there are three: igneous, sedimentary, metamorphic.
 */
function cycleRing(k: number): Pic {
  const pic = Pic.blank(20, 20);
  const c = 9.5;
  for (let t = 0; t < 1; t += 0.01) {
    if (t > 0.8) continue;
    const a = t * Math.PI * 2 + (k * Math.PI) / 2;
    pic.set(Math.round(c + Math.cos(a) * 8.5), Math.round(c + Math.sin(a) * 8.5), "l");
  }
  const a = 0.8 * Math.PI * 2 + (k * Math.PI) / 2;
  const hx = c + Math.cos(a) * 8.5;
  const hy = c + Math.sin(a) * 8.5;
  const tx = -Math.sin(a);
  const ty = Math.cos(a);
  path(
    pic,
    [
      [hx - tx * 3 + Math.cos(a) * 2, hy - ty * 3 + Math.sin(a) * 2],
      [hx, hy],
      [hx - tx * 3 - Math.cos(a) * 2, hy - ty * 3 - Math.sin(a) * 2],
    ],
    "p",
  );
  return clean(pic, EARTH_LONE);
}

const ROCKS = ["igneous", "sedimentary", "metamorphic"] as const;
const rockCycle = sprite({
  ...evo,
  palette: ROCK,
  name: "evo-rock-cycle",
  size: [20, 20],
  origin: [10, 10],
  frames: Object.fromEntries(
    ROCKS.flatMap((kind) => {
      const rock = specimen(kind);
      return [0, 1, 2, 3].map((k) => {
        const turned = [rock, turnCw(rock), turnCw(turnCw(rock)), turnCw(turnCw(turnCw(rock)))][
          k
        ] as Pic;
        const pic = cycleRing(k);
        put(pic, turned, 4, 4);
        return [`${kind}${k}`, pic.toString()];
      });
    }),
  ),
  anim: Object.fromEntries(
    ROCKS.map((kind) => [kind, { frames: names(kind, 4), fps: 12, jump: 0.6 }]),
  ),
});

/**
 * 태풍의 눈: the storm grown into a typhoon round the student: spiral bands of slate cloud lit
 * gold underneath, a clear eye in the middle, turning. Radius 80.
 */
function typhoon(k: number): Pic {
  const w = 172;
  const h = 92;
  const cx = w / 2;
  const cy = h / 2;
  const turn = (k / 4) * (Math.PI / 2);
  const pic = paintAt(w, h, (x, y) => {
    const dx = (x - cx) / 82;
    const dy = (y - cy) / 42;
    const r = Math.hypot(dx, dy);
    if (r > 1 || r < 0.2) return null;
    const a = Math.atan2(dy, dx);
    const p = (((((a - turn - Math.log(r) * 2.2) * 4) / (Math.PI * 2)) % 1) + 1) % 1;
    if (p > 0.42) return null;
    if (p < 0.08) return "k";
    if (p > 0.34) return r > 0.6 ? "l" : "d";
    return p < 0.2 ? "a" : "i";
  });
  // The eye wall, bright.
  put(
    pic,
    paintAt(w, h, (x, y) => {
      const e = ell(x, y, cx, cy, 82 * 0.22, 42 * 0.22);
      return e > 0.85 && e < 1.15 ? "p" : null;
    }),
    0,
    0,
  );
  return clean(pic, EARTH_LONE);
}

const typhoonSprite = sprite({
  ...evo,
  name: "fx-typhoon",
  size: [172, 92],
  origin: [86, 46],
  frames: framesOf("t", [0, 1, 2, 3].map(typhoon)),
  anim: { turn: { frames: names("t", 4), fps: 6, jump: 1 } },
});

/**
 * 사리: the spring tide, out to 144 and back, two rings behind each other. One frame per radius,
 * the second ring trailing the first by 24.
 */
const SPRING_R = [24, 48, 72, 96, 120, 144];
function spring(r: number, outward: boolean): Pic {
  const pic = tide(r, outward, 316);
  if (r > 24) put(pic, tide(r - 24, outward, 316), 0, 0);
  return clean(pic, EARTH_LONE);
}
const springTide = sprite({
  ...evo,
  name: "evo-spring-tide",
  size: [316, 162],
  origin: [158, 81],
  frames: {
    ...Object.fromEntries(SPRING_R.map((r) => [`out${r}`, spring(r, true).toString()])),
    ...Object.fromEntries(SPRING_R.map((r) => [`in${r}`, spring(r, false).toString()])),
  },
  anim: {
    out: { frames: SPRING_R.map((r) => `out${r}`), fps: 12, loop: false, jump: 1 },
    back: { frames: [...SPRING_R].reverse().map((r) => `in${r}`), fps: 12, loop: false, jump: 1 },
  },
});

/**
 * 성층 화산: the vent built up layer on layer into a tall cone with banded flanks, and the lava
 * it leaves running down and staying hot.
 */
function strato(k: number): Pic {
  const pic = vent(k, 1.5);
  for (let y = 0; y < pic.h; y++)
    for (let x = 0; x < pic.w; x++) {
      const ch = pic.at(x, y);
      if ((ch === "a" || ch === "n") && y % 4 === 0) pic.set(x, y, "c");
    }
  return clean(pic, EARTH_LONE);
}
function flow(k: number): Pic {
  const w = 48;
  const h = 20;
  const r = rng(13);
  const pic = Pic.blank(w, h);
  let x = 4;
  let y = 10;
  while (x < w - 4) {
    const nx = x + 4;
    const ny = Math.max(4, Math.min(h - 5, y + (r() - 0.5) * 5));
    for (let t = 0; t <= 4; t++) {
      const px = x + t;
      const py = y + ((ny - y) * t) / 4;
      for (let dy = -2; dy <= 2; dy++)
        pic.set(
          Math.round(px),
          Math.round(py + dy),
          Math.abs(dy) === 2 ? "c" : (px + k * 2) % 7 < 2 ? "p" : "R",
        );
    }
    x = nx;
    y = ny;
  }
  return clean(pic, EARTH_LONE);
}
const stratovolcano = sprite({
  ...evo,
  name: "evo-stratovolcano",
  size: [48, 60],
  origin: [24, 57],
  frames: {
    ...framesOf(
      "v",
      [0, 1, 2, 3, 4].map((k) => strato(k)),
    ),
    ...framesOf(
      "flow",
      [0, 1, 2].map((k) => put(Pic.blank(48, 60), flow(k), 0, 40)),
    ),
  },
  anim: {
    smoke: { frames: ["v0", "v4"], fps: 3, jump: 1 },
    erupt: { frames: ["v1", "v2", "v3", "v2", "v3", "v2", "v3"], fps: 10, loop: false, jump: 1 },
    flow: { frames: names("flow", 3), fps: 6, jump: 1 },
  },
});

/** The storm's cloud grown with the typhoon: wider, darker, its belly always lit. */
const stormCloud = sprite({
  ...evo,
  name: "evo-typhoon-cloud",
  size: [76, 30],
  origin: [38, 26],
  frames: {
    ...framesOf(
      "c",
      [0, 1, 2].map((k) => cloud(76, 30, k, k === 1, 7)),
    ),
  },
  anim: { drift: { frames: names("c", 3), fps: 4, jump: 1 } },
});

export default [
  plateTectonics,
  plateTectonicsEnd,
  rockCycle, typhoonSprite, springTide, stratovolcano, stormCloud];
