import { BL, BR, TL, TR } from "./dualgrid.ts";
import type { Legend, OverlayDef, OverlayPictures, TerrainDef } from "./format.ts";
import { ArtError, checkLegend, parseGrid } from "./grid.ts";
import { crop, type Indexed, indexed, stamp } from "./raster.ts";

export interface CompiledTone {
  readonly name: string;
  readonly on: "upper" | "lower";
  readonly band: readonly [number, number];
  /** Tile indices per mask 0 to 15. Mask 0 draws nothing and is empty. */
  readonly masks: readonly (readonly number[])[];
}

export interface CompiledTerrain {
  readonly kind: "terrain";
  readonly name: string;
  readonly upper: string;
  readonly lower: string;
  readonly themes: readonly string[] | null;
  /** Every distinct tile, 16×16. Pair tiles are opaque; tone tiles are overlays. */
  readonly tiles: readonly Indexed[];
  /** Tile indices per mask 0 to 15. */
  readonly masks: readonly (readonly number[])[];
  readonly tones: readonly CompiledTone[];
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

function list(src: string | readonly string[]): readonly string[] {
  return typeof src === "string" ? [src] : src;
}

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
    // Where the two corners meet, one can leave a lone pixel of the other's lip: clear it.
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) {
        const v = img.px[y * 16 + x] as number;
        if (v === 255 || img.lone[y * 16 + x]) continue;
        let paired = false;
        for (let dy = -1; dy <= 1 && !paired; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if ((dx || dy) && img.px[(y + dy) * 16 + x + dx] === v) paired = true;
        if (!paired) img.px[y * 16 + x] = 255;
      }
    }
    out[m] = img;
  }
  return out as Indexed[];
}

function same(a: Indexed, b: Indexed): boolean {
  return a.px.every((v, i) => v === b.px[i]);
}

/**
 * Where the upper picture covers part of a lower fill's mark (a pebble, a crack), the uncovered
 * scrap can be a single pixel, and so can a speck of ground pinched between the edge and a mark.
 * A lower pixel with no same-colour neighbour takes the colour most of its neighbours have.
 */
function trimCut(img: Indexed, top: Indexed): void {
  for (let y = 1; y < 15; y++) {
    for (let x = 1; x < 15; x++) {
      const i = y * 16 + x;
      const v = img.px[i] as number;
      if (top.px[i] !== 255) continue;
      const around = new Map<number, number>();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = img.px[(y + dy) * 16 + x + dx] as number;
          if (dx || dy) around.set(n, (around.get(n) ?? 0) + 1);
        }
      }
      if (around.has(v)) continue;
      img.px[i] = [...around].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? v;
    }
  }
}

/** Adds a tile to a list unless an identical one is there. Returns its index. */
function adder(tiles: Indexed[]): (img: Indexed) => number {
  return (img) => {
    const found = tiles.findIndex((t) => same(t, img));
    if (found >= 0) return found;
    tiles.push(img);
    return tiles.length - 1;
  };
}

/** Parses every picture into per-mask layers, and the mask 15 fills (outer centres first). */
function cut(
  pics: OverlayPictures,
  grid: (src: string, label: string, w: number, h: number) => Indexed,
): { layers: Indexed[][]; fills: Indexed[] } {
  const outers = list(pics.outer).map((g, i) => grid(g, `outer ${i}`, 48, 48));
  const inners = list(pics.inner).map((g, i) => grid(g, `inner ${i}`, 32, 32));
  const n = Math.max(outers.length, inners.length);
  const layers = Array.from({ length: n }, (_, i) =>
    overlays(outers[i % outers.length] as Indexed, inners[i % inners.length] as Indexed),
  );
  const fills = [
    ...outers.map((o) => crop(o, 16, 16, 16, 16)),
    ...(pics.fill ?? []).map((g, i) => grid(g, `fill ${i}`, 16, 16)),
  ];
  return { layers, fills };
}

export interface CompiledOverlay {
  readonly kind: "overlay";
  readonly name: string;
  readonly themes: readonly string[] | null;
  /** Every distinct tile, 16×16, clear where nothing is drawn. */
  readonly tiles: readonly Indexed[];
  /** Per tile, 256 flags (row major) for the pixels inside the region; null without `inside`. */
  readonly shapes: readonly (Uint8Array | null)[];
  /** Tile indices per mask 0 to 15. Mask 0 draws nothing and is empty. */
  readonly masks: readonly (readonly number[])[];
}

