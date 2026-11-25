import type { ArtMetadata, RigMeta } from "@guago/art";
import { Facing } from "@guago/shared";
import type * as Phaser from "phaser";
import { lookAnim, lookTexture, spriteAnim } from "./art.ts";

/** Movement under this many pixels in a frame is standing still. */
const STILL_PX = 0.02;
/** Standing this long ends a walk, so a frame without movement does not flicker the idle in. */
const SETTLE_MS = 70;
/** A stand of this long, give or take, ends in a fidget. */
const FIDGET_MIN_MS = 6000;
const FIDGET_SPREAD_MS = 9000;
const FIDGETS = ["yawn", "page"] as const;

const DIRS: Record<Facing, string> = {
  [Facing.Down]: "down",
  [Facing.Up]: "up",
  [Facing.Left]: "side",
  [Facing.Right]: "side",
};

const fidgetDelay = () => FIDGET_MIN_MS + Math.random() * FIDGET_SPREAD_MS;

/**
 * Something drawn in the world: a body with its feet at its position. The map view it is added
 * to (`MapView.addEntity`) sorts it by those feet, lights it and draws its shadow.
 */
abstract class Actor {
  readonly body: Phaser.GameObjects.Sprite;

  constructor(body: Phaser.GameObjects.Sprite) {
    this.body = body;
  }

  /** Puts the feet on a whole pixel. */
  protected place(x: number, y: number): void {
    this.body.setPosition(Math.round(x), Math.round(y));
  }

  destroy(): void {
    this.body.destroy();
  }
}

/**
 * A student. The walk cycle is driven by distance, not time: one cycle per stride length the
 * art was drawn for, so the feet keep pace with the ground at any speed, slow down sliding along
 * a wall and stop the moment the body does. Standing, it breathes, and now and then yawns or
 * turns a page.
 */
export class PlayerActor extends Actor {
  private readonly rig: string;
  private readonly look: string;
  private readonly walkFrames: readonly string[];
  /** Pixels covered by one full walk cycle at the art's own frame rate and the base speed. */
  private readonly stride: number;
  private dir = "down";
  private walking = false;
  private phase = 0;
  private stillFor = 0;
  private fidgetAt = fidgetDelay();
  private fidgeting = false;
  private lastX: number | undefined;
  private lastY: number | undefined;

  constructor(scene: Phaser.Scene, meta: ArtMetadata, rig: string, look: string, speed: number) {
    super(scene.add.sprite(-100, -100, lookTexture(rig, look)));
    this.rig = rig;
    this.look = look;
    const walk = (meta.rigs[rig] as RigMeta).anims.walk;
    this.walkFrames = walk?.frames ?? [];
    this.stride = walk ? (speed * walk.frames.length) / walk.fps : 32;
    this.playIdle();
    this.body.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
      if (FIDGETS.some((f) => anim.key.endsWith(`/${f}`))) {
        this.fidgeting = false;
        this.stillFor = 0;
        this.fidgetAt = fidgetDelay();
        this.playIdle();
      }
    });
  }

  private anim(name: string): string {
    return lookAnim(this.rig, this.look, this.dir, name);
  }

  private playIdle(): void {
    this.body.play(this.anim("idle"));
    // Start each breath at a different point so a crowd does not breathe in step.
    this.body.anims.setProgress(Math.random());
  }

  update(x: number, y: number, facing: Facing, dtMs: number): void {
    const dist =
      this.lastX === undefined ? 0 : Math.hypot(x - this.lastX, y - (this.lastY as number));
    this.lastX = x;
    this.lastY = y;
    const dir = DIRS[facing];
    const turned = dir !== this.dir;
    this.dir = dir;
    this.body.setFlipX(facing === Facing.Left);

    if (dist > STILL_PX) {
      this.stillFor = 0;
      if (!this.walking) {
        this.walking = true;
        this.fidgeting = false;
        this.phase = 0;
        this.body.anims.stop();
      }
      this.phase = (this.phase + dist / this.stride) % 1;
      const index = Math.floor(this.phase * this.walkFrames.length);
      this.body.setFrame(`${dir}/${this.walkFrames[index]}`);
    } else {
      this.stillFor += dtMs;
      if (this.walking && this.stillFor >= SETTLE_MS) {
        this.walking = false;
        this.fidgetAt = fidgetDelay();
        this.playIdle();
      } else if (this.walking) {
        this.body.setFrame(
          `${dir}/${this.walkFrames[Math.floor(this.phase * this.walkFrames.length)]}`,
        );
      } else if (turned) {
        if (this.fidgeting) this.fidgeting = false;
        this.playIdle();
      } else if (!this.fidgeting && this.stillFor >= this.fidgetAt) {
        this.fidgeting = true;
        this.body.play(this.anim(FIDGETS[Math.floor(Math.random() * FIDGETS.length)] as string));
      }
    }
    this.place(x, y);
  }
}

/** A monster: idles in place, hops while it moves, faces the way it last went. */
export class MonsterActor extends Actor {
  private readonly kind: string;
  private movedFor = 0;
  private lastX: number | undefined;
  private lastY: number | undefined;

  constructor(scene: Phaser.Scene, meta: ArtMetadata, kind: string) {
    const sprite = meta.sprites[kind];
    if (!sprite) throw new Error(`art has no sprite ${kind}`);
    super(scene.add.sprite(-100, -100, sprite.atlas).play(spriteAnim(kind, "idle")));
    this.kind = kind;
    // Start each loop at a different point so a crowd does not bob in step.
    this.body.anims.setProgress(Math.random());
  }

  update(x: number, y: number, facing: Facing, dtMs: number): void {
    const moved =
      this.lastX !== undefined && Math.hypot(x - this.lastX, y - (this.lastY as number)) > STILL_PX;
    this.lastX = x;
    this.lastY = y;
    this.movedFor = moved ? 0 : this.movedFor + dtMs;
    this.body.setFlipX(facing === Facing.Left);
    const anim = this.movedFor < 150 ? "hop" : "idle";
    this.body.play(spriteAnim(this.kind, anim), true);
    this.place(x, y);
  }
}
