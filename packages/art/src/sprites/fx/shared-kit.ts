import { type Legend, sprite } from "../../format.ts";
import {
  aimed,
  aimedFrames,
  clean,
  ell,
  framesOf,
  line,
  names,
  Pic,
  paintAt,
  put,
  rng,
} from "../../fx.ts";
import { DANGER, DANGER_LONE } from "./telegraph.ts";

/**
 * Effects the monsters name, and the player's shield. What hurts the player is red (the bomber's
 * burst, the golem's shockwave); what only tells the player something is
 * neutral (dust, a blocked hit), and the healer's work is rose, the one hue no class owns, so a
 * healed monster is found at a glance without being mistaken for a threat or an ally.
 */
const ENEMY: Legend = {
  ...DANGER,
  // Dust and stone.
  s: "stone.light",
  S: "stone.mid",
  c: "stone.pale",
  q: "stone.deep",
  k: "ink.deep",
  i: "ink.dark",
  // Rose, for healing.
  A: "rose.dark",
  B: "rose.mid",
  C: "rose.light",
  D: "rose.pale",
};
const fx = { group: "combat", outline: false, palette: ENEMY, lone: DANGER_LONE } as const;

/** The bomber goes off: a white flash, a red ring with chunks thrown out, a scorch. Radius ~28. */
function burst(k: number): Pic {
  const w = 64;
  const h = 40;
  const cx = 32;
  const cy = 24;
  const pic = Pic.blank(w, h);
  if (k === 0) {
    return clean(
      paintAt(w, h, (x, y) => {
        const e = ell(x, y, cx, cy - 4, 13, 10);
        return e < 0.5 ? "W" : e < 0.8 ? "p" : e < 1 ? "l" : null;
      }),
    );
  }
  const rx = [0, 20, 27, 29][k] as number;
  const ry = rx * 0.5;
  put(
    pic,
    paintAt(w, h, (x, y) => {
      const e = (ell(x, y, cx, cy, rx, ry) - 1) * ry;
      if (k === 3)
        return ell(x, y, cx, cy, 14, 6) < 1 ? (ell(x, y, cx, cy, 14, 6) > 0.7 ? "i" : "k") : null;
      if (e > 0.6 || e < (k === 1 ? -3 : -1.4)) return null;
      if (k === 2 && Math.floor((Math.atan2(y - cy, (x - cx) * 0.5) + 4) * 2.4) % 2 === 0)
        return null;
      return e > -0.5 ? "m" : y < cy ? "p" : "l";
    }),
    0,
    0,
  );
  if (k <= 2) {
    const r = rng(17 + k);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.4;
      const d = rx * (1.1 + r() * 0.2) + 2;
      put(
        pic,
        k === 1 ? "lm\nmd" : "md",
        cx + Math.cos(a) * d,
        cy + Math.sin(a) * d * 0.5 - (k === 1 ? 5 : 2),
      );
    }
  }
  return clean(pic, DANGER_LONE);
}

const burstSprite = sprite({
  ...fx,
  name: "fx-burst",
  size: [64, 40],
  origin: [32, 24],
  frames: framesOf("b", [0, 1, 2, 3].map(burst)),
  anim: { blast: { frames: names("b", 4), fps: 14, loop: false, jump: 1 } },
});

/** The healer's work on a monster: a rose ring under it and crosses rising off it. */
function heal(k: number): Pic {
  const w = 24;
  const h = 30;
  const pic = paintAt(w, h, (x, y) => {
    const e = (ell(x, y, 12, 26, 10, 3.2) - 1) * 3.2;
    if (e > 0.5 || e < -1.1) return null;
    const a = Math.atan2(y - 26, (x - 12) * 0.3);
    return Math.floor((a + Math.PI) * 2.5 + k) % 2 ? (y < 26 ? "C" : "B") : null;
  });
  const crosses: [number, number][] = [
    [6, 22],
    [16, 16],
    [10, 9],
  ];
  crosses.forEach(([x, y0], i) => {
    const y = y0 - ((k * 4 + i * 3) % 12);
    if (y < 1) return;
    put(pic, ".C.\nCDC\n.C.", x - 1, y - 1);
  });
  return clean(pic, DANGER_LONE);
}

const healSprite = sprite({
  ...fx,
  name: "fx-heal",
  size: [24, 30],
  origin: [12, 26],
  frames: framesOf("h", [0, 1, 2, 3].map(heal)),
  anim: { heal: { frames: names("h", 4), fps: 8, jump: 1 } },
});

/** A charger's dust: puffs thrown back off its feet as it goes, settling grey. */
function dust(k: number): Pic {
  const w = 30;
  const h = 14;
  const pic = Pic.blank(w, h);
  const puffs: [number, number, number][] = [
    [22, 10, 3.2],
    [15, 9, 3.8],
    [8, 10, 3],
  ];
  for (const [x, y, r] of puffs) {
    const rr = r * ([0.7, 1, 1.15][k] as number);
    put(
      pic,
      paintAt(w, h, (px, py) => {
        const e = ell(px, py, x - k * 3, y - k * 0.6, rr, rr * 0.75);
        if (e > 1) return null;
        if (k === 2) return e > 0.55 ? "s" : null;
        if (e > 0.75) return "S";
        return py < y - k * 0.6 - rr * 0.2 ? "c" : "s";
      }),
      0,
      0,
    );
  }
  return clean(pic);
}

