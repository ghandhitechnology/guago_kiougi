import type * as Phaser from "phaser";

/** PLAN §6: offset = trauma² × 4 px, trauma decays 1.5 per second. */
const MAX_OFFSET = 4;
const DECAY = 1.5;

/**
 * Screen trauma (PLAN §6). Only the player's own hits and hits the player takes add to it; the
 * offset is trauma squared, so small knocks barely move the view and big ones shake it hard.
 * Applied after the camera has been placed each frame, in whole pixels, from smooth noise so it
 * jitters rather than vibrates.
 */
export class Trauma {
  value = 0;
  private t = 0;
  private ox = 0;
  private oy = 0;
  /** Scale on the whole effect: a settings slider can turn it down. */
  scale = 1;

  add(amount: number): void {
    this.value = Math.min(1, this.value + amount);
  }

  /** A push of the view toward (dx, dy), px, that springs back: one big event, not a shake. */
  nudge(dx: number, dy: number): void {
    this.nx = Math.max(-4, Math.min(4, this.nx + dx));
    this.ny = Math.max(-4, Math.min(4, this.ny + dy));
  }

  private nx = 0;
  private ny = 0;

  /** Moves the camera by this frame's shake. Call after the camera has been placed. */
  apply(cam: Phaser.Cameras.Scene2D.Camera, dtMs: number): void {
    this.t += dtMs / 1000;
    this.value = Math.max(0, this.value - (DECAY * dtMs) / 1000);
    // A camera nobody moved this frame still carries last frame's shake: take it back off.
    let bx = cam.scrollX;
    let by = cam.scrollY;
    if (bx === this.setX && by === this.setY) {
      bx -= this.ox;
      by -= this.oy;
    }
    const k = this.value * this.value * MAX_OFFSET * this.scale;
    // The nudge eases back over about a tenth of a second.
    const back = Math.exp(-dtMs / 70);
    this.nx = Math.abs(this.nx * back) < 0.05 ? 0 : this.nx * back;
    this.ny = Math.abs(this.ny * back) < 0.05 ? 0 : this.ny * back;
    if (k < 0.5) {
      this.ox = Math.round(this.nx * this.scale);
      this.oy = Math.round(this.ny * this.scale);
    } else {
      const t = this.t * 38;
      this.ox = Math.round(
        k * (Math.sin(t * 1.13) * 0.6 + Math.sin(t * 2.71 + 1.3) * 0.4) + this.nx * this.scale,
      );
      this.oy = Math.round(
        k * (Math.sin(t * 1.37 + 2.1) * 0.6 + Math.sin(t * 2.39 + 0.4) * 0.4) +
          this.ny * this.scale,
      );
    }
    this.setX = bx + this.ox;
    this.setY = by + this.oy;
    cam.setScroll(this.setX, this.setY);
  }

  private setX = Number.NaN;
  private setY = Number.NaN;

  /** The offset added this frame, px. */
  get offsetX(): number {
    return this.ox;
  }

  get offsetY(): number {
    return this.oy;
  }
}
