import * as Phaser from "phaser";
import type { NavKey } from "./focus.ts";
import { RedPen } from "./marks.ts";
import { slide } from "./motion.ts";
import { sound } from "./sound.ts";
import { sliceOf } from "./theme.ts";
import { type Ctx, Widget } from "./widget.ts";

/** One row of a list. It draws itself into the row's container and may take keys. */
export interface ListRow {
  /** Draws the row's content; the container is emptied before each call. */
  draw(into: Phaser.GameObjects.Container, w: number, h: number, ctx: RowCtx): void;
  left?(): void;
  right?(): void;
  activate?(): void;
}

export interface RowCtx {
  readonly scene: Phaser.Scene;
  /** Marks a hit zone inside the row: hovering it focuses the row, a tap runs `onTap`. */
  zone(x: number, y: number, w: number, h: number, onTap: () => void): void;
  readonly focused: boolean;
}

export interface ListOptions {
  readonly w: number;
  /** Rows on screen at once. */
  readonly visible: number;
  readonly rowH?: number;
  readonly rows: readonly ListRow[];
  /** The row ringed in red pen, for lists that are a choice. */
  readonly selected?: number;
}

const BAR_W = 5;

/**
 * Rows ruled on the page. The row under the cursor gets a highlighter pass, a chosen row a
 * red-pen loop. Longer lists scroll a whole row at a time, with an eraser for a scroll thumb.
 */
export class List extends Widget {
  private readonly opts: ListOptions;
  private readonly rowH: number;
  private readonly slots: Phaser.GameObjects.Container[] = [];
  private readonly backs: Phaser.GameObjects.NineSlice[] = [];
  private readonly pen: RedPen;
  private readonly thumb: Phaser.GameObjects.NineSlice | undefined;
  private rows: readonly ListRow[];
  private cursor = 0;
  private top = 0;
  private chosen: number | undefined;

  constructor(ctx: Ctx, x: number, y: number, opts: ListOptions) {
    const rowH = opts.rowH ?? 16;
    super(ctx, x, y, opts.w, opts.visible * rowH, 0);
    this.opts = opts;
    this.rowH = rowH;
    this.rows = opts.rows;
    this.chosen = opts.selected;
    this.zone.disableInteractive();
    const scene = ctx.scene;
    const scrolls = opts.rows.length > opts.visible;
    const rowW = opts.w - (scrolls ? BAR_W + 3 : 0);
    const [l, r, t, b] = sliceOf("row");
    for (let i = 0; i < opts.visible; i++) {
      const back = scene.add.nineslice(0, i * rowH, "ui", "row/idle", rowW, rowH, l, r, t, b);
      back.setOrigin(0);
      const slot = scene.add.container(0, i * rowH);
      this.backs.push(back);
      this.slots.push(slot);
      this.add([back, slot]);
    }
    this.pen = new RedPen(scene);
    this.add(this.pen.gfx);
    if (scrolls) {
      const [sl, sr, st, sb] = sliceOf("scroll-track");
      const track = scene.add
        .nineslice(opts.w - BAR_W, 0, "ui", "scroll-track/idle", BAR_W, this.boxH, sl, sr, st, sb)
        .setOrigin(0);
      const [tl, tr, tt, tb] = sliceOf("scroll-thumb");
      const th = Math.max(14, Math.round((this.boxH * opts.visible) / opts.rows.length));
      this.thumb = scene.add
        .nineslice(opts.w - BAR_W, 0, "ui", "scroll-thumb/idle", BAR_W, th, tl, tr, tt, tb)
        .setOrigin(0)
        .setInteractive({ draggable: true, useHandCursor: true });
      this.thumb.on("drag", (_p: Phaser.Input.Pointer, _x: number, dragY: number) => {
        const room = this.boxH - th;
        const k = room > 0 ? Phaser.Math.Clamp(dragY / room, 0, 1) : 0;
        this.scrollTo(Math.round(k * (this.rows.length - opts.visible)), false);
      });
      this.add([track, this.thumb]);
      const wheel = scene.add.zone(0, 0, opts.w, this.boxH).setOrigin(0).setInteractive();
      wheel.on("wheel", (_p: unknown, _dx: number, dy: number) =>
        this.scrollTo(this.top + Math.sign(dy)),
      );
      this.addAt(wheel, 0);
    }
    this.redraw();
  }

