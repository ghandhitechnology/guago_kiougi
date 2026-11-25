import { sprite } from "../../format.ts";
import { aimedFrames, clean, framesOf, names, Pic, paintAt, put, rng } from "../../fx.ts";
import { antibody, aura, pea, roots } from "./bio-kit.ts";
import { BASE, BIO, CH, CW, cellBody, eye, fanAt, LONE, single } from "./biology.ts";

/** 생명's evolved forms, in the `combat-evolved` atlas. */
const evo = { group: "combat-evolved", outline: false, palette: BIO, lone: LONE } as const;

/**
 * 줄기세포: a cell that becomes what the fight needs. The killer grows spines and a hard dark
 * rim, the burster swells with bright vacuoles, the healer pales and carries a white cross. Two
 * frames each, a breath apart.
 */
function specialist(kind: "killer" | "burst" | "healer", k: number): Pic {
  const ry = 4.2 + (k ? 0.3 : 0);
  const rx = kind === "burst" ? 5.8 + (k ? 0.5 : 0) : 5.2;
  const blob = { ...single(rx, ry, 0, k * 1.5), wob: kind === "killer" ? 0.02 : 0.07 };
  let pic = cellBody([blob]);
  if (kind === "killer") {
    // Spines: short dark points round the membrane.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + k * 0.2;
      const x = CW / 2 + Math.cos(a) * (rx + 1.2);
      const y = BASE - ry + Math.sin(a) * (ry + 1.2);
      pic.set(Math.round(x), Math.round(y), "o");
    }
    pic = pic.swap("lpb", "mlp");
  }
  if (kind === "burst") {
    for (const [dx, dy] of [
      [-2, -2],
      [2, 0],
      [-1, 2],
    ] as const)
      put(pic, "bb\nbb", CW / 2 + dx - 1, BASE - ry + dy - 1, "lmp");
  }
  if (kind === "healer") {
    pic = pic.swap("mlp", "lpb");
    put(pic, ".W.\nWWW\n.W.", CW / 2 - 1, BASE - ry - 1);
    return clean(pic, `${LONE}W`);
  }
  return clean(eye(pic, CW / 2 + 1, Math.round(BASE - ry)), LONE);
}

const stemCell = sprite({
  ...evo,
  name: "evo-stem-cell",
  size: [CW, CH],
  origin: [CW / 2, BASE],
  lone: `${LONE}W`,
  frames: Object.fromEntries(
    (["killer", "burst", "healer"] as const).flatMap((kind) =>
      [0, 1].map((k) => [`${kind}${k}`, specialist(kind, k).toString()]),
    ),
  ),
  anim: Object.fromEntries(
    (["killer", "burst", "healer"] as const).map((kind) => [
      kind,
      { frames: [`${kind}0`, `${kind}1`], fps: 4, jump: 0.5 },
    ]),
  ),
});

/**
 * 멘델의 법칙: the pea comes in its pod, three to a shot, and the mark it leaves shows the 3 to 1:
 * three filled squares and an open one, passed on without fading.
 */
function pod(k: number): Pic {
  const pic = Pic.blank(17, 11);
  for (let x = 2; x <= 14; x++) {
    const t = (x - 8) / 7;
    const half = Math.round(3.4 * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let y = 5 - half; y <= 5 + half; y++) pic.set(x, y, y < 5 ? "l" : "m");
    pic.set(x, 5 - half - 1, "o");
    pic.set(x, 5 + half + 1, "o");
  }
  for (const x of [4, 8, 12]) put(pic, pea(4), x - 2 + (k ? 1 : 0), 3);
  return clean(pic, LONE);
}

function ratio(k: number): Pic {
  const pic = Pic.blank(21, 17);
  const filled = "oooo\nolpo\nompo\noooo";
  const open = "oooo\no..o\no..o\noooo";
  put(pic, filled, 2, 2);
  put(pic, filled, 7, 2);
  put(pic, filled, 12, 2);
  put(pic, k ? filled : open, 17, 2);
  for (const x of [4, 9, 14, 19]) put(pic, "o\no\no", x, 6);
  return clean(pic, LONE);
}

const mendel = sprite({
  ...evo,
  name: "evo-mendel",
  size: [21, 17],
  origin: [10, 16],
  frames: {
    pod0: put(Pic.blank(21, 17), pod(0), 2, 3).toString(),
    pod1: put(Pic.blank(21, 17), pod(1), 2, 3).toString(),
    mark0: ratio(0).toString(),
    mark1: ratio(1).toString(),
  },
  anim: {
    pod: { frames: ["pod0", "pod1"], fps: 8, jump: 1 },
    mark: { frames: ["mark0", "mark0", "mark0", "mark1"], fps: 4, jump: 1 },
  },
});

/**
 * 정밀 해부도: the anatomy chart's guide lines dotted out first across a wider fan (70°, 52 px),
 * then eight cuts down them. Sixteen directions, like the scalpel.
 */
