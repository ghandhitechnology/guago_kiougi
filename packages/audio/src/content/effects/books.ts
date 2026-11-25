/**
 * Book cues: every book has a cast sound and an impact (its `cues.cast` and `cues.impact` in
 * `packages/content`). A book is one line in `BOOK_TABLE`; its sounds come from a cast flavour
 * (how the attack leaves: thrown, sprayed, summoned) and a hit flavour (what it lands as), both
 * defaulting from the attack kind and the class. Adding one of the remaining launch books is one
 * line; giving it its own character is choosing flavours or a `tune`.
 *
 * Impacts are `hit` sounds (three layers at most) and play for ordinary hits; heavy hits and crits
 * use the class family in `classes.ts`, so a class keeps one weight.
 */

import type { HitClass } from "../../engine/hits.ts";
import type { EffectSource, Layer } from "../../sfx/format.ts";
import {
  chalk,
  crackle,
  hiss,
  paper,
  ping,
  rumble,
  splash,
  squelch,
  thump,
  tick,
  whoosh,
  zap,
} from "./kit.ts";

export type AttackKind =
  | "orbit"
  | "beam"
  | "projectile"
  | "chain"
  | "cone"
  | "summon"
  | "telegraph"
  | "wave";

type Flavor = (tune: number) => Layer[];

/** How an attack leaves the book. */
const CAST: Record<string, Flavor> = {
  /** A ring of shapes spinning up: chalk, then an exact rising 1-5-8. */
  spin: (t) => [
    chalk(3200, 0.08),
    ping(587.33 * t, 0.22, {
      role: "body",
      wave: "tri",
      jumps: [
        { at: 0.05, semitones: 7 },
        { at: 0.1, semitones: 12 },
      ],
    }),
    whoosh(1500 * t, 2, 0.25, { gain: -8 }),
  ],
  /** A drawn curve leaving the page: a tone that bends like a sine wave. */
  zing: (t) => [
    ping(900 * t, 0.3, { role: "body", wave: "tri", slide: 1.5, vibrato: { depth: 3, rate: 9 } }),
    chalk(4200, 0.06, { gain: -4 }),
    whoosh(2500 * t, 1, 0.2, { gain: -10 }),
  ],
  /** A heavy book thrown: a swish and the pages flapping. */
  throw: (t) => [
    whoosh(700 * t, 2.5, 0.22),
    paper(1800, 0.12, { delay: 0.02, gain: -6 }),
    thump(160 * t, 0.04, { gain: -10, punch: 0 }),
  ],
  /** A charge building: a rising buzz. */
  charge: (t) => [
    zap(280 * t, 0.25, { role: "body", slide: 3, am: { rate: 60, depth: 0.7 } }),
    hiss(4000, 0.2, { gain: -10 }),
    ping(880 * t, 0.12, { delay: 0.18, slide: 2, gain: -8 }),
  ],
  /** A flask thrown: glass catching the air and liquid sloshing inside. */
  slosh: (t) => [
    whoosh(900 * t, 2, 0.2),
    splash(800 * t, 0.15, {
      am: { rate: 8, depth: 0.6 },
      band: { freq: 800 * t, slide: 1, q: 1.2 },
      gain: -4,
    }),
    ping(2900 * t, 0.05, { gain: -12 }),
  ],
  /** A spray: pressurised hiss. */
  spray: (t) => [
    hiss(2500 * t, 0.3, { band: { freq: 4000 * t, q: 0.8 } }),
    splash(1600 * t, 0.15, { gain: -6 }),
  ],
  /** Something small and alive appears: a pop and a chirp up. */
  spawn: (t) => [
    squelch(300 * t, 0.06, { slide: 3 }),
    ping(520 * t, 0.18, { wave: "tri", slide: 1.2, gain: -4 }),
    splash(1200, 0.08, { gain: -8 }),
  ],
  /** A blade through air. */
  swish: (t) => [
    whoosh(3500 * t, -2, 0.14, { band: { freq: 3500 * t, slide: -2, q: 2 } }),
    tick(6000, 0.01, { gain: -8 }),
  ],
  /**
   * 예보: a rumble that grows for 1.2 s and peaks exactly at its end, where the strike lands.
   * The engine stretches it to the book's real delay.
   */
  rumble: (t) => [
    {
      role: "body",
      wave: "sine",
      freq: 42 * t,
      slide: 0.15,
      attack: 1.15,
      hold: 0.03,
      decay: 0.05,
      curve: 1,
    },
    rumble(180, 0.05, { attack: 1.15, hold: 0.03, gain: 2 }),
    crackle(400, 1200, 0.05, { attack: 1.1, hold: 0.05, gain: -6 }),
  ],
  /** A rock hefted and thrown. */
  heave: (t) => [whoosh(500 * t, 1.2, 0.2), thump(100 * t, 0.05, { gain: -8, punch: 0 })],
  /** A ring opening outward. */
  ring: (t) => [whoosh(400 * t, 3, 0.3), ping(440 * t, 0.3, { wave: "tri", slide: 1, gain: -6 })],
};

