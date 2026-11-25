import { type Legend, sprite } from "../../format.ts";
import { clean, ell, framesOf, line, names, Pic, paintAt, path, put } from "../../fx.ts";

/**
 * 수학, the rest of the launch kit: 수열 문제집's chalk numerals, 확률과 통계's die, 좌표 평면's
 * blink and the axes it leaves, and 증명 노트's longer tally and heavier Q.E.D. Same language as
 * 수학의 왕도: chalk white over navy, exact lines, nothing soft.
 */
export const MATH: Legend = {
  ".": null,
  o: "navy.deep",
  d: "navy.dark",
  m: "navy.mid",
  l: "navy.light",
  p: "navy.pale",
  W: "stone.bright",
  c: "stone.pale",
  s: "stone.light",
  "*": "stone.bright",
  "'": "navy.pale",
  ",": "navy.light",
};
export const MATH_LONE = "*',";
const fx = { group: "combat", outline: false, palette: MATH, lone: MATH_LONE } as const;

/** Chalk numerals, 3×5, the way they are written on a board. */
export const DIGITS: Record<string, string> = {
  "0": "WWW\nW.W\nW.W\nW.W\nWWW",
  "1": ".W.\nWW.\n.W.\n.W.\nWWW",
  "2": "WWW\n..W\nWWW\nW..\nWWW",
  "3": "WWW\n..W\n.WW\n..W\nWWW",
  "4": "W.W\nW.W\nWWW\n..W\n..W",
  "5": "WWW\nW..\nWWW\n..W\nWWW",
  "6": "WWW\nW..\nWWW\nW.W\nWWW",
  "8": "WWW\nW.W\nWWW\nW.W\nWWW",
  x: "...\nW.W\n.W.\nW.W\n...",
};

/**
 * A chalk word: glyphs side by side with a pixel between on a navy plate that fills their
 * counters and rims the lot, like a scrap of blackboard, so it reads on the dark field and on
 * sunlit dirt alike.
 */
export function chalk(text: string, w: number, h: number, ink = "W"): Pic {
  const glyphs = [...text].map((ch) => Pic.of(DIGITS[ch] as string));
  const width = glyphs.reduce((n, g) => n + g.w + 1, -1);
  const pic = Pic.blank(w, h);
  let x = Math.floor((w - width) / 2);
  const y = Math.floor((h - 5) / 2);
  const marks: [number, number][] = [];
  for (const g of glyphs) {
    for (let gy = 0; gy < g.h; gy++)
      for (let gx = 0; gx < g.w; gx++) if (g.at(gx, gy) === "W") marks.push([x + gx, y + gy]);
    x += g.w + 1;
  }
  for (const [mx, my] of marks) pic.set(mx, my, ink);
  const out = pic.clone();
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      if (pic.at(xx, yy) !== ".") continue;
      const n = [
        pic.at(xx - 1, yy),
        pic.at(xx + 1, yy),
        pic.at(xx, yy - 1),
        pic.at(xx, yy + 1),
        pic.at(xx - 1, yy - 1),
        pic.at(xx + 1, yy + 1),
        pic.at(xx + 1, yy - 1),
        pic.at(xx - 1, yy + 1),
      ];
      if (n.some((ch) => ch && ch !== ".")) out.set(xx, yy, "d");
    }
  return clean(out);
}

// 수열 문제집 ---------------------------------------------------------------------------------

/** Every term a volley can show, 13 and 21 for 발산 급수. */
export const TERMS = ["1", "2", "3", "5", "8", "13", "21"];

const digit = sprite({
  ...fx,
  name: "atk-digit",
  size: [11, 9],
  origin: [5, 4],
  frames: Object.fromEntries(TERMS.map((t) => [`d${t}`, chalk(t, 11, 9).toString()])),
  anim: Object.fromEntries(TERMS.map((t) => [`d${t}`, { frames: [`d${t}`], fps: 1, loop: false }])),
});

// 확률과 통계 ---------------------------------------------------------------------------------

const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/**
 * The die face up: a white cube seen from above with its front face showing, pips in navy. `pip`
 * and `body` swap for 기댓값 정리's navy die with chalk pips.
 */
export function dieFace(n: number, body = "W", shade = "c", pip = "d", rim = "o"): Pic {
  const pic = Pic.blank(14, 14);
  for (let y = 2; y <= 10; y++) for (let x = 3; x <= 11; x++) pic.set(x, y, body);
  for (let x = 3; x <= 11; x++) {
    pic.set(x, 11, shade);
    pic.set(x, 12, shade);
  }
  for (const [px, py] of PIPS[n] ?? [])
    put(pic, `${pip}${pip}\n${pip}${pip}`, 4 + px * 3, 3 + py * 3);
  for (let y = 1; y <= 13; y++) {
    pic.set(2, y, rim);
    pic.set(12, y, rim);
  }
  for (let x = 2; x <= 12; x++) {
    pic.set(x, 1, rim);
    pic.set(x, 13, rim);
  }
  pic.set(2, 1, ".");
  pic.set(12, 1, ".");
  pic.set(2, 13, ".");
  pic.set(12, 13, ".");
  return pic;
}

