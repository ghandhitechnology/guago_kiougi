import { crc32, deflateSync } from "node:zlib";
import { PNG } from "pngjs";
import { COLORS, hexToRgb } from "./palette.ts";

/** Transparent pixel in an indexed image. */
export const CLEAR = 255;

/**
 * An indexed image: each pixel is a palette index (0 to 63), a swap-slot key index (64 and up)
 * or CLEAR. `lone` marks pixels drawn with a legend character that may stand alone.
 */
export interface Indexed {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
  readonly lone: Uint8Array;
}

export function indexed(w: number, h: number): Indexed {
  return { w, h, px: new Uint8Array(w * h).fill(CLEAR), lone: new Uint8Array(w * h) };
}

/** Draws `src` onto `dst` at (x, y), skipping clear pixels and clipping to `dst`. */
export function stamp(dst: Indexed, src: Indexed, x: number, y: number, flipX = false): void {
  for (let sy = 0; sy < src.h; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= dst.h) continue;
    for (let sx = 0; sx < src.w; sx++) {
      const dx = x + (flipX ? src.w - 1 - sx : sx);
      if (dx < 0 || dx >= dst.w) continue;
      const s = sy * src.w + sx;
      const v = src.px[s] as number;
      if (v === CLEAR) continue;
      const d = dy * dst.w + dx;
      dst.px[d] = v;
      dst.lone[d] = src.lone[s] as number;
    }
  }
}

export function crop(src: Indexed, x: number, y: number, w: number, h: number): Indexed {
  const out = indexed(w, h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      const sy = y + yy;
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      out.px[yy * w + xx] = src.px[sy * src.w + sx] as number;
      out.lone[yy * w + xx] = src.lone[sy * src.w + sx] as number;
    }
  }
  return out;
}

export function remap(src: Indexed, map: ReadonlyMap<number, number>): Indexed {
  const px = src.px.map((v) => map.get(v) ?? v);
  return { w: src.w, h: src.h, px, lone: src.lone.slice() };
}

export function opaqueCount(img: Indexed): number {
  let n = 0;
  for (const v of img.px) if (v !== CLEAR) n++;
  return n;
}

/** Bounding box of the opaque pixels, or null when the image is empty. */
export function bounds(img: Indexed): { x: number; y: number; w: number; h: number } | null {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.px[y * img.w + x] === CLEAR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** RGBA lookup for every index: palette colours, then swap-slot keys appended by the caller. */
export type Lut = readonly (readonly [number, number, number])[];

export const PALETTE_LUT: Lut = COLORS.map(hexToRgb);

/** An RGBA canvas used for atlases and the static contact sheet. */
export class Rgba {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  rect(x: number, y: number, w: number, h: number, rgb: readonly number[]): void {
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
        const o = (yy * this.w + xx) * 4;
        this.data[o] = rgb[0] as number;
        this.data[o + 1] = rgb[1] as number;
        this.data[o + 2] = rgb[2] as number;
        this.data[o + 3] = 255;
      }
    }
  }

  /** Draws an indexed image scaled by an integer factor, nearest neighbour. */
  draw(img: Indexed, x: number, y: number, lut: Lut, scale = 1): void {
    for (let sy = 0; sy < img.h; sy++) {
      for (let sx = 0; sx < img.w; sx++) {
        const v = img.px[sy * img.w + sx] as number;
        if (v === CLEAR) continue;
        const c = lut[v];
        if (!c) throw new Error(`index ${v} has no colour`);
        this.rect(x + sx * scale, y + sy * scale, scale, scale, c);
      }
    }
  }

  /** Copies an RGBA region verbatim, including alpha. */
  copy(src: Rgba, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
    for (let y = 0; y < h; y++) {
      const from = ((sy + y) * src.w + sx) * 4;
      this.data.set(src.data.subarray(from, from + w * 4), ((dy + y) * this.w + dx) * 4);
    }
  }

  /**
   * The image as a PNG: indexed (a palette of the colours it uses, with transparency) when it
   * has 256 colours or fewer, as almost all art drawn to the 64-colour palette does, else RGBA.
   * Whichever file is smaller is kept.
   */
  png(): Buffer {
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    const rgba = PNG.sync.write(png, { colorType: 6, deflateLevel: 9, filterType: 4 });
    const pal = indexedPng(this.w, this.h, this.data);
    return pal && pal.length < rgba.length ? pal : rgba;
  }
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}

/**
 * Writes RGBA pixels as a palette PNG, or returns null past 256 colours. Fully clear pixels
 * share one entry; entries with any transparency come first so the tRNS chunk stays short. The
 * bit depth is the least that holds the palette.
 */
export function indexedPng(
  w: number,
  h: number,
  data: Uint8Array | Uint8ClampedArray,
): Buffer | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const keyAt = (i: number) => {
    const v = view.getUint32(i * 4, false);
    return (v & 255) === 0 ? 0 : v;
  };
  const seen = new Map<number, number>();
  for (let i = 0; i < w * h; i++) {
    const k = keyAt(i);
    if (!seen.has(k)) {
      if (seen.size === 256) return null;
      seen.set(k, 0);
    }
  }
  const keys = [...seen.keys()].sort((a, b) => (a & 255) - (b & 255) || a - b);
  for (const [n, k] of keys.entries()) seen.set(k, n);
  const depth = keys.length <= 2 ? 1 : keys.length <= 4 ? 2 : keys.length <= 16 ? 4 : 8;
  const perByte = 8 / depth;
  const stride = Math.ceil(w / perByte);
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (stride + 1);
    for (let x = 0; x < w; x++) {
      const n = seen.get(keyAt(y * w + x)) as number;
      const at = row + 1 + Math.floor(x / perByte);
      raw[at] = (raw[at] as number) | (n << (8 - depth - (x % perByte) * depth));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = depth;
  ihdr[9] = 3;
  const plte = Buffer.alloc(keys.length * 3);
  const alphas: number[] = [];
  keys.forEach((k, n) => {
    plte[n * 3] = (k >>> 24) & 255;
    plte[n * 3 + 1] = (k >>> 16) & 255;
    plte[n * 3 + 2] = (k >>> 8) & 255;
    if ((k & 255) < 255) alphas.push(k & 255);
  });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    ...(alphas.length ? [chunk("tRNS", Buffer.from(alphas))] : []),
    chunk("IDAT", deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Renders an indexed image into a fresh RGBA canvas at 1×. */
export function toRgba(img: Indexed, lut: Lut): Rgba {
  const out = new Rgba(img.w, img.h);
  out.draw(img, 0, 0, lut);
  return out;
}
