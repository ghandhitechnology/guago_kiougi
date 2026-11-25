import type { ArtMetadata } from "@guago/art";
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
  /** Each frame's blend mode, from its sprite's `blend` in the art metadata. */
  readonly blends: ReadonlyMap<string, Phaser.BlendModes>;
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
  private readonly blends = new Map<string, Phaser.BlendModes>();

  constructor(scene: Phaser.Scene, view: MapView, meta: ArtMetadata) {
    this.scene = scene;
    this.view = view;
    for (const sp of Object.values(meta.sprites)) {
      if (sp.blend !== "add") continue;
      for (const f of sp.frames) this.blends.set(f, Phaser.BlendModes.ADD);
    }
  }

  private list(layer: Layer): Piece[] {
    return layer === Layer.Glow ? this.glow : layer === Layer.Ground ? this.ground : this.tells;
  }

  /**
   * A piece, reset: ×1, unturned, untinted, uncropped. Its blend follows the art each time
   * `show` sets a frame, so a pooled piece never keeps another sprite's.
   */
  take(layer: Layer): Piece {
    let p = this.list(layer).pop();
    if (!p) {
      const s = new Phaser.GameObjects.Sprite(this.scene, -999, -999, COMBAT);
      p = { s, layer, inUse: false, glowing: false, blends: this.blends };
      if (layer === Layer.Glow) this.view.addEffect(s, false);
    }
    p.inUse = true;
    const s = p.s;
    s.setBlendMode(Phaser.BlendModes.NORMAL);
    s.setVisible(true).setAlpha(1).setScale(1).setRotation(0).setFlipX(false).setFlipY(false);
    s.clearTint();
    if (s.isCropped) s.setCrop();
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

/**
 * Sets a piece to a sprite's frame and plays one of its animations, from the start or not. The
 * blend comes from the sprite's art every time: light and thin strokes add, sparks, bodies,
 * pools, telegraphs and every enemy effect do not.
 */
export function show(
  p: Piece,
  atlas: string,
  frame: string,
  anim: string | null,
  restart = true,
): Phaser.GameObjects.Sprite {
  const s = p.s;
  if (s.texture.key !== atlas || s.frame.name !== frame) s.setTexture(atlas, frame);
  const blend = p.blends.get(frame) ?? Phaser.BlendModes.NORMAL;
  if (s.blendMode !== blend) s.setBlendMode(blend);
  if (anim) s.play(anim, !restart);
  return s;
}

/**
 * Puts a piece's frame pivot (the art's origin) on (x, y), on whole pixels, at the piece's
 * scale. A ground piece hangs from its top edge instead, with the pivot still on (x, y): the
 * view sorts ground pieces with the bodies by `y`, and the top edge keeps a pool or a crack
 * under everyone standing on it.
 */
export function place(p: Piece, x: number, y: number): void {
  const s = p.s;
  const f = s.frame;
  const px = f.customPivot ? f.pivotX : 0.5;
  const py = f.customPivot ? f.pivotY : 0.5;
  if (p.layer === Layer.Ground) {
    if (s.originX !== px || s.originY !== 0) s.setOrigin(px, 0);
    s.setPosition(Math.round(x), Math.round(y) - Math.round(py * f.realHeight * s.scaleY));
  } else {
    if (s.originX !== px || s.originY !== py) s.setOrigin(px, py);
    s.setPosition(Math.round(x), Math.round(y));
  }
}

/**
 * A playing animation sets each new frame's origin to its pivot; a ground piece that was placed
 * hangs from its top edge again (see `place`).
 */
export function hang(p: Piece): void {
  if (p.layer === Layer.Ground && p.s.originY !== 0) p.s.setOrigin(p.s.originX, 0);
}

/**
 * Shows only the first `w` × `h` pixels of a piece's frame: the last, partial tile of a beam,
 * bolt or lane is cut short, never squeezed. A full frame drops the crop.
 */
export function crop(p: Piece, w: number, h: number): void {
  const s = p.s;
  const fw = s.frame.realWidth;
  const fh = s.frame.realHeight;
  if (w >= fw && h >= fh) {
    if (s.isCropped) s.setCrop();
    return;
  }
  s.setCrop(
    0,
    0,
    Math.max(1, Math.min(fw, Math.round(w))),
    Math.max(1, Math.min(fh, Math.round(h))),
  );
}