const dustSprite = sprite({
  ...fx,
  name: "fx-dust",
  size: [30, 14],
  origin: [24, 12],
  frames: framesOf("d", [0, 1, 2].map(dust)),
  anim: { kick: { frames: names("d", 3), fps: 12, loop: false, jump: 1 } },
});

/**
 * A hit stopped on a shield: a grey arc lit where it was struck and sparks glancing off. Eight
 * aims, the arc facing the way the shield faces.
 */
function block(aim: number, k: number): Pic {
  const s = 24;
  const c = 12;
  const pic = Pic.blank(s, s);
  for (let t = -0.9; t <= 0.9; t += 0.05) {
    const a = aim + t;
    const x = c + Math.cos(a) * 7;
    const y = c + Math.sin(a) * 7;
    pic.set(Math.round(x), Math.round(y), Math.abs(t) < 0.35 && k < 2 ? "W" : "S");
    pic.set(Math.round(c + Math.cos(a) * 6), Math.round(c + Math.sin(a) * 6), "q");
  }
  if (k < 2) {
    for (const off of [-0.7, 0, 0.7]) {
      const a = aim + off;
      const r0 = 9 + k * 2;
      line(
        pic,
        c + Math.cos(a) * r0,
        c + Math.sin(a) * r0,
        c + Math.cos(a) * (r0 + 3),
        c + Math.sin(a) * (r0 + 3),
        "c",
      );
    }
  }
  return clean(pic, DANGER_LONE);
}

const blockSprite = sprite({
  ...fx,
  name: "fx-shield-block",
  size: [24, 24],
  origin: [12, 12],
  frames: aimedFrames(
    "d",
    aimed(8, (a) => block(a, 0)).map((p, i) => [
      p,
      block((i / 8) * Math.PI * 2, 1),
      block((i / 8) * Math.PI * 2, 2),
    ]),
  ),
  anim: Object.fromEntries(
    Array.from({ length: 8 }, (_, d) => [
      `d${d}`,
      { frames: names(`d${d}-`, 3), fps: 18, loop: false, jump: 1 },
    ]),
  ),
});

/**
 * The golem's slam landing: a red-edged ring of dust and grit running out over the ground (one
 * frame per radius, to 72 for the enraged slam) and cracks under the fist.
 */
const SHOCK_R = [16, 30, 44, 58, 72];
function shockwave(r: number): Pic {
  const w = 156;
  const h = 82;
  const cx = w / 2;
  const cy = h / 2;
  const ry = r * 0.5;
  const pic = paintAt(w, h, (x, y) => {
    const e = (ell(x, y, cx, cy, r, ry) - 1) * ry;
    if (e > 0.7 || e < -3) return null;
    if (e > 0) return "l";
    if (e > -1.2) return "m";
    return (x + y) % 3 === 0 ? "S" : "s";
  });
  if (r <= 30) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      line(pic, cx, cy, cx + Math.cos(a) * 14, cy + Math.sin(a) * 7, "k");
    }
  }
  return clean(pic, DANGER_LONE);
}

const shockSprite = sprite({
  ...fx,
  name: "fx-shockwave",
  size: [156, 82],
  origin: [78, 41],
  frames: Object.fromEntries(SHOCK_R.map((r) => [`r${r}`, shockwave(r).toString()])),
  anim: { out: { frames: SHOCK_R.map((r) => `r${r}`), fps: 14, loop: false, jump: 1 } },
});

/**
 * The player's shield (from 중화 and from iron): a clear bubble round the student, white at its
 * lit rim and pale glass round the rest, shimmering, then popping when it breaks.
 */
const BUBBLE: Legend = {
  ".": null,
  W: "stone.bright",
  c: "stone.pale",
  g: "sea.pale",
  l: "sea.light",
  "*": "stone.bright",
  "'": "sea.pale",
};
function bubble(k: number): Pic {
  const w = 28;
  const h = 32;
  const cx = 14;
  const cy = 16;
  if (k >= 3) {
    const pic = Pic.blank(w, h);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const d = k === 3 ? 13 : 15;
      put(pic, k === 3 ? "Wc" : "'", cx + Math.cos(a) * d, cy + Math.sin(a) * d * 1.15);
    }
    return clean(pic, "*'");
  }
  return clean(
    paintAt(w, h, (x, y) => {
      const e = ell(x, y, cx, cy, 12.5, 14.5);
      if (e > 1 || e < 0.86) return null;
      const a = Math.atan2(y - cy, x - cx);
      const lit = Math.cos(a + 2.35 - k * 0.5) > 0.6;
      if (lit) return "W";
      return Math.floor((a + Math.PI) * 4 + k) % 3 === 0 ? null : e > 0.93 ? "l" : "g";
    }),
    "*'",
  );
}

const shieldBubble = sprite({
  name: "fx-shield-bubble",
  group: "combat",
  outline: false,
  blend: "add",
  palette: BUBBLE,
  lone: "*'",
  size: [28, 32],
  origin: [14, 28],
  frames: framesOf("b", [0, 1, 2, 3, 4].map(bubble)),
  anim: {
    hold: { frames: ["b0", "b1", "b2"], fps: 6, jump: 1 },
    pop: { frames: ["b3", "b4"], fps: 14, loop: false, jump: 1 },
  },
});

export default [burstSprite, healSprite, dustSprite, blockSprite, shockSprite, shieldBubble];
