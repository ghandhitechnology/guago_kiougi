/**
 * The map change curtain: an ordered-dither fade in whole game pixels, sixteen steps from clear
 * to ink and back, so the screen dissolves the way pixel art does instead of dimming.
 */
import { INTERNAL_HEIGHT as H, INTERNAL_WIDTH as W } from "@guago/shared";
import type * as Phaser from "phaser";
import { FADE_DEPTH } from "./depths.ts";
import { paint } from "./ui/theme.ts";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const STEPS = 16;
const key = (level: number) => `fade-dither-${level}`;

function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(key(STEPS))) return;
  const ink = paint("ink.deep");
  const color = `#${ink.toString(16).padStart(6, "0")}`;
  for (let level = 1; level <= STEPS; level++) {
    const t = scene.textures.createCanvas(key(level), 4, 4);
    const ctx = t?.getContext();
    if (!t || !ctx) continue;
    ctx.fillStyle = color;
    for (let i = 0; i < 16; i++)
      if ((BAYER[i] as number) < level) ctx.fillRect(i % 4, i >> 2, 1, 1);
    t.refresh();
  }
}

/** Steps the waiting curtain breathes between, and the pace of a breath. */
const BREATH_FROM = 13;
const BREATH_MS = 900;
/** The page caret shows only when a wait lasts longer than a door. */
const CARET_AFTER_MS = 450;

export class Curtain {
  private readonly sheet: Phaser.GameObjects.TileSprite;
  private level = 0;
  private tween: Phaser.Tweens.Tween | undefined;
  /** While the world is out of reach: the breath and the caret. */
  private waiting:
    | {
        breath: Phaser.Tweens.Tween;
        caret: Phaser.GameObjects.Image | undefined;
        timer: Phaser.Time.TimerEvent;
      }
    | undefined;

  constructor(scene: Phaser.Scene, closed: boolean) {
    makeTextures(scene);
    this.sheet = scene.add
      .tileSprite(0, 0, W, H, key(STEPS))
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(FADE_DEPTH);
    this.set(closed ? STEPS : 0);
  }

  get closed(): boolean {
    return this.level === STEPS || this.waiting !== undefined;
  }

  /**
   * The world is out of reach for a while (entering, a dropped connection coming back): the
   * curtain closes and breathes in its own dither, and the dialogue's page caret bobs in the
   * corner, as on a page that has more to come. No words. `open` ends it.
   */
  wait(): void {
    if (this.waiting) return;
    const scene = this.sheet.scene;
    void this.close().then(() => {
      if (this.waiting || this.level !== STEPS) return;
      const state = { v: STEPS };
      const breath = scene.tweens.add({
        targets: state,
        v: BREATH_FROM,
        duration: BREATH_MS,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
        onUpdate: () => this.set(Math.round(state.v)),
      });
      let caret: Phaser.GameObjects.Image | undefined;
      const timer = scene.time.delayedCall(CARET_AFTER_MS, () => {
        if (!scene.textures.get("ui").has("caret/down")) return;
        caret = scene.add
          .image(W - 14, H - 10, "ui", "caret/down")
          .setScrollFactor(0)
          .setDepth(FADE_DEPTH + 1)
          .setAlpha(0);
        scene.tweens.add({ targets: caret, alpha: 1, duration: 200 });
        scene.tweens.add({
          targets: caret,
          y: H - 12,
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: "Sine.InOut",
        });
        if (this.waiting) this.waiting.caret = caret;
      });
      this.waiting = { breath, caret, timer };
    });
  }

  private stopWaiting(): void {
    const w = this.waiting;
    if (!w) return;
    this.waiting = undefined;
    w.breath.stop();
    w.timer.remove();
    w.caret?.destroy();
    this.set(STEPS);
  }

  private set(level: number): void {
    this.level = level;
    this.sheet.setVisible(level > 0);
    if (level > 0) this.sheet.setTexture(key(level));
  }

  /** Dissolves to ink over `ms`; resolves once the screen is covered. */
  close(ms = 180): Promise<void> {
    return this.to(STEPS, ms);
  }

  /** Dissolves back to the world over `ms`. */
  open(ms = 220): Promise<void> {
    this.stopWaiting();
    return this.to(0, ms);
  }

  private to(target: number, ms: number): Promise<void> {
    this.tween?.stop();
    const from = this.level;
    if (from === target) return Promise.resolve();
    const state = { v: from };
    const scene = this.sheet.scene;
    return new Promise((resolve) => {
      this.tween = scene.tweens.add({
        targets: state,
        v: target,
        duration: (ms * Math.abs(target - from)) / STEPS,
        ease: "Linear",
        onUpdate: () => this.set(Math.round(state.v)),
        onComplete: () => {
          this.set(target);
          resolve();
        },
        onStop: () => resolve(),
      });
    });
  }

  destroy(): void {
    this.stopWaiting();
    this.tween?.stop();
    this.sheet.destroy();
  }
}
