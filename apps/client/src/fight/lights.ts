import type { LightHandle, MapView, Tier } from "../render/index.ts";

/** Short lights alive at once, by tier. */
const SLOTS: Readonly<Record<Tier, number>> = { low: 2, medium: 4, high: 6 };

interface Slot {
  readonly handle: LightHandle;
  age: number;
  life: number;
  peak: number;
}

/**
 * The fight's light, behind one small surface so the lighting pass can replace it: a short
 * flash where something lands (own impacts, blasts, level ups), fading out. Lights are made once
 * and parked dark, since the renderer walks every light for every lit entity each frame.
 */
export class FightLights {
  private readonly slots: Slot[] = [];
  private next = 0;
  private count: number;

  constructor(view: MapView, tier: Tier) {
    this.count = SLOTS[tier];
    for (let i = 0; i < SLOTS.high; i++) {
      const handle = view.addLight(-999, -999, { radius: 24, color: 0xffffff, intensity: 0 });
      this.slots.push({ handle, age: 0, life: 0, peak: 0 });
    }
  }

  setTier(tier: Tier): void {
    this.count = SLOTS[tier];
    for (let i = this.count; i < this.slots.length; i++) {
      const s = this.slots[i] as Slot;
      s.life = 0;
      s.handle.set({ intensity: 0 });
    }
  }

  /** A light at (x, y) that starts at `intensity` and fades out over `ms`. */
  flash(x: number, y: number, color: number, radius: number, intensity: number, ms: number): void {
    if (this.count === 0) return;
    const s = this.slots[this.next % this.count] as Slot;
    this.next++;
    s.age = 0;
    s.life = ms;
    s.peak = intensity;
    s.handle.moveTo(x, y);
    s.handle.set({ color, radius, intensity });
  }

  update(dtMs: number): void {
    for (let i = 0; i < this.count; i++) {
      const s = this.slots[i] as Slot;
      if (s.life <= 0) continue;
      s.age += dtMs;
      if (s.age >= s.life) {
        s.life = 0;
        s.handle.set({ intensity: 0 });
        continue;
      }
      const f = 1 - s.age / s.life;
      s.handle.set({ intensity: s.peak * f * f });
    }
  }

  destroy(): void {
    for (const s of this.slots) s.handle.remove();
    this.slots.length = 0;
  }
}
