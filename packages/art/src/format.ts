/**
 * The sprite source format (PLAN §16 "Sprite source format").
 *
 * Art is written as text grids, one character per pixel, with a legend that maps characters to
 * 해솔 64 names (`red.mid`) or swap-slot names (`hair.mid`). Six kinds of art exist:
 *
 * - `sprite`: monsters, effects, props. Frames are grids, or stacks of named parts.
 * - `variant`: a sprite recoloured or with some parts swapped, without copying grids.
 * - `rig`: a layered paper-doll character. Parts hang on bones, frames move bones.
 * - `terrain`: a dual-grid terrain pair drawn as two pictures, plus fills, tones and decals.
 * - `overlay`: a dual-grid edge drawn over other terrain, like a rift's torn border.
 * - `glyphs`: a hand-drawn bitmap font, one grid per character.
 *
 * UI pieces are sprites in the `ui` group with a top-left origin; stretchable ones set `slice`.
 */
import type { ColorName, Remap, SlotColorName } from "./palette.ts";

export type Paint = ColorName | SlotColorName;
/** One character per pixel. `null` is clear. */
export type Legend = Readonly<Record<string, Paint | null>>;
export type Vec = readonly [x: number, y: number];

export interface Anim {
  readonly frames: readonly string[];
  readonly fps: number;
  /** Defaults to true. */
  readonly loop?: boolean;
  /**
   * Largest allowed change in opaque pixel count between consecutive frames, as a fraction of
   * the larger frame. Defaults to 0.35.
   */
  readonly jump?: number;
}

interface Common {
  /** Defaults to the file name for the file's only piece of art. */
  readonly name?: string;
  readonly palette: Legend;
  /** Legend characters that may stand alone and skip the outline rule: sparkles, glints, debris. */
  readonly lone?: string;
}

// Sprites -------------------------------------------------------------------------------------

/** A grid placed at `at` (default top left) when a frame names it. */
export type PartGrid = string | { readonly at: Vec; readonly grid: string };

/** A part or frame name, optionally offset: `'face'` or `['face', 0, 1]`. */
export type Placement = string | readonly [name: string, dx: number, dy: number];

export interface SpriteDef extends Common {
  readonly kind: "sprite";
  readonly size: Vec;
  /** Anchor in pixels, the feet for Y-sorting. Defaults to bottom centre. */
  readonly origin?: Vec;
  /** Atlas group. Defaults to `core`. */
  readonly group?: string;
  readonly parts?: Readonly<Record<string, PartGrid>>;
  /** A full-size grid, or a stack of parts and other frames drawn back to front. */
  readonly frames: Readonly<Record<string, string | readonly Placement[]>>;
  readonly anim: Readonly<Record<string, Anim>>;
  /**
   * The outline rule. Defaults to true; turn off for effects and for modular pieces that join
   * edge to edge (facade, fence), which draw their outer outline by hand.
   */
  readonly outline?: boolean;
  /**
   * Ground shadow, a grid the size of the sprite. Compiled to the frame `shadow`; consumers use
   * its shape only (the scene renderer darkens the ground under it by one ramp step).
   */
  readonly shadow?: string;
  /** Palette remap applied after parsing. Usually set through `variant`. */
  readonly recolor?: Remap;
  /**
   * Nine-slice insets in pixels, `[left, right, top, bottom]`, shared by every frame. The frames
   * pack untrimmed, and the middle column and row must repeat exactly so stretching never smears.
   */
  readonly slice?: Slice;
  /**
   * How the client blends it. `add` is light: sparks, flashes, bolts and glows, added onto what
   * is under them (and drawn plainly where additive blending is off). Defaults to normal.
   */
  readonly blend?: "add";
}

export type Slice = readonly [left: number, right: number, top: number, bottom: number];

export function sprite(def: Omit<SpriteDef, "kind">): SpriteDef {
  return { kind: "sprite", ...def };
}

/**
 * A sprite made from another by recolouring (`recolor: { 'red.*': 'plum.*' }`), replacing
 * legend entries, or swapping named parts. Nothing else is copied.
 */
