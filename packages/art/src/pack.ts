export interface PackInput {
  readonly key: string;
  readonly w: number;
  readonly h: number;
}

export interface Packed {
  readonly w: number;
  readonly h: number;
  /** Top-left of each input by key. */
  readonly at: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
}

/**
 * Shelf packer. Rects go tallest first, left to right, `pad` pixels apart and from the edges.
 * The width is the smallest power of two from 64 to `max` that keeps the height within it.
 * Deterministic: ties break on key. Returns null when nothing fits in `max × max`.
 */
export function pack(rects: readonly PackInput[], max = 2048, pad = 1): Packed | null {
  const sorted = [...rects].sort((a, b) => b.h - a.h || b.w - a.w || (a.key < b.key ? -1 : 1));
  for (let w = 64; w <= max; w *= 2) {
    const at = new Map<string, { x: number; y: number }>();
    let x = pad;
    let y = pad;
    let shelf = 0;
    let fits = true;
    for (const r of sorted) {
      if (r.w + 2 * pad > w) {
        fits = false;
        break;
      }
      if (x + r.w + pad > w) {
        x = pad;
        y += shelf + pad;
        shelf = 0;
      }
      at.set(r.key, { x, y });
      x += r.w + pad;
      shelf = Math.max(shelf, r.h);
    }
    const h = y + shelf + pad;
    if (fits && h <= w) return { w, h, at };
  }
  return null;
}