  setRows(rows: readonly ListRow[]): void {
    this.rows = rows;
    this.cursor = Math.min(this.cursor, rows.length - 1);
    this.redraw();
  }

  /** Rings a row in red pen, drawing the loop. */
  choose(index: number | undefined): void {
    this.chosen = index;
    this.placePen(true);
  }

  /** Redraws one row, after its value changed. */
  redrawRow(index: number): void {
    const slot = index - this.top;
    if (slot >= 0 && slot < this.slots.length) this.drawSlot(slot);
  }

  override nav(key: NavKey): boolean {
    const row = this.rows[this.cursor];
    switch (key) {
      case "up":
        if (this.cursor === 0) return false;
        this.moveCursor(this.cursor - 1);
        return true;
      case "down":
        if (this.cursor >= this.rows.length - 1) return false;
        this.moveCursor(this.cursor + 1);
        return true;
      case "left":
        if (!row?.left) return false;
        row.left();
        return true;
      case "right":
        if (!row?.right) return false;
        row.right();
        return true;
      default:
        return false;
    }
  }

  override activate(): void {
    this.rows[this.cursor]?.activate?.();
  }

  protected fire(): void {}

  protected refresh(): void {
    this.redraw();
  }

  private moveCursor(to: number): void {
    if (to === this.cursor) return;
    this.cursor = to;
    sound("hover");
    if (to < this.top) this.scrollTo(to);
    else if (to >= this.top + this.opts.visible) this.scrollTo(to - this.opts.visible + 1);
    else this.redraw();
  }

  private scrollTo(top: number, animate = true): void {
    const max = Math.max(0, this.rows.length - this.opts.visible);
    const next = Phaser.Math.Clamp(top, 0, max);
    if (next === this.top) return;
    this.top = next;
    if (this.cursor < next) this.cursor = next;
    if (this.cursor >= next + this.opts.visible) this.cursor = next + this.opts.visible - 1;
    this.redraw(animate);
  }

  private redraw(animate = false): void {
    for (let i = 0; i < this.slots.length; i++) this.drawSlot(i);
    if (this.thumb) {
      const room = this.boxH - this.thumb.height;
      const max = Math.max(1, this.rows.length - this.opts.visible);
      const to = { x: this.thumb.x, y: Math.round((room * this.top) / max) };
      if (animate) slide(this.thumb, to, 90);
      else this.thumb.setY(to.y);
    }
    this.placePen(false);
  }

  private drawSlot(slot: number): void {
    const index = this.top + slot;
    const row = this.rows[index];
    const into = this.slots[slot] as Phaser.GameObjects.Container;
    const back = this.backs[slot] as Phaser.GameObjects.NineSlice;
    into.removeAll(true);
    const lit = this.focused && index === this.cursor;
    back.setFrame(lit ? "row/hover" : "row/idle").setVisible(row !== undefined);
    if (!row) return;
    const scene = this.scene;
    row.draw(into, back.width, this.rowH, {
      scene,
      focused: lit,
      zone: (x, y, w, h, onTap) => {
        const z = scene.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
        z.on("pointerover", (p: Phaser.Input.Pointer) => {
          if (!this.enabled()) return;
          this.ctx.scope.focus(this, "pointer");
          if (this.cursor !== index) {
            this.cursor = index;
            // A finger lands and lifts at once: redrawing now would replace this zone before the
            // lift reaches it, so a touch redraws after the tap instead.
            if (!p.wasTouch) this.redraw();
          }
        });
        z.on("pointerup", (p: Phaser.Input.Pointer) => {
          if (!this.enabled()) return;
          onTap();
          if (p.wasTouch && this.active) this.redraw();
        });
        into.add(z);
      },
    });
  }

  private placePen(draw: boolean): void {
    const slot = this.chosen === undefined ? -1 : this.chosen - this.top;
    const back = this.backs[0];
    if (slot < 0 || slot >= this.slots.length || !back) {
      this.pen.hide(0);
      return;
    }
    this.pen.box(0, slot * this.rowH, back.width, this.rowH - 1);
    if (draw) {
      this.pen.hide(0);
      this.pen.show(140);
    } else this.pen.show(0);
  }
}
