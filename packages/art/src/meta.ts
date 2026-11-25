/** The shape of `dist/art.json`, the metadata the build writes beside the atlases. */
import type { Dir, Vec } from "./format.ts";

export interface AnimMeta {
  /** Atlas frame names for sprites; rig frame names (`walk0`) for rigs. */
  readonly frames: readonly string[];
  readonly fps: number;
  readonly loop: boolean;
}

export interface SpriteMeta {
  readonly atlas: string;
  readonly size: Vec;
  /** The feet, in pixels from the top left of the untrimmed frame. */
  readonly origin: Vec;
  /** The `shadow` frame's name when the sprite brings a ground shadow, else null. */
  readonly shadow: string | null;
  readonly frames: readonly string[];
  readonly anims: Readonly<Record<string, AnimMeta>>;
  /** Nine-slice insets for `add.nineslice`. Sliced frames are packed untrimmed. */
  readonly slice?: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  };
  /** `add` for light (sparks, bolts, glows) drawn with additive blending. Absent is normal. */
  readonly blend?: "add";
}

/** A bitmap font for `load.bitmapFont(key, image, data)`. */
export interface FontMeta {
  /** Paths inside the build directory. */
  readonly image: string;
  readonly data: string;
  /** The size the font data declares. BitmapText draws 1:1 at it, which is its default. */
  readonly size: number;
  readonly lineHeight: number;
  /** Baseline, in pixels from the top of a line. */
  readonly base: number;
  /** Where a Hangul syllable's ink sits in a line: rows from the top, and its height. */
  readonly ink: { readonly top: number; readonly height: number };
  readonly chars: number;
  /** One white colour, meant for `setTint` with a palette colour. Otherwise drawn as is. */
  readonly tint: boolean;
}

export interface LookMeta {
  readonly parts: Readonly<Record<string, string>>;
  readonly slots: Readonly<Record<string, string>>;
}

export interface RigMeta {
  readonly atlas: string;
  readonly size: Vec;
  readonly origin: Vec;
  readonly directions: readonly Dir[];
  /** The direction drawn facing right and flipped for left. */
  readonly flipForLeft: Dir;
  /** Back to front. */
  readonly layers: readonly string[];
  readonly parts: Readonly<Record<string, readonly string[]>>;
  readonly frames: readonly string[];
  /** Atlas frame name template: `{layer}`, `{part}`, `{dir}` and `{frame}` are filled in. */
  readonly frameKey: string;
  readonly anims: Readonly<Record<string, AnimMeta>>;
  /** The first look is the default. */
  readonly looks: Readonly<Record<string, LookMeta>>;
  /**
   * Parts drawn just below another layer instead of in their own layer's place, per layer and
   * part: `{ accessory: { headphones: 'hair' } }` draws the headphones after the face and before
   * the hair, so long hair falls over them. Parts not listed draw in their own layer.
   */
  readonly under: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Stack the layers with `stackLayers` from `@guago/art` (exported from `layer-order.ts`) and
   * `clean` on, before swapping slot colours in: a pixel a later layer leaves without any
   * same-colour neighbour takes that layer's colour. Without it, hair cut by a clip or a strap
   * keeps one-pixel crumbs. Outline colours are every ramp's `deep` step and every slot's `deep`
   * key.
   */
  readonly clean: boolean;
  /**
   * Points that follow the skeleton, keyed `{layer}/{part}/{anchor}`, then `{dir}/{frame}` to a
   * pixel in the frame. A frame left out has the point hidden. `jacket/varsity/emblem` is the
   * top left of the 과잠's back panel, where a club's 6×6 emblem is drawn after the jacket layer.
   */
  readonly anchors: Readonly<Record<string, Readonly<Record<string, Vec>>>>;
}

export interface DecalMeta {
  readonly name: string;
  readonly on: "upper" | "lower";
  readonly density: number;
  readonly w: number;
  readonly h: number;
  readonly frame: string;
}

/** Soft patches over one side of a pair, for `pickTone`. Mask 0 is empty. */
export interface ToneMeta {
  readonly name: string;
  readonly on: "upper" | "lower";
  readonly band: readonly [number, number];
  readonly masks: readonly (readonly number[])[];
}

export interface TilesetMeta {
  readonly upper: string;
  readonly lower: string;
  /** Themes the pair is meant for, or null for all. */
  readonly themes: readonly string[] | null;
  /** Theme atlases that hold its tiles, or null for all. Elsewhere its indices are not drawn. */
  readonly bake: readonly string[] | null;
  /** Tile indices per dual-grid mask, for `pickTiles`. */
  readonly masks: readonly (readonly number[])[];
  readonly tones: readonly ToneMeta[];
  readonly decals: readonly DecalMeta[];
}

/** A dual-grid edge drawn over other ground. Mask 0 is empty. */
export interface OverlayMeta {
  readonly themes: readonly string[] | null;
  /** Theme atlases that hold its tiles, or null for all. */
  readonly bake: readonly string[] | null;
  readonly masks: readonly (readonly number[])[];
  /**
   * Per tile index, its shape as 64 hex digits: 256 flags row major, high bit first, set inside
   * the region. Null for overlays without a shape.
   */
  readonly shapes: Readonly<Record<string, string>> | null;
}

export interface SlotMeta {
  /** Key colour (`#rrggbb`) per slot step. */
  readonly keys: Readonly<Record<string, string>>;
  /** Option name to colour per slot step. */
  readonly options: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface ArtMetadata {
  readonly palette: {
    readonly colors: readonly string[];
    readonly ramps: Readonly<Record<string, Readonly<Record<string, string>>>>;
  };
  readonly slots: Readonly<Record<string, SlotMeta>>;
  readonly atlases: readonly string[];
  readonly themes: readonly string[];
  /** Per theme, every colour it changes (`#rrggbb` to `#rrggbb`), for drawing sprites in a theme. */
  readonly recolor: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Each colour one ramp step darker, for ground shadows. */
  readonly shade: Readonly<Record<string, string>>;
  readonly sprites: Readonly<Record<string, SpriteMeta>>;
  readonly rigs: Readonly<Record<string, RigMeta>>;
  /** Tile atlases are named `tiles-{theme}` and laid out on this grid. */
  readonly tileGrid: {
    readonly tile: number;
    readonly margin: number;
    readonly spacing: number;
    readonly columns: number;
  };
  readonly tilesets: Readonly<Record<string, TilesetMeta>>;
  readonly overlays: Readonly<Record<string, OverlayMeta>>;
  /** Font key to font. Galmuri's OFL licence ships beside them as `fonts/OFL-Galmuri.txt`. */
  readonly fonts: Readonly<Record<string, FontMeta>>;
}
