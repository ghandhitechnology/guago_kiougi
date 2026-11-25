import { sprite } from "../../format.ts";
import { clean, ell, framesOf, line, names, Pic, paintAt, put, rng } from "../../fx.ts";
import { shade } from "../../paint.ts";
import { BIO, LONE } from "./biology.ts";

/**
 * 생명, the rest of the launch kit: 유전 가계도 문제집's pea and the mark it leaves,
 * 생태계 보고서's seed and roots, 효소 반응 노트's aura and 면역 필기's antibodies. Grass green,
 * round and growing; the only straight lines are the pedigree's.
 */
const fx = { group: "combat", outline: false, palette: BIO, lone: LONE } as const;

// 유전 가계도 문제집 --------------------------------------------------------------------------

/** A pea, round so it flies any way unturned, lit from the top left. */
export function pea(d: number, dark = "o", mid = "m", light = "l", glint = "b"): Pic {
  const c = d / 2;
  return clean(
    shade(d, d, (x, y) => Math.hypot(x + 0.5 - c, y + 0.5 - c) <= c - 0.2, {
      outline: dark,
      dark: mid,
      mid: light,
      light: glint,
      glint: "W",
    }),
    LONE,
  );
}

const peaSprite = sprite({
  ...fx,
  name: "atk-mark",
  size: [9, 9],
  origin: [4, 4],
  frames: {
    pea: put(Pic.blank(9, 9), pea(7), 1, 1).toString(),
    squash: put(Pic.blank(9, 9), pea(8).crop(0, 1, 8, 6), 0, 2).toString(),
  },
  anim: { fly: { frames: ["pea", "squash"], fps: 10, jump: 1 } },
});

/**
 * The inherited mark: a filled pedigree square over the target, a line down to the generation
 * below. `pass` throws the line out to the two neighbours it goes to on death.
 */
function mark(k: number): Pic {
  const pic = Pic.blank(21, 17);
  const square = (fill: string) =>
    `oooooo\no${fill.repeat(4)}o\no${fill.repeat(4)}o\no${fill.repeat(4)}o\no${fill.repeat(4)}o\noooooo`;
  if (k === 0) {
    put(pic, "oooooo\no....o\no....o\no....o\no....o\noooooo", 7, 1);
    return pic;
  }
  if (k <= 2) {
    put(pic, square(k === 1 ? "l" : "p"), 7, 1);
    line(pic, 10, 7, 10, 10, "o");
    return clean(pic, LONE);
  }
  // Passing on: the descent line splits to the two who inherit.
  put(pic, square("m"), 7, 1);
  line(pic, 10, 7, 10, 9, "o");
  line(pic, 3, 9, 17, 9, "o");
  const reach = k === 3 ? 12 : 15;
  line(pic, 3, 10, 3, reach, "o");
  line(pic, 17, 10, 17, reach, "o");
  if (k === 4) {
    put(pic, "oo\nll", 2, 15);
    put(pic, "oo\nll", 16, 15);
  }
  return clean(pic, LONE);
}

const markSprite = sprite({
  ...fx,
  name: "fx-mark",
  size: [21, 17],
  origin: [10, 16],
  frames: framesOf("m", [0, 1, 2, 3, 4].map(mark)),
  anim: {
    apply: { frames: ["m0", "m1"], fps: 14, loop: false, jump: 1 },
    hold: { frames: ["m1", "m2"], fps: 3, jump: 1 },
    pass: { frames: ["m3", "m4"], fps: 10, loop: false, jump: 1 },
  },
});

// 생태계 보고서 -------------------------------------------------------------------------------

/** The seed that plants the patch: it drops, splits and puts out its first two leaves. */
function seed(k: number): Pic {
  const pic = Pic.blank(13, 13);
  if (k === 0) return put(pic, ".oo.\nollo\nommo\n.oo.", 4, 7);
  if (k === 1) return clean(put(pic, ".oo.\nolmo\noomo\n.oo.\n.mm.", 4, 6), LONE);
  return clean(put(pic, "ll..ll\n.lmml.\n..mm..\n..mm..\n.oooo.", 3, 6), LONE);
}

const seedSprite = sprite({
  ...fx,
  name: "atk-roots",
  size: [13, 13],
  origin: [6, 11],
  frames: framesOf("s", [0, 1, 2].map(seed)),
  anim: { plant: { frames: names("s", 3), fps: 10, loop: false, jump: 1 } },
});

/**
 * Roots spreading over the ground: green runners out from the centre, forking, with a leaf at
 * some tips. `reach` sets how far they have grown (the content grows them 6 px a second).
 */
