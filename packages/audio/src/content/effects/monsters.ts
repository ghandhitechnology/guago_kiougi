/**
 * Monster cues: `sfx.monster.<id>.hit`, `.die` and, for monsters with an attack, `.attack`. A
 * monster is one line in `MONSTER_TABLE`: its material and mass. Heavier monsters sound lower
 * and longer. A hit is what the target sounds like when struck (the material layer of PLAN §6);
 * a death is the pop: 오답 tear like paper, stone crumbles, fire fizzles out.
 */

import type { EffectSource, Layer } from "../../sfx/format.ts";
import { crackle, hiss, paper, ping, rumble, splash, squelch, thump, tick, whoosh } from "./kit.ts";

export type Material =
  | "paper"
  | "pencil"
  | "bronze"
  | "fire"
  | "water"
  | "air"
  | "stone"
  | "shadow"
  | "shell";

export type MonsterAttack = "fuse" | "heal" | "dash" | "shot";

interface MaterialSounds {
  hit: (t: number) => Layer[];
  die: (t: number) => Layer[];
}

const MATERIALS: Record<Material, MaterialSounds> = {
  paper: {
    hit: (t) => [paper(2200 * t, 0.05), tick(3200, 0.012), thump(180 * t, 0.04, { gain: -8 })],
    die: (t) => [
      {
        role: "material",
        wave: "noise",
        freq: 0,
        band: { freq: 2400 * t, slide: 1.2, q: 1.6 },
        am: { rate: 95, depth: 0.7 },
        attack: 0.005,
        hold: 0.12,
        decay: 0.12,
      },
      squelch(320 * t, 0.05, { slide: 3, gain: -4 }),
      crackle(280, 2500, 0.3, { delay: 0.08, gain: -6 }),
    ],
  },
  pencil: {
    hit: (t) => [
      tick(1800 * t, 0.02, { band: { freq: 1800 * t, q: 4 } }),
      ping(1100 * t, 0.03, { wave: "tri", role: "body" }),
    ],
    die: (t) => [
      tick(2500 * t, 0.03),
      thump(300 * t, 0.03, { punch: 0.6 }),
      paper(3000, 0.12, { delay: 0.02, gain: -4 }),
    ],
  },
  bronze: {
    hit: (t) => [
      ping(620 * t, 0.12, { role: "body", wave: "tri" }),
      {
        role: "material",
        wave: "metal",
        freq: 1600 * t,
        band: { freq: 3000, q: 3 },
        attack: 0.0005,
        hold: 0.003,
        decay: 0.06,
        gain: -6,
      },
      thump(150 * t, 0.05, { gain: -6 }),
    ],
    die: (t) => [
      crackle(400, 1500, 0.4),
      ping(520 * t, 0.4, { slide: -0.5, wave: "tri" }),
      thump(100 * t, 0.15, { delay: 0.2, punch: 0.6 }),
      {
        role: "material",
        wave: "metal",
        freq: 1200 * t,
        band: { freq: 2600, q: 3 },
        attack: 0.001,
        hold: 0.01,
        decay: 0.25,
        delay: 0.2,
        gain: -8,
      },
    ],
  },
  fire: {
    hit: (t) => [whoosh(600 * t, 1, 0.08, { role: "body" }), crackle(1500, 2000, 0.06)],
    die: (t) => [
      hiss(3000, 0.5, { highpass: { freq: 3000, slide: -1.5 } }),
      crackle(1200, 1800, 0.4, { decay: 0.4 }),
      whoosh(800 * t, -2, 0.35, { role: "body" }),
    ],
  },
  water: {
    hit: (t) => [
      splash(1300 * t, 0.06, { role: "body" }),
      ping(700 * t, 0.05, { slide: 2.5, gain: -6 }),
    ],
    die: (t) => [
      splash(600 * t, 0.4, { role: "body" }),
      {
        role: "material",
        wave: "sine",
        freq: 200 * t,
        slide: -1,
        am: { rate: 12, depth: 0.9 },
        attack: 0.01,
        hold: 0.1,
        decay: 0.3,
        gain: -4,
      },
      crackle(30, 2500, 0.5, { delay: 0.1, band: { freq: 2500, q: 3 }, gain: -6 }),
    ],
  },
  air: {
    hit: (t) => [whoosh(1500 * t, 1.5, 0.08, { role: "body" }), tick(4000, 0.01, { gain: -8 })],
    die: (t) => [whoosh(1200 * t, -2, 0.6, { role: "body" }), hiss(5000, 0.5, { gain: -10 })],
  },
  stone: {
    hit: (t) => [
      tick(1800 * t, 0.03, { band: { freq: 1800 * t, q: 2 } }),
      thump(90 * t, 0.08, { punch: 0.5 }),
      crackle(600, 1500, 0.06, { gain: -6 }),
    ],
    die: (t) => [
      crackle(1200, 900, 0.5, { role: "material" }),
      thump(60 * t, 0.25, { punch: 0.6 }),
      rumble(260, 0.5, { gain: -4 }),
      tick(2200, 0.04, { delay: 0.12, gain: -6 }),
    ],
  },
  shadow: {
    hit: (t) => [
      thump(140 * t, 0.07, { lowpass: { freq: 900 } }),
      whoosh(700 * t, -1, 0.08, { lowpass: { freq: 1200 } }),
    ],
    die: (t) => [
      rumble(220, 0.15, { attack: 0.3, curve: 1 }),
      { role: "body", wave: "sine", freq: 90 * t, slide: -1, attack: 0.25, hold: 0.05, decay: 0.2 },
      hiss(1500, 0.2, { attack: 0.3, highpass: { freq: 1500, slide: 2 }, gain: -8 }),
    ],
  },
  shell: {
    hit: (t) => [
      ping(380 * t, 0.08, { role: "body", wave: "tri" }),
      tick(1500 * t, 0.02),
      thump(200 * t, 0.04, { gain: -6 }),
    ],
    die: (t) => [
      ping(380 * t, 0.2, { role: "body", wave: "tri", slide: 1.2 }),
      tick(1500, 0.03),
      ping(1568, 0.4, {
        delay: 0.12,
        jumps: [
          { at: 0.06, semitones: 4 },
          { at: 0.12, semitones: 7 },
          { at: 0.18, semitones: 12 },
        ],
      }),
    ],
  },
};

