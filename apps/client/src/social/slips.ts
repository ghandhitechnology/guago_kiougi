import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { Button } from "../ui/button.ts";
import { FocusScope } from "../ui/focus.ts";
import { fade, slide } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";

/** One note: what arrived, from whom, and the two answers when it asks for one. */
export interface Slip {
  /** Replaces a slip with the same key. */
  readonly key: string;
  /** A `ui` frame, or a texture key, drawn at the left. */
  readonly icon: string;
  readonly iconTexture?: boolean;
  readonly title: string;
  readonly sub?: string;
  /** When the offer lapses (ms since the epoch): a fuse burns down the bottom edge. */
  readonly expiresAt?: number;
  /** How long a slip without a fuse stays up. */
  readonly ttl?: number;
  readonly accept?: () => void;
  readonly decline?: () => void;
  /** One answer instead of the two: 취소, for an offer of the player's own still waiting. */
  readonly cancel?: () => void;
  /** Answers in words of their own instead, side by side; an `ink` one moves things on. */
  readonly choices?: readonly {
    readonly label: string;
    readonly run: () => void;
    readonly ink?: boolean;
  }[];
  /** A clock counting up from this time (ms since the epoch) in place of `sub`: a wait. */
  readonly since?: number;
  /** A slip that reports something done shows the red seal instead of answers. */
  readonly sealed?: boolean;
}

interface Shown {
  readonly slip: Slip;
  readonly root: Phaser.GameObjects.Container;
  readonly w: number;
  readonly h: number;
  readonly fuse: Phaser.GameObjects.Rectangle | undefined;
  readonly fuseW: number;
  readonly until: number;
  readonly start: number;
  readonly clock: Label | undefined;
}

const W = 132;
const MAX = 3;

/**
 * Invites and requests as notes stuck down the right edge, under the minimap: an icon, the name,
 * and 수락 and 거절 right on them. A note with a deadline burns a fuse along its bottom edge.
 * They never take the keyboard and never cover the middle of the screen.
 */
export class Slips {
  private readonly scene: Phaser.Scene;
  private readonly scope = new FocusScope();
  private readonly shown: Shown[] = [];
  private top = 96;
  private hidden = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  /** Out of the way while a menu is open; back when it closes. */
  setVisible(on: boolean): void {
    this.hidden = !on;
    for (const s of this.shown) fade(s.root, on ? 1 : 0, 120);
  }

  /** Where the stack starts, below whatever sits at the top right. */
  setTop(y: number): void {
    this.top = y;
    this.layout();
  }

