import { type Legend, sprite } from "../../format.ts";
import { clean, ell, framesOf, line, names, Pic, paintAt, put, segDist } from "../../fx.ts";
import { PHYS, PHYS_LONE, TOME, tome } from "./physics.ts";
import { bob, spiral } from "./physics-kit.ts";

/** 물리's evolved forms, in the `combat-evolved` atlas. */
const evo = { group: "combat-evolved", outline: false, palette: PHYS, lone: PHYS_LONE } as const;

/**
 * 프린키피아 사본: the tome bound again in its deepest plum with a pale gold band, flying flat
 * and straight now, so it turns slower: four frames over a half turn. Its silk bookmark streams
 * out behind it, a long gold ribbon waving and forked at the end: drawn at sixteen aims
 * (`fly{aim}`), so the client never turns it and the tome reads as a comet from across a field.
 */
const PRINCIPIA: Legend = { ...TOME, y: "gold.pale", Y: "gold.light", G: "gold.mid" };

function ribbon(a: number, k: number): Pic {
  const s = 64;
  const c = s / 2;
  const ux = -Math.cos(a);
  const uy = -Math.sin(a);
  const pts: [number, number][] = [];
  for (let d = 5; d <= 30; d += 1) {
    const wave = Math.sin(d * 0.32 - k * 1.6) * (d / 30) * 3.6;
    pts.push([c + ux * d - uy * wave, c + uy * d + ux * wave]);
  }
  const pic = paintAt(s, s, (x, y) => {
    let best = 9;
    let side = 0;
    let along = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i] as [number, number];
      const q = pts[i + 1] as [number, number];
      const dist = segDist(x, y, p, q);
      if (dist < best) {
        best = dist;
        side = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
        along = i;
      }
    }
    const half = along > 21 ? 1.5 : 1.25 - along * 0.012;
    if (best > half) return null;
    // The forked end: the middle of the last few pixels is cut away.
    if (along > 21 && best < 0.55) return null;
    return side * (ux + uy) > 0 ? "G" : "Y";
  });
  const out = pic.clone();
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      if (pic.at(x, y) !== ".") continue;
      if ([pic.at(x - 1, y), pic.at(x + 1, y), pic.at(x, y - 1), pic.at(x, y + 1)].some((ch) => ch && ch !== "."))
        out.set(x, y, "o");
    }
  return out;
}

const principia = sprite({
  name: "evo-principia",
  group: "combat-evolved",
  palette: PRINCIPIA,
  size: [64, 64],
  origin: [32, 32],
  frames: {
    ...framesOf(
      "spin",
      [0, 1, 2, 3].map((k) =>
        put(Pic.blank(64, 64), tome((k * Math.PI) / 4).swap("lmdYG", "mddyY"), 23, 23),
      ),
    ),
    ...Object.fromEntries(
      Array.from({ length: 16 }, (_, d) =>
        [0, 1, 2, 3].map((k) => {
          const pic = ribbon((d / 16) * Math.PI * 2, k);
          put(pic, tome((k * Math.PI) / 4).swap("lmdYG", "mddyY"), 23, 23);
          return [`fly${d}-${k}`, clean(pic).toString()];
        }),
      ).flat(),
    ),
  },
  anim: {
    spin: { frames: names("spin", 4), fps: 10, jump: 0.5 },
    ...Object.fromEntries(
      Array.from({ length: 16 }, (_, d) => [
        `fly${d}`,
        { frames: names(`fly${d}-`, 4), fps: 10, jump: 0.5 },
      ]),
    ),
  },
});

/**
 * 푸코 진자: the swing plane turns. A dial on the ground round the pendulum, its rim set with
 * pins, the plane drawn across it at six angles through half a turn (30° a second: the client
 * steps a frame every second), and the heavier bob the two pendulums swing.
 */
function dial(k: number): Pic {
  const w = 108;
  const h = 56;
  const cx = w / 2;
  const cy = h / 2;
  const rx = 50;
  const ry = 25;
  const pic = paintAt(w, h, (x, y) => {
    const e = (ell(x, y, cx, cy, rx, ry) - 1) * ry;
    if (e > 0.5 || e < -1.2) return null;
    return y < cy ? "l" : "m";
  });
  // Twelve pins round the rim; the two the plane points at are knocked down.
  const plane = (k * Math.PI) / 6;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const x = Math.round(cx + Math.cos(a) * (rx - 4));
    const y = Math.round(cy + Math.sin(a) * (ry - 3));
    const down = Math.abs(Math.sin(a - plane)) < 0.1;
    put(pic, down ? "pW" : "W\np", x, y - (down ? 0 : 1));
  }
  const ux = Math.cos(plane);
  const uy = Math.sin(plane) * 0.5;
  line(pic, cx - ux * (rx - 8), cy - uy * (rx - 8), cx + ux * (rx - 8), cy + uy * (rx - 8), "p");
  return clean(pic, PHYS_LONE);
}

