/** Fight events: the golem, the elite, the field's waves, reactions, pickups and the player's own moments. */

import type { EffectSource } from "../../sfx/format.ts";
import { crackle, hiss, paper, ping, rumble, splash, thump, tick, whoosh } from "./kit.ts";

/** D major, the key of the Greek field theme, so the bell and pickups sit inside the music. */
const D5 = 587.33;
const A5 = 880;

export const EVENT_EFFECTS = {
  // 오답노트 골렘: a creature of crumpled exam paper.
  "sfx.boss.odap-golem.roar": {
    category: "combat",
    priority: 2,
    max: 1,
    level: 3,
    room: 0.3,
    duck: { depth: -6, release: 0.8 },
    layers: [
      {
        role: "body",
        wave: "saw",
        freq: 80,
        vibrato: { depth: 1.5, rate: 6 },
        band: { freq: 450, slide: -0.3, q: 2 },
        attack: 0.15,
        hold: 0.6,
        decay: 0.5,
      },
      {
        wave: "saw",
        freq: 121,
        vibrato: { depth: 1.2, rate: 5 },
        band: { freq: 700, q: 2 },
        attack: 0.2,
        hold: 0.5,
        decay: 0.5,
        gain: -6,
      },
      paper(1800, 1, { am: { rate: 38, depth: 0.6 }, hold: 0.5, attack: 0.1 }),
      rumble(180, 1, { attack: 0.2 }),
    ],
  },
  "sfx.boss.odap-golem.slam": {
    category: "combat",
    priority: 2,
    max: 2,
    level: 4,
    room: 0.2,
    duck: { depth: -6, release: 0.4 },
    layers: [
      thump(45, 0.5, { punch: 0.9, slide: -1 }),
      paper(1200, 0.3, { punch: 0.6 }),
      crackle(800, 1500, 0.5),
      rumble(160, 0.8),
    ],
  },
  "sfx.boss.odap-golem.die": {
    category: "combat",
    priority: 3,
    max: 1,
    level: 3,
    room: 0.35,
    duck: { depth: -8, release: 1.2 },
    layers: [
      crackle(600, 1500, 1.5, { hold: 0.4 }),
      paper(2000, 1.2, { hold: 0.3 }),
      thump(50, 0.6, { delay: 0.3, punch: 0.9 }),
      rumble(200, 1.5, { delay: 0.3 }),
      crackle(150, 2500, 1, { delay: 0.8, gain: -6 }),
    ],
  },
  /** An elite arrives: a low brass swell in fifths and a gong. */
  "sfx.monster.elite.spawn": {
    category: "combat",
    priority: 2,
    max: 1,
    level: 2,
    room: 0.35,
    duck: { depth: -5, release: 0.8 },
    layers: [
      {
        role: "body",
        wave: "saw",
        freq: 73.42,
        band: { freq: 600, slide: 0.5, q: 1.5 },
        attack: 0.4,
        hold: 0.4,
        decay: 0.6,
      },
      {
        wave: "saw",
        freq: 110,
        band: { freq: 800, slide: 0.5, q: 1.5 },
        attack: 0.45,
        hold: 0.35,
        decay: 0.6,
        gain: -4,
      },
      {
        role: "sweetener",
        wave: "metal",
        freq: 300,
        band: { freq: 900, q: 3 },
        attack: 0.002,
        hold: 0.05,
        decay: 1.5,
        delay: 0.4,
        gain: -6,
      },
      whoosh(300, 3, 0.5),
    ],
  },
  /**
   * 쉬는 시간: the school's own chime, the head of the school motif (5, 1, 7, 5) in D on a
   * vibraphone-like tone, the motor's tremolo included.
   */
  "sfx.field.bell": {
    category: "combat",
    vary: 0,
    priority: 3,
    max: 1,
    level: 2,
    room: 0.35,
    duck: { depth: -6, release: 1 },
    layers: [0, 0.42, 0.84, 1.26].map((at, i) => ({
      role: "sweetener" as const,
      wave: "tri" as const,
      freq: [A5, D5 * 2, 1108.73, A5][i] as number,
      am: { rate: 5.5, depth: 0.25 },
      attack: 0.004,
      hold: 0.02,
      decay: i === 3 ? 1.6 : 1.1,
      delay: at,
      gain: i === 3 ? 0 : -1,
    })),
  },
  /** A surge: wind rising, two war-drum strokes and a reed call. */
  "sfx.field.surge": {
    category: "combat",
    priority: 2,
    max: 1,
    level: 2,
    room: 0.3,
    layers: [
      whoosh(300, 3, 1.2),
      thump(70, 0.35, { punch: 0.8, delay: 0.9 }),
      thump(65, 0.4, { punch: 0.9, delay: 1.2 }),
      {
        role: "sweetener",
        wave: "saw",
        freq: 220,
        jumps: [{ at: 0.25, semitones: 7 }],
        vibrato: { depth: 0.25, rate: 5.5 },
        band: { freq: 1100, q: 2 },
        attack: 0.05,
        hold: 0.55,
        decay: 0.3,
        delay: 0.9,
        gain: -2,
      },
    ],
  },

  // 화학's four reactions.
  /** 중화: a fizz that settles into a calm fifth as the shield forms. */
  "sfx.reaction.neutralize": {
    category: "combat",
    priority: 2,
    max: 2,
    room: 0.2,
    layers: [
      hiss(4000, 0.4, { am: { rate: 20, depth: 0.6 } }),
      splash(900, 0.3, { band: { freq: 900, slide: 1, q: 1 } }),
      ping(D5, 0.6, { wave: "tri", delay: 0.15 }),
      ping(A5, 0.6, { delay: 0.22, gain: -4 }),
    ],
  },
  /** 연소: the whoomp of catching fire and the crackle after. */
  "sfx.reaction.combustion": {
    category: "combat",
    priority: 2,
    max: 2,
    level: 2,
    layers: [
      whoosh(300, 2.5, 0.37, { role: "body", attack: 0.02, hold: 0.05, decay: 0.3 }),
      crackle(1500, 1500, 0.6),
      thump(70, 0.15, { punch: 0.6 }),
      hiss(3000, 0.25, { gain: -8 }),
    ],
  },
  /** 부식: a sizzle on metal, the metal creaking, drops falling. */
  "sfx.reaction.corrosion": {
    category: "combat",
    priority: 2,
    max: 2,
    layers: [
      hiss(3000, 0.6, { am: { rate: 35, depth: 0.6 } }),
      {
        role: "material",
        wave: "metal",
        freq: 500,
        slide: -0.5,
        band: { freq: 1200, q: 4 },
        attack: 0.02,
        hold: 0.2,
        decay: 0.4,
        gain: -4,
      },
      crackle(40, 2000, 0.7, { band: { freq: 2000, q: 3 } }),
    ],
  },
  /** 폭발: sodium in water, the biggest sound a player makes. */
  "sfx.reaction.explosion": {
    category: "combat",
    priority: 2,
    max: 1,
    level: 4,
    room: 0.25,
    duck: { depth: -6, release: 0.5 },
    layers: [
      thump(45, 0.6, { punch: 1 }),
      splash(800, 0.5, { band: { freq: 800, slide: -2, q: 0.7 } }),
      crackle(2000, 2000, 0.8),
      rumble(200, 0.9),
      ping(3100, 0.15, { gain: -10 }),
    ],
  },

  // Drops and pickups.
  /** 솔방울: a woody tock with a bright blip; a run of pickups climbs D major pentatonic. */
  "sfx.pickup.cone": {
    category: "combat",
    vary: 0,
    priority: 1,
    max: 4,
    level: -4,
    streak: { steps: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24], window: 0.45 },
    layers: [
      tick(2000, 0.02, { band: { freq: 2000, q: 4 } }),
      ping(1174.66, 0.09, { role: "body", wave: "tri" }),
      ping(2349.32, 0.05, { gain: -10 }),
    ],
  },
  /** 낱장: a page snapped up and a small sparkle. */
  "sfx.pickup.page": {
    category: "combat",
    vary: 0.01,
    priority: 2,
    max: 2,
    level: -2,
    layers: [
      paper(2600, 0.06),
      ping(1568, 0.35, {
        jumps: [
          { at: 0.06, semitones: 5 },
          { at: 0.12, semitones: 12 },
        ],
      }),
      whoosh(2000, 1, 0.15, { gain: -10 }),
    ],
  },
  "combat.drop.cone": {
    category: "combat",
    priority: 0,
    max: 3,
    level: -10,
    variants: 3,
    jitter: 0.1,
    layers: [
      tick(1500, 0.02, { band: { freq: 1500, q: 4 } }),
      thump(300, 0.03),
      tick(1700, 0.015, { delay: 0.09, gain: -6 }),
    ],
  },
  "combat.drop.page": {
    category: "combat",
    priority: 0,
    max: 2,
    level: -10,
    variants: 2,
    layers: [
      paper(2000, 0.25, { am: { rate: 30, depth: 0.6 } }),
      tick(1200, 0.02, { delay: 0.22, gain: -6 }),
    ],
  },

  // The player.
  /** 기절: the world tilts and the floor arrives. */
  "combat.knockout": {
    category: "combat",
    priority: 3,
    max: 1,
    room: 0.2,
    duck: { depth: -4, release: 0.8 },
    layers: [
      ping(600, 0.6, { wave: "tri", slide: -2, vibrato: { depth: 0.8, rate: 8 }, role: "body" }),
      thump(80, 0.3, { delay: 0.35, punch: 0.7 }),
      paper(1500, 0.2, { delay: 0.35, gain: -6 }),
    ],
  },
  /** Back on your feet: a rising D major arpeggio and a bright swell. */
  "combat.revive": {
    category: "combat",
    vary: 0,
    priority: 3,
    max: 1,
    room: 0.25,
    layers: [
      ping(D5, 0.8, {
        wave: "tri",
        jumps: [
          { at: 0.08, semitones: 4 },
          { at: 0.16, semitones: 7 },
          { at: 0.24, semitones: 12 },
        ],
      }),
      hiss(5000, 0.3, { attack: 0.3, gain: -10 }),
      whoosh(600, 2, 0.5, { gain: -6 }),
    ],
  },
  /** The dodge roll: a swish, cloth, a scuff. */
  "combat.dodge": {
    category: "combat",
    priority: 2,
    max: 2,
    level: -4,
    variants: 2,
    layers: [
      whoosh(1800, -1.5, 0.18),
      paper(1200, 0.08, { am: { rate: 60, depth: 0.6 }, gain: -6 }),
      tick(800, 0.03, { delay: 0.14, gain: -6 }),
    ],
  },
  /** A telegraph's warning tick: dry and metallic, so it cuts through a horde. Red means danger. */
  "combat.telegraph.tick": {
    category: "combat",
    vary: 0,
    priority: 2,
    max: 2,
    level: -4,
    layers: [
      {
        role: "body",
        wave: "square",
        freq: 2600,
        duty: 0.3,
        attack: 0.0005,
        hold: 0.004,
        decay: 0.03,
      },
      tick(5000, 0.01),
    ],
  },
  /** The telegraph fires. */
  "combat.telegraph.fire": {
    category: "combat",
    priority: 2,
    max: 2,
    level: 1,
    layers: [whoosh(2000, -3, 0.15), thump(60, 0.25, { punch: 0.8 }), crackle(1200, 1500, 0.3)],
  },
} satisfies Record<string, EffectSource>;
