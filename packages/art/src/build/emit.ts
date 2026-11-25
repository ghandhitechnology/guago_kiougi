import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BuiltFont,
  buildFace,
  buildGlyphFont,
  FACES,
  FONT_DIR,
  writeFonts,
} from "../fonts.ts";
import type { Anim } from "../format.ts";
import type { ArtMetadata } from "../meta.ts";
import { pack } from "../pack.ts";
import {
  COLORS,
  colorIndex,
  INDEX_RGB,
  RAMP_LIST,
  rampEntries,
  resolveRemap,
  SHADE,
  SLOT_STEPS,
  SLOTS,
  THEMES,
} from "../palette.ts";
import { bounds, crop, type Indexed, Rgba, remap } from "../raster.ts";
import type { CompiledOverlay, CompiledTerrain } from "../terrain.ts";
import type { Compiled } from "./compile.ts";

export const MAX_ATLAS = 2048;
/** Tile atlases are a uniform grid: 16 px tiles with a 1 px extruded border each. */
export const TILE_GRID = { tile: 16, margin: 1, spacing: 2, columns: 16 } as const;

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pivot?: { x: number; y: number };
}

export interface Atlas {
  readonly name: string;
  readonly png: Rgba;
  readonly frames: Readonly<Record<string, AtlasFrame>>;
}

function phaserJson(atlas: Atlas): string {
  return `${JSON.stringify(
    {
      frames: atlas.frames,
      meta: {
        image: `${atlas.name}.png`,
        format: "RGBA8888",
        size: { w: atlas.png.w, h: atlas.png.h },
        scale: "1",
      },
    },
    null,
    1,
  )}\n`;
}

function signature(img: Indexed): string {
  return `${img.w}x${img.h}:${Buffer.from(img.px).toString("base64")}`;
}

interface Entry {
  key: string;
  img: Indexed;
  pivot?: readonly [number, number];
  /** Nine-slice frames keep their full size: Phaser's NineSlice cannot use trimmed frames. */
  whole?: boolean;
}

/** Trims, dedupes and shelf-packs sprite frames into one atlas. */
export function packSprites(name: string, entries: readonly Entry[]): Atlas {
  const unique = new Map<string, Indexed>();
  const placed = entries.map(({ key, img, pivot, whole }) => {
    const b = whole
      ? { x: 0, y: 0, w: img.w, h: img.h }
      : (bounds(img) ?? { x: 0, y: 0, w: 1, h: 1 });
    const trimmed = crop(img, b.x, b.y, b.w, b.h);
    const sig = signature(trimmed);
    if (!unique.has(sig)) unique.set(sig, trimmed);
    return { key, img, pivot, b, sig };
  });
  const sigs = [...unique.keys()].sort();
  const layout = pack(
    sigs.map((s) => ({ key: s, w: (unique.get(s) as Indexed).w, h: (unique.get(s) as Indexed).h })),
    MAX_ATLAS,
    1,
  );
  if (!layout)
    throw new Error(`atlas ${name} does not fit in ${MAX_ATLAS}×${MAX_ATLAS}; split the group`);
  const png = new Rgba(layout.w, layout.h);
  for (const s of sigs) {
    const at = layout.at.get(s) as { x: number; y: number };
    png.draw(unique.get(s) as Indexed, at.x, at.y, INDEX_RGB);
  }
  const frames: Record<string, AtlasFrame> = {};
  for (const p of [...placed].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const at = layout.at.get(p.sig) as { x: number; y: number };
    frames[p.key] = {
      frame: { x: at.x, y: at.y, w: p.b.w, h: p.b.h },
      rotated: false,
      trimmed: p.b.w !== p.img.w || p.b.h !== p.img.h,
      spriteSourceSize: p.b,
      sourceSize: { w: p.img.w, h: p.img.h },
      ...(p.pivot ? { pivot: { x: p.pivot[0] / p.img.w, y: p.pivot[1] / p.img.h } } : {}),
    };
  }
  return { name, png, frames };
}

