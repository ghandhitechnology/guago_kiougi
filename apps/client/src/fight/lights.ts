import type { MapView, Tier } from "../render/index.ts";

/** Flashes started per frame, by tier; the lighting pass keeps them pooled. */
const BUDGET: Readonly<Record<Tier, number>> = { low: 4, medium: 10, high: 24 };

/**
 * Largest flash a hit or a moment may throw, by light. In daylight a bigger or brighter disc
 * fogs the monsters it lands on, and a horde of them turns into haze; in the dark a little more
 * reads as the strike lighting the ground.
 */
const CAP = {
  day: { radius: 24, intensity: 0.6 },
  dark: { radius: 32, intensity: 0.9 },
} as const;

/** Below this ambient a map is dark enough for casts to light the ground around them. */
const DARK_AMBIENT = 0.7;

/**
 * The fight's light, through the lighting pass's flashes (`MapView.flash`). It decides once per
 * map whether the map is lit by day or dark (dusk, night, or a room lit below this), so callers
 * only say what kind of light they want:
 *
 * - `strike`, the local player's own crits and Q.E.D. (never light hits), and the player's own
 *   big moments (level up, revive, an elite, an evolution), capped small on every map.
 * - `cast`, a cast lighting the ground at the caster's hands, and `carry`, a shot carrying its
 *   glow across the field: only in the dark, where they light the horde around them.
 *
 * A budget per frame keeps a crowd's fireworks from flooding the light map; the local player's
 * own light goes first because it is asked for first in a frame (impacts come from the hit
 * records, before effects update).
 */
export class FightLights {
  private readonly view: MapView;
  private budget: number;
  private used = 0;
  /** Dusk, night or a dim room: casts light the ground. */
  readonly dark: boolean;

  constructor(view: MapView, tier: Tier) {
    this.view = view;
    this.budget = BUDGET[tier];
    const map = view.map;
    this.dark =
      map.time.phase === "dusk" ||
      map.time.phase === "night" ||
      map.ambient.intensity < DARK_AMBIENT;
  }

  setTier(tier: Tier): void {
    this.budget = BUDGET[tier];
  }

  /** Whether another flash fits this frame. */
  get spare(): boolean {
    return this.used < this.budget;
  }

  /**
   * A strike of the local player's or one of their moments: a short light at (x, y), at most
   * the map's cap however big it is asked for.
   */
  strike(x: number, y: number, color: number, radius: number, intensity: number, ms: number): void {
    const cap = this.dark ? CAP.dark : CAP.day;
    this.flash(x, y, color, Math.min(cap.radius, radius), Math.min(cap.intensity, intensity), ms);
  }

  /** A cast or a carried glow: lights the ground only on a dark map. */
  glow(x: number, y: number, color: number, radius: number, intensity: number, ms: number): void {
    if (!this.dark) return;
    this.flash(x, y, color, Math.min(CAP.dark.radius, radius), Math.min(0.5, intensity), ms);
  }

  private flash(
    x: number,
    y: number,
    color: number,
    radius: number,
    intensity: number,
    ms: number,
  ): void {
    if (this.used >= this.budget) return;
    this.used++;
    this.view.flash(x, y, { radius, color, intensity, ms });
  }

  /** A new frame: the budget refills. */
  update(_dtMs: number): void {
    this.used = 0;
  }

  destroy(): void {}
}
