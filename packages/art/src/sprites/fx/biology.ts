import { type Legend, sprite } from "../../format.ts";
import { clean, framesOf, line, names, Pic, paintAt, put } from "../../fx.ts";
import { shade } from "../../paint.ts";

/**
 * 생명: grass green, soft and round. Cells that wobble, stretch and split; membranes with a pale
 * rim; cuts that leave green light. Nothing with a corner except the scalpel.
 */
const BIO: Legend = {
  ".": null,
  o: "grass.deep",
  d: "grass.dark",
  m: "grass.mid",
  l: "grass.light",
  p: "grass.pale",
  b: "grass.bright",
  W: "stone.bright",
  // The nucleus, which looks where the cell is going.
  n: "board.deep",
  // Blood, for 출혈.
  x: "rose.deep",
  D: "rose.dark",
  r: "rose.mid",
  R: "rose.light",
  // Lone glints.
  "*": "stone.bright",
  "'": "grass.bright",
  ",": "grass.pale",
  "^": "rose.light",
};
const LONE = "*',^";

// 캠핑 생명과학 -------------------------------------------------------------------------------

const CW = 26;
const CH = 15;
const BASE = 13;

interface Blob {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  /** Wobble of the membrane: amount and phase. */
  readonly wob?: number;
  readonly phase?: number;
}

/** A union of soft blobs, shaded as one membrane lit from the top left. */
function cellBody(blobs: readonly Blob[], cut?: (x: number, y: number) => boolean): Pic {
  const inside = (x: number, y: number) =>
    !cut?.(x + 0.5, y + 0.5) &&
    blobs.some((b) => {
      const dx = x + 0.5 - b.x;
      const dy = y + 0.5 - b.y;
      const a = Math.atan2(dy, dx);
      const wob = 1 + (b.wob ?? 0.06) * Math.sin(3 * a + (b.phase ?? 0));
      return (dx / (b.rx * wob)) ** 2 + (dy / (b.ry * wob)) ** 2 <= 1;
    });
  return shade(CW, CH, inside, { outline: "o", dark: "m", mid: "l", light: "p", glint: "b" });
}

/** The nucleus: a dark disc with a white glint, which reads as the cell's one eye. */
function eye(pic: Pic, x: number, y: number, blink = false): Pic {
  if (blink) return clean(put(pic, "nnn", x - 1, y), LONE);
  put(pic, ".nn.\nnnnn\nnnnn\n.nn.", x - 2, y - 2, "lmpb");
  put(pic, "WW", x - 1, y - 1, "n");
  return clean(pic, LONE);
}

const single = (rx: number, ry: number, dx = 0, phase = 0): Blob => ({
  x: CW / 2 + dx,
  y: BASE - ry,
  rx,
  ry,
  phase,
});

/** Idle: the membrane breathes and ripples round. */
const idle = [0, 2.1, 4.2].map((ph, i) => {
  const rx = [5, 5.3, 4.8][i] as number;
  const ry = [4.4, 4.1, 4.6][i] as number;
  const pic = cellBody([{ ...single(rx, ry, 0, ph), wob: 0.08 }]);
  return eye(pic, CW / 2 + 1, Math.round(BASE - ry), i === 2);
});

/** Move, to the right: it reaches out a pseudopod, pours into it, and drags its back after. */
const move = [
  [single(5, 4.2), { x: CW / 2 + 5, y: BASE - 3, rx: 2.2, ry: 1.8 }],
  [single(5.8, 3.8, 1), { x: CW / 2 + 6.5, y: BASE - 3, rx: 2.4, ry: 2 }],
  [single(5.6, 3.9, 2.5)],
  [single(4.8, 4.5, 2), { x: CW / 2 - 1.5, y: BASE - 2.5, rx: 2.4, ry: 2 }],
].map((blobs, i) => {
  const pic = cellBody(blobs as Blob[]);
  return eye(pic, CW / 2 + ([2, 3, 4, 3][i] as number), Math.round(BASE - 4));
});

/** The nip: crouch back, lunge with the membrane opened like a mouth, snap shut. */
const nip = [
  cellBody([single(5.6, 3.6, -1.5)]),
  cellBody(
    [single(6.2, 4, 2)],
    (x, y) => x > CW / 2 + 4 && Math.abs(y - (BASE - 4)) < (x - CW / 2 - 4) * 0.9,
  ),
  cellBody([single(5.4, 4.2, 2.5)]),
].map((pic, i) => eye(pic, CW / 2 + ([0, 3, 4][i] as number), Math.round(BASE - 4)));
put(nip[2] as Pic, "*", CW / 2 + 9, BASE - 6);
put(nip[2] as Pic, "*", CW / 2 + 10, BASE - 3);

/** Division: swell, stretch, pinch at the waist, part, and settle as two. */
const divide = [
  [single(5.4, 4.3)],
  [single(6.8, 3.9)],
  [
    { ...single(4.2, 3.9, -3.2), wob: 0.03 },
    { ...single(4.2, 3.9, 3.2), wob: 0.03 },
  ],
  [
    { ...single(4, 3.8, -4.4), wob: 0.03 },
    { ...single(4, 3.8, 4.4), wob: 0.03 },
    { x: CW / 2, y: BASE - 3.6, rx: 1.6, ry: 1 },
  ],
  [
    { ...single(4.1, 3.8, -5.6), wob: 0.04 },
    { ...single(4.1, 3.8, 5.6), wob: 0.04 },
  ],
  [
    { ...single(4.4, 3.9, -6.2), wob: 0.05 },
    { ...single(4.4, 3.9, 6.2), wob: 0.05, phase: 2 },
  ],
].map((blobs, i) => {
  const pic = cellBody(blobs as Blob[]);
  const y = Math.round(BASE - 4);
  if (i < 2) return eye(pic, CW / 2 + 1, y, i === 1);
  const off = [0, 0, 3.2, 4.4, 5.6, 6.2][i] as number;
  eye(pic, Math.round(CW / 2 - off + 1), y);
  return eye(pic, Math.round(CW / 2 + off + 1), y);
});