const PRECISE = [-0.6, -0.3, 0, 0.3, 0.6];
function precise(aim: number, k: number): Pic {
  if (k > 0) return fanAt(120, aim, PRECISE, 54, k - 1);
  const pic = Pic.blank(120, 120);
  const c = 60;
  for (const a of PRECISE) {
    for (let r = 8; r < 54; r += 4) {
      pic.set(Math.round(c + Math.cos(aim + a) * r), Math.round(c + Math.sin(aim + a) * r), "'");
    }
  }
  return pic;
}
const preciseSets = Array.from({ length: 16 }, (_, d) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((k) => precise((d / 16) * Math.PI * 2, k)),
);
const preciseAnatomy = sprite({
  ...evo,
  name: "evo-precise-anatomy",
  blend: "add",
  size: [120, 120],
  origin: [60, 60],
  frames: aimedFrames("d", preciseSets),
  anim: Object.fromEntries(
    preciseSets.map((_, d) => [
      `fan${d}`,
      { frames: names(`d${d}-`, 8), fps: 24, loop: false, jump: 1 },
    ]),
  ),
});

/**
 * 극상림: the roots grown into a wood. Saplings come up across a wider patch (radius 56), and when
 * something falls in it, leaves drift up to the student.
 */
const TREE = [".ll.", "lppl", "llml", ".ml.", "..o.", "..o."];
const SAPLING = [".l.", "lpl", ".o.", ".o."];
function forest(k: number): Pic {
  const w = 128;
  const h = 72;
  const pic = roots(w, h, [24, 40, 56, 56, 56][k] as number, 21);
  const r = rng(4);
  const spots = Array.from({ length: 11 }, () => {
    const a = r() * Math.PI * 2;
    const d = 0.25 + r() * 0.7;
    return [w / 2 + Math.cos(a) * 54 * d, h / 2 + Math.sin(a) * 27 * d] as const;
  }).sort((p, q) => p[1] - q[1]);
  spots.forEach(([x, y], i) => {
    if (i > ([3, 6, 11, 11, 11][k] as number)) return;
    const tall = i % 3 === 0 && k >= 2;
    const grid = (tall ? TREE : SAPLING).join("\n");
    put(pic, grid, x - 2, y - (tall ? 6 : 4) + (k === 4 && i % 2 ? -1 : 0));
  });
  if (k >= 3) {
    for (let i = 0; i < 5; i++) {
      const x = w / 2 + (r() - 0.5) * 60;
      const y = h / 2 - 6 - ((r() * 20 + k * 6) % 26);
      put(pic, "pl", x, y);
    }
  }
  return clean(pic, LONE);
}

const forestSprite = sprite({
  ...evo,
  name: "fx-forest",
  size: [128, 72],
  origin: [64, 36],
  frames: framesOf("f", [0, 1, 2, 3, 4].map(forest)),
  anim: {
    grow: { frames: ["f0", "f1", "f2"], fps: 2, loop: false, jump: 1 },
    hold: { frames: ["f3", "f4"], fps: 2, jump: 1 },
  },
});

/** 촉매: the aura half as wide again (radius 96), a second ring inside the first. */
function catalyst(k: number): Pic {
  const outer = aura(96, k);
  const inner = aura(64, (k + 2) % 4);
  put(outer, inner, Math.round((outer.w - inner.w) / 2), Math.round((outer.h - inner.h) / 2));
  return clean(outer, LONE);
}

const catalystSprite = sprite({
  ...evo,
  name: "evo-catalyst",
  size: [198, 102],
  origin: [99, 51],
  frames: framesOf("a", [0, 1, 2, 3].map(catalyst)),
  anim: { aura: { frames: names("a", 4), fps: 6, jump: 1 } },
});

/**
 * 집단 면역: the antibodies now guard the party too, so they shine: white bodies, a green rim,
 * eight turns as before. Under each member they guard, a ring of interlocking links on the
 * ground (`ring`), turning: the herd held together, readable from across a field as a chain no
 * other book draws.
 */
function chainRing(k: number): Pic {
  const w = 44;
  const h = 26;
  const cx = w / 2;
  const cy = h / 2;
  const n = 16;
  const pic = Pic.blank(w, h);
  for (let i = 0; i < n; i++) {
    const a = ((i + k / 2) / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * 18;
    const y = cy + Math.sin(a) * 9;
    // Links alternate: one lying along the ring, the next standing across it.
    const along = i % 2 === 0;
    const tx = -Math.sin(a) * 18;
    const ty = Math.cos(a) * 9;
    const tl = Math.hypot(tx, ty);
    const [lx, ly] = along ? [tx / tl, ty / tl] : [-ty / tl, tx / tl];
    const front = y >= cy;
    put(
      pic,
      paintAt(w, h, (px, py) => {
        const u = (px - x) * lx + (py - y) * ly;
        const v = -(px - x) * ly + (py - y) * lx;
        const e = Math.hypot(u / (along ? 3.6 : 2.4), v / (along ? 2.1 : 1.8));
        if (e > 1 || e < 0.42) return null;
        if (e > 0.8) return "o";
        return front ? (v < 0 ? "W" : "p") : v < 0 ? "l" : "m";
      }),
      0,
      0,
    );
  }
  return clean(pic, LONE);
}

const herd = sprite({
  ...evo,
  name: "evo-herd-immunity",
  size: [44, 26],
  origin: [22, 13],
  frames: {
    ...framesOf(
      "t",
      [0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
        put(Pic.blank(44, 26), antibody((k * Math.PI) / 4, "m", "W", "*"), 16, 7),
      ),
    ),
    ...framesOf("ring", [0, 1, 2, 3].map(chainRing)),
  },
  lone: `${LONE}W`,
  anim: {
    tumble: { frames: names("t", 8), fps: 12, jump: 1 },
    ring: { frames: names("ring", 4), fps: 6, jump: 1 },
  },
});

export default [stemCell, mendel, preciseAnatomy, forestSprite, catalystSprite, herd];
