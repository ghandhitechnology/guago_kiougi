import type { Rect, Vec } from "./layers.ts";
import { fractal } from "./noise.ts";

/**
 * Value noise sampled on a turned, warped lattice: its contours wander at every angle instead of
 * running along the tile grid the way plain lattice noise does at large scales.
 */
function organic(x: number, y: number, scale: number, seed: number): number {
  const wx = x + (fractal(x, y, scale * 0.7, seed + 501) - 0.5) * scale * 0.9;
  const wy = y + (fractal(x, y, scale * 0.7, seed + 502) - 0.5) * scale * 0.9;
  return fractal(wx * 0.82 - wy * 0.57, wx * 0.57 + wy * 0.82, scale, seed);
}

/**
 * A terrain plan painted with shapes instead of typed by hand, for maps too large to type: one
 * legend character per tile, edited with rectangles, ragged ellipses and thick paths, then
 * printed as the `plan` string. Pure and seeded, so the same calls always paint the same plan.
 */
export class PlanGrid {
  readonly w: number;
  readonly h: number;
  private readonly cells: string[];

  constructor(w: number, h: number, fill: string) {
    this.w = w;
    this.h = h;
    this.cells = new Array<string>(w * h).fill(fill);
  }

  at(x: number, y: number): string | undefined {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return undefined;
    return this.cells[y * this.w + x];
  }

