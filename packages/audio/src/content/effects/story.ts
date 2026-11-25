/**
 * One-shot sounds the story scripts ask for by name (see `aliases.ts` for the names). They load
 * with Page 1, not at start-up.
 */

import type { EffectSource } from "../../sfx/format.ts";
import { chalk, crackle, hiss, paper, ping, rumble, thump, tick, whoosh } from "./kit.ts";

const story = (x: Omit<EffectSource, "category" | "bank">): EffectSource => ({
  category: "world",
  bank: "page1",
  priority: 3,
  max: 1,
  vary: 0.02,
  ...x,
});

export const STORY_EFFECTS = {
  /** 23:38 in the 자습실: tubes catching, flickering, settling into their buzz. */
  "story.fluorescent": story({
    level: -6,
    layers: [
      tick(3000, 0.02),
      {
        role: "body",
        wave: "square",
        freq: 120,
        duty: 0.4,
        band: { freq: 1000, q: 1.5 },
        am: { rate: 6, depth: 0.9 },
        attack: 0.01,
        hold: 1.2,
        decay: 0.5,
      },
      tick(2600, 0.02, { delay: 0.35, gain: -4 }),
    ],
  }),
  /** The device firing under the 급식실: a hum that rises through the floor. */
  "story.floor-hum": story({
    level: 2,
    duck: { depth: -8, release: 1 },
    layers: [
      {
        role: "body",
        wave: "sine",
        freq: 55,
        slide: 0.6,
        attack: 1.5,
        hold: 0.8,
        decay: 0.8,
        curve: 1,
      },
      {
        wave: "saw",
        freq: 110,
        slide: 0.6,
        band: { freq: 400, q: 1.5 },
        attack: 1.5,
        hold: 0.8,
        decay: 0.8,
        gain: -8,
      },
      { wave: "sine", freq: 1800, slide: 0.5, attack: 2, hold: 0.4, decay: 0.7, gain: -18 },
      rumble(150, 1, { attack: 1.2, hold: 0.8 }),
    ],
  }),
  /** The torn page blowing in through the window. */
  "story.page-flutter": story({
    layers: [
      crackle(220, 2500, 1, { am: { rate: 9, depth: 0.7 }, attack: 0.2, hold: 0.5 }),
      whoosh(900, 1, 1.2),
      paper(1800, 0.08, { delay: 1.25 }),
    ],
  }),
  /** Red X 오답 pouring up the stairs: paper by the hundred, chittering. */
  "story.odap-swarm": story({
    level: 2,
    layers: [
      paper(2500, 2, { am: { rate: 23, depth: 0.6 }, attack: 0.4, hold: 1 }),
      crackle(600, 2000, 2, { attack: 0.4, hold: 1 }),
      {
        role: "sweetener",
        wave: "square",
        freq: 1800,
        am: { rate: 37, depth: 0.9 },
        band: { freq: 2500, q: 3 },
        attack: 0.5,
        hold: 0.8,
        decay: 0.8,
        gain: -14,
      },
      rumble(250, 2, { am: { rate: 9, depth: 0.7 }, attack: 0.4, hold: 1 }),
    ],
  }),
  /** A diagonal drawn in chalk, corner to corner, and the tap at the end. */
  "story.chalk": story({
    layers: [
      chalk(3000, 0.3, { hold: 0.7, attack: 0.05, band: { freq: 2800, slide: 0.4, q: 2.5 } }),
      tick(2400, 0.03, { delay: 1.05 }),
    ],
  }),
  /** The sea off Croton: one wave washing in. */
  "story.sea": story({
    room: 0.3,
    layers: [
      {
        role: "body",
        wave: "pink",
        freq: 0,
        band: { freq: 600, slide: 0.5, q: 0.7 },
        attack: 0.8,
        hold: 0.4,
        decay: 1.8,
        curve: 1.5,
      },
      rumble(300, 2, { attack: 0.8 }),
      hiss(4000, 1.5, { delay: 0.9, gain: -8 }),
      crackle(150, 3000, 1.4, { delay: 1, gain: -10 }),
    ],
  }),
  /** Ice spreading across the floor of the 리케이온. */
  "story.ice": story({
    room: 0.3,
    layers: [
      crackle(900, 4000, 1.2, { attack: 0.1, hold: 0.3 }),
      {
        role: "material",
        wave: "metal",
        freq: 2200,
        band: { freq: 5000, q: 5 },
        attack: 0.05,
        hold: 0.3,
        decay: 0.8,
        gain: -8,
      },
      {
        role: "body",
        wave: "saw",
        freq: 180,
        band: { freq: 700, q: 4 },
        vibrato: { depth: 1, rate: 5 },
        attack: 0.1,
        hold: 0.4,
        decay: 0.5,
        gain: -10,
      },
      ping(2637, 0.4, { delay: 0.5, jumps: [{ at: 0.1, semitones: 5 }], gain: -10 }),
    ],
  }),
  /** Two stones, one big and one small, landing almost together. */
  "story.stone-land": story({
    room: 0.25,
    vary: 0,
    layers: [
      thump(90, 0.15, { punch: 0.7 }),
      tick(1800, 0.03),
      thump(110, 0.12, { delay: 0.028, punch: 0.6 }),
      tick(2300, 0.03, { delay: 0.028 }),
    ],
  }),
} satisfies Record<string, EffectSource>;