/** Draws a tile with its edge pixels repeated one pixel outward, so sampling never bleeds. */
function drawExtruded(png: Rgba, img: Indexed, x: number, y: number, lut: typeof INDEX_RGB): void {
  for (let dy = -1; dy <= img.h; dy++) {
    for (let dx = -1; dx <= img.w; dx++) {
      const sx = Math.min(img.w - 1, Math.max(0, dx));
      const sy = Math.min(img.h - 1, Math.max(0, dy));
      const v = img.px[sy * img.w + sx] as number;
      if (v === 255) continue;
      png.rect(x + dx, y + dy, 1, 1, lut[v] as readonly number[]);
    }
  }
}

/** Art baked into the tile atlases: terrain pairs and overlays. */
export type TileArt = CompiledTerrain | CompiledOverlay;

export function isTileArt(a: Compiled): a is TileArt {
  return a.kind === "terrain" || a.kind === "overlay";
}

/**
 * Tile indices and decal frames, identical in every theme. Art baked into every theme comes
 * first and art with a `bake` list after it, so a theme that leaves the latter out ends its
 * atlas early without moving anyone's indices.
 */
export interface TileLayout {
  readonly first: ReadonlyMap<string, number>;
  readonly count: number;
}

const size = (t: TileArt): number => t.tiles.length + (t.kind === "terrain" ? t.decals.length : 0);

export function tileLayout(sets: readonly TileArt[]): TileLayout {
  const first = new Map<string, number>();
  let n = 0;
  for (const t of [...sets.filter((s) => !s.bake), ...sets.filter((s) => s.bake)]) {
    first.set(t.name, n);
    n += size(t);
  }
  return { first, count: n };
}

/** Whether a theme's atlas holds a set's tiles. */
export function bakedIn(t: TileArt, theme: string): boolean {
  return !t.bake || t.bake.includes(theme);
}

export function cellOf(index: number): { x: number; y: number } {
  const { tile, margin, spacing, columns } = TILE_GRID;
  return {
    x: margin + (index % columns) * (tile + spacing),
    y: margin + Math.floor(index / columns) * (tile + spacing),
  };
}

/** Bakes every terrain and overlay under one theme into a uniform tile-grid atlas. */
export function bakeTiles(themeName: string, terrains: readonly TileArt[]): Atlas {
  const theme = THEMES.find((t) => t.name === themeName);
  if (!theme) throw new Error(`unknown theme ${themeName}`);
  const map = resolveRemap(theme.remap);
  const layout = tileLayout(terrains);
  const { tile, spacing, columns } = TILE_GRID;
  const baked = terrains.filter((t) => bakedIn(t, themeName));
  const end = Math.max(0, ...baked.map((t) => (layout.first.get(t.name) as number) + size(t)));
  const rows = Math.max(1, Math.ceil(end / columns));
  const png = new Rgba(columns * (tile + spacing), rows * (tile + spacing));
  if (png.w > MAX_ATLAS || png.h > MAX_ATLAS)
    throw new Error(`tiles-${themeName} is larger than ${MAX_ATLAS}`);
  const frames: Record<string, AtlasFrame> = {};
  for (const t of baked) {
    const first = layout.first.get(t.name) as number;
    t.tiles.forEach((img, i) => {
      const at = cellOf(first + i);
      drawExtruded(png, remap(img, map), at.x, at.y, INDEX_RGB);
      frames[`${t.name}/${i}`] = {
        frame: { x: at.x, y: at.y, w: tile, h: tile },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: tile, h: tile },
        sourceSize: { w: tile, h: tile },
      };
    });
    if (t.kind === "overlay") continue;
    t.decals.forEach((d, i) => {
      const at = cellOf(first + t.tiles.length + i);
      png.draw(remap(d.img, map), at.x, at.y, INDEX_RGB);
      frames[`${t.name}/${d.name}`] = {
        frame: { x: at.x, y: at.y, w: d.img.w, h: d.img.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: d.img.w, h: d.img.h },
        sourceSize: { w: d.img.w, h: d.img.h },
      };
    });
  }
  return { name: `tiles-${themeName}`, png, frames };
}

export function rigFrameKey(rig: string, layer: string, part: string, key: string): string {
  return `${rig}/${layer}/${part}/${key}`;
}

