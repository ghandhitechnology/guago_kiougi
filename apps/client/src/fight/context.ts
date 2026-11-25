import type * as Phaser from "phaser";
import type { MapView, Tier } from "../render/index.ts";
import type { Catalog } from "./catalog.ts";
import type { FightLights } from "./lights.ts";
import type { DamageNumbers } from "./numbers.ts";
import type { Particles } from "./particles.ts";
import type { FightSound } from "./sound.ts";
import type { Trauma } from "./trauma.ts";

/** How much of other players' fireworks is drawn, by tier: alpha, and the share of their sparks kept. */
export interface Restraint {
  /** Alpha of other players' effects. */
  readonly others: number;
  /** Other players' hit sparks drawn, 0 to 1. */
  readonly otherSparks: number;
  /** Most effects of other players drawn at once. */
  readonly otherEffects: number;
  readonly particles: number;
}

export const RESTRAINT: Readonly<Record<Tier, Restraint>> = {
  low: { others: 0.4, otherSparks: 0, otherEffects: 40, particles: 150 },
  medium: { others: 0.5, otherSparks: 0.25, otherEffects: 90, particles: 350 },
  high: { others: 0.55, otherSparks: 0.5, otherEffects: 160, particles: 600 },
};

/** What every part of the fight view shares. */
export interface FightContext {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly cat: Catalog;
  readonly particles: Particles;
  readonly numbers: DamageNumbers;
  readonly sound: FightSound;
  readonly lights: FightLights;
  readonly trauma: Trauma;
  tier: Tier;
  restraint: Restraint;
  /** Local time of this frame, ms. */
  now: number;
  /** Fractional server tick the world (monsters, other players) is drawn at this frame. */
  tick: number;
  /**
   * The tick the local player's own effects and the dangers aimed at them are drawn at: the
   * newest snapshot, so they line up with the predicted body and with the hit records.
   */
  ownTick: number;
  /** The local player's entity, slot and class; 0 / -1 until known. */
  selfId: number;
  selfSlot: number;
  selfClass: string;
  /** Where the local player is drawn this frame. */
  selfX: number;
  selfY: number;
  /** The way the drawn local player faces, `Facing`. */
  selfFacing: number;
}