/** What a book lands as: one light impact, three layers at most. */
const HIT: Record<string, Flavor> = {
  /** A polygon's edge: a chalk tick and a clean high tone. */
  edge: (t) => [
    ping(1568 * t, 0.05, { role: "body", wave: "tri" }),
    chalk(4000, 0.015),
    ping(1568 * 1.5 * t, 0.03, { gain: -12 }),
  ],
  /** A sine curve passing through: a bright ping that bends down. */
  curve: (t) => [
    ping(2093 * t, 0.06, { role: "body", slide: -1.5 }),
    chalk(3600, 0.02),
    tick(5000, 0.01, { gain: -8 }),
  ],
  /** A thrown book landing: a thud and a paper slap. */
  land: (t) => [
    thump(95 * t, 0.09, { punch: 0.5 }),
    paper(1300, 0.05),
    tick(2500, 0.015, { gain: -6 }),
  ],
  /** Lightning arriving. */
  zap: (t) => [
    zap(1800 * t, 0.06, { role: "body" }),
    crackle(2500, 3000, 0.07),
    thump(150 * t, 0.04, { gain: -8 }),
  ],
  /** A flask breaking on a body. */
  shatter: (t) => [
    crackle(3000, 4000, 0.16, { role: "body" }),
    ping(3200 * t, 0.09, { gain: -4 }),
    splash(1100 * t, 0.12, { gain: -2 }),
  ],
  /** Vapour catching fire. */
  ignite: (t) => [
    whoosh(400 * t, 2.5, 0.25, { role: "body", attack: 0.01, hold: 0.03, decay: 0.21 }),
    crackle(1200, 2000, 0.2),
    thump(90 * t, 0.06, { gain: -8 }),
  ],
  /** A minion dividing as it strikes: the split, and a soft pop. */
  divide: (t) => [
    ping(440 * t, 0.16, { role: "body", wave: "tri", slide: 0.8 }),
    ping(440 * t, 0.16, { wave: "tri", slide: -0.5 }),
    squelch(220 * t, 0.05),
  ],
  /** A clean, wet cut. */
  cut: (t) => [
    tick(2600 * t, 0.04, { band: { freq: 2600 * t, slide: -1, q: 2 } }),
    squelch(200 * t, 0.05),
    splash(1500, 0.05, { gain: -8 }),
  ],
  /** A fault opening: the crack and the ground giving. */
  fault: (t) => [
    crackle(2000, 1500, 0.3, { role: "material" }),
    thump(52 * t, 0.35, { punch: 0.7 }),
    rumble(220, 0.4, { gain: -2 }),
  ],
  /** A rock breaking on impact. */
  rock: (t) => [
    tick(2000 * t, 0.06),
    thump(150 * t, 0.08, { punch: 0.5 }),
    crackle(900, 1500, 0.1, { role: "sweetener", gain: -4 }),
  ],
  /** A shockwave ring passing through. */
  ring: (t) => [
    thump(110 * t, 0.12),
    whoosh(800 * t, -2, 0.15, { role: "material" }),
    ping(880 * t, 0.08, { gain: -10 }),
  ],
};

