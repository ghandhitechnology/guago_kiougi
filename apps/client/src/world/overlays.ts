import * as Phaser from "phaser";
import { Label, measure, wrap } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import { worldView } from "./view.ts";

/**
 * What floats over the world: nameplates under everyone's feet, speech bubbles over their heads,
 * and the prompt over whatever is in reach. Drawn by the world scene's own camera above every
 * entity, so a plate never slips a pixel from the feet it belongs to.
 */

export type PlateKind = "self" | "player" | "npc";

/** Above every Y-sorted entity. */
const DEPTH = 1_000_000;
/** From the feet to a bubble's tail tip: a 24 px student and a little air. */
const HEAD = 29;
const BUBBLE_MAX_W = 104;
/** Older lines from the same speaker that stay up above the newest. */
const STACK = 2;
/** A head as bubbles keep clear of it: the width of a student's hair, feet to crown. */
const HEAD_W = 14;

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

interface Plate {
  readonly root: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.NineSlice;
  readonly label: Label;
  x: number;
  y: number;
}

interface Bubble {
  readonly root: Phaser.GameObjects.Container;
  readonly owner: string;
  readonly w: number;
  readonly h: number;
  /** Lift above the default spot, eased toward `lift`. */
  shown: number;
  lift: number;
  expires: number;
  leaving: boolean;
}

export class WorldOverlays {
  private readonly scene: Phaser.Scene;
  private readonly plates = new Map<string, Plate>();
  private readonly bubbles: Bubble[] = [];
  private prompt: Phaser.GameObjects.Image | undefined;
  private promptAt = { x: 0, y: 0 };
  private clock = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** A nameplate for someone, created or renamed. */
  plate(id: string, name: string, kind: PlateKind): void {
    let p = this.plates.get(id);
    if (!p) {
      const [l, r, t, b] = sliceOf("nameplate");
      const back = this.scene.add.nineslice(0, 0, "ui", "nameplate/idle", 10, 13, l, r, t, b);
      back.setOrigin(0);
      const color = kind === "npc" ? "gold.light" : "stone.bright";
      const label = new Label(this.scene, 3, 2, "", { font: "galmuri9", color });
      const root = this.scene.add.container(0, 0, [back, label.obj]).setDepth(DEPTH);
      if (kind !== "self") {
        back.setInteractive({ useHandCursor: true });
        back.on("pointerup", () => worldView.onNameTap?.(id, p?.label.obj.text ?? name, kind));
      }
      p = { root, back, label, x: 0, y: 0 };
      this.plates.set(id, p);
    }
    p.label.set(name);
    const w = p.label.width + 7;
    p.back.setSize(w, 13);
    p.label.at(-Math.ceil(w / 2) + 3, 2);
    p.back.setX(-Math.ceil(w / 2));
  }

  /** Where someone's feet are now. */
  move(id: string, x: number, y: number): void {
    const p = this.plates.get(id);
    if (!p) return;
    p.x = Math.round(x);
    p.y = Math.round(y);
    p.root.setPosition(p.x, p.y + 2);
  }

  remove(id: string): void {
    this.plates.get(id)?.root.destroy();
    this.plates.delete(id);
    for (const b of this.bubbles) if (b.owner === id) b.expires = 0;
  }

  /**
   * A line said aloud over someone's head. It stays long enough to read, then goes; a newer line
   * from the same person pushes theirs up, and bubbles from people standing close step aside.
   */
  say(id: string, text: string): void {
    const p = this.plates.get(id);
    if (!p) return;
    const lines = wrap(this.scene, "galmuri9", text, BUBBLE_MAX_W - 10).slice(0, 4);
    // A word the filter took out is a strip of ink where it stood, as in the chat log.
    const parts: Phaser.GameObjects.GameObject[] = [];
    let textW = 0;
    lines.forEach((line, row) => {
      const y = 4 + row * 13;
      let x = 5;
      for (const run of line.match(/\*+|[^*]+/g) ?? []) {
        if (run.startsWith("*")) {
          const rw = measure(this.scene, "galmuri9", run);
          parts.push(this.scene.add.rectangle(x, y + 2, rw, 7, paint("ink.light")).setOrigin(0));
          x += rw + 1;
          continue;
        }
        const label = new Label(this.scene, x, y, run, { font: "galmuri9", color: "ink.dark" });
        parts.push(label.obj);
        x += label.width + 1;
      }
      textW = Math.max(textW, x - 1 - 5);
    });
    const w = textW + 11;
    const h = lines.length * 13 + 5;
    const [l, r, t, b] = sliceOf("bubble");
    const back = this.scene.add.nineslice(0, 0, "ui", "bubble/idle", w, h, l, r, t, b).setOrigin(0);
    const tail = this.scene.add
      .image(Math.floor(w / 2) - 2, h - 1, "ui", "bubble-tail/idle")
      .setOrigin(0);
    const root = this.scene.add.container(0, 0, [back, tail, ...parts]).setDepth(DEPTH + 1);
    const chars = [...text].length;
    const bubble: Bubble = {
      root,
      owner: id,
      w,
      h,
      shown: 0,
      lift: 0,
      expires: this.clock + Math.min(7000, 2600 + chars * 70),
      leaving: false,
    };
    // Older lines from the same person rise above this one; the oldest beyond the stack goes.
    const mine = this.bubbles.filter((x) => x.owner === id && !x.leaving);
    for (const old of mine) old.lift += h + 2;
    mine.slice(0, Math.max(0, mine.length - (STACK - 1))).forEach((old) => {
      old.expires = Math.min(old.expires, this.clock + 400);
    });
    this.bubbles.push(bubble);
    root.setScale(0.6).setAlpha(0);
    this.scene.tweens.add({ targets: root, scale: 1, alpha: 1, duration: 120, ease: "Back.Out" });
    this.layoutBubble(bubble, p);
  }

