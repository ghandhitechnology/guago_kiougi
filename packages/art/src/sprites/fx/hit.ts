import { type Legend, sprite } from "../../format.ts";
import { clean, ell, framesOf, line, names, Pic, paintAt, put, rng } from "../../fx.ts";

/**
 * Hits and deaths, shared by every class. Hit sparks are neutral white so the class colour stays
 * with the attack itself; their first frame is one solid silhouette, so the white hit flash and
 * any tint land on a clean shape. Sizes follow PLAN §6 hitstop: a light spark is gone inside 50
 * ms of hitstop plus a beat, a heavy one fills 100 to 160 ms, a critical a little more.
 */
const HIT: Legend = {
  ".": null,
  W: "stone.bright",
  c: "stone.pale",
  s: "stone.light",
  S: "stone.mid",
  q: "stone.deep",
  y: "gold.pale",
  Y: "gold.light",
  g: "gold.mid",
  // Paper and red pen, for 오답.
  r: "red.mid",
  R: "red.light",
  x: "red.dark",
  // Lone sparks and motes.
  "*": "stone.bright",
  "'": "stone.pale",
  ",": "gold.pale",
  "`": "gold.light",
};
const LONE = "*',`";
const fx = { group: "combat", outline: false, palette: HIT, lone: LONE } as const;

/** A star of `n` points: long rays on the axes, shorter on the diagonals. */
function star(size: number, long: number, short: number, core: number, ch: string): Pic {
  const c = (size - 1) / 2;
  const pic = Pic.blank(size, size);
  line(pic, c - long, c, c + long, c, ch);
  line(pic, c, c - long, c, c + long, ch);
  if (short > 0) {
    line(pic, c - short, c - short, c + short, c + short, ch);
    line(pic, c - short, c + short, c + short, c - short, ch);
  }
  put(
    pic,
    paintAt(size, size, (x, y) => (Math.hypot(x - c - 0.5, y - c - 0.5) <= core ? ch : null)),
    0,
    0,
  );
  // Thicken the axis rays near the core.
  line(pic, c - long + 2, c + 1, c + long - 2, c + 1, ch);
  line(pic, c + 1, c - long + 2, c + 1, c + long - 2, ch);
  return pic;
}

/**
 * A white star with a warm rim: gold round the white, and the ray tips cooling to gold, so the
 * spark holds on sunlit ground as well as on the dark field.
 */
function warm(p: Pic): Pic {
  const out = p.clone();
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.at(x, y) !== ".") continue;
      const n = [p.at(x - 1, y), p.at(x + 1, y), p.at(x, y - 1), p.at(x, y + 1)];
      if (n.some((ch) => ch === "W")) out.set(x, y, "Y");
    }
  return clean(out);
}

/** A ring of short dashes at radius `r`. */
function dashes(size: number, r: number, n: number, len: number, ch: string, rot = 0): Pic {
  const c = (size - 1) / 2 + 0.5;
  const pic = Pic.blank(size, size);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    line(
      pic,
      c - 0.5 + Math.cos(a) * r,
      c - 0.5 + Math.sin(a) * r,
      c - 0.5 + Math.cos(a) * (r + len),
      c - 0.5 + Math.sin(a) * (r + len),
      ch,
    );
  }
  return pic;
}

function motes(size: number, r: number, n: number, seed: number): Pic {
  const c = (size - 1) / 2;
  const rr = rng(seed);
  const pic = Pic.blank(size, size);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr() * 0.6;
    const d = r * (0.8 + rr() * 0.3);
    pic.set(
      Math.round(c + Math.cos(a) * d),
      Math.round(c + Math.sin(a) * d),
      "*',"[i % 3] as string,
    );
  }
  return pic;
}

/** Hit sparks blend normally: their warm rim is what keeps them readable on bright ground. */
const hitLight = sprite({
  ...fx,
  name: "fx-hit-light",
  size: [13, 13],
  origin: [6, 6],
  frames: {
    h0: warm(star(13, 5, 0, 1.6, "W")).toString(),
    h1: put(dashes(13, 3.5, 4, 1.5, "c", Math.PI / 4), "*", 6, 6).toString(),
  },
  anim: { hit: { frames: ["h0", "h1"], fps: 30, loop: false, jump: 1 } },
});

function heavy(k: number): Pic {
  const s = 21;
  if (k === 0) return warm(star(s, 9, 5, 2.8, "W"));
  if (k === 1) {
    const pic = star(s, 7, 4, 2.2, "y");
    put(pic, star(s, 4, 2, 1.6, "W"), 0, 0);
    return warm(pic);
  }
  if (k === 2) {
    const pic = dashes(s, 6, 8, 2.5, "c", Math.PI / 8);
    put(pic, dashes(s, 8.5, 4, 1.5, "y"), 0, 0);
    return pic;
  }
  return motes(s, 9, 6, 3);
}

const hitHeavy = sprite({
  ...fx,
  name: "fx-hit-heavy",
  size: [21, 21],
  origin: [10, 10],
  frames: framesOf("h", [0, 1, 2, 3].map(heavy)),
  anim: { hit: { frames: names("h", 4), fps: 25, loop: false, jump: 1 } },
});