/** The die tumbling in the air: a cube turned on its corner, then on its edge. */
export function dieSpin(k: number, body = "W", shade = "c", pip = "d", rim = "o"): Pic {
  if (k % 2 === 0) {
    const face = dieFace(k === 0 ? 5 : 3, body, shade, pip, rim);
    return face;
  }
  // On its corner: a diamond with the light face up-left and the shaded face down-right.
  return clean(
    paintAt(14, 14, (x, y) => {
      const d = Math.abs(x - 7) + Math.abs(y - 7);
      if (d > 6.2) return null;
      if (d > 5.2) return rim;
      if (Math.abs(x - 7 - 1.5) + Math.abs(y - 7 + 1.5) < 1.2) return pip;
      if (Math.abs(x - 7 + 1.5) + Math.abs(y - 7 - 1.5) < 1.2) return pip;
      return x + y > 15 ? shade : body;
    }),
  );
}

const die = sprite({
  ...fx,
  name: "atk-die",
  size: [14, 14],
  origin: [7, 8],
  frames: {
    ...framesOf(
      "spin",
      [0, 1, 2, 3].map((k) => dieSpin(k)),
    ),
    ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`face${n}`, dieFace(n).toString()])),
  },
  anim: {
    spin: { frames: names("spin", 4), fps: 14, jump: 1 },
    ...Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [`face${n}`, { frames: [`face${n}`], fps: 1, loop: false }]),
    ),
  },
});

/** The roll: the multiplier chalked over the target, ×1 to ×6, bigger and brighter as it rises. */
const roll = sprite({
  ...fx,
  name: "fx-roll",
  size: [13, 9],
  origin: [6, 8],
  frames: Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((n) => [`x${n}`, chalk(`x${n}`, 13, 9, n >= 5 ? "W" : "c").toString()]),
  ),
  anim: Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((n) => [`x${n}`, { frames: [`x${n}`], fps: 1, loop: false }]),
  ),
});

// 좌표 평면 -----------------------------------------------------------------------------------

/**
 * The blink: where the student leaves, a coordinate point whose brackets snap shut; where they
 * arrive, a crosshair that opens out.
 */
function blink(k: number): Pic {
  const s = 17;
  const c = 8;
  const pic = Pic.blank(s, s);
  const arrive = k >= 3;
  const step = k % 3;
  const r = arrive ? [2, 5, 7][step] : [7, 4, 1][step];
  if (r !== undefined && r > 1) {
    // ( and ) brackets at radius r.
    path(
      pic,
      [
        [c - r + 1, c - 3],
        [c - r, c - 1],
        [c - r, c + 1],
        [c - r + 1, c + 3],
      ],
      step === 2 && !arrive ? "p" : "W",
    );
    path(
      pic,
      [
        [c + r - 1, c - 3],
        [c + r, c - 1],
        [c + r, c + 1],
        [c + r - 1, c + 3],
      ],
      step === 2 && !arrive ? "p" : "W",
    );
  }
  if (arrive) {
    line(pic, c - r - 1, c, c - r + 1, c, "l");
    line(pic, c + r - 1, c, c + r + 1, c, "l");
    line(pic, c, c - r - 1, c, c - r + 1, "l");
    line(pic, c, c + r - 1, c, c + r + 1, "l");
  }
  put(pic, step === 2 && arrive ? "pp\npp" : "WW\nWW", c, c);
  return clean(pic);
}

const axesBlink = sprite({
  ...fx,
  name: "atk-axes",
  blend: "add",
  size: [17, 17],
  origin: [8, 8],
  frames: framesOf("b", [0, 1, 2, 3, 4, 5].map(blink)),
  anim: {
    leave: { frames: ["b0", "b1", "b2"], fps: 20, loop: false, jump: 1 },
    arrive: { frames: ["b3", "b4", "b5"], fps: 20, loop: false, jump: 1 },
  },
});

/**
 * Axes on the ground: x across, y foreshortened into the ground, arrowheads on the positive ends,
 * ticks every eight pixels and a navy glow under the chalk where they burn.
 */
export function groundAxes(
  w: number,
  h: number,
  r: number,
  angle: number,
  reach: number,
  ink = "W",
  glow = "l",
): Pic {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const pic = Pic.blank(w, h);
  const at = (u: number, v: number): [number, number] => [
    cx + Math.cos(angle) * u - Math.sin(angle) * v,
    cy + (Math.sin(angle) * u + Math.cos(angle) * v) * 0.5,
  ];
  const len = r * reach;
  for (const [ux, uy] of [
    [1, 0],
    [0, 1],
  ] as const) {
    const a = at(-len * ux, -len * uy);
    const b = at(len * ux, len * uy);
    line(pic, a[0], a[1] + 1, b[0], b[1] + 1, glow);
    line(pic, a[0], a[1], b[0], b[1], ink);
    for (let t = -len + 8; t < len - 2; t += 8) {
      const p = at(t * ux, t * uy);
      const q = at(t * ux - uy * 2, t * uy + ux * 2);
      const q2 = at(t * ux + uy * 2, t * uy - ux * 2);
      line(pic, q[0], q[1], q2[0], q2[1], ink === "W" ? "c" : ink);
      void p;
    }
    if (reach > 0.9) {
      const tip = at(len * ux, len * uy);
      const back1 = at(len * ux - ux * 4 - uy * 3, len * uy - uy * 4 + ux * 3);
      const back2 = at(len * ux - ux * 4 + uy * 3, len * uy - uy * 4 - ux * 3);
      path(pic, [back1, tip, back2], ink);
    }
  }
  return clean(pic, MATH_LONE);
}

