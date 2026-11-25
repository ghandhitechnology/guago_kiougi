import { narrative } from "@guago/content";
import type * as Phaser from "phaser";
import type { Spoken } from "../copy/lines.ts";
import { cue } from "../sound/audio.ts";
import { Highlighter } from "./marks.ts";
import { fade, slide } from "./motion.ts";
import { edges, screen } from "./screen.ts";
import { Label, wrap } from "./text.ts";
import { sliceOf } from "./theme.ts";

/**
 * A server announcement (a Page opening, a boss freed, the boards turning over) gets more than a
 * chat line: a card drops in under the top of the screen with the field bell, the speaker's name
 * on its corner, holds long enough to read, then shrinks down into the chat corner where the line
 * stays in the log. One at a time, in order.
 */

const MAX_W = 300;
const speakers = new Map(narrative.NARRATIVE.speakers.map((s) => [s.id, s]));

export class AnnounceBanner {
  private readonly scene: Phaser.Scene;
  private readonly queue: Spoken[] = [];
  private busy = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(line: Spoken): void {
    this.queue.push(line);
    if (!this.busy) this.next();
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const scene = this.scene;
    const rows = wrap(scene, "galmuri11", line.text, MAX_W - 24).slice(0, 3);
    const text = new Label(scene, 12, 17, rows.join("\n"), {
      font: "galmuri11",
      color: "stone.bright",
      leading: 2,
    });
    const speaker = speakers.get(line.voice);
    const name = speaker ? (narrative.NARRATIVE.ko[speaker.name] ?? "") : "";
    const tag = new Label(scene, 12, 5, name, { font: "galmuri9", color: "gold.light" });
    const w = Math.min(MAX_W, Math.max(text.width, tag.width) + 24);
    const h = text.height + 25;
    const [l, r, t, b] = sliceOf("hud-plate");
    const card = scene.add.nineslice(0, 0, "ui", "hud-plate/idle", w, h, l, r, t, b).setOrigin(0);
    const rule = new Highlighter(scene, "gold.mid").box(12, 14, Math.max(8, tag.width), 1);
    const x = Math.round((screen.w - w) / 2);
    const rest = { x, y: edges().top + 30 };
    const root = scene.add
      .container(x, rest.y - 16, [card, rule.gfx, tag.obj, text.obj])
      .setDepth(660)
      .setAlpha(0);
    cue("sfx.field.bell");
    slide(root, rest, 240);
    fade(root, 1, 240, () => rule.show(260));
    const hold = 3200 + Math.min(3000, [...line.text].length * 45);
    scene.time.delayedCall(hold, () => {
      // It settles into the chat corner, where the line now waits in the log.
      const e = edges();
      scene.tweens.add({
        targets: root,
        x: e.left,
        y: e.bottom - 20,
        scale: 0.35,
        alpha: 0,
        duration: 420,
        ease: "Cubic.In",
        onComplete: () => {
          root.destroy();
          this.next();
        },
      });
    });
  }
}
