import { TILE_SIZE } from "../constants.ts";
import type { FightWorld } from "./world.ts";

const FAR = 0xffff;
/** Neighbour offsets: four sides, then four corners. */
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Distance in tiles from every tile monsters can walk to the nearest hunted player, by a
 * multi-source breadth-first search over the walkable tiles, and which player that is. Monsters
 * read the next tile downhill, so a horde walks around walls and buildings instead of pressing
 * into them. Corners are never cut. Players standing in a safe zone or knocked out are not hunted.
 */
export class FlowField {
  readonly dist: Uint16Array;
  readonly owner: Int16Array;
  private readonly queue: Int32Array;
  private readonly cols: number;
  private readonly rows: number;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.dist = new Uint16Array(cols * rows).fill(FAR);
    this.owner = new Int16Array(cols * rows).fill(-1);
    this.queue = new Int32Array(cols * rows);
  }

  build(w: FightWorld): void {
    const { cols, rows, dist, owner, queue } = this;
    const tiles = w.tiles;
    dist.fill(FAR);
    owner.fill(-1);
    let head = 0;
    let tail = 0;
    for (const p of w.players) {
      if (!p.joined || p.down) continue;
      const tx = Math.floor(p.x / TILE_SIZE);
      const ty = Math.floor(p.y / TILE_SIZE);
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
      const i = ty * cols + tx;
      if (tiles[i] !== 0 || dist[i] === 0) continue;
      dist[i] = 0;
      owner[i] = p.index;
      queue[tail++] = i;
    }
    while (head < tail) {
      const i = queue[head++] as number;
      const tx = i % cols;
      const ty = (i - tx) / cols;
      const d = (dist[i] as number) + 1;
      for (let k = 0; k < 8; k++) {
        const nx = tx + (NX[k] as number);
        const ny = ty + (NY[k] as number);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (tiles[j] !== 0 || (dist[j] as number) <= d) continue;
        if (k >= 4 && (tiles[ty * cols + nx] !== 0 || tiles[ny * cols + tx] !== 0)) continue;
        dist[j] = d;
        owner[j] = owner[i] as number;
        queue[tail++] = j;
      }
    }
  }

  /** The tile index at a point, or -1 outside. */
  tile(x: number, y: number): number {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return -1;
    return ty * this.cols + tx;
  }

  /**
   * The centre of the neighbouring tile one step nearer (`sign` 1) or farther (`sign` -1) from
   * the hunted players, written to `out`; false when there is no such step.
   */
  step(x: number, y: number, sign: 1 | -1, out: { x: number; y: number }): boolean {
    const i = this.tile(x, y);
    if (i < 0) return false;
    const { cols, rows, dist } = this;
    const here = dist[i] as number;
    if (here === FAR) return false;
    const tx = i % cols;
    const ty = (i - tx) / cols;
    let best = -1;
    let bestD = here;
    for (let k = 0; k < 8; k++) {
      const nx = tx + (NX[k] as number);
      const ny = ty + (NY[k] as number);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      const d = dist[j] as number;
      if (d === FAR) continue;
      if (k >= 4 && (dist[ty * cols + nx] === FAR || dist[ny * cols + tx] === FAR)) continue;
      if (sign === 1 ? d < bestD : d > bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0) return false;
    const bx = best % cols;
    out.x = (bx + 0.5) * TILE_SIZE;
    out.y = ((best - bx) / cols + 0.5) * TILE_SIZE;
    return true;
  }

  /** Tiles to the nearest hunted player along walkable ground, or `FAR`. */
  distanceAt(x: number, y: number): number {
    const i = this.tile(x, y);
    return i < 0 ? FAR : (this.dist[i] as number);
  }

  /** The hunted player nearest along the ground, or -1. */
  ownerAt(x: number, y: number): number {
    const i = this.tile(x, y);
    return i < 0 ? -1 : (this.owner[i] as number);
  }
}

export const FLOW_FAR = FAR;