export function variant(
  base: SpriteDef,
  change: {
    readonly name: string;
    readonly recolor?: Remap;
    readonly palette?: Legend;
    readonly parts?: Readonly<Record<string, PartGrid>>;
  },
): SpriteDef {
  for (const part of Object.keys(change.parts ?? {})) {
    if (!base.parts || !(part in base.parts)) {
      throw new Error(`variant ${change.name}: base has no part "${part}"`);
    }
  }
  return {
    ...base,
    name: change.name,
    palette: { ...base.palette, ...change.palette },
    parts: { ...base.parts, ...change.parts },
    recolor: { ...base.recolor, ...change.recolor },
  };
}

// Rigs ----------------------------------------------------------------------------------------

export type Dir = "down" | "up" | "side";

/**
 * A grid placed at the piece's `at`, or one with its own `at` for a pose that sits elsewhere
 * (an arm raised for a strike, a body lying down).
 */
export type PoseGrid = string | { readonly at: Vec; readonly grid: string };

/** A grid, or pose name to grid. A pose map must have `rest`, used for poses it does not draw. */
export type PieceGrids = string | Readonly<Record<string, PoseGrid>>;

/**
 * A part's drawing on one bone. Every direction the rig uses needs an entry; null means nothing
 * shows from that side. Grids are placed at `at` in the frame (default top left), which can
 * differ per direction: `at: { down: [4, 12], side: [5, 12] }`.
 */
export type Piece = { readonly at?: Vec | Readonly<Partial<Record<Dir, Vec>>> } & Readonly<
  Partial<Record<Dir, PieceGrids | null>>
>;

export interface PartDef {
  readonly palette: Legend;
  readonly lone?: string;
  /** Pieces keyed by bone. */
  readonly pieces: Readonly<Record<string, Piece>>;
}

/** One option for a layer, like a hairstyle. */
export function part(def: PartDef): PartDef {
  return def;
}

/** How a frame moves one bone: an offset, a pose name, or both. Offsets add up through parents. */
export type BonePose = Vec | string | readonly [pose: string, dx: number, dy: number];
export type Poses = Readonly<Record<string, BonePose>>;
/** Bone poses for a frame, or a function of direction when sides differ. */
export type FramePose = Poses | ((dir: Dir) => Poses);

export interface Look {
  /** Part name per layer. A layer left out is not drawn. */
  readonly parts: Readonly<Record<string, string>>;
  /** Slot option per slot, like `{ hair: 'pink' }`. */
  readonly slots?: Readonly<Record<string, string>>;
}

export interface RigDef {
  readonly kind: "rig";
  readonly name?: string;
  readonly size: Vec;
  readonly origin?: Vec;
  readonly group?: string;
  /** Authored directions. `side` faces right and is flipped at runtime for left. */
  readonly directions: readonly Dir[];
  /** Bone name to parent bone (or null). Key order is the draw order inside each layer. */
  readonly bones: Readonly<Record<string, string | null>>;
  /** Back to front. */
  readonly layers: readonly string[];
  /** Layers the outline and orphan checks skip, like a ground shadow. */
  readonly unchecked?: readonly string[];
  readonly parts: Readonly<Record<string, Readonly<Record<string, PartDef>>>>;
  readonly frames: Readonly<Record<string, FramePose>>;
  readonly anim: Readonly<Record<string, Anim>>;
  /** Looks composited for the build checks and the contact sheet. */
  readonly looks: Readonly<Record<string, Look>>;
}

export function rig(def: Omit<RigDef, "kind">): RigDef {
  return { kind: "rig", ...def };
}

// Terrain -------------------------------------------------------------------------------------

export interface Decal {
  /** Up to 16×16, drawn centred on a cell with a small hashed jitter. */
  readonly grid: string;
  readonly on: "upper" | "lower";
  /** Fraction of eligible cells, before noise clumping. Zero keeps it for hand placement. */
  readonly density: number;
}

/**
 * Two pictures cut into the 16 dual-grid masks, like a terrain pair, but with clear pixels
 * everywhere the picture leaves clear, so the result is drawn over other tiles.
 *
 * - `outer`: 48×48, a 2×2-cell island centred on nothing.
 * - `inner`: 32×32, a one-cell hole centred in the island's fill.
 * - `fill`: extra variants of mask 15; the outer centre tile is variant 0.
 */
export interface OverlayPictures {
  /** One picture, or several whose tiles become variants of each mask. */
  readonly outer: string | readonly string[];
  readonly inner: string | readonly string[];
  readonly fill?: readonly string[];
}