const foucault = sprite({
  ...evo,
  name: "evo-foucault",
  size: [108, 56],
  origin: [54, 28],
  frames: {
    ...framesOf("plane", [0, 1, 2, 3, 4, 5].map(dial)),
    bob: put(Pic.blank(108, 56), bob(20), 44, 18).toString(),
  },
  anim: {
    turn: { frames: names("plane", 6), fps: 1, jump: 1 },
    bob: { frames: ["bob"], fps: 1, loop: false },
  },
});

/**
 * 맥스웰 방정식: where the lightning forks, the field shows: rings of plum running out from the
 * struck target, broken where the two new arcs leave.
 */
function field(k: number): Pic {
  const s = 33;
  const c = 16.5;
  const pic = Pic.blank(s, s);
  for (const [r, ch] of [
    [4 + k * 4, "W"],
    [8 + k * 4, "l"],
  ] as const) {
    if (r > 16) continue;
    put(
      pic,
      paintAt(s, s, (x, y) => {
        const d = Math.abs(Math.hypot(x - c, (y - c) * 1.4) - r);
        if (d > 0.6) return null;
        const a = Math.atan2(y - c, x - c);
        if (Math.abs(Math.sin(a * 2)) < 0.25) return null;
        return ch;
      }),
      0,
      0,
    );
  }
  put(pic, k === 0 ? "WWW\nWWW\nWWW" : ".p.\npWp\n.p.", 15, 15);
  return clean(pic, PHYS_LONE);
}

const maxwell = sprite({
  ...evo,
  name: "evo-maxwell",
  blend: "add",
  size: [33, 33],
  origin: [16, 16],
  frames: framesOf("f", [0, 1, 2].map(field)),
  anim: { fork: { frames: names("f", 3), fps: 16, loop: false, jump: 1 } },
});

/**
 * 탄성 충돌: where two carried monsters meet, the energy passes on whole: a clack of two white
 * arcs back to back and a spring of plum between them.
 */
function clack(k: number): Pic {
  const pic = Pic.blank(25, 17);
  const gap = [2, 5, 8][k] as number;
  for (const side of [-1, 1] as const) {
    const x = 12 + side * gap;
    for (let dy = -5; dy <= 5; dy++) {
      const bend = Math.round((dy * dy) / 8) * side;
      pic.set(x + bend, 8 + dy, k === 2 ? "l" : "W");
      pic.set(x + bend + side, 8 + dy, k === 2 ? "m" : "p");
    }
  }
  if (k < 2) {
    for (let x = 12 - gap + 2; x <= 12 + gap - 2; x++) pic.set(x, 8 + (x % 2 ? -1 : 1), "l");
  }
  return clean(pic, PHYS_LONE);
}

const elastic = sprite({
  ...evo,
  name: "evo-elastic",
  blend: "add",
  size: [25, 17],
  origin: [12, 8],
  frames: framesOf("c", [0, 1, 2].map(clack)),
  anim: { clack: { frames: names("c", 3), fps: 18, loop: false, jump: 1 } },
});

/**
 * 만유인력: the well grown to swallow a crowd, with a ring of debris already caught in orbit
 * round its dark heart.
 */
function gravitation(k: number): Pic {
  const pic = spiral(80, k, 4);
  const cx = pic.w / 2;
  const cy = pic.h / 2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + k * 0.35;
    const x = cx + Math.cos(a) * 30;
    const y = cy + Math.sin(a) * 15;
    put(pic, i % 3 === 0 ? "pl\nlm" : "ll\nm.", x, y);
  }
  return clean(pic, PHYS_LONE);
}

const universal = sprite({
  ...evo,
  name: "evo-universal-gravitation",
  size: [164, 84],
  origin: [82, 42],
  frames: framesOf("w", [0, 1, 2, 3].map(gravitation)),
  anim: { pull: { frames: names("w", 4), fps: 10, jump: 1 } },
});

export default [principia, foucault, maxwell, elastic, universal];
