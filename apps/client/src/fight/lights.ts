import type { MapView, Tier } from "../render/index.ts";

/** Flashes started per frame, by tier; the lighting pass keeps them pooled. */
const BUDGET: Readonly<Record<Tier, number>> = { low: 4, medium: 10, high: 24 };

/**
 * The fight's light, through the lighting pass's flashes (`MapView.flash`): a burst where
 * something lands, a cast lighting the ground at the caster's hands, a shot carrying its glow
 * across the field. Each fades from its peak to nothing. A budget per frame keeps a crowd's
 * fireworks from flooding the light map; the local player's own light goes first because it is
 * asked for first in a frame (impacts come from the hit records, before effects update).
 */
export class FightLights {
  private readonly view: MapView;
  private budget: number;
  private used = 0;

  constructor(view: MapView, tier: Tier) {
    this.view = view;
    this.budget = BUDGET[tier];
  }

  setTier(tier: Tier): void {
    this.budget = BUDGET[tier];
  }

  /** Whether another flash fits this frame. */
  get spare(): boolean {
    return this.used < this.budget;
  }

  /** A light at (x, y) that starts at `intensity` and fades out over `ms`. */
  flash(x: number, y: number, color: number, radius: number, intensity: number, ms: number): void {
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
