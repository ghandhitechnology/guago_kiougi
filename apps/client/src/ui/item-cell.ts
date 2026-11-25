import * as Phaser from "phaser";
import { sound } from "./sound.ts";
import { Label } from "./text.ts";
import { type Ctx, Widget } from "./widget.ts";

/**
 * One item in a well on the page: the grade's frame (PLAN §8 colours), the icon, a stack count
 * bottom right and a short badge top left (`+7` for 필기). Hovering it or a long press on a phone
 * asks for its card; a press picks it; a drag carries it to wherever it may go.
 *
 * ```ts
 * const cell = new ItemCell(ctx, x, y, { onPress: () => pick(item), onPeek: (on) => card(on) });
 * cell.set({ icon: "book/wangdo", grade: 2, badge: "+7" });
 * ```
 */
export interface CellItem {
  /** A frame of the `ui` atlas, 16×16 or 12×12. */
  readonly icon: string;
  /** 0 to 4 draws the grade's frame; absent draws a plain well. */
  readonly grade?: number;
  readonly count?: number;
  readonly badge?: string;
  /** Worn: a small gold pin in the corner. */
  readonly worn?: boolean;
  /** Present but not usable here: drawn faded. */
  readonly dim?: boolean;
}

export interface ItemCellOptions {
  readonly onPress?: () => void;
  /** The card for this item should show (`true`) or go (`false`). */
  readonly onPeek?: (on: boolean) => void;
  /** A drag started from this cell; the grid or page carries it from here. */
  readonly onDragStart?: (pointer: Phaser.Input.Pointer) => void;
  /** Draws a lock instead of an empty well: a slot the player has not opened. */
  readonly locked?: boolean;
}

export const CELL = 24;
const GRADES = ["textbook", "reference", "advanced", "major", "original"] as const;
/** How long a finger rests before the card shows on a phone. */
const LONG_PRESS_MS = 380;

export class ItemCell extends Widget {
  private readonly back: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly countShadow: Label;
  private readonly countText: Label;
  private readonly badgeShadow: Label;
  private readonly badgeText: Label;
  private readonly pin: Phaser.GameObjects.Image;
  private readonly lock: Phaser.GameObjects.Image;
  private readonly opts: ItemCellOptions;
  private item: CellItem | undefined;
  private selected = false;
  private holdTimer: Phaser.Time.TimerEvent | undefined;
  private downAt: { x: number; y: number } | undefined;
  private peeking = false;
  /** The finger rested long enough to show the card: lifting it only hides the card. */
  private longPressed = false;

