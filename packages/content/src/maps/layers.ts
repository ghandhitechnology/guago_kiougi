/**
 * The visual half of a map: terrain cells and placed art in named depth layers, drawn back to
 * front. The art package's review scenes are written in it too, and its renderer draws both, so
 * a map and a scene are never authored twice.
 *
 * 1. `sky` and `backdrop`: what lies past the map edge, shown through void cells.
 * 2. Terrain: the `ground` grid, one legend character per cell, with dual-grid tiles, tones and
 *    scattered decals.
 * 3. `details`: hand-placed ground art (field lines, cracks, puddles, fallen needles).
 * 4. `edges`: dual-grid overlays around marked cells, like a rift's torn border.
 * 5. `shadows`: ground shadows, plus every object's own; the ground under them drops one step.
 * 6. `objects`: props, monsters and characters, sorted by their feet.
 * 7. `overhead`: what characters walk behind: canopies, eaves, capitals, skybridges.
 * 8. `lights`: painted light, stepped bands of other themes (the contact sheet's lighting).
 * 9. `atmosphere` and `emitters`: small animated sprites over everything.
 *
 * Everything names atlas art by name (sprites, rigs, decal frames, overlays), never by index,
 * so redrawn art shows up by itself. Positions are world pixels; a thing's `at` is its feet.
 */

export type Vec = readonly [x: number, y: number];
export type Dir = "down" | "up" | "side";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Cell {
  /** A terrain id, the `upper` or `lower` of a pair like `grass` or `walk`; null is void. */
  readonly terrain: string | null;
  /** Overrides the map theme for this cell, like `greece` across a rift. */
  readonly theme?: string;
}

/**
 * How a thing picks its frame: by name, or by animation and index. With `play` the animation
 * runs from `index` over time; a still render shows time zero.
 */
export interface FramePick {
  readonly frame?: string;
  readonly anim?: string;
  readonly index?: number;
  readonly play?: boolean;
}

export interface Placement extends FramePick {
  /** The art's anchor (its feet) in world pixels. */
  readonly at: Vec;
  readonly flip?: boolean;
  /** Draws copies this many times, each one frame width further right. */
  readonly repeat?: number;
  /**
   * Moves from `at` to `to` over `period` seconds, then starts again, offset by `phase`
   * seconds. For things being carried somewhere: pages pulled into a rift, scraps lifting off.
   */
  readonly drift?: { readonly to: Vec; readonly period: number; readonly phase?: number };
  /**
   * The Y it sorts by, when that is not its feet: every piece of a building sorts by the
   * building's front wall, so nothing slips between its floors.
   */
  readonly sort?: number;
}

/** Environment art. Takes the map theme unless `raw`. */
export interface Prop extends Placement {
  readonly prop: string;
  readonly raw?: boolean;
}
/** A monster sprite in the master palette. `shadow` names a frame for sprites without one. */
export interface Actor extends Placement {
  readonly actor: string;
  readonly shadow?: string;
}
/** A paper-doll character. A layer named `shadow` is drawn as its ground shadow. */
export interface Doll extends Placement {
  readonly rig: string;
  readonly look?: string;
  readonly dir?: Dir;
}
/** A terrain decal frame like `lawn-path/needles`, at its top left, in its cell's theme. */
export interface Decal {
  readonly decal: string;
  readonly at: Vec;
}
/** The ground shadow of something large (a building in low sun), as a polygon in pixels. */
export interface ShadowShape {
  readonly poly: readonly Vec[];
}

/**
 * Painted light: stepped bands of themes, brightest first, falling off into the map theme.
 * Every band edge is broken by low-frequency noise, so no light ends on a clean curve. One shape
 * per light:
 *
 * - `at` and `r`: an ellipse, its bands evenly spaced out to `r`.
 * - `spill`: a trapezoid falling from a lit window or door, narrow at the top, wide below.
 * - `region`: the ground around cells whose legend character is in `region`, each band reaching
 *   the next distance in `reach` (pixels).
 */
export interface Light {
  readonly bands: readonly string[];
  readonly at?: Vec;
  readonly r?: Vec;
  readonly spill?: {
    readonly top: readonly [x0: number, x1: number, y: number];
    readonly bottom: readonly [x0: number, x1: number, y: number];
  };
  readonly region?: string;
  readonly reach?: readonly number[];
  /** Pixels of edge noise. Defaults to 3. */
  readonly ragged?: number;
  /**
   * Shafts for a `region` light: seen from `at`, its reach swells by up to `amount` (a
   * fraction) in some directions and shrinks in others, about `count` times around, so the light
   * falls in tongues instead of rings.
   */
  readonly rays?: { readonly at: Vec; readonly count: number; readonly amount: number };
  readonly pulse?: { readonly amount: number; readonly period: number };
}

/** Overlay tiles drawn around the cells whose legend character is in `inside`. */
export interface Edge {
  /** One overlay, or several cycled at `fps` for a pulse. */
  readonly overlay: string | readonly string[];
  readonly fps?: number;
  readonly inside: string;
}

/**
 * Ambient particles: `count` copies of a sprite alive at once, each born somewhere in `area`,
 * living `life` seconds while moving at `velocity`, and, with `toward`, pulled all the way to
 * that point by the end of its life. Deterministic, so every client and the contact sheet show
 * the same drift. Drawn raw, over everything.
 */
export interface Emitter {
  readonly sprite: string;
  /** Animation each particle plays from birth. Defaults to the sprite's first. */
  readonly anim?: string;
  readonly area: Rect;
  readonly count: number;
  readonly life: number;
  /** Pixels per second. */
  readonly velocity: Vec;
  readonly toward?: Vec;
}

export interface SceneDef {
  readonly name: string;
  readonly seed: number;
  /** Theme for terrain and props. */
  readonly theme: string;
  /** Palette name filling the canvas before anything else. */
  readonly sky?: string;
  /**
   * Theme ground shadows are painted in on the contact sheet. Without it a shadow darkens the
   * ground one ramp step; with it (cool violet under a golden sun) it reads as shade.
   */
  readonly shade?: string;
  /** Cells across and down. Without it the scene is one 480×270 screen (30×17 cells). */
  readonly size?: Vec;
  readonly legend: Readonly<Record<string, Cell>>;
  /** One legend character per cell: a multi-line string, or one string per row. */
  readonly ground: string | readonly string[];
  readonly backdrop?: readonly Prop[];
  readonly details?: readonly (Decal | Prop)[];
  readonly edges?: readonly Edge[];
  readonly shadows?: readonly (Prop | ShadowShape)[];
  readonly objects: readonly (Prop | Actor | Doll)[];
  readonly overhead?: readonly Prop[];
  readonly lights?: readonly Light[];
  readonly atmosphere?: readonly (Prop | Actor)[];
  readonly emitters?: readonly Emitter[];
}

export function scene(def: SceneDef): SceneDef {
  return def;
}

/** Ground rows, trimmed, from either form. */
export function groundRows(ground: string | readonly string[]): string[] {
  const rows = typeof ground === "string" ? ground.split("\n") : [...ground];
  return rows.map((r) => r.trim()).filter((r) => r.length > 0);
}
