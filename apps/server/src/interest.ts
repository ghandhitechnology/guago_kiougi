import type { Schema } from "@colyseus/schema";
import { INTEREST_CELL_TILES, TILE_SIZE } from "@guago/shared";

/**
 * How far past the side of its 3×3 cells a client still has things added. The screen reaches
 * 240 px to each side of the player plus the camera's lean, a sprite pokes out half its width
 * past its feet, and the server holds the player a few pixels behind where its own client draws
 * it; the cells' minimum 256 px is short of that by about this much. Above and below there is
 * room to spare.
 */
export const VIEW_MARGIN_X = 24;
/** How much further than where it was added an entity must go before it is taken out again. */
export const VIEW_HYSTERESIS = 16;

/** What the grid needs of a client's view: a Colyseus StateView, or a stand-in in tests. */
export interface ViewLike<E> {
  add(entity: E): unknown;
  remove(entity: E): unknown;
  has(entity: E): boolean;
}

/** A client's window on the map: its view and the cell its player stands in. */
export interface Viewer<E = Schema> {
  readonly view: ViewLike<E>;
  cell: number | undefined;
}

interface Placed {
  x: number;
  y: number;
  cell: number;
  /** Near a cell edge, where a view's verdict on it can change. */
  edgy: boolean;
}

/**
 * Interest management (PLAN §19): the map is cut into cells of 16×16 tiles and a client sees
 * what stands in its own cell and the eight around it, widened by {@link VIEW_MARGIN_X} at the
 * sides so nothing pops in on screen. An entity leaves a view only once it is
 * {@link VIEW_HYSTERESIS} px further out than where it came in, so walking along an edge does not
 * flicker it in and out. Views are worked out again only when an entity changes cell or stands
 * near a cell edge, or when a client's player changes cell: a tick costs one cell lookup per
 * entity away from the edges.
 */
export class InterestGrid<E extends object = Schema> {
  private readonly cellPx = INTEREST_CELL_TILES * TILE_SIZE;
  private readonly cols: number;
  private readonly rows: number;
  private readonly members = new Map<number, Set<E>>();
  private readonly placed = new Map<E, Placed>();
  /** Viewers by the cell they stand in. */
  private readonly watchers = new Map<number, Set<Viewer<E>>>();
  /** What each viewer was given by the grid, and who holds each entity. */
  private readonly shown = new Map<Viewer<E>, Set<E>>();
  private readonly shownBy = new Map<E, Set<Viewer<E>>>();
  /** Entities added to or removed from a view since the grid was made; each add resends the entity in full. */
  changes = 0;

  constructor(widthPx: number, heightPx: number) {
    this.cols = Math.max(1, Math.ceil(widthPx / this.cellPx));
    this.rows = Math.max(1, Math.ceil(heightPx / this.cellPx));
  }

  get cellCount(): number {
    return this.cols * this.rows;
  }

