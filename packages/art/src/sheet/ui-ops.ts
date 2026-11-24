/**
 * A screen as a list of draw operations on compiled atlas frames and bitmap fonts, so the page
 * and the static sheets draw exactly the same picture. Browser-safe.
 */
import type { BmFont } from "./bmfont.ts";

export type Op =
  | {
      readonly op: "fill";
      readonly color: string;
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }
  | {
      readonly op: "frame";
      readonly sprite: string;
      readonly frame: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly op: "slice";
      readonly sprite: string;
      readonly frame: string;
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }
  | {
      /** A rig look's frame without its ground shadow, top left at (x, y). */
      readonly op: "rig";
      readonly rig: string;
      readonly look: string;
      /** `down/idle0` */
      readonly key: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly op: "text";
      readonly font: string;
      readonly text: string;
      readonly x: number;
      readonly y: number;
      /** A palette name for tinted fonts. */
      readonly color?: string;
    };

/** What a layout may ask about the build. */
export interface Kit {
  readonly fonts: ReadonlyMap<string, BmFont>;
  /** Source size of a sprite, or undefined when the build has no such sprite. */
  size(sprite: string): readonly [number, number] | undefined;
  frames(sprite: string): readonly string[];
  /** Whether the build has this rig look. */
  hasLook(rig: string, look: string): boolean;
}

export interface Screen {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly ops: readonly Op[];
}

/** Nine-slice source and destination rectangles, shared by both renderers. */
export function sliceRects(
  src: readonly [number, number],
  [l, r, t, b]: readonly [number, number, number, number],
  w: number,
  h: number,
): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}[] {
  const [sw, sh] = src;
  const cols = [
    [0, l, 0, l],
    [l, sw - l - r, l, w - l - r],
    [sw - r, r, w - r, r],
  ] as const;
  const rows = [
    [0, t, 0, t],
    [t, sh - t - b, t, h - t - b],
    [sh - b, b, h - b, b],
  ] as const;
  const out = [];
  for (const [sy, shh, dy, dh] of rows) {
    for (const [sx, sww, dx, dw] of cols) {
      if (sww > 0 && shh > 0 && dw > 0 && dh > 0) {
        out.push({ sx, sy, sw: sww, sh: shh, dx, dy, dw, dh });
      }
    }
  }
  return out;
}
