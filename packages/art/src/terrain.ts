import { BL, BR, TL, TR } from "./dualgrid.ts";
import type { TerrainDef } from "./format.ts";
import { ArtError, checkLegend, parseGrid } from "./grid.ts";
import { crop, type Indexed, indexed, stamp } from "./raster.ts";

export interface CompiledTerrain {
  readonly kind: "terrain";
  readonly name: string;
  readonly upper: string;
  readonly lower: string;
  /** Every distinct tile, 16×16 and opaque. */
  readonly tiles: readonly Indexed[];
  /** Tile indices per mask 0 to 15. */
  readonly masks: readonly (readonly number[])[];
  readonly decals: readonly {
    name: string;
    on: "upper" | "lower";
    density: number;
    img: Indexed;
  }[];
}

/** Masks of the outer picture's 3×3 tiles and the inner picture's 2×2 tiles. */
export const OUTER_MASKS = [
  [BR, BL | BR, BL],
  [TR | BR, 15, TL | BL],
  [TR, TL | TR, TL],
] as const;
export const INNER_MASKS = [
  [15 & ~BR, 15 & ~BL],
  [15 & ~TR, 15 & ~TL],
] as const;

/** Cuts the two pictures into one overlay per mask. Overlays are clear where lower shows. */
export function overlays(outer: Indexed, inner: Indexed): Indexed[] {
  const out: (Indexed | undefined)[] = new Array(16);
  out[0] = indexed(16, 16);
  OUTER_MASKS.forEach((row, ty) => {
    row.forEach((m, tx) => {
      out[m] = crop(outer, tx * 16, ty * 16, 16, 16);
    });
  });
  INNER_MASKS.forEach((row, ty) => {
    row.forEach((m, tx) => {
      out[m] = crop(inner, tx * 16, ty * 16, 16, 16);
    });
  });
  for (const [m, a, b] of [
    [TR | BL, TR, BL],
    [TL | BR, TL, BR],
  ] as const) {
    const img = indexed(16, 16);
    stamp(img, out[a] as Indexed, 0, 0);
    stamp(img, out[b] as Indexed, 0, 0);
    out[m] = img;
  }
  return out as Indexed[];
}

function same(a: Indexed, b: Indexed): boolean {
  return a.px.every((v, i) => v === b.px[i]);
}

export function compileTerrain(def: TerrainDef, name: string, where: string): CompiledTerrain {
  checkLegend(def.palette, where);
  const lone = def.lone ?? "";
  const grid = (src: string, label: string, w: number, h: number): Indexed =>
    parseGrid(src, def.palette, `${where} › ${label}`, { w, h }, lone);

  const outer = grid(def.outer, "outer", 48, 48);
  const inner = grid(def.inner, "inner", 32, 32);
  if (def.base.length === 0) throw new ArtError(where, "needs at least one base tile");
  const bases = def.base.map((g, i) => grid(g, `base ${i}`, 16, 16));
  const fills = [
    crop(outer, 16, 16, 16, 16),
    ...(def.fill ?? []).map((g, i) => grid(g, `fill ${i}`, 16, 16)),
  ];
  bases.forEach((b, i) => {
    if (b.px.includes(255))
      throw new ArtError(`${where} › base ${i}`, "base tiles must be fully opaque");
  });

  const layers = overlays(outer, inner);
  const tiles: Indexed[] = [];
  const add = (img: Indexed): number => {
    const found = tiles.findIndex((t) => same(t, img));
    if (found >= 0) return found;
    tiles.push(img);
    return tiles.length - 1;
  };
  const masks: number[][] = [];
  for (let m = 0; m < 16; m++) {
    const tops = m === 15 ? fills : [layers[m] as Indexed];
    const unders = m === 15 ? [bases[0] as Indexed] : bases;
    const list: number[] = [];
    for (const top of tops) {
      for (const under of unders) {
        const img = indexed(16, 16);
        stamp(img, under, 0, 0);
        stamp(img, top, 0, 0);
        const i = add(img);
        if (!list.includes(i)) list.push(i);
      }
    }
    masks.push(list);
  }

  const decals = Object.entries(def.decals ?? {}).map(([dn, d]) => {
    const img = parseGrid(d.grid, def.palette, `${where} › decal ${dn}`, {}, lone);
    if (img.w > 16 || img.h > 16)
      throw new ArtError(`${where} › decal ${dn}`, "is larger than 16×16");
    return { name: dn, on: d.on, density: d.density, img };
  });

  return { kind: "terrain", name, upper: def.upper, lower: def.lower, tiles, masks, decals };
}
