/**
 * People and things a scene puts on stage (PLAN §4): drawn from the cast table or the stage's
 * own art (`actorArt`), walked from mark to mark with their walk, turned, posed with their
 * animations. Presentation only: the server knows none of them.
 */
import type { ArtMetadata } from "@guago/art";
import type { CastArt, narrative } from "@guago/content";
import type * as Phaser from "phaser";
import { composeLook, lookAnim, lookTexture, spriteAnim } from "../art.ts";

export type Dir = narrative.Dir;

/** A rig drawn from one of its looks, or a sprite with its own animations. */
type Drawn =
  | { readonly kind: "rig"; readonly rig: string; readonly look: string }
  | { readonly kind: "sprite"; readonly sprite: string };

/** The way to look from one point toward another. */
export function dirToward(x: number, y: number, tx: number, ty: number, was: Dir): Dir {
  const dx = tx - x;
  const dy = ty - y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return was;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

export class StoryActor {
  readonly id: string;
  readonly body: Phaser.GameObjects.Sprite;
  private readonly drawn: Drawn;
  private readonly meta: ArtMetadata;
  private dir: Dir = "down";
  private walking = false;
  private posed = false;
  private tween: Phaser.Tweens.Tween | undefined;

  private constructor(
    id: string,
    body: Phaser.GameObjects.Sprite,
    drawn: Drawn,
    meta: ArtMetadata,
  ) {
    this.id = id;
    this.body = body;
    this.drawn = drawn;
    this.meta = meta;
    body.on("animationcomplete", () => {
      if (this.posed && !this.walking) this.idle();
    });
  }

  /** The actor, or undefined while the art build has nothing to draw them with. */
  static make(
    scene: Phaser.Scene,
    meta: ArtMetadata,
    id: string,
    art: CastArt | undefined,
    look?: string,
  ): StoryActor | undefined {
    if (!art) return undefined;
    if (art.kind === "rig") {
      const rig = meta.rigs[art.art];
      const chosen = look && rig?.looks[look] ? look : rig && Object.keys(rig.looks)[0];
      if (!rig || !chosen) return undefined;
      const key = lookTexture(art.art, chosen);
      if (!scene.textures.exists(key)) composeLook(scene, meta, art.art, chosen);
      const body = scene.add.sprite(-100, -100, key);
      const a = new StoryActor(id, body, { kind: "rig", rig: art.art, look: chosen }, meta);
      a.idle();
      return a;
    }
    const sprite = meta.sprites[art.art];
    if (!sprite || !scene.textures.exists(sprite.atlas)) return undefined;
    const body = scene.add.sprite(-100, -100, sprite.atlas);
    const a = new StoryActor(id, body, { kind: "sprite", sprite: art.art }, meta);
    a.idle();
    return a;
  }

  get x(): number {
    return this.body.x;
  }

  get y(): number {
    return this.body.y;
  }

  /** Where a bubble over the head sits. */
  get headY(): number {
    return this.body.y - (this.drawn.kind === "rig" ? 28 : Math.max(14, this.body.height - 4));
  }

  place(x: number, y: number): void {
    this.tween?.stop();
    this.body.setPosition(Math.round(x), Math.round(y));
  }

  face(dir: Dir): void {
    this.dir = dir;
    if (!this.walking && !this.posed) this.idle();
    else this.body.setFlipX(dir === "left");
  }

  /** Walks to (x, y) over `ms`, facing the way, and stands. Resolves on arrival. */
  walkTo(x: number, y: number, ms: number): Promise<void> {
    this.tween?.stop();
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (Math.hypot(tx - this.x, ty - this.y) < 1 || ms <= 0) {
      this.place(tx, ty);
      return Promise.resolve();
    }
    this.dir = dirToward(this.x, this.y, tx, ty, this.dir);
    this.walking = true;
    this.posed = false;
    this.playWalk();
    return new Promise((resolve) => {
      this.tween = this.body.scene.tweens.add({
        targets: this.body,
        x: tx,
        y: ty,
        duration: ms,
        onUpdate: () => this.body.setPosition(Math.round(this.body.x), Math.round(this.body.y)),
        onComplete: () => {
          this.walking = false;
          this.idle();
          resolve();
        },
        onStop: () => {
          this.walking = false;
          resolve();
        },
      });
    });
  }

  /** Plays one of their animations; looping ones hold until the next walk or pose. */
  pose(anim: string): boolean {
    const key = this.animKey(anim);
    if (!key) return false;
    this.posed = true;
    this.body.setFlipX(this.dir === "left");
    this.body.play(key);
    return true;
  }

  /** Whether the actor has an animation of this name. */
  has(anim: string): boolean {
    return this.animKey(anim) !== undefined;
  }

  idle(): void {
    this.posed = false;
    this.body.setFlipX(this.dir === "left");
    const key = this.animKey("idle");
    if (key) this.body.play(key, true);
  }

  private playWalk(): void {
    this.body.setFlipX(this.dir === "left");
    const d = this.drawn;
    if (d.kind === "sprite") {
      const s = this.meta.sprites[d.sprite];
      // The cat walks with one animation a direction.
      const named = `walk${this.dir === "up" ? "Up" : this.dir === "down" ? "Down" : "Side"}`;
      const walk = [named, "walk", "move", "hop"].find((a) => s?.anims[a]);
      if (walk) this.body.play(spriteAnim(d.sprite, walk), true);
      return;
    }
    const key = this.animKey("walk");
    if (key) this.body.play(key, true);
  }

  private animKey(anim: string): string | undefined {
    const d = this.drawn;
    if (d.kind === "sprite") {
      return this.meta.sprites[d.sprite]?.anims[anim] ? spriteAnim(d.sprite, anim) : undefined;
    }
    if (!this.meta.rigs[d.rig]?.anims[anim]) return undefined;
    const side = this.dir === "left" || this.dir === "right" ? "side" : this.dir;
    return lookAnim(d.rig, d.look, side, anim);
  }

  destroy(): void {
    this.tween?.stop();
    this.body.destroy();
  }
}
