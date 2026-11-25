import { sprite } from "../../format.ts";
import { clean, ell, framesOf, line, names, Pic, paintAt, path, put } from "../../fx.ts";
import { dieFace, dieSpin, groundAxes, MATH, MATH_LONE } from "./math-kit.ts";

/**
 * 수학's evolved forms, in the `combat-evolved` atlas so they load when the first one is earned.
 * Each is a grander thing at a glance, still chalk over navy.
 */
const evo = { group: "combat-evolved", outline: false, palette: MATH, lone: MATH_LONE } as const;

/**
 * 유클리드 원론: the polygon closes into a circle that runs out across the ground. One frame per
 * radius (16 to 96), the client picks the one nearest the wave's size: a chalk ellipse lit on
 * its far side, navy below, with the five postulates ticked round it.
 */
function ring(r: number, fade: boolean): Pic {
  const w = 200;
  const h = 104;
  const cx = w / 2;
  const cy = h / 2;
  const ry = r * 0.5;
  const pic = paintAt(w, h, (x, y) => {
    const e = (ell(x, y, cx, cy, r, ry) - 1) * ry;
    if (e > 0.7 || e < -2.4) return null;
    if (fade)
      return e < -1.4
        ? null
        : Math.floor((Math.atan2(y - cy, (x - cx) * 0.5) + 4) * 3) % 2
          ? "l"
          : null;
    if (e > 0) return "d";
    if (e > -1.4) return y < cy ? "W" : "p";
    return "l";
  });
  if (!fade) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * ry;
      line(pic, x, y - 2, x, y + 2, "W");
    }
  }
  return clean(pic, MATH_LONE);
}

const RADII = [16, 32, 48, 64, 80, 96];
const elements = sprite({
  ...evo,
  name: "evo-elements",
  blend: "add",
  size: [200, 104],
  origin: [100, 52],
  frames: {
    ...Object.fromEntries(RADII.map((r) => [`r${r}`, ring(r, false).toString()])),
    fade: ring(96, true).toString(),
  },
  anim: {
    out: { frames: [...RADII.map((r) => `r${r}`), "fade"], fps: 14, loop: false, jump: 1 },
  },
});

/**
 * 푸리에 급수: the beam as a sum of harmonics. Three sines on one 24-pixel period, the
 * fundamental in chalk and two overtones in navy riding on it; each frame shifts a quarter.
 */
function fourier(shift: number): Pic {
  const w = 24;
  const h = 37;
  const mid = 18;
  const curve = (amp: number, k: number) => (x: number) =>
    mid + 0.5 - amp * Math.sin((2 * Math.PI * k * (x + shift)) / w);
  const dist = (f: (x: number) => number, x: number, y: number) => {
    let best = 9;
    for (let t = x - 4; t <= x + 4; t += 0.125) best = Math.min(best, Math.hypot(t - x, f(t) - y));
    return best;
  };
  const fundamental = curve(15, 1);
  const second = curve(8, 2);
  const third = curve(5, 3);
  return clean(
    paintAt(w, h, (x, y) => {
      const d1 = dist(fundamental, x, y);
      if (d1 < 0.75) return "W";
      if (dist(second, x, y) < 0.7) return "p";
      if (dist(third, x, y) < 0.7) return "l";
      if (d1 < 1.4) return "p";
      if (d1 < 1.9) return "m";
      return null;
    }),
  );
}

const fourierSprite = sprite({
  ...evo,
  name: "evo-fourier",
  size: [24, 37],
  origin: [0, 18],
  frames: framesOf("wave", [0, -6, -12, -18].map(fourier)),
  anim: { travel: { frames: names("wave", 4), fps: 16, jump: 1 } },
});

/**
 * 기댓값 정리: the die turned inside out, navy with chalk pips, and the expectation climbing out
 * of it: a chalk chart line that zigzags up from the die's face and leaves its top corner as an
 * arrow. The arrow stands upright in every frame, spinning or landed, so the die reads as a
 * rising chart from across a field.
 */
const NAVY_DIE = ["m", "d", "W", "o"] as const;

