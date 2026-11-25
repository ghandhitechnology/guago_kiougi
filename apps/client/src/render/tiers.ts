/**
 * Quality tiers (PLAN §16): low, medium and high. The tier is chosen once from a short
 * frame-time probe, can be overridden from settings, and is remembered on this device.
 */
export type Tier = "low" | "medium" | "high";

export const TIERS: readonly Tier[] = ["low", "medium", "high"];

/**
 * What each tier draws. On at every tier: the light map with its bands, per-sprite light, the
 * grade, blob shadows, the rift's spill, lip glow and pulse, glowing windows and lamps.
 */
export interface TierSettings {
  /** Dithered seams between light bands; off leaves hard steps. */
  readonly dither: boolean;
  /** Most lights carried by entities that are drawn at once; the nearest win. */
  readonly entityLights: number;
  /** Fraction of each map emitter's particles kept. */
  readonly particles: number;
  /** Screen-space weather particles alive at once. */
  readonly weather: number;
  /** Rift: rows shimmering inside the tear, colour split at its lip, motes pulled inward. */
  readonly riftHaze: boolean;
  readonly riftChroma: boolean;
  readonly riftMotes: number;
  /** Shafts in the rift's light drifting between two ray patterns. */
  readonly riftShafts: boolean;
  /** Overhead art near the player: a dithered hole (true) or a plain fade (false). */
  readonly ditherCutaway: boolean;
  /** Canopies and crowns wave a pixel at a time. */
  readonly foliageWobble: boolean;
  /** Banded halos around lamps and floodlights. */
  readonly halos: boolean;
}

export const TIER_SETTINGS: Readonly<Record<Tier, TierSettings>> = {
  low: {
    dither: false,
    entityLights: 4,
    particles: 0.5,
    weather: 24,
    riftHaze: false,
    riftChroma: false,
    riftMotes: 12,
    riftShafts: false,
    ditherCutaway: false,
    foliageWobble: false,
    halos: true,
  },
  medium: {
    dither: true,
    entityLights: 10,
    particles: 0.8,
    weather: 60,
    riftHaze: true,
    riftChroma: false,
    riftMotes: 28,
    riftShafts: true,
    ditherCutaway: true,
    foliageWobble: false,
    halos: true,
  },
  high: {
    dither: true,
    entityLights: 24,
    particles: 1,
    weather: 120,
    riftHaze: true,
    riftChroma: true,
    riftMotes: 48,
    riftShafts: true,
    ditherCutaway: true,
    foliageWobble: true,
    halos: true,
  },
};

const STORE = "guago.quality";

function stored(): Tier | null {
  try {
    const v = localStorage.getItem(STORE);
    return v === "low" || v === "medium" || v === "high" ? v : null;
  } catch {
    return null;
  }
}

let current: Tier | null = stored();
const listeners = new Set<(tier: Tier) => void>();

/** The tier in use, or null before the probe has run and nothing was chosen. */
export function qualityTier(): Tier | null {
  return current;
}

/** Sets the tier from settings (or the probe) and remembers it on this device. */
export function setQualityTier(tier: Tier, remember = true): void {
  current = tier;
  if (remember) {
    try {
      localStorage.setItem(STORE, tier);
    } catch {
      // Private windows may refuse storage; the tier still applies for this session.
    }
  }
  for (const fn of listeners) fn(tier);
}

/** Forgets a chosen tier so the next probe decides again. */
export function clearQualityTier(): void {
  current = null;
  try {
    localStorage.removeItem(STORE);
  } catch {
    // Nothing stored.
  }
}

export function onQualityTier(fn: (tier: Tier) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Picks a tier from frame times measured while the map runs at high: the median frame within
 * 19 ms keeps high, within 30 ms takes medium, slower takes low. A phone starts its probe at
 * medium at best. Resolves at once with the remembered tier when there is one.
 */
export function probeTier(
  game: { loop: { delta: number } },
  onFrame: (fn: () => void) => () => void,
  frames = 90,
): Promise<Tier> {
  const known = stored();
  if (known) return Promise.resolve(known);
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return new Promise((resolve) => {
    const samples: number[] = [];
    let skip = 20;
    const stop = onFrame(() => {
      if (skip-- > 0) return;
      samples.push(game.loop.delta);
      if (samples.length < frames) return;
      stop();
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)] ?? 16;
      let tier: Tier = median <= 19 ? "high" : median <= 30 ? "medium" : "low";
      if (coarse && tier === "high") tier = "medium";
      setQualityTier(tier, false);
      resolve(tier);
    });
  });
}
