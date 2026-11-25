import type * as Phaser from "phaser";
import { Button } from "./button.ts";
import { shake } from "./motion.ts";
import { Label } from "./text.ts";
import type { Ctx } from "./widget.ts";

/**
 * What an action costs and the one button that does it: each cost as its icon and amount, red
 * when the player holds less, and the button on the right, which stays dull until every cost is
 * met and while the request is out.
 *
 * ```ts
 * const row = new CostRow(ctx, x, y, w, { label: "필기", onPress: () => attempt() });
 * row.setCosts([{ icon: "icon/ink", need: 14, have: 30 }, { icon: "icon/pinecone", need: 152, have: 90 }]);
 * ```
 */
export interface Cost {
  /** A frame of the `ui` atlas, 12×12 or 16×16. */
  readonly icon: string;
  readonly need: number;
  readonly have: number;
  /** How to write the amount; plain thousands by default. */
  readonly text?: string;
}

export interface CostRowOptions {
  readonly label: string;
  readonly onPress: () => void;
  /** Ink for the action that moves the story on; paper for a plain one. */
  readonly kind?: "ink" | "paper";
  readonly w?: number;
}

export class CostRow {
  readonly root: Phaser.GameObjects.Container;
  readonly button: Button;
  private readonly scene: Phaser.Scene;
  private readonly costs: Phaser.GameObjects.Container;
  private met = true;
  private pending = false;
  private blocked = false;

  constructor(ctx: Ctx, x: number, y: number, w: number, opts: CostRowOptions) {
    this.scene = ctx.scene;
    this.root = ctx.scene.add.container(x, y);
    this.costs = ctx.scene.add.container(0, 0);
    this.button = new Button(ctx, 0, 0, {
      label: opts.label,
      kind: opts.kind ?? "ink",
      ...(opts.w === undefined ? {} : { w: opts.w }),
      h: 21,
      sound: "confirm",
      onPress: () => {
        if (this.met && !this.pending && !this.blocked) opts.onPress();
      },
    });
    this.button.setX(w - this.button.size().w);
    this.root.add([this.costs, this.button]);
  }

  /** The costs now; the button wakes once all are met. */
  setCosts(costs: readonly Cost[]): void {
    this.costs.removeAll(true);
    let x = 0;
    this.met = true;
    for (const c of costs) {
      const short = c.have < c.need;
      if (short) this.met = false;
      const frame = this.scene.textures.getFrame("ui", c.icon);
      const ih = frame?.height ?? 12;
      const icon = this.scene.add
        .image(x, Math.round((21 - ih) / 2) - 1, "ui", c.icon)
        .setOrigin(0);
      x += (frame?.width ?? 12) + 2;
      const amount = new Label(this.scene, x, 6, c.text ?? c.need.toLocaleString("en-US"), {
        font: "galmuri11",
        color: short ? "red.mid" : "ink.dark",
      });
      this.costs.add([icon, amount.obj]);
      x += amount.width + 8;
    }
    this.refresh();
  }

  /** While the request is out the button holds still; it cannot be pressed twice. */
  setPending(on: boolean): void {
    this.pending = on;
    this.refresh();
  }

  /** A rule outside the costs (no copies left, a slot not open) keeps the button down. */
  setBlocked(on: boolean): void {
    this.blocked = on;
    this.refresh();
  }

  /** The costs shake: what the player was short of. */
  refuse(): void {
    shake(this.costs, { x: 0, y: 0 });
  }

  private refresh(): void {
    this.button.setEnabled(this.met && !this.pending && !this.blocked);
    this.button.setAlpha(this.pending ? 0.7 : 1);
  }
}