const DEFAULT_CAST: Record<AttackKind, string> = {
  orbit: "spin",
  beam: "zing",
  projectile: "throw",
  chain: "charge",
  cone: "spray",
  summon: "spawn",
  telegraph: "rumble",
  wave: "ring",
};

const DEFAULT_HIT: Record<HitClass, string> = {
  math: "edge",
  physics: "land",
  chemistry: "shatter",
  biology: "cut",
  earth: "rock",
};

export interface BookSound {
  readonly id: string;
  readonly cls: HitClass;
  readonly kind: AttackKind;
  /** The last word of the content's cue ids: `sfx.book.<id>.<cast>`. */
  readonly cast: string;
  readonly hit: string;
  readonly castFlavor?: string;
  readonly hitFlavor?: string;
  /** Pitch multiplier, so books of one class and kind still differ. */
  readonly tune?: number;
}

/** The M2 books. One line per book. */
export const BOOK_TABLE: readonly BookSound[] = [
  { id: "wangdo", cls: "math", kind: "orbit", cast: "cast", hit: "hit" },
  { id: "graph-note", cls: "math", kind: "beam", cast: "cast", hit: "hit", hitFlavor: "curve" },
  { id: "holiday-physics", cls: "physics", kind: "projectile", cast: "throw", hit: "land" },
  { id: "em-lab", cls: "physics", kind: "chain", cast: "cast", hit: "zap", hitFlavor: "zap" },
  {
    id: "zoomin-chem",
    cls: "chemistry",
    kind: "projectile",
    cast: "throw",
    hit: "shatter",
    castFlavor: "slosh",
  },
  {
    id: "lab-report",
    cls: "chemistry",
    kind: "cone",
    cast: "spray",
    hit: "ignite",
    hitFlavor: "ignite",
  },
  {
    id: "camping-bio",
    cls: "biology",
    kind: "summon",
    cast: "spawn",
    hit: "divide",
    hitFlavor: "divide",
  },
  {
    id: "dissection",
    cls: "biology",
    kind: "cone",
    cast: "swish",
    hit: "cut",
    castFlavor: "swish",
  },
  {
    id: "round-earth",
    cls: "earth",
    kind: "telegraph",
    cast: "rumble",
    hit: "crack",
    hitFlavor: "fault",
  },
  {
    id: "rock-box",
    cls: "earth",
    kind: "projectile",
    cast: "throw",
    hit: "crack",
    castFlavor: "heave",
  },
];

export function bookEffects(table: readonly BookSound[]): Record<string, EffectSource> {
  const out: Record<string, EffectSource> = {};
  for (const b of table) {
    const t = b.tune ?? 1;
    const cast = CAST[b.castFlavor ?? DEFAULT_CAST[b.kind]];
    const hit = HIT[b.hitFlavor ?? DEFAULT_HIT[b.cls]];
    if (!cast || !hit) throw new Error(`book ${b.id}: unknown flavour`);
    out[`sfx.book.${b.id}.${b.cast}`] = {
      category: "combat",
      variants: 2,
      jitter: 0.05,
      priority: 1,
      max: 2,
      level: -3,
      layers: cast(t),
    };
    out[`sfx.book.${b.id}.${b.hit}`] = {
      category: "hit",
      variants: 3,
      jitter: 0.06,
      max: 3,
      layers: hit(t),
    };
  }
  return out;
}

export const BOOK_EFFECTS = bookEffects(BOOK_TABLE);