/** Everything a consumer needs besides the atlases. */
export function metadata(
  art: readonly Compiled[],
  atlases: readonly Atlas[],
  fonts: readonly BuiltFont[] = [],
): ArtMetadata {
  const sets = art.filter(isTileArt);
  const terrains = sets.filter((a): a is CompiledTerrain => a.kind === "terrain");
  const layout = tileLayout(sets);
  const hex = (i: number): string => COLORS[i] as string;
  const shift = (list: readonly (readonly number[])[], first: number) =>
    list.map((m) => m.map((i) => first + i));
  const anims = (owner: string, anim: Readonly<Record<string, Anim>>) =>
    Object.fromEntries(
      Object.entries(anim).map(([k, a]) => [
        k,
        {
          frames: a.frames.map((f) => (owner ? `${owner}/${f}` : f)),
          fps: a.fps,
          loop: a.loop ?? true,
        },
      ]),
    );
  return {
    palette: {
      colors: COLORS,
      ramps: Object.fromEntries(
        RAMP_LIST.map((r) => [
          r.name,
          Object.fromEntries(rampEntries(r).map(([s, i]) => [s, COLORS[i] as string])),
        ]),
      ),
    },
    slots: Object.fromEntries(
      SLOTS.map((s) => [
        s.name,
        {
          keys: Object.fromEntries(SLOT_STEPS.map((step, i) => [step, s.keys[i] as string])),
          options: Object.fromEntries(
            Object.entries(s.options).map(([o, names]) => [
              o,
              Object.fromEntries(
                SLOT_STEPS.map((step, i) => [
                  step,
                  COLORS[colorIndex(names[i] as string)] as string,
                ]),
              ),
            ]),
          ),
        },
      ]),
    ),
    atlases: atlases.map((a) => a.name),
    themes: THEMES.map((t) => t.name),
    /** Per theme, every colour it changes, as hex to hex. Sprites can be drawn in a theme too. */
    recolor: Object.fromEntries(
      THEMES.map((t) => [
        t.name,
        Object.fromEntries([...resolveRemap(t.remap)].map(([a, b]) => [hex(a), hex(b)])),
      ]),
    ),
    /** One ramp step darker per colour: what a ground shadow does to the ground under it. */
    shade: Object.fromEntries([...SHADE].map(([a, b]) => [hex(a), hex(b)])),
    sprites: Object.fromEntries(
      art
        .filter((a) => a.kind === "sprite")
        .map((s) => [
          s.name,
          {
            atlas: s.group,
            size: s.size,
            origin: s.origin,
            shadow: s.shadow ? `${s.name}/shadow` : null,
            frames: [...s.frames.keys()].map((f) => `${s.name}/${f}`),
            anims: anims(s.name, s.anim),
            ...(s.slice
              ? {
                  slice: {
                    left: s.slice[0],
                    right: s.slice[1],
                    top: s.slice[2],
                    bottom: s.slice[3],
                  },
                }
              : {}),
            ...(s.blend ? { blend: s.blend } : {}),
          },
        ]),
    ),
    rigs: Object.fromEntries(
      art
        .filter((a) => a.kind === "rig")
        .map((r) => [
          r.name,
          {
            atlas: r.group,
            size: r.size,
            origin: r.origin,
            directions: r.directions,
            flipForLeft: "side" as const,
            layers: r.layers,
            parts: Object.fromEntries(
              r.layers.map((l) => [l, r.parts.filter((p) => p.layer === l).map((p) => p.name)]),
            ),
            frames: r.frameNames,
            frameKey: `${r.name}/{layer}/{part}/{dir}/{frame}`,
            anims: anims("", r.anim),
            looks: Object.fromEntries(
              r.looks.map((l) => [l.name, { parts: l.parts, slots: l.slots }]),
            ),
            under: Object.fromEntries(
              r.layers
                .map((l) => [
                  l,
                  Object.fromEntries(
                    r.parts
                      .filter((p) => p.layer === l && p.under !== undefined)
                      .map((p) => [p.name, p.under as string]),
                  ),
                ])
                .filter(([, byPart]) => Object.keys(byPart as object).length > 0),
            ),
            anchors: Object.fromEntries(
              r.parts.flatMap((p) =>
                [...p.anchors].map(([anchor, at]) => [
                  `${p.layer}/${p.name}/${anchor}`,
                  Object.fromEntries(at),
                ]),
              ),
            ),
          },
        ]),
    ),
    tileGrid: TILE_GRID,
    tilesets: Object.fromEntries(
      terrains.map((t) => {
        const first = layout.first.get(t.name) as number;
        return [
          t.name,
          {
            upper: t.upper,
            lower: t.lower,
            themes: t.themes,
            bake: t.bake,
            masks: shift(t.masks, first),
            tones: t.tones.map((tone) => ({
              name: tone.name,
              on: tone.on,
              band: tone.band,
              masks: shift(tone.masks, first),
            })),
            decals: t.decals.map((d) => ({
              name: d.name,
              on: d.on,
              density: d.density,
              w: d.img.w,
              h: d.img.h,
              frame: `${t.name}/${d.name}`,
            })),
          },
        ];
      }),
    ),
    overlays: Object.fromEntries(
      sets
        .filter((o): o is CompiledOverlay => o.kind === "overlay")
        .map((o) => {
          const first = layout.first.get(o.name) as number;
          const shapes = o.shapes.some((sh) => sh)
            ? Object.fromEntries(
                o.shapes.map((sh, i) => [
                  String(first + i),
                  sh
                    ? Array.from(
                        { length: 64 },
                        (_, q) =>
                          (sh[q * 4] as number) * 8 +
                          (sh[q * 4 + 1] as number) * 4 +
                          (sh[q * 4 + 2] as number) * 2 +
                          (sh[q * 4 + 3] as number),
                      )
                        .map((v) => v.toString(16))
                        .join("")
                    : "",
                ]),
              )
            : null;
          return [o.name, { themes: o.themes, bake: o.bake, masks: shift(o.masks, first), shapes }];
        }),
    ),
    fonts: Object.fromEntries(fonts.map((f) => [f.name, f.meta])),
  };
}

