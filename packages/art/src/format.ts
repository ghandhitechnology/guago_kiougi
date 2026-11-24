/**
 * The sprite source format (PLAN §16 "Sprite source format").
 *
 * Art is written as text grids, one character per pixel, with a legend that maps characters to
 * 해솔 64 names (`red.mid`) or swap-slot names (`hair.mid`). Four kinds of art exist:
 *
 * - `sprite`: monsters, effects, props. Frames are grids, or stacks of named parts.
 * - `variant`: a sprite recoloured or with some parts swapped, without copying grids.
 * - `rig`: a layered paper-doll character. Parts hang on bones, frames move bones.
 * - `terrain`: a dual-grid terrain pair drawn as two pictures, plus fills and decals.
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
  /** The outline rule. Defaults to true; turn off for effects. */
  readonly outline?: boolean;
  /** Palette remap applied after parsing. Usually set through `variant`. */
  readonly recolor?: Remap;
}

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

/** A grid, or pose name to grid. A pose map must have `rest`, used for poses it does not draw. */
export type PieceGrids = string | Readonly<Record<string, string>>;

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
  /** Fraction of eligible cells, before noise clumping. */
  readonly density: number;
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
 */
export interface TerrainDef extends Common {
  readonly kind: "terrain";
  readonly upper: string;
  readonly lower: string;
  readonly outer: string;
  readonly inner: string;
  readonly base: readonly string[];
  readonly fill?: readonly string[];
  readonly decals?: Readonly<Record<string, Decal>>;
}

export function terrain(def: Omit<TerrainDef, "kind">): TerrainDef {
  return { kind: "terrain", ...def };
}

export type Art = SpriteDef | RigDef | TerrainDef;
