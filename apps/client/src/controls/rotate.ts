import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { Label } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";

/**
 * The game is played sideways. A phone held upright gets a card over everything: the phone
 * standing, a red-pen arrow, the phone on its side, and one line from the school office.
 */
export class RotateCard {
  private readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private upright = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const dim = scene.add
      .rectangle(0, 0, 480, 270, paint("ink.deep"))
      .setOrigin(0)
      .setInteractive();
    const art = scene.add.image(240, 112, "ui", "rotate/idle").setOrigin(0.5).setScale(4);
    const line = new Label(scene, 0, 0, t("rotate.line"), {
      font: "galmuri11-bold",
      color: "stone.pale",
    });
    line.obj.setScale(2);
    line.at(240 - line.width, 196);
    this.root = scene.add.container(0, 0, [dim, art, line.obj]).setDepth(10_000).setVisible(false);
    this.check = this.check.bind(this);
    window.addEventListener("resize", this.check);
    window.visualViewport?.addEventListener("resize", this.check);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("resize", this.check);
      window.visualViewport?.removeEventListener("resize", this.check);
    });
    this.check();
  }

  private check(): void {
    const upright = window.innerHeight > window.innerWidth;
    if (upright === this.upright) return;
    this.upright = upright;
    this.scene.tweens.killTweensOf(this.root);
    if (upright) {
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
