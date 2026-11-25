import type { Actor, Doll, Prop } from "../scene.ts";

/**
 * Pieces the combat review scenes share: an effect placed in its own colours, a monster with the
 * blob shadow it borrows, a student mid-attack, and a crowd filler that keeps clear of the
 * fights a scene is about.
 */

/** An effect is light or matter that keeps its own colours: never themed. */
export const fx = (prop: string, x: number, y: number, more: Partial<Prop> = {}): Prop => ({
  prop,
  at: [x, y],
  raw: true,
  ...more,
});

const SHADOW: Record<string, string> = {
  odap: "shadow-s/blob",
  "odap-pencil": "shadow-s/blob",
  "element-fire": "shadow-s/blob",
  "element-water": "shadow-s/blob",
  "element-air": "shadow-s/blob",
  "element-earth": "shadow-s/blob",
  "element-earth-pebble": "shadow-s/blob",
  "cave-shadow": "shadow-m/blob",
  rational: "shadow-m/blob",
  tortoise: "shadow-m/blob",
};

/** A monster on its own beat; `left` faces it toward students standing to its left. */
export const mob = (
  actor: string,
  x: number,
  y: number,
  anim = "idle",
  index = 0,
  left = true,
): Actor => ({
  actor,
  at: [x, y],
  anim,
  index,
  play: anim !== "hit",
  flip: left === (actor === "rational" || actor === "tortoise"),
  ...(SHADOW[actor] ? { shadow: SHADOW[actor] } : {}),
});

export const student = (look: string, x: number, y: number, index = 1, flip = false): Doll => ({
  rig: "student",
  look,
  dir: "side",
  anim: "attack",
  index,
  at: [x, y],
  flip,
});

/** A small seeded generator, so a crowd is the same every render. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = [
  "odap",
  "odap",
  "odap",
  "odap-pencil",
  "odap-pencil",
  "element-fire",
  "element-water",
  "element-air",
  "element-earth",
  "rational",
  "tortoise",
  "cave-shadow",
] as const;

/**
 * A crowd: `count` monsters in a box, each a hashed kind and beat, at least `gap` apart and clear
 * of every circle in `keep` (x, y, radius, the y squashed for the ground).
 */
export function crowd(
  seed: number,
  count: number,
  box: readonly [number, number, number, number],
  keep: readonly (readonly [number, number, number])[],
  gap = 14,
  facesLeft: (x: number) => boolean = () => true,
): Actor[] {
  const r = rng(seed);
  const out: Actor[] = [];
  for (let tries = 0; tries < count * 60 && out.length < count; tries++) {
    const x = Math.round(box[0] + r() * (box[2] - box[0]));
    const y = Math.round(box[1] + r() * (box[3] - box[1]));
    if (keep.some(([kx, ky, kr]) => Math.hypot(x - kx, (y - ky) * 1.4) < kr)) continue;
    if (out.some((m) => Math.hypot(m.at[0] - x, (m.at[1] - y) * 1.3) < gap)) continue;
    const kind = KINDS[Math.floor(r() * KINDS.length)] as string;
    const anim = kind.startsWith("odap") ? "hop" : kind.startsWith("element") ? "move" : "walk";
    out.push(
      mob(kind, x, y, kind === "cave-shadow" ? "idle" : anim, Math.floor(r() * 4), facesLeft(x)),
    );
  }
  return out;
}

/**
 * A line strip laid the way the client lays it: full tiles every `tile` pixels along the true
 * line, each at the nearest of sixteen aims (variants in turn), a quarter-length partial tile for
 * the rest, the end cap at the drawn end and, with `start`, the same cap at the opposite aim at
 * the start.
 */
export function laid(
  prop: string,
  anim: string,
  x0: number,
  y0: number,
  degrees: number,
  length: number,
  tile: number,
  more: { variants?: number; index?: number; play?: boolean; start?: boolean } = {},
): Prop[] {
  const a = Math.round(degrees / 22.5) & 15;
  const ux = Math.cos((degrees * Math.PI) / 180);
  const uy = Math.sin((degrees * Math.PI) / 180);
  const at = (d: number): [number, number] => [Math.round(x0 + ux * d), Math.round(y0 + uy * d)];
  let n = Math.floor(length / tile);
  let q = Math.round(((length - n * tile) * 4) / tile);
  if (q === 4) {
    n += 1;
    q = 0;
  }
  const look = { index: more.index ?? 0, play: more.play ?? false };
  const out: Prop[] = [];
  if (more.start)
    out.push(fx(`${prop}-end`, ...at(0), { anim: `${anim}${(a + 8) & 15}`, ...look }));
  for (let i = 0; i < n; i++) {
    const v = more.variants && i % more.variants ? `v${i % more.variants}` : "";
    out.push(fx(prop, ...at(i * tile), { anim: `${anim}${a}${v}`, ...look }));
  }
  if (q) out.push(fx(prop, ...at(n * tile), { anim: `${anim}${a}q${q}`, ...look }));
  out.push(fx(`${prop}-end`, ...at((n + q / 4) * tile), { anim: `${anim}${a}`, ...look }));
  return out;
}