  private cellAt(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellPx)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellPx)));
    return cy * this.cols + cx;
  }

  /** Cells within `reach` cells of `cell` on both axes. */
  private around(cell: number, reach: number): number[] {
    const cx = cell % this.cols;
    const cy = (cell - cx) / this.cols;
    const out: number[] = [];
    for (let y = Math.max(0, cy - reach); y <= Math.min(this.rows - 1, cy + reach); y++) {
      for (let x = Math.max(0, cx - reach); x <= Math.min(this.cols - 1, cx + reach); x++) {
        out.push(y * this.cols + x);
      }
    }
    return out;
  }

  /** How far (x, y) lies outside the 3×3 cells around `cell`, per axis; 0 inside. */
  private outside(cell: number, x: number, y: number): [number, number] {
    const cx = cell % this.cols;
    const cy = (cell - cx) / this.cols;
    const left = (cx - 1) * this.cellPx;
    const right = (cx + 2) * this.cellPx;
    const top = (cy - 1) * this.cellPx;
    const bottom = (cy + 2) * this.cellPx;
    return [Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom)];
  }

  /** Whether (x, y) is close enough to a cell edge that some view's verdict could be changing. */
  private nearEdge(x: number, y: number): boolean {
    const fx = x - Math.floor(x / this.cellPx) * this.cellPx;
    const fy = y - Math.floor(y / this.cellPx) * this.cellPx;
    const bx = VIEW_MARGIN_X + VIEW_HYSTERESIS;
    return (
      fx <= bx ||
      fx >= this.cellPx - bx ||
      fy <= VIEW_HYSTERESIS ||
      fy >= this.cellPx - VIEW_HYSTERESIS
    );
  }

  /** Adds `entity` to the viewer's view, keeps it, or takes it out, from where both stand. */
  private judge(viewer: Viewer<E>, entity: E, at: Placed): void {
    if (viewer.cell === undefined) return;
    const [ox, oy] = this.outside(viewer.cell, at.x, at.y);
    const shown = this.shown.get(viewer);
    const has = shown?.has(entity) ?? false;
    if (!has && ox <= VIEW_MARGIN_X && oy === 0) this.show(viewer, entity);
    else if (has && (ox > VIEW_MARGIN_X + VIEW_HYSTERESIS || oy > VIEW_HYSTERESIS))
      this.hide(viewer, entity);
  }

  private show(viewer: Viewer<E>, entity: E): void {
    let shown = this.shown.get(viewer);
    if (!shown) {
      shown = new Set();
      this.shown.set(viewer, shown);
    }
    shown.add(entity);
    let by = this.shownBy.get(entity);
    if (!by) {
      by = new Set();
      this.shownBy.set(entity, by);
    }
    by.add(viewer);
    // The player's own body is in its view already, carrying the owner's fields.
    if (!viewer.view.has(entity)) {
      viewer.view.add(entity);
      this.changes++;
    }
  }

  private hide(viewer: Viewer<E>, entity: E): void {
    this.shown.get(viewer)?.delete(entity);
    this.shownBy.get(entity)?.delete(viewer);
    if (viewer.view.has(entity)) {
      viewer.view.remove(entity);
      this.changes++;
    }
  }

  /**
   * Puts an entity at (x, y), updating the views that gain or lose it. Returns its new cell when
   * it changed, so a viewer standing on this entity can follow.
   */
  place(entity: E, x: number, y: number): number | undefined {
    const before = this.placed.get(entity);
    const cell = this.cellAt(x, y);
    const moved = before === undefined || before.cell !== cell;
    const at: Placed = { x, y, cell, edgy: this.nearEdge(x, y) };
    this.placed.set(entity, at);
    if (moved) {
      if (before) this.members.get(before.cell)?.delete(entity);
      let set = this.members.get(cell);
      if (!set) {
        set = new Set();
        this.members.set(cell, set);
      }
      set.add(entity);
    } else if (!at.edgy && !before.edgy) {
      // Judged once more on the tick it leaves the band, which it may have stepped across.
      return undefined;
    }
    const judged = new Set<Viewer<E>>(this.shownBy.get(entity));
    for (const c of this.around(cell, 2)) for (const v of this.watchers.get(c) ?? []) judged.add(v);
    for (const viewer of judged) this.judge(viewer, entity, at);
    return moved ? cell : undefined;
  }

  /** Takes an entity off the grid and out of every view holding it. */
  remove(entity: E): void {
    const at = this.placed.get(entity);
    if (!at) return;
    this.members.get(at.cell)?.delete(entity);
    this.placed.delete(entity);
    for (const viewer of [...(this.shownBy.get(entity) ?? [])]) this.hide(viewer, entity);
    this.shownBy.delete(entity);
  }

  /** Centres a viewer on `cell` (undefined to stop watching), adding and removing what comes and goes. */
  watch(viewer: Viewer<E>, cell: number | undefined): void {
    const from = viewer.cell;
    if (from === cell) return;
    if (from !== undefined) this.watchers.get(from)?.delete(viewer);
    viewer.cell = cell;
    if (cell === undefined) {
      for (const e of [...(this.shown.get(viewer) ?? [])]) this.hide(viewer, e);
      this.shown.delete(viewer);
      return;
    }
    let set = this.watchers.get(cell);
    if (!set) {
      set = new Set();
      this.watchers.set(cell, set);
    }
    set.add(viewer);
    const judged = new Set<E>(this.shown.get(viewer));
    for (const c of this.around(cell, 2)) for (const e of this.members.get(c) ?? []) judged.add(e);
    for (const e of judged) {
      const at = this.placed.get(e);
      if (at) this.judge(viewer, e, at);
    }
  }

  /** The cell an entity is in. */
  cellOfEntity(entity: E): number | undefined {
    return this.placed.get(entity)?.cell;
  }
}
