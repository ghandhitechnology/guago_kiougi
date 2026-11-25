/**
 * Speech bubbles in the world: a line over a person's head, or a description over a thing the
 * player looked at. The minimum until the UI lane's bubble and dialogue box exist; the world
 * scene only calls `say`, `clear` and `update`, so swapping this module touches nothing else.
 */
import type * as Phaser from "phaser";
import { BUBBLE_DEPTH } from "./depths.ts";
import { Label } from "./ui/text.ts";
import { INK, INK_SOFT, sliceOf } from "./ui/theme.ts";

/** Text wraps at this width, in pixels. */
const WRAP = 118;
const PAD_X = 4;
const PAD_Y = 3;
/** On screen this long, plus a little per character. */
const BASE_MS = 2200;
const PER_CHAR_MS = 55;
const MAX_MS = 7000;
/** A bubble for something the player looked at closes once they walk this far off. */
const LEAVE_PX = 72;

interface Shown {
  readonly box: Phaser.GameObjects.Container;
  until: number;
  /** For bubbles that close when the player walks away: where the thing is. */
  readonly near?: { readonly x: number; readonly y: number };
  closing: boolean;
}

export class Bubbles {
  private readonly scene: Phaser.Scene;
  private readonly shown = new Map<string, Shown>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Shows `text` in a bubble whose tail points at (x, y), replacing whatever `key` was saying.
   * With `title`, the first row is a heading. With `stayNear`, it also closes when the player
   * walks off.
   */
  say(
    key: string,
    x: number,
    y: number,
    text: string,
    opts: { title?: string; stayNear?: boolean } = {},
  ): void {
    this.clear(key, true);
    const s = this.scene;
    const rows: Phaser.GameObjects.GameObject[] = [];
    let h = PAD_Y;
    let w = 0;
    if (opts.title) {
      const title = new Label(s, PAD_X, h, opts.title, { font: "galmuri9", color: INK_SOFT });
      rows.push(title.obj);
      w = Math.max(w, title.width);
      h += title.height;
    }
    const body = new Label(s, PAD_X, h, text, { font: "galmuri9", color: INK, width: WRAP });
    rows.push(body.obj);
    w = Math.max(w, body.width);
    h += body.height + PAD_Y - 2;
    w += PAD_X * 2;
    const [l, r, t, b] = sliceOf("bubble");
    const paper = s.add.nineslice(0, 0, "ui", "bubble/idle", w, h, l, r, t, b).setOrigin(0);
    const tail = s.add.image(Math.round(w / 2) - 2, h - 1, "ui", "bubble-tail/idle").setOrigin(0);
    const box = s.add.container(0, 0, [paper, tail, ...rows]);
    // The tail's tip on the anchor; the box grows up from there.
    const rest = { x: Math.round(x - w / 2), y: Math.round(y - h - 2) };
    box
      .setPosition(rest.x, rest.y + 3)
      .setAlpha(0)
      .setDepth(BUBBLE_DEPTH);
    s.tweens.add({ targets: box, y: rest.y, alpha: 1, duration: 120, ease: "Back.Out" });
    const ms = Math.min(MAX_MS, BASE_MS + text.length * PER_CHAR_MS);
    this.shown.set(key, {
      box,
      until: s.time.now + ms,
      ...(opts.stayNear ? { near: { x, y } } : {}),
      closing: false,
    });
  }

  /** Closes `key`'s bubble: at once, or with a short fade. */
  clear(key: string, now = false): void {
    const b = this.shown.get(key);
    if (!b) return;
    this.shown.delete(key);
    if (now) {
      b.box.destroy();
      return;
    }
    b.closing = true;
    this.scene.tweens.add({
      targets: b.box,
      alpha: 0,
      y: b.box.y - 2,
      duration: 160,
      ease: "Quad.In",
      onComplete: () => b.box.destroy(),
    });
  }

  /** Ages bubbles out, and closes looked-at ones the player walked away from. */
  update(player: { x: number; y: number } | undefined): void {
    const now = this.scene.time.now;
    for (const [key, b] of this.shown) {
      const far =
        b.near && player && Math.hypot(player.x - b.near.x, player.y - b.near.y) > LEAVE_PX;
      if (now >= b.until || far) this.clear(key);
    }
  }

  clearAll(): void {
    for (const key of [...this.shown.keys()]) this.clear(key, true);
  }
}