export function roots(
  w: number,
  h: number,
  reach: number,
  seedN: number,
  fade = 0,
  leaf = "ll\nl.",
): Pic {
  const cx = w / 2;
  const cy = h / 2;
  const pic = Pic.blank(w, h);
  const r = rng(seedN);
  const runners = 9;
  for (let i = 0; i < runners; i++) {
    let a = (i / runners) * Math.PI * 2 + r() * 0.5;
    let x = cx;
    let y = cy;
    let d = 0;
    const len = reach * (0.7 + r() * 0.35);
    while (d < len) {
      const step = 2 + r() * 2;
      a += (r() - 0.5) * 0.8;
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step * 0.5;
      line(pic, x, y, nx, ny, d < len * 0.5 ? "d" : "m");
      if (r() < 0.18 && d > 6) {
        const fa = a + (r() < 0.5 ? 0.9 : -0.9);
        line(pic, nx, ny, nx + Math.cos(fa) * 4, ny + Math.sin(fa) * 2, "m");
      }
      x = nx;
      y = ny;
      d += step;
    }
    if (!fade && r() < 0.6) put(pic, leaf, x - 1, y - 1);
  }
  put(pic, "oo\noo", cx - 1, cy - 1);
  // The ground the roots grip, darkened under them so they read on sunlit dirt.
  const out = pic.clone();
  for (let y = 1; y < h; y++)
    for (let x = 0; x < w; x++)
      if (out.at(x, y) === "." && "dm".includes(pic.at(x, y - 1) ?? ".")) out.set(x, y, "o");
  if (fade) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const ch = out.at(x, y);
        if (ch === "o" && (x + y) % fade !== 0) out.set(x, y, ".");
        if (ch === "m" || ch === "d") out.set(x, y, fade > 2 ? "o" : "d");
      }
  }
  return clean(out, LONE);
}

const rootsArea = sprite({
  ...fx,
  name: "fx-roots",
  size: [88, 48],
  origin: [44, 24],
  frames: {
    ...framesOf(
      "g",
      [12, 22, 32, 40].map((reach) => roots(88, 48, reach, 8)),
    ),
    hold: roots(88, 48, 40, 8).toString(),
    sway: roots(88, 48, 40, 8, 0, ".l\nll").toString(),
    fade0: roots(88, 48, 40, 8, 2).toString(),
    fade1: roots(88, 48, 34, 8, 3).toString(),
  },
  anim: {
    grow: { frames: names("g", 4), fps: 2, loop: false, jump: 1 },
    hold: { frames: ["hold", "sway"], fps: 2, jump: 1 },
    fade: { frames: ["fade0", "fade1"], fps: 4, loop: false, jump: 1 },
  },
});

// 효소 반응 노트 ------------------------------------------------------------------------------

/**
 * The aura on the ground round the student (and allies inside it): a green ring of dashes
 * turning, with small enzyme shapes (a cell and its notch) riding round it.
 */
export function aura(rx: number, k: number): Pic {
  const ry = rx * 0.5;
  const w = Math.ceil(rx * 2 + 6);
  const h = Math.ceil(ry * 2 + 6);
  const cx = w / 2;
  const cy = h / 2;
  const pic = paintAt(w, h, (x, y) => {
    const e = (ell(x, y, cx, cy, rx, ry) - 1) * ry;
    if (e > 0.6 || e < -1.4) return null;
    const a = Math.atan2(y - cy, (x - cx) * 0.5);
    const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24 + k * 0.5) % 2;
    if (seg) return null;
    return y < cy ? "l" : "m";
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + (k * Math.PI) / 8;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    put(pic, ".pp\npdp\npp.", x - 1, y - 1);
  }
  const r = rng(Math.round(rx) + k);
  for (let i = 0; i < Math.round(rx / 8); i++) {
    const a = r() * Math.PI * 2;
    const d = 0.3 + r() * 0.6;
    pic.set(
      Math.round(cx + Math.cos(a) * rx * d),
      Math.round(cy + Math.sin(a) * ry * d - k),
      i % 2 ? "'" : ",",
    );
  }
  return clean(pic, LONE);
}

const auraSprite = sprite({
  ...fx,
  name: "fx-aura",
  size: [134, 70],
  origin: [67, 35],
  frames: framesOf(
    "a",
    [0, 1, 2, 3].map((k) => aura(64, k)),
  ),
  anim: { aura: { frames: names("a", 4), fps: 6, jump: 1 } },
});

// 면역 필기 -----------------------------------------------------------------------------------

/** An antibody, a Y, drawn at eight turns so it tumbles as it orbits without being rotated. */
export function antibody(a: number, ink = "o", body = "p", light = "*"): Pic {
  const s = 13;
  const c = 6;
  const pic = Pic.blank(s, s);
  const at = (r: number, off: number): [number, number] => [
    c + Math.cos(a + off) * r,
    c + Math.sin(a + off) * r,
  ];
  const tail = at(5, Math.PI);
  const arm1 = at(5, -0.65);
  const arm2 = at(5, 0.65);
  line(pic, c, c, tail[0], tail[1], body);
  line(pic, c, c, arm1[0], arm1[1], body);
  line(pic, c, c, arm2[0], arm2[1], body);
  put(pic, light, Math.round(arm1[0]), Math.round(arm1[1]));
  put(pic, light, Math.round(arm2[0]), Math.round(arm2[1]));
  const out = pic.clone();
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      if (pic.at(x, y) !== ".") continue;
      if (
        [pic.at(x - 1, y), pic.at(x + 1, y), pic.at(x, y - 1), pic.at(x, y + 1)].some(
          (ch) => ch && ch !== ".",
        )
      )
        out.set(x, y, ink);
    }
  return clean(out, `${LONE}${light}`);
}

const antibodySprite = sprite({
  ...fx,
  name: "atk-antibody",
  size: [13, 13],
  origin: [6, 6],
  frames: framesOf(
    "t",
    [0, 1, 2, 3, 4, 5, 6, 7].map((k) => antibody((k * Math.PI) / 4)),
  ),
  anim: { tumble: { frames: names("t", 8), fps: 12, jump: 1 } },
});

export default [peaSprite, markSprite, seedSprite, rootsArea, auraSprite, antibodySprite];
