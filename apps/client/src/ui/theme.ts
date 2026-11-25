import type { ArtMetadata, FontMeta } from "@guago/art";

/** The art metadata, set once at boot so UI code can name palette colours and fonts. */
let art: ArtMetadata | undefined;

export function setUiArt(meta: ArtMetadata): void {
  art = meta;
}

export function uiArt(): ArtMetadata {
  if (!art) throw new Error("UI used before the art metadata loaded");
  return art;
}

/** A 해솔 64 colour by name (`ink.dark`) as a number for tints and fills. */
export function paint(name: string): number {
  const [ramp, step] = name.split(".");
  const hex = uiArt().palette.ramps[ramp ?? ""]?.[step ?? ""];
  if (!hex) throw new Error(`palette has no ${name}`);
  return Number.parseInt(hex.slice(1), 16);
}

export type FontKey = "galmuri11" | "galmuri11-bold" | "galmuri9";

export function fontMeta(font: FontKey): FontMeta {
  const meta = uiArt().fonts[font];
  if (!meta) throw new Error(`art has no font ${font}`);
  return meta;
}

/** Nine-slice insets of a UI sprite, from the kit's metadata. */
export function sliceOf(sprite: string): readonly [number, number, number, number] {
  const s = uiArt().sprites[sprite]?.slice;
  if (!s) throw new Error(`UI sprite ${sprite} has no slice`);
  return [s.left, s.right, s.top, s.bottom];
}

/** Colours the UI uses, by role. */
export const INK = "ink.dark";
export const INK_SOFT = "stone.dark";
export const PAPER = "stone.bright";
export const PEN = "red.mid";
export const MARKER = "gold.pale";