/** Cuts overlay pictures into tiles, appending to `tiles`. Returns indices per mask. */
function cutOverlay(
  pics: OverlayPictures,
  palette: Legend,
  lone: string,
  where: string,
  tiles: Indexed[],
): number[][] {
  const grid = (src: string, label: string, w: number, h: number): Indexed =>
    parseGrid(src, palette, `${where} › ${label}`, { w, h }, lone);
  const { layers, fills } = cut(pics, grid);
  const add = adder(tiles);
  const masks: number[][] = [[]];
  for (let m = 1; m < 16; m++) {
    const found = (m === 15 ? fills : layers.map((l) => l[m] as Indexed)).map(add);
    masks.push([...new Set(found)]);
  }
  return masks;
}

export function compileOverlay(def: OverlayDef, name: string, where: string): CompiledOverlay {
  checkLegend(def.palette, where);
  const lone = def.lone ?? "";
  const grid = (src: string, label: string, w: number, h: number): Indexed =>
    parseGrid(src, def.palette, `${where} › ${label}`, { w, h }, lone);
  const look = cut(def, grid);
  // The shape: the same pictures read as inside (any colour) or not.
  const inside = def.inside;
  const shapeLegend: Legend = Object.fromEntries(
    Object.keys(def.palette).map((ch) => [ch, inside?.includes(ch) ? "ink.deep" : null]),
  );
  const form = inside
    ? cut(def, (src, label, w, h) => parseGrid(src, shapeLegend, `${where} › ${label}`, { w, h }))
    : null;
  const tiles: Indexed[] = [];
  const shapes: (Uint8Array | null)[] = [];
  const add = (img: Indexed, shape: Indexed | undefined): number => {
    const flags = shape ? shape.px.map((v) => (v === 255 ? 0 : 1)) : null;
    const found = tiles.findIndex(
      (t, i) =>
        same(t, img) && (flags ? (shapes[i] as Uint8Array).every((v, k) => v === flags[k]) : true),
    );
    if (found >= 0) return found;
    tiles.push(img);
    shapes.push(flags);
    return tiles.length - 1;
  };
  const masks: number[][] = [[]];
  for (let m = 1; m < 16; m++) {
    const imgs = m === 15 ? look.fills : look.layers.map((l) => l[m] as Indexed);
    const forms = form ? (m === 15 ? form.fills : form.layers.map((l) => l[m] as Indexed)) : [];
    masks.push([...new Set(imgs.map((img, k) => add(img, forms[k])))]);
  }
  return { kind: "overlay", name, themes: def.themes ?? null, tiles, shapes, masks };
}

export function compileTerrain(def: TerrainDef, name: string, where: string): CompiledTerrain {
  checkLegend(def.palette, where);
  const lone = def.lone ?? "";
  const grid = (src: string, label: string, w: number, h: number): Indexed =>
    parseGrid(src, def.palette, `${where} › ${label}`, { w, h }, lone);

  if (def.base.length === 0) throw new ArtError(where, "needs at least one base tile");
  const bases = def.base.map((g, i) => grid(g, `base ${i}`, 16, 16));
  const { layers, fills } = cut(def, grid);
  bases.forEach((b, i) => {
    if (b.px.includes(255))
      throw new ArtError(`${where} › base ${i}`, "base tiles must be fully opaque");
  });

  const tiles: Indexed[] = [];
  const add = adder(tiles);
  const masks: number[][] = [];
  for (let m = 0; m < 16; m++) {
    const tops =
      m === 15 ? fills : m === 0 ? [indexed(16, 16)] : layers.map((l) => l[m] as Indexed);
    const unders = m === 15 ? [bases[0] as Indexed] : bases;
    const list: number[] = [];
    for (const top of tops) {
      for (const under of unders) {
        const img = indexed(16, 16);
        stamp(img, under, 0, 0);
        stamp(img, top, 0, 0);
        trimCut(img, top);
        const i = add(img);
        if (!list.includes(i)) list.push(i);
      }
    }
    masks.push(list);
  }

  const tones = (def.tones ?? []).map((t) => {
    const [min, max] = t.band;
    if (!(min >= 0 && min < max && max <= 1))
      throw new ArtError(`${where} › tone ${t.name}`, "band must satisfy 0 <= min < max <= 1");
    const masks = cutOverlay(t, def.palette, lone, `${where} › tone ${t.name}`, tiles);
    return { name: t.name, on: t.on, band: t.band, masks };
  });

  const decals = Object.entries(def.decals ?? {}).map(([dn, d]) => {
    const img = parseGrid(d.grid, def.palette, `${where} › decal ${dn}`, {}, lone);
    if (img.w > 16 || img.h > 16)
      throw new ArtError(`${where} › decal ${dn}`, "is larger than 16×16");
    return { name: dn, on: d.on, density: d.density, img };
  });

  return {
    kind: "terrain",
    name,
    upper: def.upper,
    lower: def.lower,
    themes: def.themes ?? null,
    tiles,
    masks,
    tones,
    decals,
  };
}