  /** Puts a slip up; one with the key of a slip already up takes its place without moving. */
  push(slip: Slip): void {
    const before = this.shown.findIndex((s) => s.slip.key === slip.key);
    const old = this.shown[before];
    const was = old ? { x: old.root.x, y: old.root.y } : undefined;
    if (old) {
      this.shown.splice(before, 1);
      old.root.destroy();
    }
    const scene = this.scene;
    const ctx = { scene, scope: this.scope };
    const answers =
      slip.accept !== undefined ||
      slip.decline !== undefined ||
      slip.cancel !== undefined ||
      (slip.choices?.length ?? 0) > 0;
    const h = answers ? 50 : 30;
    const title = new Label(scene, 24, 5, slip.title, {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    const subText = slip.since !== undefined ? waited(slip.since) : slip.sub;
    const sub = subText
      ? new Label(scene, 24, 18, subText, { font: "galmuri9", color: "stone.dark" })
      : undefined;
    // As wide as its words need, at least the width the answers sit in.
    const w = Math.max(W, 24 + Math.max(title.width, sub?.width ?? 0) + (slip.sealed ? 30 : 8));
    const [l, r, tt, b] = sliceOf("tooltip");
    const paper = scene.add.nineslice(0, 0, "ui", "tooltip/idle", w, h, l, r, tt, b).setOrigin(0);
    paper.setInteractive();
    const parts: Phaser.GameObjects.GameObject[] = [paper];
    parts.push(
      slip.iconTexture
        ? scene.add.image(5, 5, slip.icon).setOrigin(0)
        : scene.add.image(5, 5, "ui", slip.icon).setOrigin(0),
    );
    parts.push(title.obj);
    if (sub) parts.push(sub.obj);
    if (slip.sealed) parts.push(scene.add.image(w - 25, 4, "ui", "seal/on").setOrigin(0));
    const root = scene.add.container(0, 0, parts).setDepth(700);
    const answer = (fn: (() => void) | undefined) => () => {
      this.drop(slip.key);
      fn?.();
    };
    if (slip.choices?.length) {
      const n = slip.choices.length;
      const bw = Math.floor((W - 10 - (n - 1) * 4) / n);
      slip.choices.forEach((c, i) => {
        root.add(
          new Button(ctx, 5 + i * (bw + 4), h - 22, {
            label: c.label,
            ...(c.ink ? { kind: "ink" as const } : {}),
            w: bw,
            h: 17,
            font: "galmuri9",
            sound: c.ink ? "confirm" : "select",
            onPress: answer(c.run),
          }),
        );
      });
    } else if (slip.cancel) {
      root.add(
        new Button(ctx, 5, h - 22, {
          label: t("social.cancel"),
          w: W - 10,
          h: 17,
          font: "galmuri9",
          sound: "close",
          onPress: answer(slip.cancel),
        }),
      );
    } else if (answers) {
      const bw = Math.floor((W - 14) / 2);
      root.add(
        new Button(ctx, 5, h - 22, {
          label: t("social.accept"),
          kind: "ink",
          w: bw,
          h: 17,
          font: "galmuri9",
          sound: "confirm",
          onPress: answer(slip.accept),
        }),
      );
      root.add(
        new Button(ctx, 9 + bw, h - 22, {
          label: t("social.decline"),
          w: bw,
          h: 17,
          font: "galmuri9",
          onPress: answer(slip.decline),
        }),
      );
    }
    let fuse: Phaser.GameObjects.Rectangle | undefined;
    const fuseW = w - 8;
    if (slip.expiresAt) {
      fuse = scene.add.rectangle(4, h - 3, fuseW, 1, paint("red.mid")).setOrigin(0);
      root.add(fuse);
    }
    const now = Date.now();
    const until = slip.expiresAt ?? now + (slip.ttl ?? 9000);
    const clock = slip.since !== undefined ? sub : undefined;
    const shown = { slip, root, w, h, fuse, fuseW, until, start: old?.start ?? now, clock };
    if (old) this.shown.splice(before, 0, shown);
    else this.shown.unshift(shown);
    const sw = this.scene.scale.width;
    root.setPosition(was?.x ?? sw + 4, was?.y ?? this.top);
    if (this.hidden) root.setAlpha(0);
    else if (!was) sound("toast");
    while (this.shown.length > MAX) {
      const last = this.shown.at(-1);
      if (last) this.drop(last.slip.key);
    }
    this.layout();
  }

  /** Takes a slip down, as when its offer was answered elsewhere. */
  drop(key: string, now = false): void {
    const i = this.shown.findIndex((s) => s.slip.key === key);
    if (i < 0) return;
    const [s] = this.shown.splice(i, 1);
    if (!s) return;
    if (now) s.root.destroy();
    else {
      const sw = this.scene.scale.width;
      slide(s.root, { x: sw + 4, y: s.root.y }, 140);
      fade(s.root, 0, 140, () => s.root.destroy());
    }
    this.layout();
  }

  has(key: string): boolean {
    return this.shown.some((s) => s.slip.key === key);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    for (const s of this.shown) s.root.destroy();
    this.shown.length = 0;
  }

  private layout(): void {
    let y = this.top;
    for (const s of this.shown) {
      const x = this.scene.scale.width - s.w - 6;
      slide(s.root, { x, y }, 160);
      y += s.h + 3;
    }
  }

  private tick(): void {
    const now = Date.now();
    for (const s of [...this.shown]) {
      if (s.fuse) {
        const k = Phaser.Math.Clamp((s.until - now) / Math.max(1, s.until - s.start), 0, 1);
        s.fuse.width = Math.round(s.fuseW * k);
      }
      if (s.clock && s.slip.since !== undefined) {
        const text = waited(s.slip.since, now);
        if (s.clock.obj.text !== text) s.clock.set(text);
      }
      if (now >= s.until) this.drop(s.slip.key);
    }
  }
}

/** `m:ss` since `since`. */
function waited(since: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