const cell = sprite({
  name: "fx-cell",
  group: "combat",
  palette: BIO,
  lone: LONE,
  size: [CW, CH],
  origin: [CW / 2, BASE],
  shadow: paintAt(CW, CH, (x, y) =>
    ((x - CW / 2) / 5) ** 2 + ((y - BASE) / 1.2) ** 2 <= 1 ? "o" : null,
  ).toString(),
  frames: {
    ...framesOf("idle", idle),
    ...framesOf("move", move),
    ...framesOf("nip", nip),
    ...framesOf("div", divide),
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle0", "idle1", "idle2", "idle0"], fps: 6, jump: 0.5 },
    move: { frames: names("move", 4), fps: 10, jump: 0.5 },
    nip: { frames: names("nip", 3), fps: 12, loop: false, jump: 0.5 },
    divide: { frames: names("div", 6), fps: 8, loop: false, jump: 0.6 },
  },
});

// 해부 실습서 ---------------------------------------------------------------------------------

/**
 * One cut: a tapered slash from the apex outward, white along its middle with a green edge
 * below. `dim` is the same cut fading.
 */
function cut(pic: Pic, angle: number, r0: number, r1: number, dim: boolean): void {
  const ax = 2;
  const ay = 14;
  const x0 = ax + Math.cos(angle) * r0;
  const y0 = ay + Math.sin(angle) * r0;
  const x1 = ax + Math.cos(angle) * r1;
  const y1 = ay + Math.sin(angle) * r1;
  const mx0 = ax + Math.cos(angle) * (r0 + (r1 - r0) * 0.25);
  const my0 = ay + Math.sin(angle) * (r0 + (r1 - r0) * 0.25);
  const mx1 = ax + Math.cos(angle) * (r0 + (r1 - r0) * 0.8);
  const my1 = ay + Math.sin(angle) * (r0 + (r1 - r0) * 0.8);
  line(pic, x0, y0, x1, y1, dim ? "l" : "p");
  line(pic, mx0, my0 + 1, mx1, my1 + 1, dim ? "m" : "l");
  if (!dim) line(pic, mx0, my0, mx1, my1, "W");
}

/** The fan: three cuts in quick order, top to bottom, each fading as the next lands. */
function fan(k: number): Pic {
  const pic = Pic.blank(40, 28);
  const angles = [-0.42, 0, 0.42];
  if (k === 4) {
    angles.forEach((a, i) => {
      for (const r of [16, 24, 31]) {
        pic.set(
          Math.round(2 + Math.cos(a) * (r + i)),
          Math.round(14 + Math.sin(a) * (r + i)),
          i % 2 ? "'" : ",",
        );
      }
    });
    return pic;
  }
  angles.forEach((a, i) => {
    if (i > k) return;
    const fresh = i === k && k < 3;
    cut(pic, a, fresh ? 6 : 9, fresh ? 36 : 33, !fresh);
  });
  return clean(pic, LONE);
}

const scalpel = sprite({
  name: "fx-scalpel",
  group: "combat",
  outline: false,
  blend: "add",
  palette: BIO,
  lone: LONE,
  size: [40, 28],
  origin: [2, 14],
  frames: framesOf("cut", [0, 1, 2, 3, 4].map(fan)),
  anim: { fan: { frames: names("cut", 5), fps: 24, loop: false, jump: 1 } },
});

/** A drop at three sizes: a bead, a swelling drop, a falling drop, and a splash. */
const BEAD = "DD\nDD";
const SWELL = ".DD.\nD^DD\n.DD.";
const DROP = ".DD.\nD^rD\nDrrD\n.DD.";
const SPLASH = "D....D\n.D..D.\n..DD..";
const NICK = "..DD\nDD..";

/** 출혈: a nick on the target with drops that swell, fall and splash, in a loop. */
function bleedFrame(k: number): Pic {
  const pic = Pic.blank(14, 16);
  put(pic, NICK, 2, 1);
  put(pic, NICK, 8, 3);
  const stream = (x: number, top: number, phase: number) => {
    const s = (k + phase) % 4;
    if (s === 0) put(pic, BEAD, x + 1, top);
    else if (s === 1) put(pic, SWELL, x, top);
    else if (s === 2) {
      put(pic, BEAD, x + 1, top);
      put(pic, DROP, x, top + 4);
    } else {
      put(pic, BEAD, x + 1, top);
      put(pic, SPLASH, x - 1, 13);
    }
  };
  stream(2, 3, 0);
  stream(8, 5, 2);
  return pic;
}

const bleed = sprite({
  name: "fx-bleed",
  group: "combat",
  outline: false,
  palette: BIO,
  lone: LONE,
  size: [14, 16],
  origin: [7, 15],
  frames: framesOf("b", [0, 1, 2, 3].map(bleedFrame)),
  anim: { bleed: { frames: names("b", 4), fps: 6, jump: 1 } },
});

export default [cell, scalpel, bleed];