  constructor(ctx: Ctx, x: number, y: number, opts: ItemCellOptions = {}) {
    super(ctx, x, y, CELL, CELL, 1);
    this.opts = opts;
    const scene = ctx.scene;
    this.back = scene.add.image(0, 0, "ui", "item-empty/idle").setOrigin(0);
    this.icon = scene.add.image(CELL / 2, CELL / 2, "ui", "icon/page").setVisible(false);
    this.ring = scene.add.image(-4, -4, "ui", "item-select/idle").setOrigin(0).setVisible(false);
    this.countShadow = new Label(scene, 0, 0, "", { font: "galmuri9", color: "ink.deep" });
    this.countText = new Label(scene, 0, 0, "", { font: "galmuri9", color: "stone.bright" });
    this.badgeShadow = new Label(scene, 3, 3, "", { font: "galmuri9", color: "ink.deep" });
    this.badgeText = new Label(scene, 2, 2, "", { font: "galmuri9", color: "gold.light" });
    this.pin = scene.add
      .image(CELL - 6, 1, "ui", "pin/npc")
      .setOrigin(0)
      .setVisible(false);
    this.lock = scene.add.image(8, 7, "ui", "lock/idle").setOrigin(0).setVisible(!!opts.locked);
    this.add([
      this.back,
      this.icon,
      this.countShadow.obj,
      this.countText.obj,
      this.badgeShadow.obj,
      this.badgeText.obj,
      this.pin,
      this.lock,
      this.ring,
    ]);
    if (opts.locked) this.back.setFrame("item-empty/idle").setAlpha(0.6);
    this.zone.on("pointerover", (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.peek(true);
    });
    this.zone.on("pointerout", () => {
      this.cancelHold();
      this.peek(false);
    });
    this.zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y };
      this.longPressed = false;
      if (p.wasTouch && this.item) {
        this.holdTimer = scene.time.delayedCall(LONG_PRESS_MS, () => {
          this.longPressed = true;
          this.peek(true);
        });
      }
    });
    this.zone.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch && this.longPressed) this.peek(false);
    });
    this.zone.on("pointermove", (p: Phaser.Input.Pointer) => {
      const d = this.downAt;
      if (!d || !p.isDown || !this.item || !this.opts.onDragStart) return;
      if (Math.hypot(p.x - d.x, p.y - d.y) > 5) {
        this.cancelHold();
        this.downAt = undefined;
        this.pressed = false;
        this.opts.onDragStart(p);
      }
    });
  }

  get value(): CellItem | undefined {
    return this.item;
  }

  set(item: CellItem | undefined): this {
    this.item = item;
    const locked = !!this.opts.locked;
    const g = item?.grade;
    this.back.setFrame(
      g !== undefined && !locked ? `item/${GRADES[g] ?? "textbook"}` : "item-empty/idle",
    );
    this.icon.setVisible(!!item && !locked);
    // Icon frames carry their own pivot; the well wants them centred.
    if (item)
      this.icon
        .setFrame(item.icon)
        .setOrigin(0.5)
        .setAlpha(item.dim ? 0.4 : 1);
    const count = item?.count !== undefined && item.count > 1 ? String(item.count) : "";
    this.countText.set(count);
    this.countShadow.set(count);
    const cw = this.countText.width;
    this.countText.at(CELL - 2 - cw, CELL - 9);
    this.countShadow.at(CELL - 1 - cw, CELL - 8);
    this.badgeText.set(item?.badge ?? "");
    this.badgeShadow.set(item?.badge ?? "");
    this.pin.setVisible(!!item?.worn);
    this.lock.setVisible(locked);
    return this;
  }

  /** Ringed: the item the inspector is showing. */
  setSelected(on: boolean): void {
    this.selected = on;
    this.refresh();
  }

  protected override down(): void {
    this.back.y = 1;
    this.icon.y = CELL / 2 + 1;
  }

  protected override up(): void {
    this.back.y = 0;
    this.icon.y = CELL / 2;
    this.cancelHold();
  }

  protected fire(): void {
    // A long press that showed the card is a look, not a pick.
    if (this.longPressed) {
      this.longPressed = false;
      return;
    }
    if (this.opts.locked) {
      sound("error");
      return;
    }
    if (!this.item && !this.opts.onPress) return;
    sound("select");
    this.opts.onPress?.();
  }

  protected refresh(): void {
    this.ring.setVisible(this.selected || (this.focused && this.isEnabled && !!this.item));
    this.ring.setAlpha(this.selected ? 1 : 0.55);
  }

  private peek(on: boolean): void {
    if (on === this.peeking) return;
    if (on && !this.item) return;
    this.peeking = on;
    this.opts.onPeek?.(on);
  }

  private cancelHold(): void {
    this.holdTimer?.remove();
    this.holdTimer = undefined;
  }

  override destroy(fromScene?: boolean): void {
    this.cancelHold();
    super.destroy(fromScene);
  }
}

/** The ghost of an item while it is dragged: its icon under the finger, slightly lifted. */
export function dragGhost(
  scene: Phaser.Scene,
  icon: string,
  pointer: Phaser.Input.Pointer,
  onDrop: (x: number, y: number) => void,
): void {
  const ghost = scene.add
    .image(pointer.x, pointer.y - 4, "ui", icon)
    .setDepth(5000)
    .setScale(1.25)
    .setAlpha(0.9);
  sound("select");
  const move = (p: Phaser.Input.Pointer) => {
    if (p.id === pointer.id) ghost.setPosition(Math.round(p.x), Math.round(p.y) - 4);
  };
  const up = (p: Phaser.Input.Pointer) => {
    if (p.id !== pointer.id) return;
    scene.input.off(Phaser.Input.Events.POINTER_MOVE, move);
    scene.input.off(Phaser.Input.Events.POINTER_UP, up);
    scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
    ghost.destroy();
    onDrop(p.x, p.y);
  };
  scene.input.on(Phaser.Input.Events.POINTER_MOVE, move);
  scene.input.on(Phaser.Input.Events.POINTER_UP, up);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
}
