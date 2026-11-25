import * as Phaser from "phaser";
import type { MapView, TelegraphOptions } from "../render/index.ts";
import { COMBAT } from "./catalog.ts";

/** Where an effect sprite is drawn. */
export const Layer = {
  /** In the air, unlit, over everything: shots, sparks, bolts. */
  Glow: 0,
  /** On the ground, sorted with the bodies by its top edge: pools, the player's 예보, cracks. */
  Ground: 1,
  /**
   * A monster's tell: on the ground under everyone standing on it, unlit, throwing its own
   * pulsing light (`MapView.addTelegraph`), so it reads at full strength in the darkest map.
   */
  Tell: 2,
} as const;
export type Layer = (typeof Layer)[keyof typeof Layer];

export interface Piece {
  readonly s: Phaser.GameObjects.Sprite;
  layer: Layer;
  inUse: boolean;
  /** A tell piece handed to the view as a telegraph. */
  glowing: boolean;
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
  private readonly tells: Piece[] = [];
  /** Pieces out right now, for the readout. */
  out = 0;

  constructor(scene: Phaser.Scene, view: MapView) {
    this.scene = scene;
    this.view = view;
  }

  private list(layer: Layer): Piece[] {
    return layer === Layer.Glow ? this.glow : layer === Layer.Ground ? this.ground : this.tells;
  }

  take(layer: Layer, additive = false): Piece {
    let p = this.list(layer).pop();
    if (!p) {
      const s = new Phaser.GameObjects.Sprite(this.scene, -999, -999, COMBAT);
      p = { s, layer, inUse: false, glowing: false };
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

  /**
   * Shows a tell piece on the ground with its light, once its frame and size are set (the light's
   * shape follows them). Later calls do nothing.
   */
  tell(p: Piece, options: TelegraphOptions): void {
    if (p.glowing || p.layer !== Layer.Tell) return;
    p.glowing = true;
    this.view.addTelegraph(p.s, options);
  }

  give(p: Piece): void {
    if (!p.inUse) return;
    p.inUse = false;
    p.s.anims.stop();
    p.s.setVisible(false);
    if (p.layer === Layer.Ground) this.view.removeEntity(p.s);
    else if (p.layer === Layer.Tell && p.glowing) {
      p.glowing = false;
      this.view.removeTelegraph(p.s);
      // The view watches a telegraph's destruction; a pooled piece is never destroyed meanwhile.
      p.s.removeAllListeners(Phaser.GameObjects.Events.DESTROY);
    }
    this.list(p.layer).push(p);
    this.out--;
  }

  destroy(): void {
    for (const p of [...this.glow, ...this.ground, ...this.tells]) p.s.destroy();
    this.glow.length = 0;
    this.ground.length = 0;
    this.tells.length = 0;
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