/**
 * A soft patch of one side of a terrain, larger than a tile: denser tufts, a lighter or darker
 * stretch of ground. Cells whose low-frequency noise falls in `band` (and whose 3×3
 * neighbourhood is all that side) form patches, drawn with the overlay's dual-grid tiles.
 * Tones of one terrain share one noise field, so disjoint bands never overlap.
 */
export interface Tone extends OverlayPictures {
  readonly name: string;
  readonly on: "upper" | "lower";
  readonly band: readonly [min: number, max: number];
}

/**
 * A dual-grid terrain pair, `upper` drawn over `lower`. Clear pixels in the pictures show the
 * lower fill underneath.
 *
 * - `outer`: 48×48, a 2×2-cell island of upper terrain centred on lower terrain. Its nine
 *   16×16 tiles become masks 8 12 4 / 10 15 5 / 2 3 1 (bits TL=1 TR=2 BL=4 BR=8).
 * - `inner`: 32×32, a one-cell hole of lower terrain centred in upper terrain. Its tiles become
 *   masks 7 11 / 13 14.
 * - Masks 6 and 9 are composed from 2 + 4 and 1 + 8.
 * - `base`: lower fill variants (mask 0). `fill`: extra upper variants; the outer centre tile is
 *   always variant 0 of mask 15.
 * - `tones`: large soft patches over either side, chosen by noise (see `Tone`).
 */
export interface TerrainDef extends Common {
  readonly kind: "terrain";
  readonly upper: string;
  readonly lower: string;
  /** One picture, or several whose tiles become variants of each mask (and of mask 15). */
  readonly outer: string | readonly string[];
  readonly inner: string | readonly string[];
  readonly base: readonly string[];
  readonly fill?: readonly string[];
  readonly tones?: readonly Tone[];
  readonly decals?: Readonly<Record<string, Decal>>;
  /** Themes the pair is meant for. The contact sheet shows it in these only. Defaults to all. */
  readonly themes?: readonly string[];
  /**
   * Themes the art is baked into. Defaults to every theme. Interior floors leave out the
   * outdoor field and era themes, so those atlases do not grow with every room. A map that lights
   * a terrain in a theme it is not baked into fails the map checks.
   */
  readonly bake?: readonly string[];
}

export function terrain(def: Omit<TerrainDef, "kind">): TerrainDef {
  return { kind: "terrain", ...def };
}

/** A dual-grid edge drawn over whatever terrain lies under it. Cells inside are the island. */
export interface OverlayDef extends Common, OverlayPictures {
  readonly kind: "overlay";
  readonly themes?: readonly string[];
  /**
   * Themes the art is baked into. Defaults to every theme. Interior floors leave out the
   * outdoor field and era themes, so those atlases do not grow with every room. A map that lights
   * a terrain in a theme it is not baked into fails the map checks.
   */
  readonly bake?: readonly string[];
  /**
   * Picture characters that belong to the region itself, drawn or clear. With it, each tile
   * also carries its shape, and scenes cut the ground inside and outside along that shape
   * instead of along the cell grid.
   */
  readonly inside?: string;
}

export function overlay(def: Omit<OverlayDef, "kind">): OverlayDef {
  return { kind: "overlay", ...def };
}

// Glyph fonts ---------------------------------------------------------------------------------

/**
 * A bitmap font drawn by hand, like the damage numerals. Every glyph grid is `height` rows tall
 * and as wide as it is drawn. A key may list several characters that share one drawing: `'-−'`.
 * The build writes it beside the Galmuri faces as a BMFont atlas.
 */
export interface GlyphFontDef extends Common {
  readonly kind: "glyphs";
  readonly height: number;
  /** Rows from the top to the baseline. Defaults to `height`. */
  readonly base?: number;
  /** Added to every advance. −1 lets neighbouring outlines share a column. */
  readonly spacing?: number;
  /** Advance of a space. Defaults to half the height. */
  readonly space?: number;
  readonly glyphs: Readonly<Record<string, string>>;
  readonly recolor?: Remap;
}

export function glyphs(def: Omit<GlyphFontDef, "kind">): GlyphFontDef {
  return { kind: "glyphs", ...def };
}

export type Art = SpriteDef | RigDef | TerrainDef | OverlayDef | GlyphFontDef;
