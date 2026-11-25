/**
 * The server clock (PLAN §10, §25 M4): one time source for every timer in the living world. It
 * runs from an anchor at a rate, so a test server can play a 13-week Page in 90 minutes and an
 * admin can step it. The anchor is stored with the server state and survives a restart.
 */
import { type ClockAnchor, clockAt, reanchor } from "@guago/shared";

export class LiveClock {
  private anchor: ClockAnchor;
  private readonly wall: () => number;
  private readonly listeners = new Set<(anchor: ClockAnchor) => void>();

  constructor(anchor: ClockAnchor, wall: () => number = Date.now) {
    this.anchor = anchor;
    this.wall = wall;
  }

  /** Game ms now. */
  now(): number {
    return clockAt(this.anchor, this.wall());
  }

  date(): Date {
    return new Date(this.now());
  }

  get rate(): number {
    return this.anchor.rate;
  }

  get state(): ClockAnchor {
    return this.anchor;
  }

  /** Moves game time forward by `ms` at once. */
  step(ms: number): ClockAnchor {
    return this.set(reanchor(this.anchor, this.wall(), { stepMs: ms }));
  }

  setRate(rate: number): ClockAnchor {
    return this.set(reanchor(this.anchor, this.wall(), { rate }));
  }

  /** Replaces the anchor (loading the stored one). */
  set(anchor: ClockAnchor): ClockAnchor {
    this.anchor = anchor;
    for (const l of this.listeners) l(anchor);
    return anchor;
  }

  /** Called with every new anchor, to store it. */
  onChange(listener: (anchor: ClockAnchor) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Wall-clock ms until game time reaches `gameMs` at the current rate. */
  wallUntil(gameMs: number): number {
    return Math.max(0, (gameMs - this.now()) / this.anchor.rate);
  }
}