  /** The prompt over the thing in reach, by kind (`talk`, `use`, `read`); `undefined` clears it. */
  showPrompt(at: { x: number; y: number; kind: "talk" | "use" | "read" } | undefined): void {
    if (!at) {
      const old = this.prompt;
      this.prompt = undefined;
      if (old)
        this.scene.tweens.add({
          targets: old,
          alpha: 0,
          y: old.y - 3,
          duration: 100,
          onComplete: () => old.destroy(),
        });
      return;
    }
    if (!this.prompt) {
      this.prompt = this.scene.add
        .image(0, 0, "ui", `prompt/${at.kind}`)
        .setOrigin(0.5, 1)
        .setDepth(DEPTH + 2);
      this.prompt.setScale(0.5).setAlpha(0);
      this.scene.tweens.add({
        targets: this.prompt,
        scale: 1,
        alpha: 1,
        duration: 120,
        ease: "Back.Out",
      });
    }
    this.prompt.setFrame(`prompt/${at.kind}`);
    this.promptAt = { x: Math.round(at.x), y: Math.round(at.y) };
  }

  private layoutBubble(b: Bubble, p: Plate): void {
    b.root.setPosition(p.x - Math.floor(b.w / 2), p.y - HEAD - b.h - Math.round(b.shown));
  }

  /**
   * Puts every bubble over its speaker so that none covers another person's head or another
   * bubble: oldest first, each newer one steps up above whatever it would cover. It glides to
   * its new height rather than jumping, so a crowd's bubbles settle instead of flickering.
   */
  private placeBubbles(delta: number): void {
    const heads = [...this.plates.entries()].map(([id, p]) => ({
      id,
      x: p.x - HEAD_W / 2,
      y: p.y - HEAD,
      w: HEAD_W,
      h: HEAD - 2,
    }));
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const glide = Math.min(1, delta / 70);
    for (const b of this.bubbles) {
      if (b.leaving) continue;
      const p = this.plates.get(b.owner);
      if (!p) continue;
      b.shown += (b.lift - b.shown) * Math.min(1, delta / 80);
      const x = p.x - Math.floor(b.w / 2);
      let y = p.y - HEAD - b.h - Math.round(b.shown);
      const box = () => ({ x, y, w: b.w, h: b.h });
      for (let tries = 0; tries < 24; tries++) {
        const hit =
          heads.find((h) => h.id !== b.owner && overlaps(box(), h)) ??
          placed.find((r) => overlaps(box(), r));
        if (!hit) break;
        y = hit.y - b.h - 2;
      }
      placed.push(box());
      const settled = Math.abs(b.root.y - y) < 0.5 || b.root.alpha === 0;
      b.root.setPosition(x, settled ? y : b.root.y + (y - b.root.y) * glide);
    }
  }

  private tick(_time: number, delta: number): void {
    this.clock += delta;
    if (this.prompt) {
      const bob = Math.sin(this.clock / 260) > 0 ? 0 : 1;
      this.prompt.setPosition(this.promptAt.x, this.promptAt.y - bob);
    }
    this.placeBubbles(delta);
    for (const b of [...this.bubbles]) {
      if (b.leaving || this.clock < b.expires) continue;
      b.leaving = true;
      this.scene.tweens.add({
        targets: b.root,
        alpha: 0,
        y: b.root.y - 4,
        duration: 260,
        onComplete: () => {
          b.root.destroy();
          const i = this.bubbles.indexOf(b);
          if (i >= 0) this.bubbles.splice(i, 1);
        },
      });
    }
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    for (const p of this.plates.values()) p.root.destroy();
    this.plates.clear();
    for (const b of this.bubbles) b.root.destroy();
    this.bubbles.length = 0;
    this.prompt?.destroy();
  }
}