const ATTACKS: Record<MonsterAttack, (t: number) => Layer[]> = {
  /** A fuse burning down before the blast. */
  fuse: (t) => [
    hiss(2500, 0.9, { attack: 0.05, hold: 0.7, band: { freq: 3500 * t, slide: 1, q: 1 } }),
    crackle(600, 2500, 0.9, { hold: 0.6 }),
    ping(600 * t, 0.9, { slide: 1.5, gain: -12, hold: 0.6 }),
  ],
  /** A healing pulse: a soft rising chime with bubbles. */
  heal: (t) => [
    ping(880 * t, 0.5, {
      wave: "tri",
      jumps: [
        { at: 0.08, semitones: 4 },
        { at: 0.16, semitones: 7 },
      ],
    }),
    splash(1800, 0.3, { band: { freq: 1800, slide: 1, q: 1.5 }, gain: -8 }),
  ],
  /** A charge: air torn past at speed. */
  dash: (t) => [whoosh(900 * t, 3, 0.3, { role: "body" }), hiss(4000, 0.2, { gain: -10 })],
  /** A shadow bolt: a low hollow breath and a pale tone. */
  shot: (t) => [
    whoosh(500 * t, 1.5, 0.25, { role: "body", lowpass: { freq: 1500 } }),
    ping(220 * t, 0.3, { vibrato: { depth: 0.6, rate: 7 }, gain: -6 }),
  ],
};

export interface MonsterSound {
  readonly id: string;
  readonly material: Material;
  /** The content's mass: heavier sounds lower. */
  readonly mass: number;
  readonly attack?: MonsterAttack;
}

/** The Page 1 roster. One line per monster. */
export const MONSTER_TABLE: readonly MonsterSound[] = [
  { id: "odap", material: "paper", mass: 1 },
  { id: "odap-pencil", material: "pencil", mass: 0.4 },
  { id: "rational", material: "bronze", mass: 2.5 },
  { id: "element-fire", material: "fire", mass: 0.8, attack: "fuse" },
  { id: "element-water", material: "water", mass: 1, attack: "heal" },
  { id: "element-air", material: "air", mass: 0.5, attack: "dash" },
  { id: "element-earth", material: "stone", mass: 3 },
  { id: "element-earth-pebble", material: "stone", mass: 1 },
  { id: "cave-shadow", material: "shadow", mass: 0.6, attack: "shot" },
  { id: "tortoise", material: "shell", mass: 4 },
];

export function monsterEffects(table: readonly MonsterSound[]): Record<string, EffectSource> {
  const out: Record<string, EffectSource> = {};
  for (const m of table) {
    const t = m.mass ** -0.15;
    const sounds = MATERIALS[m.material];
    out[`sfx.monster.${m.id}.hit`] = {
      category: "hit",
      variants: 3,
      jitter: 0.08,
      priority: 1,
      max: 2,
      level: -4,
      layers: sounds.hit(t),
    };
    out[`sfx.monster.${m.id}.die`] = {
      category: "combat",
      variants: 2,
      jitter: 0.06,
      priority: 1,
      max: 3,
      level: -2 + Math.min(3, Math.log2(m.mass + 1)),
      layers: sounds.die(t),
    };
    if (m.attack)
      out[`sfx.monster.${m.id}.attack`] = {
        category: "combat",
        variants: 1,
        priority: 1,
        max: 2,
        level: -4,
        layers: ATTACKS[m.attack](t),
      };
  }
  return out;
}

export const MONSTER_EFFECTS = monsterEffects(MONSTER_TABLE);
