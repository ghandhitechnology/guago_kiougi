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
  /** Tile indices per dual-grid mask, for `pickTiles`. */
  readonly masks: readonly (readonly number[])[];
  readonly tones: readonly ToneMeta[];
  readonly decals: readonly DecalMeta[];
}

/** A dual-grid edge drawn over other ground. Mask 0 is empty. */
export interface OverlayMeta {
  readonly themes: readonly string[] | null;
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
}