function crit(k: number): Pic {
  const s = 29;
  const c = 14.5;
  const ring = (r: number, w: number, ch: string, broken = 0) =>
    paintAt(s, s, (x, y) => {
      const d = Math.hypot(x - c, y - c);
      if (Math.abs(d - r) > w / 2) return null;
      if (broken && Math.floor((Math.atan2(y - c, x - c) + 4) * broken) % 2 === 0) return null;
      return ch;
    });
  if (k === 0) return warm(star(s, 13, 7, 3.6, "W"));
  if (k === 1) {
    const pic = ring(8, 1.6, "Y");
    put(pic, star(s, 12, 6, 3, "y"), 0, 0);
    put(pic, star(s, 7, 3, 2, "W"), 0, 0);
    return clean(pic);
  }
  if (k === 2) {
    const pic = ring(11, 1.2, "Y", 1.6);
    put(pic, dashes(s, 6, 8, 3, "y", Math.PI / 8), 0, 0);
    put(pic, star(s, 3, 0, 1.2, "W"), 0, 0);
    return clean(pic);
  }
  if (k === 3) {
    const pic = ring(13, 0.9, "g", 2.4);
    put(pic, dashes(s, 9, 8, 2, "c", Math.PI / 8), 0, 0);
    return clean(pic);
  }
  return motes(s, 13, 8, 9);
}

const hitCrit = sprite({
  ...fx,
  name: "fx-hit-crit",
  size: [29, 29],
  origin: [14, 14],
  frames: framesOf("h", [0, 1, 2, 3, 4].map(crit)),
  anim: { hit: { frames: names("h", 5), fps: 25, loop: false, jump: 1 } },
});

// Deaths -------------------------------------------------------------------------------------

/**
 * The generic pop (PLAN §6: three frames, debris flies out separately): a squashed white flash,
 * a ring torn into arcs, then puffs drifting apart.
 */
function pop(k: number): Pic {
  const s = 25;
  const c = 12.5;
  if (k === 0) {
    return paintAt(s, s, (x, y) => {
      const e = ell(x, y, c, c, 6.5, 5.5);
      return e < 0.7 ? "W" : e < 1 ? "c" : null;
    });
  }
  if (k === 1) {
    return clean(
      paintAt(s, s, (x, y) => {
        const e = (ell(x, y, c, c, 9, 8) - 1) * 8;
        if (e > 0.6 || e < -1.8) return null;
        if (Math.floor((Math.atan2(y - c, x - c) + 4) * 1.9) % 2 === 0) return null;
        return y < c ? "W" : "s";
      }),
    );
  }
  const pic = Pic.blank(s, s);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    put(pic, i % 2 ? "cc\ncc" : "ss\nss", c - 1 + Math.cos(a) * 10, c - 1 + Math.sin(a) * 9);
  }
  return pic;
}

const death = sprite({
  ...fx,
  name: "fx-death",
  size: [25, 25],
  origin: [12, 12],
  frames: framesOf("d", [0, 1, 2].map(pop)),
  anim: { die: { frames: names("d", 3), fps: 16, loop: false, jump: 1 } },
});

/**
 * 오답 goes back to being paper: the mark crumples to a sheet, the sheet tears in four, and the
 * scraps flutter off with red ink on them.
 */
function paper(k: number): Pic {
  const s = 25;
  const pic = Pic.blank(s, s);
  if (k === 0) {
    put(
      pic,
      `
      qqqqqqqqq
      qWWWWWWcq
      qWrWWWrcq
      qWWrWrWcq
      qWWWrWWcq
      qWWrWrWcq
      qWrWWWrcq
      qcccccccq
      qqqqqqqqq
    `,
      8,
      8,
    );
    return pic;
  }
  const pieces = [
    "qqqq\nqWWq\nqWrq\nqqqq",
    "qqqq\nqWWq\nqrWq\nqqqq",
    "qqqq\nqrWq\nqWcq\nqqqq",
    "qqqq\nqWrq\nqccq\nqqqq",
  ];
  const d = k === 1 ? 5 : 9;
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].forEach(([dx, dy], i) => {
    put(
      pic,
      pieces[i] as string,
      10 + (dx as number) * d,
      10 + (dy as number) * d - (k === 2 ? 2 : 0),
    );
  });
  if (k === 1) {
    for (const [x, y] of [
      [12, 4],
      [4, 13],
      [20, 14],
      [12, 21],
    ] as const)
      pic.set(x, y, "*");
  }
  return pic;
}

const deathPaper = sprite({
  ...fx,
  lone: "Wcr*',",
  name: "fx-death-paper",
  size: [25, 25],
  origin: [12, 12],
  frames: framesOf("d", [0, 1, 2].map(paper)),
  anim: { die: { frames: names("d", 3), fps: 14, loop: false, jump: 1 } },
});

/**
 * Debris the client throws 4 to 6 of per death, each with its own velocity, gravity and spin.
 * White chunks take the monster's tint; the paper scraps are 오답's own.
 */
const debris = sprite({
  ...fx,
  lone: "Wcs",
  name: "fx-debris",
  size: [4, 4],
  origin: [1, 1],
  frames: {
    a: "WW..\nWs..\n....\n....",
    b: "WWc.\nscs.\n....\n....",
    c: "Wc..\nWs..\nss..\n....",
  },
  anim: {
    a: { frames: ["a"], fps: 1, loop: false },
    b: { frames: ["b"], fps: 1, loop: false },
    c: { frames: ["c"], fps: 1, loop: false },
  },
});

const debrisPaper = sprite({
  ...fx,
  lone: "Wcrx",
  name: "fx-debris-paper",
  size: [5, 5],
  origin: [2, 2],
  frames: {
    a: "WWW..\nWrc..\nccc..\n.....\n.....",
    b: "WW...\nWrr..\n.cc..\n.....\n.....",
    flip: "rrr..\nxxx..\n.....\n.....\n.....",
  },
  anim: { flutter: { frames: ["a", "flip", "b", "flip"], fps: 10, jump: 1 } },
});

export default [hitLight, hitHeavy, hitCrit, death, deathPaper, debris, debrisPaper];
