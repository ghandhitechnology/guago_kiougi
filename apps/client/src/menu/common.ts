import { narrative } from "@guago/content";
import * as Phaser from "phaser";
import { refusal, type Spoken } from "../copy/lines.ts";
import { amount } from "../items/catalog.ts";
import { inventory } from "../state/inventory.ts";
import { fade, slide } from "../ui/motion.ts";
import { Label, type LabelStyle, wrap } from "../ui/text.ts";
import type { OpCall } from "../world-link.ts";

/**
 * Pieces every notebook page shares: a line said in its speaker's voice right where it applies,
 * the wallet along the bottom of a page, and the hook that lets a page let go of what it watches
 * when the notebook turns away from it.
 */

const speakers = new Map(narrative.NARRATIVE.speakers.map((s) => [s.id, s]));

export function speakerName(voice: string): string {
  const s = speakers.get(voice);
  return s ? (narrative.NARRATIVE.ko[s.name] ?? "") : "";
}

/** A one-line label whose right edge sits at `right`. */
export function rightLabel(
  scene: Phaser.Scene,
  right: number,
  y: number,
  text: string,
  style: LabelStyle,
): Label {
  const l = new Label(scene, right, y, text, style);
  return l.at(right - l.width, y);
}

/** The line an operation's refusal is answered with; undefined for a dropped connection. */
export function opRefusal(r: OpCall): Spoken | undefined {
  if (r.ok || r.error === "offline" || r.error === "timeout") return undefined;
  return refusal("op", r.error);
}

/**
 * A line said on the page: the narrator's plain, anyone else's with their name before it. It
 * comes in with a nudge and leaves on its own after a while.
 */
export class SaidLine {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly w: number;
  private timer: Phaser.Time.TimerEvent | undefined;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
  ) {
    this.scene = scene;
    this.w = w;
    this.root = scene.add.container(x, y);
    parent.add(this.root);
  }

  say(line: Spoken | undefined, color = "ink.mid", ms = 4200): void {
    this.timer?.remove();
    this.root.removeAll(true);
    if (!line) return;
    let x = 0;
    if (line.voice !== "narrator") {
      const name = new Label(this.scene, 0, 0, speakerName(line.voice), {
        font: "galmuri9",
        color: "red.dark",
      });
      this.root.add(name.obj);
      x = name.width + 4;
    }
    const rows = wrap(this.scene, "galmuri9", line.text, this.w - x).slice(0, 2);
    const text = new Label(this.scene, x, 0, rows.join("\n"), {
      font: "galmuri9",
      color,
      leading: 1,
    });
    this.root.add(text.obj);
    const rest = { x: this.root.x, y: this.root.y };
    this.root.setAlpha(0).setX(rest.x + 3);
    slide(this.root, rest, 120);
    fade(this.root, 1, 120);
    this.timer = this.scene.time.delayedCall(ms, () => fade(this.root, 0, 300));
  }

  clear(): void {
    this.timer?.remove();
    this.root.removeAll(true);
  }
}

/** 솔방울, 상점 and 연구 토큰 along the bottom of a page, kept current. */
export function walletRow(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  which: readonly ("pinecone" | "merit" | "token")[] = ["pinecone", "merit", "token"],
): () => void {
  const root = scene.add.container(x, y);
  parent.add(root);
  const draw = () => {
    root.removeAll(true);
    let cx = 0;
    for (const c of which) {
      root.add(scene.add.image(cx, 0, "ui", `icon/${c}`).setOrigin(0));
      const v = new Label(scene, cx + 14, 2, amount(inventory.moneyText(c)), {
        font: "galmuri9",
        color: "ink.dark",
      });
      root.add(v.obj);
      cx += 14 + v.width + 10;
    }
  };
  const off = inventory.watch(() => draw());
  draw();
  return off;
}

/** Runs `fn` when `obj` goes, as a page's contents do when the notebook turns away. */
export function onGone(obj: Phaser.GameObjects.GameObject, fn: () => void): void {
  obj.once(Phaser.GameObjects.Events.DESTROY, fn);
}
