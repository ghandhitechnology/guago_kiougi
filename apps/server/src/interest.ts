import type { Schema, StateView } from "@colyseus/schema";
import { INTEREST_CELL_TILES, TILE_SIZE } from "@guago/shared";

/** Pixels an entity must go past its cell's edge before it counts as in the next cell. */
const HYSTERESIS_PX = 8;

/** A client's window on the map: its view and the cell its player stands in. */
export interface Viewer {
  readonly view: StateView;
  cell: number | undefined;
}

/**
 * Interest management (PLAN §19): the map is cut into cells of 16×16 tiles and a client sees the
 * entities in its own cell and the eight around it. Views change only when an entity or a
 * viewer crosses into another cell, so the per-tick cost is one cell lookup per entity. An
 * entity walking along a cell edge does not flicker in and out of views: it changes cell only
 * once it is a few pixels past the edge.
 */
export class InterestGrid {
  private readonly cellPx = INTEREST_CELL_TILES * TILE_SIZE;
  private readonly cols: number;
  private readonly rows: number;
  private readonly members = new Map<number, Set<Schema>>();
  private readonly cellOf = new Map<Schema, number>();
  /** Viewers by the cell they stand in. */
  private readonly watchers = new Map<number, Set<Viewer>>();
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

  private near(a: number, b: number): boolean {
    const ax = a % this.cols;
    const bx = b % this.cols;
    return Math.abs(ax - bx) <= 1 && Math.abs((a - ax) / this.cols - (b - bx) / this.cols) <= 1;
  }

  /** The cell and the up to eight around it. */
  private around(cell: number): number[] {
    const cx = cell % this.cols;
    const cy = (cell - cx) / this.cols;
    const out: number[] = [];
    for (let y = Math.max(0, cy - 1); y <= Math.min(this.rows - 1, cy + 1); y++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(this.cols - 1, cx + 1); x++)
        out.push(y * this.cols + x);
    }
    return out;
  }

  /** Whether (x, y) is still within its cell, widened by the hysteresis band. */
  private holds(cell: number, x: number, y: number): boolean {
    const cx = cell % this.cols;
    const cy = (cell - cx) / this.cols;
    const m = HYSTERESIS_PX;
    return (
      x >= cx * this.cellPx - m &&
      x < (cx + 1) * this.cellPx + m &&
      y >= cy * this.cellPx - m &&
      y < (cy + 1) * this.cellPx + m
    );
  }

  /**
   * Puts an entity at (x, y), updating the views that gain or lose it. Returns its new cell when
   * it changed, so a viewer standing on this entity can follow.
   */
  place(entity: Schema, x: number, y: number): number | undefined {
    const from = this.cellOf.get(entity);
    if (from !== undefined && this.holds(from, x, y)) return undefined;
    const to = this.cellAt(x, y);
    if (from === to) return undefined;
    if (from !== undefined) this.members.get(from)?.delete(entity);
    let set = this.members.get(to);
    if (!set) {
      set = new Set();
      this.members.set(to, set);
    }
    set.add(entity);
    this.cellOf.set(entity, to);

    const touched = new Set<number>(this.around(to));
    if (from !== undefined) for (const c of this.around(from)) touched.add(c);
    for (const c of touched) {
      for (const viewer of this.watchers.get(c) ?? []) {
        const centre = viewer.cell as number;
        const was = from !== undefined && this.near(centre, from);
        const now = this.near(centre, to);
        if (was && !now && viewer.view.has(entity)) {
          viewer.view.remove(entity);
          this.changes++;
        } else if (now && !was && !viewer.view.has(entity)) {
          viewer.view.add(entity);
          this.changes++;
        }
      }
    }
    return to;
  }

  /** Takes an entity off the grid and out of every view holding it. */
  remove(entity: Schema): void {
    const cell = this.cellOf.get(entity);
    if (cell === undefined) return;
    this.members.get(cell)?.delete(entity);
    this.cellOf.delete(entity);
    for (const c of this.around(cell)) {
      for (const viewer of this.watchers.get(c) ?? []) {
        if (viewer.view.has(entity)) viewer.view.remove(entity);
      }
    }
  }

  /** Centres a viewer on `cell` (undefined to stop watching), adding and removing what comes and goes. */
  watch(viewer: Viewer, cell: number | undefined): void {
    const from = viewer.cell;
    if (from === cell) return;
    if (from !== undefined) {
      this.watchers.get(from)?.delete(viewer);
      for (const c of this.around(from)) {
        if (cell !== undefined && this.near(cell, c)) continue;
        for (const e of this.members.get(c) ?? []) {
          if (!viewer.view.has(e)) continue;
          viewer.view.remove(e);
          this.changes++;
        }
      }
    }
    viewer.cell = cell;
    if (cell === undefined) return;
    let set = this.watchers.get(cell);
    if (!set) {
      set = new Set();
      this.watchers.set(cell, set);
    }
    set.add(viewer);
    for (const c of this.around(cell)) {
      if (from !== undefined && this.near(from, c)) continue;
      for (const e of this.members.get(c) ?? []) {
        if (viewer.view.has(e)) continue;
        viewer.view.add(e);
        this.changes++;
      }
    }
  }

  /** The cell an entity is in. */
  cellOfEntity(entity: Schema): number | undefined {
    return this.cellOf.get(entity);
  }
}
