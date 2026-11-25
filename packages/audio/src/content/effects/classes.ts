/**
 * Class impact families (PLAN §17: each class has its own) and the class signature moments.
 * The families follow the combat art: 수학 exact and clean (chalk, pure intervals), 물리 weight
 * and electricity, 화학 glass, liquid and fire, 생명 soft and organic, 지구과학 slow and huge.
 *
 * Every impact is light, heavy or crit, built from three layers: body, material, sweetener.
 */

import type { EffectSource, Layer } from "../../sfx/format.ts";
import {
  chalk,
  crackle,
  hiss,
  ping,
  rumble,
  splash,
  squelch,
  thump,
  tick,
  whoosh,
  zap,
} from "./kit.ts";

const impact = (layers: Layer[], x: Partial<EffectSource> = {}): EffectSource => ({
  category: "hit",
  variants: 3,
  jitter: 0.04,
  max: 3,
  layers,
  ...x,
});

export const CLASS_IMPACTS = {
  // 수학: a clean tock, chalk, and a pure fifth on top.
  "hit.math.light": impact([
    ping(1318.5, 0.05, { role: "body", wave: "tri" }),
    chalk(3800, 0.02),
    ping(1318.5 * 1.5, 0.04, { gain: -10 }),
  ]),
  "hit.math.heavy": impact([
    thump(440, 0.12, { wave: "tri", slide: -0.5, punch: 0.5 }),
    chalk(3000, 0.07),
    ping(660, 0.16, { gain: -6 }),
  ]),
  "hit.math.crit": impact(
    [
      ping(1760, 0.28, { role: "body" }),
      chalk(3400, 0.06, { punch: 0.6 }),
      ping(2640, 0.32, { gain: -4 }),
    ],
    { level: 2, vary: 0.02 },
  ),

  // 물리: weight first, then electricity.
  "hit.physics.light": impact([
    thump(110, 0.07, { slide: -2.5 }),
    tick(1200, 0.03, { band: { freq: 900, q: 0.7 } }),
    zap(2200, 0.03, { gain: -10 }),
  ]),
  "hit.physics.heavy": impact([
    thump(70, 0.18, { punch: 0.7 }),
    rumble(500, 0.1, { role: "material" }),
    crackle(900, 3000, 0.12, { role: "sweetener", gain: -4 }),
  ]),
  "hit.physics.crit": impact(
    [
      thump(60, 0.25, { punch: 0.8 }),
      zap(1800, 0.15, { role: "material", am: { rate: 70, depth: 0.8 } }),
      crackle(1500, 2500, 0.2, { role: "sweetener" }),
    ],
    { level: 2 },
  ),

  // 화학: liquid, glass, a little fire.
  "hit.chemistry.light": impact([
    splash(1400, 0.06, { role: "body", band: { freq: 1400, slide: -3, q: 1 } }),
    ping(3100, 0.06, { role: "material", gain: -6 }),
    ping(600, 0.05, { slide: 3, gain: -8 }),
  ]),
  "hit.chemistry.heavy": impact([
    splash(700, 0.15, { role: "body" }),
    {
      role: "material",
      wave: "metal",
      freq: 2800,
      band: { freq: 4000, q: 4 },
      attack: 0.001,
      hold: 0.005,
      decay: 0.1,
      gain: -8,
    },
    hiss(5000, 0.25, { am: { rate: 30, depth: 0.5 }, gain: -8 }),
  ]),
  "hit.chemistry.crit": impact(
    [
      crackle(2500, 3000, 0.25, { role: "body" }),
      ping(3500, 0.2, { role: "material", gain: -4 }),
      whoosh(500, 2, 0.25, { role: "sweetener", gain: -2 }),
    ],
    { level: 2 },
  ),

  // 생명: soft bodies, wet contact, a small living chirp.
  "hit.biology.light": impact([
    squelch(180, 0.06),
    tick(900, 0.04, { band: { freq: 900, q: 1.5 }, lowpass: { freq: 2500 } }),
    ping(520, 0.05, { wave: "tri", slide: 1.5, gain: -10 }),
  ]),
  "hit.biology.heavy": impact([
    squelch(120, 0.12, { slide: 1.5, punch: 0.4 }),
    splash(600, 0.1, { am: { rate: 30, depth: 0.5 } }),
    ping(300, 0.06, { slide: 3, gain: -6 }),
  ]),
  "hit.biology.crit": impact(
    [
      squelch(400, 0.05, { slide: 4, punch: 0.6 }),
      splash(1200, 0.12),
      ping(880, 0.2, { wave: "tri", jumps: [{ at: 0.05, semitones: 7 }] }),
    ],
    { level: 2, vary: 0.03 },
  ),

  // 지구과학: low and long, with rock in it.
  "hit.earth.light": impact([
    thump(70, 0.12, { slide: -1 }),
    crackle(500, 1500, 0.08),
    rumble(300, 0.15, { gain: -6 }),
  ]),
  "hit.earth.heavy": impact([
    thump(48, 0.35, { slide: -0.8, punch: 0.6 }),
    crackle(900, 1200, 0.25),
    rumble(200, 0.5, { gain: -4 }),
  ]),
  "hit.earth.crit": impact(
    [
      thump(42, 0.5, { slide: -0.6, punch: 0.8 }),
      splash(600, 0.3, { role: "material", band: { freq: 600, slide: -1, q: 0.8 } }),
      crackle(1500, 1500, 0.45, { role: "sweetener" }),
    ],
    { level: 2 },
  ),
} satisfies Record<string, EffectSource>;

