import * as Phaser from "phaser";
import type { MapView } from "../render/index.ts";
import { COMBAT } from "./catalog.ts";

/** Where an effect sprite is drawn. */
export const Layer = {
  /** In the air, unlit, over everything: shots, sparks, bolts. */
  Glow: 0,
  /** On the ground, sorted with the bodies by its top edge: pools, telegraphs, cracks. */
  Ground: 1,
} as const;
export type Layer = (typeof Layer)[keyof typeof Layer];

export interface Piece {
  readonly s: Phaser.GameObjects.Sprite;
  layer: Layer;
  inUse: boolean;
}

/**
 * Sprites for effects, made on demand and kept. A glow piece lives in the view's glow layer and
 * is only hidden when handed back; a ground piece is an unlit, shadowless entity of the view, so
 * the view sorts it with the bodies, and it leaves the view when handed back.
 */
export class Pieces {
  private readonly scene: Phaser.Scene;
  private readonly view: MapView;
  private readonly glow: Piece[] = [];
  private readonly ground: Piece[] = [];
  /** Pieces out right now, for the readout. */
  out = 0;

  constructor(scene: Phaser.Scene, view: MapView) {
    this.scene = scene;
    this.view = view;
  }

  take(layer: Layer, additive = false): Piece {
    const list = layer === Layer.Glow ? this.glow : this.ground;
    let p = list.pop();
    if (!p) {
      const s = new Phaser.GameObjects.Sprite(this.scene, -999, -999, COMBAT);
      p = { s, layer, inUse: false };
      if (layer === Layer.Glow) this.view.addEffect(s, false);
    }
    p.inUse = true;
    const s = p.s;
    s.setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    s.setVisible(true).setAlpha(1).setScale(1).setRotation(0).setFlipX(false).setFlipY(false);
    s.clearTint();
    s.setOrigin(0.5, 0.5);
    if (layer === Layer.Ground) this.view.addEntity(s, { shadow: false, lit: false });
    this.out++;
    return p;
  }

  give(p: Piece): void {
    if (!p.inUse) return;
    p.inUse = false;
    p.s.anims.stop();
    p.s.setVisible(false);
    if (p.layer === Layer.Ground) {
      this.view.removeEntity(p.s);
      this.ground.push(p);
    } else this.glow.push(p);
    this.out--;
  }

  destroy(): void {
    for (const p of [...this.glow, ...this.ground]) p.s.destroy();
    this.glow.length = 0;
    this.ground.length = 0;
  }
}

/** Sets a piece to a sprite's frame and plays one of its animations, from the start or not. */
export function show(
  p: Piece,
  atlas: string,
  frame: string,
  anim: string | null,
  restart = true,
): Phaser.GameObjects.Sprite {
  const s = p.s;
  if (s.texture.key !== atlas || s.frame.name !== frame) s.setTexture(atlas, frame);
  if (anim) s.play(anim, !restart);
  return s;
}
