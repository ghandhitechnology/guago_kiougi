/**
 * The interact prompt (PLAN §6 "Interact"): an icon over the nearest thing in reach, never a
 * sentence. The key cap on a keyboard, the kit's interact button on a touch screen, where a tap
 * on it is the context button.
 */
import * as Phaser from "phaser";
import { PROMPT_DEPTH } from "./depths.ts";
import { sound } from "./ui/sound.ts";
import { Label } from "./ui/text.ts";
import { INK, sliceOf } from "./ui/theme.ts";

const touch = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;

export class Prompt {
  private readonly box: Phaser.GameObjects.Container;
  private target: string | undefined;
  private x = 0;
  private y = 0;
  private bornAt = 0;

  constructor(scene: Phaser.Scene, onTap: () => void) {
    let parts: Phaser.GameObjects.GameObject[];
    let w: number;
    let h: number;
    if (touch()) {
      const button = scene.add.image(0, 0, "ui", "touch-btn/idle").setOrigin(0);
      const icon = scene.add.image(7, 7, "ui", "touch-icon/interact").setOrigin(0);
      parts = [button, icon];
      w = button.width;
      h = button.height;
    } else {
      const [l, r, t, b] = sliceOf("btn");
      const cap = scene.add.nineslice(0, 0, "ui", "btn/idle", 13, 19, l, r, t, b).setOrigin(0);
      const key = new Label(scene, 4, 5, "E", { font: "galmuri9", color: INK });
      parts = [cap, key.obj];
      w = 13;
      h = 19;
    }
    this.box = scene.add.container(0, 0, parts).setDepth(PROMPT_DEPTH).setVisible(false);
    this.box.setSize(w, h);
    this.box.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.box.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.target) onTap();
    });
  }

  /** Puts the prompt over `key`, its bottom centre at (x, y); undefined hides it. */
  show(key: string | undefined, x = 0, y = 0): void {
    if (key === undefined) {
      if (this.target !== undefined) {
        this.target = undefined;
        this.box.scene.tweens.killTweensOf(this.box);
        this.box.setVisible(false);
      }
      return;
    }
    this.x = Math.round(x - this.box.width / 2);
    this.y = Math.round(y - this.box.height);
    if (this.target === key) return;
    this.target = key;
    this.bornAt = this.box.scene.time.now;
    this.box
      .setVisible(true)
      .setAlpha(0)
      .setPosition(this.x, this.y + 3);
    this.box.scene.tweens.add({ targets: this.box, alpha: 1, duration: 90, ease: "Quad.Out" });
  }

  /** A press: the cap pushes down and springs back. */
  press(): void {
    if (!this.target) return;
    sound("select");
    this.box.scene.tweens.add({ targets: this.box, scaleY: 0.85, duration: 50, yoyo: true });
  }

  update(time: number): void {
    if (!this.target) return;
    const rise = Math.min(1, (time - this.bornAt) / 90) * 3;
    const bob = Math.round(Math.sin(time / 260) * 1);
    this.box.setPosition(this.x, this.y + 3 - rise + bob);
  }

  destroy(): void {
    this.box.destroy();
  }
}
