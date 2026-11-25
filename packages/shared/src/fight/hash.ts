import { SPATIAL_HASH_CELL_PX } from "../constants.ts";

/**
 * A uniform grid of 32 px cells (PLAN §6) holding entity indices, rebuilt in one pass whenever
 * the entities have moved. Buckets are linked lists in typed arrays, so a rebuild or a query
 * allocates nothing. A query returns candidates from every cell the box touches; the caller
 * checks the real distance.
 */
export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  private readonly head: Int32Array;
  private next: Int32Array;

  constructor(widthPx: number, heightPx: number, capacity: number) {
    this.cols = Math.max(1, Math.ceil(widthPx / SPATIAL_HASH_CELL_PX));
    this.rows = Math.max(1, Math.ceil(heightPx / SPATIAL_HASH_CELL_PX));
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(capacity).fill(-1);
  }

  clear(): void {
    this.head.fill(-1);
  }

  insert(i: number, x: number, y: number): void {
    if (i >= this.next.length) {
      const grown = new Int32Array(Math.max(i + 1, this.next.length * 2)).fill(-1);
      grown.set(this.next);
      this.next = grown;
    }
    const c = this.cellAt(x, y);
    this.next[i] = this.head[c] as number;
    this.head[c] = i;
  }

  private cellAt(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / SPATIAL_HASH_CELL_PX)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / SPATIAL_HASH_CELL_PX)));
    return cy * this.cols + cx;
  }

  /**
   * Writes the indices in every cell overlapping the square of half-size `r` around (x, y) into
   * `out` from position 0, and returns how many. Stops quietly when `out` is full.
   */
  query(x: number, y: number, r: number, out: Int32Array): number {
    const S = SPATIAL_HASH_CELL_PX;
    const x0 = Math.max(0, Math.floor((x - r) / S));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r) / S));
    const y0 = Math.max(0, Math.floor((y - r) / S));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r) / S));
    let n = 0;
    const cap = out.length;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.head[cy * this.cols + cx] as number;
        while (i !== -1) {
          if (n === cap) return n;
          out[n++] = i;
          i = this.next[i] as number;
        }
      }
    }
    return n;
  }
}
