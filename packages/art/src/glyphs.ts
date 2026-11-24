import type { GlyphFontDef } from "./format.ts";
import { ArtError, checkLegend, parseGrid } from "./grid.ts";
import { resolveRemap } from "./palette.ts";
import { type Indexed, remap } from "./raster.ts";

export interface CompiledGlyphs {
  readonly kind: "glyphs";
  readonly name: string;
  readonly height: number;
  readonly base: number;
  readonly spacing: number;
  readonly space: number;
  /** One drawing per key, and the characters each key draws. */
  readonly glyphs: readonly { readonly chars: readonly string[]; readonly img: Indexed }[];
}

export function compileGlyphs(def: GlyphFontDef, name: string, where: string): CompiledGlyphs {
  checkLegend(def.palette, where);
  const map = resolveRemap(def.recolor ?? {});
  const seen = new Set<string>();
  const glyphs = Object.entries(def.glyphs).map(([key, grid]) => {
    const chars = [...key];
    for (const ch of chars) {
      if (ch === " ") throw new ArtError(where, "a space is set with `space`, not drawn");
      if (seen.has(ch)) throw new ArtError(where, `"${ch}" is drawn twice`);
      seen.add(ch);
    }
    const img = parseGrid(grid, def.palette, `${where} › "${key}"`, { h: def.height }, def.lone);
    return { chars, img: map.size > 0 ? remap(img, map) : img };
  });
  return {
    kind: "glyphs",
    name,
    height: def.height,
    base: def.base ?? def.height,
    spacing: def.spacing ?? 0,
    space: def.space ?? Math.floor(def.height / 2),
    glyphs,
  };
}
