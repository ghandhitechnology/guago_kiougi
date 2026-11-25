import * as Phaser from "phaser";
import type { Focusable, FocusCause, FocusScope, NavKey, Rect } from "./focus.ts";

/** What every widget is built with: its scene and the focus scope of its screen. */
export interface Ctx {
  readonly scene: Phaser.Scene;
  readonly scope: FocusScope;
}

/** Thumb-sized touch targets reach this far past a widget's drawn edge. */
export const TOUCH_PAD = 4;

/** True when the object and every container above it is visible. */
export function shown(obj: Phaser.GameObjects.GameObject): boolean {
  let o: Phaser.GameObjects.GameObject | null = obj;
  while (o) {
    if ((o as unknown as { visible?: boolean }).visible === false) return false;
    o = o.parentContainer;
  }
  return true;
}

/**
 * A focusable container with a hit zone a little larger than what it draws. Pointer hover moves
 * the screen's focus here, a press sinks it, and a release on it activates.
 */
export abstract class Widget extends Phaser.GameObjects.Container implements Focusable {
  readonly ctx: Ctx;
  readonly zone: Phaser.GameObjects.Zone;
  protected boxW: number;
  protected boxH: number;
  protected focused = false;
  protected pressed = false;
  private cause: FocusCause = "key";
  private live = true;

  constructor(ctx: Ctx, x: number, y: number, w: number, h: number, pad = TOUCH_PAD) {
    super(ctx.scene, Math.round(x), Math.round(y));
    ctx.scene.add.existing(this);
    this.ctx = ctx;
    this.boxW = w;
    this.boxH = h;
    this.zone = ctx.scene.add.zone(-pad, -pad, w + pad * 2, h + pad * 2).setOrigin(0);
    this.add(this.zone);
    this.zone.setInteractive({ useHandCursor: true });
    this.zone.on("pointerover", () => {
      if (this.enabled()) ctx.scope.focus(this, "pointer");
    });
    this.zone.on("pointerout", () => {
      if (ctx.scope.current === this && this.cause === "pointer") ctx.scope.blur();
      if (this.pressed) this.release(false);
    });
    this.zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.enabled()) return;
      ctx.scope.focus(this, "pointer");
      this.pressed = true;
      this.down(pointer);
    });
    this.zone.on("pointerup", () => {
      if (this.pressed) this.release(true);
    });
    ctx.scope.add(this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => ctx.scope.remove(this));
  }

  /**
   * The widget's own size, unscaled: what layout measures by. A page built while the notebook
   * turns is scaled to nothing, so world-space `bounds()` would measure it as zero wide.
   */
  size(): { w: number; h: number } {
    return { w: this.boxW, h: this.boxH };
  }

  /** Where the widget is on screen, scaled as drawn: for pointer and focus geometry. */
  bounds(): Rect {
    const m = this.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty, w: this.boxW * m.scaleX, h: this.boxH * m.scaleY };
  }

  enabled(): boolean {
    return this.live && shown(this);
  }

  setEnabled(on: boolean): this {
    this.live = on;
    if (!on && this.ctx.scope.current === this) this.ctx.scope.blur();
    this.refresh();
    return this;
  }

  get isEnabled(): boolean {
    return this.live;
  }

  setFocus(on: boolean, cause: FocusCause): void {
    this.focused = on;
    this.cause = cause;
    this.refresh();
  }

  /** Keyboard activation: the press shows for a moment, then the action runs. */
  activate(): void {
    this.down();
    this.pressed = true;
    this.scene.time.delayedCall(70, () => {
      if (this.pressed) this.release(true);
    });
  }

  nav?(key: NavKey): boolean;

  private release(fire: boolean): void {
    this.pressed = false;
    this.up();
    if (fire && this.enabled()) this.fire();
  }

  /** Draws the pressed state. */
  protected down(_pointer?: Phaser.Input.Pointer): void {}
  /** Draws the released state. */
  protected up(): void {}
  /** The action. */
  protected abstract fire(): void;
  /** Redraws for focus and enabled changes. */
  protected abstract refresh(): void;
}
