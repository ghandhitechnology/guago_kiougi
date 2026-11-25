import type * as Phaser from "phaser";
import { Highlighter } from "./marks.ts";
import { fade, slide } from "./motion.ts";
import { screen } from "./screen.ts";
import { sound } from "./sound.ts";
import { Label } from "./text.ts";
import { sliceOf } from "./theme.ts";

/**
 * The place-name banner for entering a map or a named room: a dark card drops in at the top,
 * the name is underlined with the highlighter as it lands, and it lifts away after a moment.
 */
export class PlaceBanner {
  private readonly scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | undefined;
  private timer: Phaser.Time.TimerEvent | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(name: string): void {
    this.hide(true);
    const scene = this.scene;
    const label = new Label(scene, 10, 6, name, { font: "galmuri11-bold", color: "stone.bright" });
    const w = label.width + 20;
    const [l, r, t, b] = sliceOf("hud-plate");
    const card = scene.add.nineslice(0, 0, "ui", "hud-plate/idle", w, 24, l, r, t, b).setOrigin(0);
    const mark = new Highlighter(scene, "gold.mid").box(8, 18, w - 16, 2);
    const x = Math.round((screen.w - w) / 2);
    const rest = { x, y: 34 };
    const root = scene.add.container(x, 20, [card, mark.gfx, label.obj]).setDepth(650).setAlpha(0);
    this.root = root;
    sound("page");
    slide(root, rest, 200);
    fade(root, 1, 200, () => mark.show(240));
    this.timer = scene.time.delayedCall(2600, () => this.hide());
  }

  private hide(now = false): void {
    this.timer?.remove();
    const root = this.root;
    this.root = undefined;
    if (!root) return;
    if (now) {
      root.destroy();
      return;
    }
    slide(root, { x: root.x, y: root.y - 10 }, 180);
    fade(root, 0, 180, () => root.destroy());
  }
}
