import type * as Phaser from "phaser";
import { Button } from "./button.ts";
import { CELL, type CellItem, ItemCell } from "./item-cell.ts";
import { sound } from "./sound.ts";
import { Label } from "./text.ts";
import type { Ctx } from "./widget.ts";

/**
 * A page of item wells, `cols` × `rows`, with a pager under it when there is more than a page.
 * Arrow keys move between wells (the focus scope's own navigation), PageUp and PageDown or the
 * pager's arrows turn pages, and every well reports a pick, a peek and a drag.
 *
 * ```ts
 * const grid = new ItemGrid(ctx, x, y, { cols: 8, rows: 4, onPick: (i) => inspect(items[i]) });
 * grid.setItems(items.map(toCell));
 * ```
 */
export interface ItemGridOptions {
  readonly cols: number;
  readonly rows: number;
  /** Pixels between wells. */
  readonly gap?: number;
  readonly onPick?: (index: number) => void;
  readonly onPeek?: (index: number, on: boolean, cell: ItemCell) => void;
  readonly onDragStart?: (index: number, pointer: Phaser.Input.Pointer) => void;
}

export class ItemGrid {
  readonly root: Phaser.GameObjects.Container;
  private readonly ctx: Ctx;
  private readonly opts: ItemGridOptions;
  private readonly cells: ItemCell[] = [];
  private readonly prev: Button;
  private readonly next: Button;
  private readonly pageLabel: Label;
  private items: readonly CellItem[] = [];
  private page = 0;
  private selected: number | undefined;

  constructor(ctx: Ctx, x: number, y: number, opts: ItemGridOptions) {
    this.ctx = ctx;
    this.opts = opts;
    const scene = ctx.scene;
    const gap = opts.gap ?? 2;
    this.root = scene.add.container(x, y);
    for (let r = 0; r < opts.rows; r++) {
      for (let c = 0; c < opts.cols; c++) {
        const slot = r * opts.cols + c;
        const cell = new ItemCell(ctx, c * (CELL + gap), r * (CELL + gap), {
          onPress: () => this.pick(slot),
          onPeek: (on) => opts.onPeek?.(this.index(slot), on, cell),
          onDragStart: (p) => opts.onDragStart?.(this.index(slot), p),
        });
        this.cells.push(cell);
        this.root.add(cell);
      }
    }
    const h = opts.rows * (CELL + gap) - gap;
    const w = opts.cols * (CELL + gap) - gap;
    this.prev = new Button(ctx, 0, h + 4, {
      kind: "text",
      icon: "arrow/left",
      onPress: () => this.turn(-1),
      sound: "tab",
    });
    this.next = new Button(ctx, 0, h + 4, {
      kind: "text",
      icon: "arrow/right",
      onPress: () => this.turn(1),
      sound: "tab",
    });
    this.pageLabel = new Label(scene, 0, h + 6, "", { font: "galmuri9", color: "stone.dark" });
    this.root.add([this.prev, this.next, this.pageLabel.obj]);
    this.next.setX(w - this.next.size().w);
    this.layoutPager(w);
  }

  get size(): { w: number; h: number } {
    const gap = this.opts.gap ?? 2;
    return {
      w: this.opts.cols * (CELL + gap) - gap,
      h: this.opts.rows * (CELL + gap) - gap + (this.pages > 1 ? 16 : 0),
    };
  }

  private get perPage(): number {
    return this.opts.cols * this.opts.rows;
  }

  get pages(): number {
    return Math.max(1, Math.ceil(this.items.length / this.perPage));
  }

  /** The item index a well on this page shows. */
  private index(slot: number): number {
    return this.page * this.perPage + slot;
  }

  setItems(items: readonly CellItem[]): void {
    this.items = items;
    this.page = Math.min(this.page, this.pages - 1);
    this.draw();
  }

  /** Rings one item, turning to its page. */
  select(index: number | undefined): void {
    this.selected = index;
    if (index !== undefined) this.page = Math.floor(index / this.perPage);
    this.draw();
  }

  /** The well showing an item, for placing its card. */
  cellOf(index: number): ItemCell | undefined {
    const slot = index - this.page * this.perPage;
    return slot >= 0 && slot < this.perPage ? this.cells[slot] : undefined;
  }

  turn(by: number): void {
    const next = Math.max(0, Math.min(this.pages - 1, this.page + by));
    if (next === this.page) {
      sound("error");
      return;
    }
    this.page = next;
    this.draw();
  }

  private pick(slot: number): void {
    const i = this.index(slot);
    if (i >= this.items.length) return;
    this.opts.onPick?.(i);
  }

  private draw(): void {
    this.cells.forEach((cell, slot) => {
      const i = this.index(slot);
      cell.set(this.items[i]);
      cell.setSelected(this.selected === i);
    });
    const many = this.pages > 1;
    this.prev.setVisible(many).setEnabled(many && this.page > 0);
    this.next.setVisible(many).setEnabled(many && this.page < this.pages - 1);
    this.pageLabel.obj.setVisible(many);
    this.pageLabel.set(`${this.page + 1} / ${this.pages}`);
    const gap = this.opts.gap ?? 2;
    this.layoutPager(this.opts.cols * (CELL + gap) - gap);
  }

  private layoutPager(w: number): void {
    this.pageLabel.at(Math.round((w - this.pageLabel.width) / 2), this.pageLabel.obj.y + 2);
    const gap = this.opts.gap ?? 2;
    const h = this.opts.rows * (CELL + gap) - gap;
    this.pageLabel.at(Math.round((w - this.pageLabel.width) / 2), h + 6);
  }

  destroy(): void {
    this.root.destroy();
  }

  /** The scope this grid's wells answer to, for focusing the first one. */
  firstCell(): ItemCell | undefined {
    return this.cells[0];
  }

  get scope() {
    return this.ctx.scope;
  }
}
