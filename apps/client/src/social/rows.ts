import type { Major } from "@guago/shared";
import type * as Phaser from "phaser";
import type { RowCtx } from "../ui/list.ts";
import { Label } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";

/**
 * Drawing helpers for social list rows: words, a major's emblem, an online pin, and the small
 * verbs at a row's right end that act on it.
 */

export function text(
  into: Phaser.GameObjects.Container,
  x: number,
  y: number,
  value: string,
  color = "ink.dark",
  font: "galmuri9" | "galmuri11" | "galmuri11-bold" = "galmuri11",
): Label {
  const label = new Label(into.scene, x, y, value, { font, color });
  into.add(label.obj);
  return label;
}

/** The major's emblem, 16×16, standing for the class. */
export function majorIcon(
  into: Phaser.GameObjects.Container,
  x: number,
  y: number,
  major: Major | string,
): void {
  into.add(into.scene.add.image(x, y, "ui", `emblem/${major}`).setOrigin(0));
}

/** A pin: blue for someone in school now, an empty ring of ink for someone away. */
export function presencePin(
  into: Phaser.GameObjects.Container,
  x: number,
  y: number,
  online: boolean,
): void {
  if (online) into.add(into.scene.add.image(x, y, "ui", "pin/player").setOrigin(0));
  else {
    const g = into.scene.add.graphics();
    g.lineStyle(1, paint("stone.light"));
    g.strokeRect(x + 0.5, y + 0.5, 4, 4);
    into.add(g);
  }
}

/**
 * Verbs laid right to left from `right`, each a tap zone on the row. The row's focus shows them
 * in ink; otherwise they wait in pencil grey.
 */
export function verbs(
  into: Phaser.GameObjects.Container,
  ctx: RowCtx,
  right: number,
  y: number,
  list: readonly { label: string; run: () => void; strong?: boolean }[],
): number {
  let x = right;
  for (const v of [...list].reverse()) {
    const label = new Label(into.scene, 0, y, v.label, {
      font: "galmuri9",
      color: v.strong ? "red.mid" : ctx.focused ? "navy.mid" : "stone.dark",
    });
    x -= label.width;
    label.at(x, y);
    into.add(label.obj);
    ctx.zone(x - 3, 0, label.width + 6, 18, v.run);
    x -= 9;
  }
  return x;
}
