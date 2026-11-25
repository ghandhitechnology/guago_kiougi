import type { MapView, Tier } from "../render/index.ts";

/** Flashes started per frame, by tier; the lighting pass keeps them pooled. */
const BUDGET: Readonly<Record<Tier, number>> = { low: 4, medium: 10, high: 24 };

/**
 * Largest flash a hit or a moment may throw in full daylight. A bigger or brighter disc fogs the
 * monsters it lands on, and a horde of them turns into haze; the darker the map, the further past
 * this its light may reach (see `darkness`).
 */
const DAY = { radius: 24, intensity: 0.6 } as const;
/** What full darkness adds to the caps: a cast at night lights the ground around it. */
const NIGHT = { radius: 32, intensity: 0.7 } as const;

/** Ambient at or above this is daylight; it is full dark this far below it. */
const DAYLIGHT = 0.9;
const DARK_SPAN = 0.6;

export class FightLights {
  private readonly view: MapView;
  private budget: number;
  private used = 0;
  /**
   * How dark the map is, 0 in daylight to 1 at night or in a cave, from its ambient: every
   * flash and cast light is scaled up by it, so a fight at dusk lights the ground it happens on.
   */
  readonly darkness: number;
  /** Dark enough for casts and shots in flight to light the ground. */
  readonly dark: boolean;
  private readonly capRadius: number;
  private readonly capIntensity: number;

  constructor(view: MapView, tier: Tier) {
    this.view = view;
    this.budget = BUDGET[tier];
    const map = view.map;
    const dusk = map.time.phase === "dusk" || map.time.phase === "night";
    const d = Math.max(0, Math.min(1, (DAYLIGHT - map.ambient.intensity) / DARK_SPAN));
    this.darkness = dusk ? Math.max(0.35, d) : d;
    this.dark = this.darkness > 0.15;
    this.capRadius = DAY.radius + NIGHT.radius * this.darkness;
    this.capIntensity = DAY.intensity + NIGHT.intensity * this.darkness;
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
    const k = this.darkness;
    this.flash(
      x,
      y,
      color,
      Math.min(this.capRadius, radius * (1 + 0.9 * k)),
      Math.min(this.capIntensity, intensity * (1 + 1.2 * k)),
      ms * (1 + 0.5 * k),
    );
  }

  /**
   * A light past every cap and budget, for a moment that happens once (an evolution): the art's
   * caps keep ordinary hits from fogging the field, and this is the exception.
   */
  burst(x: number, y: number, color: number, radius: number, intensity: number, ms: number): void {
    this.view.flash(x, y, { radius, color, intensity, ms });
  }

  /** A cast or a carried glow: lights the ground only on a dark map. */
  glow(x: number, y: number, color: number, radius: number, intensity: number, ms: number): void {
    if (!this.dark) return;
    const k = this.darkness;
    this.flash(
      x,
      y,
      color,
      Math.min(this.capRadius, radius * (1 + 0.8 * k)),
      Math.min(this.capIntensity, intensity * (1 + 2 * k)),
      ms * (1 + 0.5 * k),
    );
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
