import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { onScreen, type Screen, screen } from "../ui/screen.ts";
import { Label } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";

/**
 * The game is played sideways. A phone held upright gets a card over the whole screen: the
 * phone standing, a red-pen arrow, the phone on its side, and one line from the school office.
 */
export class RotateCard {
  private readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly art: Phaser.GameObjects.Image;
  private readonly line: Label;
  private upright = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.dim = scene.add.rectangle(0, 0, 1, 1, paint("ink.deep")).setOrigin(0).setInteractive();
    this.art = scene.add.image(0, 0, "ui", "rotate/idle").setOrigin(0.5);
    this.line = new Label(scene, 0, 0, t("rotate.line"), {
      font: "galmuri11-bold",
      color: "stone.pale",
    });
    this.root = scene.add
      .container(0, 0, [this.dim, this.art, this.line.obj])
      .setDepth(10_000)
      .setVisible(false);
    const off = onScreen((s) => this.check(s));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    this.check(screen);
  }

  private check(s: Screen): void {
    // Upright the view is narrow and tall; the art scales by whole steps to fill it.
    this.dim.setSize(s.w, s.h);
    const k = Math.max(1, Math.min(4, Math.floor((s.w * 0.8) / this.art.width)));
    this.art.setScale(k).setPosition(Math.round(s.w / 2), Math.round(s.h * 0.42));
    const lk = Math.max(1, Math.min(2, Math.floor((s.w - 16) / this.line.width)));
    this.line.obj.setScale(lk);
    this.line.at(
      Math.round((s.w - this.line.width * lk) / 2),
      Math.round(s.h * 0.42 + (this.art.height * k) / 2 + 16),
    );
    if (s.upright === this.upright) return;
    this.upright = s.upright;
    this.scene.tweens.killTweensOf(this.root);
    if (s.upright) {
      this.root.setVisible(true).setAlpha(0);
      this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
    } else {
      this.scene.tweens.add({
        targets: this.root,
        alpha: 0,
        duration: 140,
        onComplete: () => this.root.setVisible(false),
      });
    }
  }
}