/**
 * 증명 stacks one to ten climb the D major scale from A4 to C♯6; Q.E.D. lands on D, so the
 * ninth and tenth stacks sit on the leading tone and ask to be finished. Tuned, so no pitch
 * variation.
 */
const PROOF_NOTES = [440, 493.88, 554.37, 587.33, 659.26, 739.99, 783.99, 880, 987.77, 1108.73];

const proof = Object.fromEntries(
  PROOF_NOTES.map((f, i) => [
    `class.math.proof.${i + 1}`,
    {
      category: "combat",
      vary: 0,
      priority: 2,
      max: 2,
      level: -7 + (i * 7) / 9,
      layers: [
        chalk(3600, 0.025),
        ping(f, 0.16 + i * 0.012, { role: "body", wave: "tri" }),
        ping(f * 2, 0.1 + i * 0.01, { gain: -14 + i }),
      ],
    } satisfies EffectSource,
  ]),
);

export const CLASS_SIGNATURES = {
  ...proof,
  /** Q.E.D.: a chalk slam and a D major chord ringing in pure intervals. */
  "sfx.signature.qed": {
    category: "combat",
    vary: 0,
    priority: 2,
    max: 1,
    level: 2,
    room: 0.25,
    duck: { depth: -4, release: 0.6 },
    layers: [
      chalk(2500, 0.2, { punch: 0.8, hold: 0.04 }),
      thump(90, 0.25, { punch: 0.7 }),
      ping(587.33, 0.9, { role: "body", wave: "tri" }),
      ping(1174.66, 0.8),
      ping(1174.66 * 1.5, 0.6, { gain: -4 }),
      ping(2349.32, 0.5, { gain: -8, delay: 0.03 }),
    ],
  },
  /** A 운동량 collision chain: each link knocks harder and a fourth or fifth higher. */
  ...Object.fromEntries(
    [659.26, 880, 1318.5].map((f, i) => [
      `class.physics.collide.${i + 1}`,
      {
        category: "combat",
        vary: 0.02,
        priority: 2,
        max: 3,
        level: i,
        layers: [
          tick(3000, 0.02),
          ping(f, 0.08 + i * 0.03, { role: "material", wave: "tri" }),
          thump(120 - i * 20, 0.08 + i * 0.04, { punch: 0.5 + i * 0.15 }),
        ],
      } satisfies EffectSource,
    ]),
  ),
  /** 생명's division: one note splits into two moving apart, with a wet pop. */
  "class.biology.divide": {
    category: "combat",
    vary: 0.03,
    priority: 2,
    max: 2,
    layers: [
      ping(440, 0.3, { role: "body", wave: "tri", slide: 0.7 }),
      ping(440, 0.3, { wave: "tri", slide: -0.4, gain: -2 }),
      squelch(250, 0.06),
      splash(900, 0.1, { gain: -6 }),
    ],
  },
} satisfies Record<string, EffectSource>;