  /** Sets a tile; with `onto`, only a tile holding one of those characters. */
  set(x: number, y: number, ch: string, onto?: string): this {
    const cur = this.at(x, y);
    if (cur === undefined) return this;
    if (onto !== undefined && !onto.includes(cur)) return this;
    this.cells[y * this.w + x] = ch;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, ch: string, onto?: string): this {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ch, onto);
    return this;
  }

  /**
   * An ellipse whose edge wanders by up to `ragged` of its radius, by seeded noise about
   * `scale` tiles across, so no two blobs share an outline.
   */
  blob(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    ch: string,
    opt: { ragged?: number; seed?: number; scale?: number; onto?: string } = {},
  ): this {
    const ragged = opt.ragged ?? 0.25;
    const seed = opt.seed ?? 1;
    const scale = opt.scale ?? 3;
    for (let y = Math.floor(cy - ry * 1.5); y <= Math.ceil(cy + ry * 1.5); y++) {
      for (let x = Math.floor(cx - rx * 1.5); x <= Math.ceil(cx + rx * 1.5); x++) {
        const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
        const wobble = 1 + ragged * (fractal(x, y, scale, seed) * 2 - 1);
        if (d <= wobble) this.set(x, y, ch, opt.onto);
      }
    }
    return this;
  }

  /** A thick line through points, its half-width `width / 2` wandering by `ragged` tiles. */
  path(
    points: readonly Vec[],
    width: number,
    ch: string,
    opt: { ragged?: number; seed?: number; onto?: string } = {},
  ): this {
    const ragged = opt.ragged ?? 0.8;
    const seed = opt.seed ?? 2;
    for (let k = 0; k + 1 < points.length; k++) {
      const [x0, y0] = points[k] as Vec;
      const [x1, y1] = points[k + 1] as Vec;
      const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
      for (let t = 0; t <= len; t += 0.5) {
        const px = x0 + ((x1 - x0) * t) / len;
        const py = y0 + ((y1 - y0) * t) / len;
        const half = width / 2 + ragged * (fractal(px, py, 4, seed) * 2 - 1);
        for (let y = Math.floor(py - half); y <= Math.ceil(py + half); y++)
          for (let x = Math.floor(px - half); x <= Math.ceil(px + half); x++)
            if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= half) this.set(x, y, ch, opt.onto);
      }
    }
    return this;
  }

  /** Patches: tiles holding `on` become `to` where seeded noise reaches `threshold`. */
  patches(
    on: string,
    to: string,
    opt: { scale: number; threshold: number; seed: number; inside?: Rect },
  ): this {
    const r = opt.inside ?? { x: 0, y: 0, w: this.w, h: this.h };
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (organic(x, y, opt.scale, opt.seed) >= opt.threshold) this.set(x, y, to, on);
    return this;
  }

  /**
   * Frays the border between two grounds: every tile of `a` or `b` touching the other on a side
   * becomes one or the other by seeded noise, `passes` times, so no edge runs straight along the
   * grid. Both should be walkable, or both solid, or the walkable shape changes.
   */
  fray(a: string, b: string, opt: { seed: number; passes?: number; scale?: number }): this {
    const scale = opt.scale ?? 1.7;
    for (let pass = 0; pass < (opt.passes ?? 2); pass++) {
      const hits: [number, string][] = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const ch = this.at(x, y) as string;
          const mine = a.includes(ch) ? b : b.includes(ch) ? a : null;
          if (!mine) continue;
          const touches = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) =>
            mine.includes(this.at(x + (dx as number), y + (dy as number)) ?? "\0"),
          );
          if (!touches) continue;
          const v = fractal(x, y, scale, opt.seed + pass * 131);
          hits.push([y * this.w + x, v < 0.5 ? (a[0] as string) : (b[0] as string)]);
        }
      }
      for (const [i, ch] of hits) this.cells[i] = ch;
    }
    return this;
  }

  /**
   * Rounds the border between two grounds: each tile of `a` or `b` takes whichever of the two
   * holds most of its 3×3 block, `passes` times, so specks fill in and notches close and every
   * patch reads as a blob.
   */
  majority(a: string, b: string, passes = 2): this {
    for (let pass = 0; pass < passes; pass++) {
      const next = [...this.cells];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const ch = this.at(x, y) as string;
          if (!a.includes(ch) && !b.includes(ch)) continue;
          let na = 0;
          let nb = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const n = this.at(x + dx, y + dy);
              if (n === undefined) continue;
              if (a.includes(n)) na++;
              else if (b.includes(n)) nb++;
            }
          if (na > nb + 1 && !a.includes(ch)) next[y * this.w + x] = a[0] as string;
          else if (nb > na + 1 && !b.includes(ch)) next[y * this.w + x] = b[0] as string;
        }
      }
      this.cells.splice(0, this.cells.length, ...next);
    }
    return this;
  }

  /**
   * Tiles holding `a` with any of their eight neighbours holding `b` become `to`. Dual-grid
   * tiles draw one terrain pair, so two grounds without a pair never meet across a corner.
   */
  separate(a: string, b: string, to: string): this {
    const hits: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!a.includes(this.at(x, y) as string)) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if ((dx || dy) && b.includes(this.at(x + dx, y + dy) ?? "\0")) near = true;
        if (near) hits.push(y * this.w + x);
      }
    }
    for (const i of hits) this.cells[i] = to;
    return this;
  }

  /**
   * Squeezes closed: a walkable tile that is not part of any 2×2 walkable square takes the
   * solid character most of its neighbours hold. Repeats until none are left.
   */
  unsqueeze(walkable: string): this {
    const open = (x: number, y: number) => walkable.includes(this.at(x, y) ?? "\0");
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (!open(x, y)) continue;
          const fits = [
            [0, 0],
            [-1, 0],
            [0, -1],
            [-1, -1],
          ].some(
            ([dx, dy]) =>
              open(x + (dx as number), y + (dy as number)) &&
              open(x + (dx as number) + 1, y + (dy as number)) &&
              open(x + (dx as number), y + (dy as number) + 1) &&
              open(x + (dx as number) + 1, y + (dy as number) + 1),
          );
          if (fits) continue;
          const count = new Map<string, number>();
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const n = this.at(x + dx, y + dy);
            if (n !== undefined && !walkable.includes(n)) count.set(n, (count.get(n) ?? 0) + 1);
          }
          const best = [...count].sort((p, q) => q[1] - p[1])[0];
          if (best) {
            this.cells[y * this.w + x] = best[0];
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return this;
  }

  /**
   * Walkable tiles not connected to `from` become solid, each by `to` (walkable character to its
   * solid twin): no pocket is left that nobody reaches.
   */
  enclose(walkable: string, from: Vec, to: Readonly<Record<string, string>>): this {
    const seen = new Uint8Array(this.w * this.h);
    const open = (x: number, y: number) => walkable.includes(this.at(x, y) ?? "\0");
    const stack: Vec[] = [from];
    seen[from[1] * this.w + from[0]] = 1;
    while (stack.length > 0) {
      const [x, y] = stack.pop() as Vec;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (!open(nx, ny) || seen[ny * this.w + nx]) continue;
        seen[ny * this.w + nx] = 1;
        stack.push([nx, ny]);
      }
    }
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (open(x, y) && !seen[y * this.w + x]) {
          const i = y * this.w + x;
          this.cells[i] = to[this.cells[i] as string] ?? (this.cells[i] as string);
        }
    return this;
  }

  toString(): string {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++)
      rows.push(this.cells.slice(y * this.w, (y + 1) * this.w).join(""));
    return rows.join("\n");
  }
}
