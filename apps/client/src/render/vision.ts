/**
 * A guard's vision cone drawn as light: the torch beam a player watches is exactly the area the
 * guard sees. Each pixel of the beam is tested with the map format's own `sees`, the same test
 * the server spots players with, so cover that hides you also casts the beam's shadow.
 *
 * The beam is redrawn into its own texture only when the guard moves a pixel or turns, and
 * drawn into the light map additively: bright near the torch, a little dimmer at the tip, with a
 * hard edge where sight ends.
 */
import type { BuiltMap, Patrol, Pose } from "@guago/content";
import { sees } from "@guago/content";
import * as Phaser from "phaser";
import { bayer4 } from "./textures.ts";

export interface VisionCone {
  /** Moves the cone to a guard's pose: feet in world pixels, facing in radians (0 east). */
  setPose(pose: Pose): void;
  /** Dims or brightens the beam: 1 is the torch's full light. */
  setStrength(k: number): void;
  remove(): void;
}

export class Cone implements VisionCone {
  readonly image: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private readonly map: BuiltMap;
  private readonly patrol: Patrol;
  private readonly key: string;
  private readonly size: number;
  private readonly intensity: number;
  private last: Pose | null = null;
  private strength = 1;
  private readonly onRemove: () => void;

  constructor(
    scene: Phaser.Scene,
    map: BuiltMap,
    patrol: Patrol,
    key: string,
    color: number,
    intensity: number,
    onRemove: () => void,
  ) {
    this.scene = scene;
    this.map = map;
    this.patrol = patrol;
    this.key = key;
    this.intensity = intensity;
    this.onRemove = onRemove;
    this.size = Math.ceil(patrol.cone.length) * 2 + 2;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.createCanvas(key, this.size, this.size);
    this.image = new Phaser.GameObjects.Image(scene, 0, 0, key)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setAlpha(intensity / 2);
  }

  setPose(pose: Pose): void {
    const x = Math.round(pose.x);
    const y = Math.round(pose.y);
    const prev = this.last;
    const half = this.size / 2;
    this.image.setPosition(x - half, y - half);
    if (
      prev &&
      Math.round(prev.x) === x &&
      Math.round(prev.y) === y &&
      Math.abs(prev.facing - pose.facing) < 0.01
    )
      return;
    this.last = pose;
    const tex = this.scene.textures.get(this.key) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    const img = ctx.createImageData(this.size, this.size);
    const L = this.patrol.cone.length;
    const at = { x, y, facing: pose.facing };
    for (let py = 0; py < this.size; py++) {
      for (let px = 0; px < this.size; px++) {
        const wx = x - half + px + 0.5;
        const wy = y - half + py + 0.5;
        if (!sees(this.map, this.patrol, at, wx, wy)) continue;
        // A beam: full at the torch, three quarters at the tip, the seam between dithered.
        const d = Math.hypot(wx - x, wy - y) / L;
        const v = d < 0.55 ? 1 : d < 0.6 + bayer4(px, py) * 0.1 ? 0.85 : 0.72;
        const o = (py * this.size + px) * 4;
        img.data[o] = 255;
        img.data[o + 1] = 255;
        img.data[o + 2] = 255;
        img.data[o + 3] = Math.round(v * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  setStrength(k: number): void {
    this.strength = k;
    this.image.setAlpha(Math.max(0, Math.min(1, (this.intensity * this.strength) / 2)));
  }

  remove(): void {
    this.image.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    this.onRemove();
  }
}
