/**
 * The cast standing in the world (PLAN §3): drawn by speaker id from whatever the art build has,
 * breathing in their idle, now and then playing the one move that is theirs, turning the way
 * the server says, with a nameplate under their feet. A speaker with no art yet is skipped.
 */
import type { ArtMetadata } from "@guago/art";
import { CAST_ART, narrative } from "@guago/content";
import { Facing } from "@guago/shared";
import type * as Phaser from "phaser";
import { composeLook, lookAnim, lookTexture, spriteAnim } from "./art.ts";
import { NAME_DEPTH } from "./depths.ts";
import { Label } from "./ui/text.ts";
import { sliceOf } from "./ui/theme.ts";

export type NpcArt =
  | {
      readonly kind: "rig";
      readonly rig: string;
      readonly look: string;
      readonly signature?: string;
    }
  | { readonly kind: "sprite"; readonly sprite: string; readonly signature?: string };

const SPEAKERS = new Map(narrative.NARRATIVE.speakers.map((s) => [s.id, s]));
const KO = narrative.NARRATIVE.ko;

/** The speaker's name as their nameplate shows it. */
export function speakerName(speaker: string): string {
  const key = SPEAKERS.get(speaker)?.name;
  return (key && KO[key]) || "";
}

/**
 * What `speaker` is drawn with (`CAST_ART`), or undefined while the art build has nothing for
 * them yet, so a cast member whose sprites are still being drawn is simply not there.
 */
export function npcArt(meta: ArtMetadata, speaker: string): NpcArt | undefined {
  const cast = CAST_ART[speaker];
  if (!cast) return undefined;
  if (cast.kind === "rig") {
    const rig = meta.rigs[cast.art];
    const look = rig && Object.keys(rig.looks)[0];
    if (!rig || !look) return undefined;
    const signature = rig.anims[cast.signature] ? cast.signature : undefined;
    return { kind: "rig", rig: cast.art, look, ...(signature ? { signature } : {}) };
  }
  const sprite = meta.sprites[cast.art];
  if (!sprite?.anims.idle) return undefined;
  const signature = sprite.anims[cast.signature] ? cast.signature : undefined;
  return { kind: "sprite", sprite: cast.art, ...(signature ? { signature } : {}) };
}

const DIRS: Record<number, string> = {
  [Facing.Down]: "down",
  [Facing.Up]: "up",
  [Facing.Left]: "side",
  [Facing.Right]: "side",
};

/** Seconds between signature moves, give or take. */
const SIGNATURE_MIN_MS = 7000;
const SIGNATURE_SPREAD_MS = 9000;
/** A looping signature (the cat's nap) runs this long. */
const LOOP_SIGNATURE_MS = 6000;

/** A cast member's body; the map view it is added to sorts, lights and shadows it. */
export class NpcActor {
  readonly body: Phaser.GameObjects.Sprite;
  private readonly plate: Phaser.GameObjects.Container | undefined;
  private readonly art: NpcArt;
  private facing: number;
  private busy = false;
  private nextSignature = SIGNATURE_MIN_MS * Math.random() + 2000;
  readonly x: number;
  readonly y: number;

  constructor(
    scene: Phaser.Scene,
    meta: ArtMetadata,
    art: NpcArt,
    speaker: string,
    x: number,
    y: number,
    facing: number,
  ) {
    this.art = art;
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.facing = facing;
    if (art.kind === "rig") {
      const key = lookTexture(art.rig, art.look);
      if (!scene.textures.exists(key)) composeLook(scene, meta, art.rig, art.look);
      this.body = scene.add.sprite(this.x, this.y, key);
    } else {
      this.body = scene.add.sprite(this.x, this.y, meta.sprites[art.sprite]?.atlas ?? "core");
    }
    this.body.on("animationcomplete", () => {
      if (this.busy) this.idle();
    });
    this.idle();
    this.body.anims.setProgress(Math.random());

    const name = speakerName(speaker);
    if (name) this.plate = nameplate(scene, name, this.x, this.y + 3);
  }

  private dir(): string {
    return DIRS[this.facing] ?? "down";
  }

  private idle(): void {
    this.busy = false;
    this.body.setFlipX(this.facing === Facing.Left);
    if (this.art.kind === "rig")
      this.body.play(lookAnim(this.art.rig, this.art.look, this.dir(), "idle"));
    else this.body.play(spriteAnim(this.art.sprite, "idle"));
  }

  /** Turns to the way the server says, at once. */
  face(facing: number): void {
    if (facing === this.facing) return;
    this.facing = facing;
    if (!this.busy) {
      this.idle();
      return;
    }
    this.body.setFlipX(facing === Facing.Left);
  }

  update(dtMs: number): void {
    const sig = this.art.signature;
    if (!sig || this.busy) return;
    this.nextSignature -= dtMs;
    if (this.nextSignature > 0) return;
    this.nextSignature = SIGNATURE_MIN_MS + Math.random() * SIGNATURE_SPREAD_MS;
    this.busy = true;
    if (this.art.kind === "rig") {
      this.body.play(lookAnim(this.art.rig, this.art.look, this.dir(), sig));
    } else {
      this.body.play(spriteAnim(this.art.sprite, sig));
      const anim = this.body.anims.currentAnim;
      if (anim && anim.repeat === -1) {
        this.body.scene.time.delayedCall(LOOP_SIGNATURE_MS, () => {
          if (this.busy && this.body.active) this.idle();
        });
      }
    }
  }

  /** Where a bubble over the head sits. */
  get headY(): number {
    const h = this.art.kind === "rig" ? 26 : 16;
    return this.y - h - 2;
  }

  destroy(): void {
    this.body.destroy();
    this.plate?.destroy();
  }
}

/** A name under the feet on the kit's nameplate, centred on x. */
function nameplate(scene: Phaser.Scene, text: string, x: number, y: number) {
  const label = new Label(scene, 0, 0, text, { font: "galmuri9", color: "stone.bright" });
  const w = label.width + 6;
  const [l, r, t, b] = sliceOf("nameplate");
  const plate = scene.add.nineslice(0, 0, "ui", "nameplate/idle", w, 13, l, r, t, b).setOrigin(0);
  label.at(3, 2);
  const box = scene.add.container(Math.round(x - w / 2), Math.round(y), [plate, label.obj]);
  box.setDepth(NAME_DEPTH);
  return box;
}