export function buildAtlases(art: readonly Compiled[]): Atlas[] {
  const groups = new Map<string, Entry[]>();
  const add = (
    group: string,
    key: string,
    img: Indexed,
    pivot?: readonly [number, number],
    whole?: boolean,
  ): void => {
    const list = groups.get(group) ?? [];
    list.push({ key, img, ...(pivot ? { pivot } : {}), ...(whole ? { whole } : {}) });
    groups.set(group, list);
  };
  for (const a of art) {
    if (a.kind === "sprite") {
      for (const [f, img] of a.frames)
        add(a.group, `${a.name}/${f}`, img, a.origin, a.slice !== undefined);
    } else if (a.kind === "rig") {
      for (const p of a.parts) {
        for (const [key, img] of p.frames)
          add(a.group, rigFrameKey(a.name, p.layer, p.name, key), img, a.origin);
      }
    }
  }
  const atlases = [...groups.keys()].sort().map((g) => packSprites(g, groups.get(g) ?? []));
  const sets = art.filter(isTileArt);
  for (const t of THEMES) atlases.push(bakeTiles(t.name, sets));
  return atlases;
}

/** The Galmuri faces, then every hand-drawn glyph font. */
export function buildFonts(art: readonly Compiled[]): BuiltFont[] {
  return [
    ...FACES.map((f) => buildFace(f)),
    ...art.filter((a) => a.kind === "glyphs").map(buildGlyphFont),
  ];
}

export function writeOutput(
  dir: string,
  art: readonly Compiled[],
): { atlases: Atlas[]; fonts: BuiltFont[] } {
  const atlases = buildAtlases(art);
  const fonts = buildFonts(art);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, FONT_DIR), { recursive: true });
  for (const a of atlases) {
    writeFileSync(join(dir, `${a.name}.png`), a.png.png());
    writeFileSync(join(dir, `${a.name}.json`), phaserJson(a));
  }
  writeFonts(dir, fonts);
  writeFileSync(
    join(dir, "art.json"),
    `${JSON.stringify(metadata(art, atlases, fonts), null, 1)}\n`,
  );
  return { atlases, fonts };
}