function rising(die: Pic, k: number): Pic {
  const pic = Pic.blank(24, 24);
  put(pic, die, 2, 8);
  const lift = k % 2;
  const trace: [number, number][] = [
    [6, 18],
    [9, 14 - lift],
    [12, 16 - lift],
    [19, 6 - lift],
  ];
  const art = Pic.blank(24, 24);
  path(art, trace, "W");
  path(
    art,
    trace.map(([x, y]) => [x + 1, y] as [number, number]),
    "W",
  );
  const [tx, ty] = trace[3] as [number, number];
  path(
    art,
    [
      [tx - 4, ty - 1],
      [tx + 1, ty - 1],
      [tx + 1, ty + 4],
    ],
    "W",
  );
  path(
    art,
    [
      [tx - 3, ty],
      [tx, ty],
      [tx, ty + 3],
    ],
    "W",
  );
  // A navy edge where the chalk leaves the die.
  const edged = art.clone();
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      if (art.at(x, y) !== ".") continue;
      if ([art.at(x - 1, y), art.at(x + 1, y), art.at(x, y - 1), art.at(x, y + 1)].includes("W"))
        edged.set(x, y, "o");
    }
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const ch = edged.at(x, y);
      if (ch === "W") pic.set(x, y, "W");
      else if (ch === "o" && pic.at(x, y) === ".") pic.set(x, y, "o");
    }
  return clean(pic, MATH_LONE);
}

const expectation = sprite({
  ...evo,
  name: "evo-expectation",
  size: [24, 24],
  origin: [9, 16],
  frames: {
    ...framesOf(
      "spin",
      [0, 1, 2, 3].map((k) => rising(dieSpin(k, ...NAVY_DIE), k)),
    ),
    ...Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [`face${n}`, rising(dieFace(n, ...NAVY_DIE), 0).toString()]),
    ),
  },
  anim: {
    spin: { frames: names("spin", 4), fps: 14, jump: 1 },
    ...Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [`face${n}`, { frames: [`face${n}`], fps: 1, loop: false }]),
    ),
  },
});

/**
 * 선형 변환: the axes left behind turn and stretch, and the grid they carry shears with them.
 * Six frames turn them through a quarter (the cross repeats every 90°), at 60° a second the
 * client plays them at 4 fps.
 */
function transformed(k: number): Pic {
  const w = 128;
  const h = 68;
  const a = (k * Math.PI) / 12;
  const pic = Pic.blank(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = 56;
  const at = (u: number, v: number): [number, number] => [
    cx + Math.cos(a) * u - Math.sin(a) * v * 0.8,
    cy + (Math.sin(a) * u + Math.cos(a) * v * 0.8) * 0.5,
  ];
  for (let t = -r + 14; t < r; t += 14) {
    if (Math.abs(t) < 1) continue;
    const span = Math.sqrt(Math.max(0, r * r - t * t));
    const a1 = at(t, -span);
    const b1 = at(t, span);
    const a2 = at(-span, t);
    const b2 = at(span, t);
    line(pic, a1[0], a1[1], b1[0], b1[1], "m");
    line(pic, a2[0], a2[1], b2[0], b2[1], "m");
  }
  put(pic, groundAxes(w, h, r, a, 1), 0, 0);
  return clean(pic, MATH_LONE);
}

const linearMap = sprite({
  ...evo,
  name: "evo-linear-map",
  size: [128, 68],
  origin: [64, 34],
  frames: framesOf("turn", [0, 1, 2, 3, 4, 5].map(transformed)),
  anim: { spin: { frames: names("turn", 6), fps: 4, jump: 1 } },
});

/**
 * 완전한 증명: Q.E.D. carries on to the neighbours. A tombstone stamp that drops onto each
 * chained target, and a chalk link the client stretches from the proven target to the next.
 */
function stamp(k: number): Pic {
  const pic = Pic.blank(17, 17);
  if (k === 0) {
    put(pic, "oooooo\noWWWWo\noWWWWo\noWWWWo\noWWWWo\noooooo", 5, 0);
    return pic;
  }
  if (k === 1) {
    put(pic, "oooooooo\noWWWWWWo\noWWWWWWo\noWWWWWWo\noWWWWWWo\noWWWWWWo\noooooooo", 4, 6);
    for (const [x, y] of [
      [1, 9],
      [15, 9],
      [3, 14],
      [13, 14],
    ] as const)
      put(pic, "pp", x, y);
    return clean(pic, MATH_LONE);
  }
  put(pic, "oooooo\nollllo\nollllo\nollllo\noooooo", 5, 8);
  for (const [x, y] of [
    [1, 7],
    [15, 6],
    [2, 15],
    [14, 15],
  ] as const)
    pic.set(x, y, "'");
  return pic;
}

const completeProof = sprite({
  ...evo,
  name: "evo-complete-proof",
  blend: "add",
  size: [17, 17],
  origin: [8, 12],
  frames: {
    ...framesOf("stamp", [0, 1, 2].map(stamp)),
    link: put(Pic.blank(17, 17), "WW.WW.WW\npp.pp.pp", 4, 11).toString(),
  },
  anim: {
    stamp: { frames: names("stamp", 3), fps: 14, loop: false, jump: 1 },
    link: { frames: ["link"], fps: 1, loop: false },
  },
});

export default [elements, fourierSprite, expectation, linearMap, completeProof];
