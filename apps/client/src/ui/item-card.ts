import * as Phaser from "phaser";
import { fade, slide } from "./motion.ts";
import { screen } from "./screen.ts";
import { Label, wrap } from "./text.ts";
import { paint, sliceOf } from "./theme.ts";

/**
 * What a player needs to decide about an item, and nothing else, on a sticky note: the name in
 * its grade's colour, one line of grade, level and 필기, the attack in one line with how it
 * compares to what is worn, and the evolution state. Materials and snacks get the name, the
 * count and their bag line.
 *
 * ```ts
 * card.show(cell.bounds(), { name, color, facts: ["심화서", "Lv 42", "필기 +7"], power: 812, delta: +64 });
 * card.hide();
 * ```
 */
export interface CardData {
  readonly name: string;
  /** A palette colour that reads on paper (`GRADE_INK` in items/catalog.ts). */
  readonly color?: string;
  /** Short facts on one line, joined with a dot. */
  readonly facts?: readonly string[];
  /** The attack in one line, for books. */
  readonly attack?: string;
  /** A number to compare, with its signed difference from the worn copy. */
  readonly power?: { readonly label: string; readonly value: string; readonly delta?: number };
  /** One line on the item: its bag text for materials, its evolution state for books. */
  readonly note?: string;
  readonly noteColor?: string;
}

const W = 150;

export class ItemCard {
  private readonly scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | undefined;
  private readonly depth: number;

  constructor(scene: Phaser.Scene, depth = 950) {
    this.scene = scene;
    this.depth = depth;
  }

  /** Sticks the card beside `at` (a screen rect), above it if there is room, else below. */
  show(at: { x: number; y: number; w: number; h: number }, d: CardData): void {
    this.hide(true);
    const s = this.scene;
    const parts: Phaser.GameObjects.GameObject[] = [];
    let y = 5;
    const name = new Label(s, 6, y, d.name, {
      font: "galmuri11-bold",
      color: d.color ?? "ink.dark",
      width: W - 12,
    });
    parts.push(name.obj);
    y += name.height + 2;
    if (d.facts && d.facts.length > 0) {
      const facts = new Label(s, 6, y, d.facts.join(" · "), { font: "galmuri9", color: "ink.mid" });
      parts.push(facts.obj);
      y += 12;
    }
    if (d.power) {
      const label = new Label(s, 6, y, d.power.label, { font: "galmuri9", color: "stone.dark" });
      const value = new Label(s, 6 + label.width + 4, y, d.power.value, {
        font: "galmuri9",
        color: "ink.dark",
      });
      parts.push(label.obj, value.obj);
      const delta = d.power.delta;
      if (delta !== undefined && delta !== 0) {
        const sign = delta > 0 ? "+" : "−";
        const dl = new Label(
          s,
          value.obj.x + value.width + 4,
          y,
          `${sign}${Math.abs(delta).toLocaleString("en-US")}`,
          {
            font: "galmuri9",
            color: delta > 0 ? "grass.dark" : "red.dark",
          },
        );
        parts.push(dl.obj);
      }
      y += 12;
    }
    if (d.attack) {
      const rows = wrap(s, "galmuri9", d.attack, W - 12).slice(0, 2);
      const attack = new Label(s, 6, y + 1, rows.join("\n"), {
        font: "galmuri9",
        color: "stone.dark",
        leading: 1,
      });
      parts.push(attack.obj);
      y += rows.length * 12 + 2;
    }
    if (d.note) {
      const rows = wrap(s, "galmuri9", d.note, W - 12).slice(0, 3);
      const note = new Label(s, 6, y + 1, rows.join("\n"), {
        font: "galmuri9",
        color: d.noteColor ?? "stone.dark",
        leading: 1,
      });
      parts.push(note.obj);
      y += rows.length * 12 + 2;
    }
    const h = y + 4;
    const [l, r, t, b] = sliceOf("tooltip");
    const paper = s.add.nineslice(0, 0, "ui", "tooltip/idle", W, h, l, r, t, b).setOrigin(0);
    const x = Phaser.Math.Clamp(Math.round(at.x + at.w / 2 - W / 2), 2, screen.w - W - 2);
    const above = at.y - h - 3;
    const top = above >= 2 ? above : Math.min(screen.h - h - 2, at.y + at.h + 3);
    const root = s.add
      .container(x, top - 3, [paper, ...parts])
      .setDepth(this.depth)
      .setAlpha(0);
    slide(root, { x, y: top }, 100);
    fade(root, 1, 100);
    this.root = root;
  }

  hide(now = false): void {
    const root = this.root;
    this.root = undefined;
    if (!root) return;
    if (now) root.destroy();
    else fade(root, 0, 70, () => root.destroy());
  }
}

/** A thin rule across a page, for separating a card's or a station's parts. */
export function rule(scene: Phaser.Scene, x: number, y: number, w: number) {
  return scene.add.rectangle(x, y, w, 1, paint("stone.light")).setOrigin(0);
}
