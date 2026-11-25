/**
 * Book cues: every book has a cast sound and an impact (its `cues.cast` and `cues.impact` in
 * `packages/content`). A book is one line in `LINES`; its sounds come from a cast flavour
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
  | "wave"
  | "dash"
  | "zone"
  | "none";

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
  /** Counting up: three chalk ticks climbing a whole step at a time. */
  count: (t) => [
    ping(784 * t, 0.2, {
      role: "body",
      wave: "tri",
      jumps: [
        { at: 0.06, semitones: 2 },
        { at: 0.12, semitones: 4 },
      ],
    }),
    chalk(3600, 0.16, { am: { rate: 16, depth: 0.9 } }),
  ],
  /** Dice shaken and let go. */
  dice: (t) => [
    crackle(120, 1800, 0.22, { band: { freq: 2200 * t, q: 3 } }),
    tick(2400 * t, 0.02, { delay: 0.2 }),
  ],
  /** A dash: a fast swish with the push-off underneath. */
  dash: (t) => [whoosh(1200 * t, 2.5, 0.16), thump(140 * t, 0.04, { gain: -8, punch: 0 })],
  /** A pen scribbling a margin note. */
  scribble: (t) => [chalk(3000 * t, 0.2, { am: { rate: 22, depth: 0.8 }, hold: 0.1 })],
  /** Gears and a ratchet winding up. */
  gears: (t) => [
    crackle(45, 1500, 0.3, { band: { freq: 1800 * t, q: 4 } }),
    {
      role: "body",
      wave: "metal",
      freq: 600 * t,
      band: { freq: 1500 * t, q: 3 },
      attack: 0.01,
      hold: 0.15,
      decay: 0.1,
      gain: -10,
    },
  ],
  /** A bright beam: a high tone with a fast shimmer. */
  laser: (t) => [
    ping(2600 * t, 0.25, { role: "body", vibrato: { depth: 0.4, rate: 30 }, slide: -0.5 }),
    hiss(6000, 0.15, { gain: -12 }),
  ],
  /** A field laid on the ground: a low swell drawing in. */
  zone: (t) => [
    { role: "body", wave: "sine", freq: 70 * t, slide: 0.4, attack: 0.25, hold: 0.05, decay: 0.3 },
    whoosh(400 * t, 1.5, 0.5, { gain: -4 }),
  ],
  /** One drop from a burette. */
  drop: (t) => [ping(900 * t, 0.06, { role: "body", slide: 4 }), splash(2000, 0.05, { gain: -8 })],
  /** Something growing: a soft rising fifth and leaves stirring. */
  bloom: (t) => [
    ping(392 * t, 0.4, {
      role: "body",
      wave: "tri",
      jumps: [{ at: 0.12, semitones: 7 }],
      attack: 0.05,
    }),
    crackle(60, 3000, 0.4, { gain: -10 }),
  ],
  /** Small defenders circling: a soft whir. */
  swarm: (t) => [
    whoosh(900 * t, 0, 0.35, { am: { rate: 11, depth: 0.7 } }),
    squelch(260 * t, 0.05, { gain: -6 }),
  ],
  /** Weather rolling in: wind and the first rain. */
  storm: (t) => [whoosh(500 * t, 1, 0.6), crackle(300, 2500, 0.5, { gain: -6 })],
  /**
   * A falling star for a telegraph: a whistle dropping for 1.2 s, loudest as it lands.
   * Like the rumble, the engine stretches it to the real delay.
   */
  fall: (t) => [
    {
      role: "body",
      wave: "sine",
      freq: 1800 * t,
      slide: -1.2,
      attack: 1.15,
      hold: 0.03,
      decay: 0.05,
      curve: 1,
      gain: -4,
    },
    rumble(250, 0.05, { attack: 1.15, hold: 0.03 }),
  ],
  /** A tide coming in. */
  tide: (t) => [
    {
      role: "body",
      wave: "pink",
      freq: 0,
      band: { freq: 500 * t, slide: 1, q: 0.8 },
      attack: 0.3,
      hold: 0.1,
      decay: 0.3,
    },
    hiss(4000, 0.4, { delay: 0.2, gain: -10 }),
  ],
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
  /** Dice landing: two quick ticks and a small chime. */
  dice: (t) => [
    tick(2600 * t, 0.02),
    tick(2200 * t, 0.02, { delay: 0.04 }),
    ping(1320 * t, 0.06, { gain: -8 }),
  ],
  /** Steel parts: a clank. */
  clank: (t) => [
    ping(700 * t, 0.1, { role: "body", wave: "tri" }),
    {
      role: "material",
      wave: "metal",
      freq: 1400 * t,
      band: { freq: 2800, q: 3 },
      attack: 0.0005,
      hold: 0.003,
      decay: 0.07,
      gain: -4,
    },
    thump(140 * t, 0.05, { gain: -6 }),
  ],
  /** Light that burns where it lands. */
  sizzle: (t) => [
    hiss(3500, 0.08, { role: "body" }),
    ping(3000 * t, 0.05, { gain: -6 }),
    tick(5000, 0.01),
  ],
  /** A splash with a bubble in it. */
  splash: (t) => [
    splash(1200 * t, 0.1, { role: "body" }),
    ping(500 * t, 0.06, { slide: 3, gain: -6 }),
    tick(3000, 0.01, { gain: -10 }),
  ],
  /** A soft, living hit. */
  squish: (t) => [
    squelch(220 * t, 0.07),
    splash(900 * t, 0.06, { gain: -4 }),
    ping(600 * t, 0.04, { wave: "tri", slide: 2, gain: -12 }),
  ],
  /** A gust striking. */
  gust: (t) => [whoosh(900 * t, -1.5, 0.12, { role: "body" }), thump(120 * t, 0.06, { gain: -6 })],
  /** Something from the sky hitting the ground. */
  crater: (t) => [
    thump(50 * t, 0.4, { punch: 0.8 }),
    crackle(1500, 1200, 0.35),
    rumble(250, 0.4, { gain: -2 }),
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
  dash: "dash",
  zone: "zone",
  none: "scribble",
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

type Line = [
  id: string,
  cls: HitClass,
  kind: AttackKind,
  cast?: string,
  hit?: string,
  tune?: number,
];

/** The thirty launch books. One line per book: id, class, attack kind, flavours, tune. */
const LINES: readonly Line[] = [
  ["wangdo", "math", "orbit"],
  ["graph-note", "math", "beam", "zing", "curve"],
  ["sequence", "math", "projectile", "count", "edge", 1.12],
  ["probability", "math", "projectile", "dice", "dice"],
  ["coordinate", "math", "dash", "dash", "edge", 1.26],
  ["proof-note", "math", "none", "scribble", "edge", 1.5],
  ["holiday-physics", "physics", "projectile", "throw", "land"],
  ["mechanics-kit", "physics", "orbit", "gears", "clank"],
  ["em-lab", "physics", "chain", "charge", "zap"],
  ["optics", "physics", "beam", "laser", "sizzle"],
  ["momentum-book", "physics", "dash", "dash", "land", 0.85],
  ["gravity-report", "physics", "zone", "zone", "land", 0.75],
  ["zoomin-chem", "chemistry", "projectile", "slosh", "shatter"],
  ["periodic-table", "chemistry", "projectile", "throw", "shatter", 1.3],
  ["organic", "chemistry", "cone", "spray", "splash", 0.9],
  ["lab-report", "chemistry", "cone", "spray", "ignite"],
  ["mole", "chemistry", "cone", "spray", "splash", 1.12],
  ["titration", "chemistry", "projectile", "drop", "splash", 1.26],
  ["camping-bio", "biology", "summon", "spawn", "divide"],
  ["pedigree", "biology", "projectile", "throw", "squish", 1.12],
  ["dissection", "biology", "cone", "swish", "cut"],
  ["ecosystem", "biology", "zone", "bloom", "squish", 0.9],
  ["enzyme", "biology", "zone", "bloom", "squish", 1.2],
  ["immune", "biology", "orbit", "swarm", "squish", 1.4],
  ["round-earth", "earth", "telegraph", "rumble", "fault"],
  ["rock-box", "earth", "projectile", "heave", "rock"],
  ["weather-map", "earth", "zone", "storm", "gust"],
  ["star-log", "earth", "telegraph", "fall", "crater"],
  ["tide-table", "earth", "wave", "tide", "splash", 0.7],
  ["volcano", "earth", "telegraph", "rumble", "crater", 0.8],
];

/** Cue names that differ from `cast` and `hit` in the content. */
const NAMES: Readonly<Record<string, { cast?: string; hit?: string }>> = {
  "camping-bio": { hit: "divide" },
  dissection: { cast: "swish" },
};

export const BOOK_TABLE: readonly BookSound[] = LINES.map(
  ([id, cls, kind, castFlavor, hitFlavor, tune]) => ({
    id,
    cls,
    kind,
    cast: NAMES[id]?.cast ?? "cast",
    hit: NAMES[id]?.hit ?? "hit",
    ...(castFlavor ? { castFlavor } : {}),
    ...(hitFlavor ? { hitFlavor } : {}),
    ...(tune ? { tune } : {}),
  }),
);

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