const axes = sprite({
  ...fx,
  name: "fx-axes",
  size: [72, 40],
  origin: [36, 20],
  frames: {
    draw0: groundAxes(72, 40, 32, 0, 0.45).toString(),
    draw1: groundAxes(72, 40, 32, 0, 1).toString(),
    hold0: groundAxes(72, 40, 32, 0, 1).toString(),
    hold1: groundAxes(72, 40, 32, 0, 1, "c", "m").toString(),
    fade0: groundAxes(72, 40, 32, 0, 1, "p", "m").toString(),
    fade1: groundAxes(72, 40, 32, 0, 0.6, "m", "d").toString(),
  },
  anim: {
    draw: { frames: ["draw0", "draw1"], fps: 16, loop: false, jump: 1 },
    hold: { frames: ["hold0", "hold0", "hold1"], fps: 6, jump: 1 },
    fade: { frames: ["fade0", "fade1"], fps: 6, loop: false, jump: 1 },
  },
});

// 증명 노트 -----------------------------------------------------------------------------------

/** "Q.E.D." twice the size: each chalk stroke two pixels wide. */
const BIG: Record<string, string> = {
  Q: ".###.\n#...#\n#...#\n#...#\n#..#.\n.##.#",
  E: "####\n#...\n###.\n#...\n#...\n####",
  D: "###.\n#..#\n#..#\n#..#\n#..#\n###.",
  ".": ".\n.\n.\n.\n.\n#",
};

function bigText(ink: string): Pic {
  const marks: [number, number][] = [];
  let x = 0;
  for (const ch of "Q.E.D.") {
    const g = Pic.of(BIG[ch] as string);
    for (let y = 0; y < g.h; y++)
      for (let gx = 0; gx < g.w; gx++)
        if (g.at(gx, y) === "#") {
          marks.push(
            [x + gx * 2, y * 2],
            [x + gx * 2 + 1, y * 2],
            [x + gx * 2, y * 2 + 1],
            [x + gx * 2 + 1, y * 2 + 1],
          );
        }
    x += g.w * 2 + 2;
  }
  for (let y = 2; y < 10; y++) for (let t = 0; t < 8; t++) marks.push([x + 2 + t, y]);
  const pic = Pic.blank(x + 12, 14);
  for (const [mx, my] of marks) {
    if (pic.at(mx + 1, my + 1) === ".") pic.set(mx + 1, my + 1, "o");
  }
  for (const [mx, my] of marks) pic.set(mx, my, ink);
  return pic;
}

/**
 * 증명 노트's Q.E.D.: the tombstone slams, the proof is written in letters twice the size over a
 * double ring, and the rings break outward.
 */
function qedBig(k: number): Pic {
  const w = 72;
  const h = 40;
  const cx = w / 2;
  const cy = h / 2;
  const pic = Pic.blank(w, h);
  const ring = (
    rx: number,
    ry: number,
    width: number,
    broken: number,
    light: string,
    dark: string,
  ) =>
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = Math.abs(ell(x, y, cx, cy, rx, ry) - 1) * Math.min(rx, ry);
        if (e > width / 2) return null;
        if (broken && Math.floor((Math.atan2(y - cy, x - cx) + 4) * broken) % 2 === 0) return null;
        return y < cy ? light : dark;
      }),
      0,
      0,
    );
  if (k === 0) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = ell(x, y, cx, cy, 14, 9);
        return e < 0.6 ? "W" : e < 0.85 ? "p" : e < 1 ? "l" : null;
      }),
      0,
      0,
    );
    return clean(pic);
  }
  if (k === 1) {
    ring(26, 14, 1.8, 0, "W", "l");
    ring(31, 17, 1, 0, "p", "m");
  } else if (k === 2) {
    ring(32, 17, 1.4, 1.8, "p", "l");
    ring(35, 19, 0.9, 2.6, "l", "m");
  } else {
    ring(35, 19, 0.9, 4, "l", "m");
  }
  const text = bigText(k === 3 ? "p" : "W");
  put(pic, text, Math.round(cx - text.w / 2), Math.round(cy - 7));
  return clean(pic, MATH_LONE);
}

const qedBigSprite = sprite({
  ...fx,
  name: "fx-qed-big",
  blend: "add",
  size: [72, 40],
  origin: [36, 20],
  frames: framesOf("qed", [0, 1, 2, 3].map(qedBig)),
  anim: { burst: { frames: names("qed", 4), fps: 10, loop: false, jump: 1 } },
});

export default [digit, die, roll, axesBlink, axes, qedBigSprite];
