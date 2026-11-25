import { Facing } from "@guago/shared";
import type * as Phaser from "phaser";

/**
 * How far the view leans ahead of the player in the way they face, in pixels. Sideways it is
 * held small: the server only sends what stands within its interest reach of the player
 * (apps/server/src/interest.ts), and the screen's edge plus this lean plus half a sprite must stay
 * inside that reach, or things pop in on screen.
 */
const LOOK_X = 8;
const LOOK_Y = 10;
/** Time constant of the lean easing in, in ms. */
const LEAN_MS = 320;
/** A jump longer than this in one frame (a snap correction, a teleport) is glided over, not followed. */
const JUMP_PX = 6;
/** Time constant of gliding back onto the player after a jump, in ms. */
const CATCH_MS = 120;

/**
 * The camera on the player. Its state is an offset from the player, eased in sub-pixels: a
 * small lean in the facing direction, plus any jump it is still catching up on. Drawing snaps
 * both the player and the offset to whole pixels and adds them, so while the offset holds still
 * the player stays on the same screen pixel and the ground under them scrolls in whole pixels
 * at the same instant: nothing shimmers against anything else, at any integer scale.
 */
export class CameraRig {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly mapW: number;
  private readonly mapH: number;
  private ox = 0;
  private oy = 0;
  private leanX = 0;
  private leanY = 0;
  private lastX: number | undefined;
  private lastY: number | undefined;

  constructor(cam: Phaser.Cameras.Scene2D.Camera, mapW: number, mapH: number) {
    this.cam = cam;
    this.mapW = mapW;
    this.mapH = mapH;
    cam.setRoundPixels(true);
  }

  /** Points the camera at (x, y) with nothing to ease, as on spawn. */
  jumpTo(x: number, y: number): void {
    this.ox = 0;
    this.oy = 0;
    this.lastX = x;
    this.lastY = y;
    this.apply(x, y);
  }

  /** Follows the player drawn at (x, y), facing `facing`, `dtMs` after the last frame. */
  follow(x: number, y: number, facing: Facing, dtMs: number): void {
    if (this.lastX !== undefined && this.lastY !== undefined) {
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      if (Math.abs(dx) > JUMP_PX || Math.abs(dy) > JUMP_PX) {
        this.ox -= dx;
        this.oy -= dy;
      }
    }
    this.lastX = x;
    this.lastY = y;

    const tx = facing === Facing.Left ? -LOOK_X : facing === Facing.Right ? LOOK_X : 0;
    const ty = facing === Facing.Up ? -LOOK_Y : facing === Facing.Down ? LOOK_Y : 0;
    const lean = 1 - Math.exp(-dtMs / LEAN_MS);
    this.leanX += (tx - this.leanX) * lean;
    this.leanY += (ty - this.leanY) * lean;
    const k = Math.exp(-dtMs / CATCH_MS);
    this.ox *= k;
    this.oy *= k;
    this.apply(x, y);
  }

  /**
   * Takes the camera back from wherever a scene left it: the offset to the player at (x, y) is
   * eased away like any jump, so the view glides home instead of cutting.
   */
  handBack(x: number, y: number): void {
    this.ox = this.cam.scrollX + this.cam.width / 2 - Math.round(x) - this.leanX;
    this.oy = this.cam.scrollY + this.cam.height / 2 - Math.round(y) - this.leanY;
    this.lastX = x;
    this.lastY = y;
  }

  /** Where the camera's centre lands for a point, kept inside the map. */
  clampCenter(x: number, y: number): { x: number; y: number } {
    const W = this.cam.width;
    const H = this.cam.height;
    const sx = this.mapW <= W ? (this.mapW - W) / 2 : clamp(x - W / 2, 0, this.mapW - W);
    const sy = this.mapH <= H ? (this.mapH - H) / 2 : clamp(y - H / 2, 0, this.mapH - H);
    return { x: Math.round(sx + W / 2), y: Math.round(sy + H / 2) };
  }

  private apply(x: number, y: number): void {
    const cx = Math.round(x) + Math.round(this.ox + this.leanX);
    const cy = Math.round(y) + Math.round(this.oy + this.leanY);
    // The view's own size: as wide as the device shows (ui/screen.ts), 270 tall.
    const W = this.cam.width;
    const H = this.cam.height;
    const sx =
      this.mapW <= W
        ? Math.round((this.mapW - W) / 2)
        : clamp(cx - Math.round(W / 2), 0, this.mapW - W);
    const sy =
      this.mapH <= H
        ? Math.round((this.mapH - H) / 2)
        : clamp(cy - Math.round(H / 2), 0, this.mapH - H);
    this.cam.setScroll(sx, sy);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
