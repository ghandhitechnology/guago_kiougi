/**
 * The place name, shown for a moment on entering a new map or a named room: a name label laid
 * down at the top of the screen in the kit's paper, with the channel beside a map's name.
 */

import { INTERNAL_WIDTH as W } from "@guago/shared";
import type * as Phaser from "phaser";
import { FADE_DEPTH } from "./fade.ts";
import { t } from "./i18n/index.ts";
import { layDown, pickUp, type Rest } from "./ui/motion.ts";
import { Label } from "./ui/text.ts";
import { INK, INK_SOFT, sliceOf } from "./ui/theme.ts";

/** How long the name stays before it is picked up again. */
const HOLD_MS = 1700;
const TOP = 10;

export class PlaceCard {
  private readonly scene: Phaser.Scene;
  private box: Phaser.GameObjects.Container | undefined;
  private timer: Phaser.Time.TimerEvent | undefined;
  private shownName = "";

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Shows `name`, with the channel when given; the same name twice in a row shows once. */
  show(name: string, channel?: number): void {
    if (!name || (name === this.shownName && this.box?.visible)) return;
    this.shownName = name;
    this.dismiss(true);
    const s = this.scene;
    const title = new Label(s, 0, 0, name, { font: "galmuri11-bold", color: INK });
    const parts: Phaser.GameObjects.GameObject[] = [];
    let w = title.width + 14;
    let tag: Label | undefined;
    if (channel !== undefined) {
      tag = new Label(s, 0, 0, t("world.channel", { n: channel }), {
        font: "galmuri9",
        color: INK_SOFT,
      });
      w += tag.width + 6;
    }
    const [l, r, top, b] = sliceOf("label");
    const paper = s.add.nineslice(0, 0, "ui", "label/idle", w, 15, l, r, top, b).setOrigin(0);
    title.at(7, 2);
    parts.push(paper, title.obj);
    if (tag) {
      tag.at(7 + title.width + 6, 4);
      parts.push(tag.obj);
    }
    const rest: Rest = { x: Math.round((W - w) / 2), y: TOP };
    const box = s.add
      .container(rest.x, rest.y, parts)
      .setScrollFactor(0)
      .setDepth(FADE_DEPTH - 1);
    box.setVisible(false);
    this.box = box;
    layDown(box, rest);
    this.timer = s.time.delayedCall(HOLD_MS, () => {
      if (this.box === box) pickUp(box, rest, () => box.destroy());
      if (this.box === box) this.box = undefined;
    });
  }

  private dismiss(now: boolean): void {
    this.timer?.remove();
    const box = this.box;
    this.box = undefined;
    if (!box) return;
    if (now) box.destroy();
  }

  destroy(): void {
    this.dismiss(true);
  }
}
