/**
 * The map format (PLAN §10 "Maps", §16 "Maps are authored as code").
 *
 * A map is written as a `MapSource`: a hand-typed terrain plan, generator rules that roughen it
 * with noise, then ASCII stamps for buildings, landmarks and zones, and hand-placed art in the
 * scene layers. `buildMap` turns it into a `BuiltMap`, plain JSON that the client loads as a
 * static asset and the server reads for collision, spawns, portals and zones.
 */
import type { TileCollision } from "@guago/shared";
import type {
  Actor,
  Decal,
  Doll,
  Edge,
  Emitter,
  Light,
  Prop,
  Rect,
  SceneDef,
  ShadowShape,
  Vec,
} from "./layers.ts";

// Time and light --------------------------------------------------------------------------------

/**
 * Each map's clock stopped at its own moment when time tore (PLAN decision 30 read as identity):
 * one fixed time of day and weather, carried by its ambient light, its lights and its air.
 */
export interface MapTime {
  /** The stopped clock, `HH:MM`. */
  readonly clock: string;
  readonly phase: "morning" | "noon" | "golden" | "dusk" | "night";
  readonly weather: "clear" | "haze" | "sea-wind" | "drizzle";
}

/** The light everything gets before any light source: a palette colour and its strength. */
export interface Ambient {
  readonly color: string;
  /** 0 is black, 1 is the art as drawn. */
  readonly intensity: number;
}

/**
 * A light source for the client's engine lighting, plus how the contact sheet paints it until
 * then. Colours are 해솔 64 names.
 */
export interface LightSource {
  readonly at: Vec;
  /** Pixels. */
  readonly radius: number;
  readonly color: string;
  readonly intensity: number;
  /** Brightness wobble: `amount` as a fraction, over `period` seconds. */
  readonly flicker?: { readonly amount: number; readonly period: number };
  readonly paint?: Light;
}

// Game data ------------------------------------------------------------------------------------

/** A rectangle in tiles. */
export type TileRect = Rect;

export interface Spawn {
  /** Feet, in world pixels. */
  readonly x: number;
  readonly y: number;
  readonly facing: "down" | "up" | "left" | "right";
}

export interface Portal {
  readonly id: string;
  readonly rect: TileRect;
  /** Target map id. */
  readonly to: string;
  /** Spawn name in the target map. */
  readonly spawn: string;
  /** False while the target map is listed as planned but not built. */
  readonly built: boolean;
}

export type InteractableKind =
  | "shop"
  | "board"
  | "hall-of-fame"
  | "sit"
  | "lore"
  | "locked"
  | "notice";

export interface Interactable {
  readonly id: string;
  readonly kind: InteractableKind;
  readonly rect: TileRect;
}

export type Zone =
  | { readonly kind: "safe"; readonly id: string; readonly rect: TileRect }
  /** Logging out inside boosts the offline pool: `study` (자습실) or `sleep` (기숙사). */
  | {
      readonly kind: "logout";
      readonly id: string;
      readonly rect: TileRect;
      readonly bonus: "study" | "sleep";
    }
  /** Monsters of one kind, `density` alive per 100 walkable tiles at full player count. */
  | {
      readonly kind: "monsters";
      readonly id: string;
      readonly rect: TileRect;
      readonly monster: string;
      readonly density: number;
    }
  /** A place a group naturally stands around: the client may seat idle players here. */
  | { readonly kind: "gather"; readonly id: string; readonly rect: TileRect };

// Source ---------------------------------------------------------------------------------------

/** One plan character: terrain, and whether the tile is solid. */
export interface PlanCell {
  readonly terrain: string | null;
  readonly theme?: string;
  /** Defaults to `~` for void cells and walkable otherwise. */
  readonly solid?: "#" | "~" | false;
}

/**
 * A generator rule: plan cells holding a character in `on` become `to` where seeded value noise
 * (features `scale` tiles across) reaches `threshold`, optionally only within `near.within` tiles
 * of a character in `near.chars`. Changed cells with fewer than two changed or `to` neighbours
 * (of four) are put back, so a rule makes patches and frayed edges, never single dots.
 */
export interface Rule {
  readonly on: string;
  readonly to: string;
  readonly scale: number;
  readonly threshold: number;
  readonly near?: { readonly chars: string; readonly within: number };
  /** Only inside this tile rectangle. */
  readonly inside?: TileRect;
}

/** A placed prop that blocks the tiles in `foot` (tile rectangle, absolute). */
export interface Thing extends Prop {
  readonly foot?: TileRect;
}

/** What a stamp character does to its tile. */
export interface StampCell {
  /** A character of the host map's plan legend: the ground this tile becomes. */
  readonly ground?: string;
  /** Overrides the tile's collision. */
  readonly solid?: "#" | "~" | false;
  /**
   * A named area: every cell of the stamp holding a character with this region forms one
   * rectangle, used by `portals`, `interactables`, `zones` and `spawns` by name.
   */
  readonly region?: string;
}

/**
 * An ASCII stamp: a grid of legend characters laid onto the map at a tile position. `.` and
 * space leave the map untouched. `things` places art relative to the stamp's top-left pixel.
 */
export interface Stamp {
  readonly name: string;
  readonly grid: string;
  readonly legend: Readonly<Record<string, StampCell>>;
  readonly things?: (ox: number, oy: number) => Layers;
}

/** Art a stamp or a source adds, by layer. */
export interface Layers {
  readonly backdrop?: readonly Prop[];
  readonly details?: readonly (Decal | Prop)[];
  readonly shadows?: readonly (Prop | ShadowShape)[];
  readonly objects?: readonly (Thing | Actor | Doll)[];
  readonly overhead?: readonly Prop[];
  readonly atmosphere?: readonly (Prop | Actor)[];
  readonly lights?: readonly LightSource[];
  readonly emitters?: readonly Emitter[];
}

/**
 * A stamp laid at a tile. Its regions are named `<id>:<region>` on the map, `id` defaulting to
 * the stamp's name, so one stamp can be laid twice.
 */
export interface Stamped {
  readonly stamp: Stamp;
  readonly at: Vec;
  readonly id?: string;
}

export interface MapSource extends Layers {
  readonly id: string;
  /** Shown on entering, in Korean. */
  readonly name: string;
  readonly seed: number;
  readonly time: MapTime;
  /** Palette theme terrain and props are painted in on the contact sheet. */
  readonly theme: string;
  /** Theme ground shadows are painted in on the contact sheet. */
  readonly shade?: string;
  readonly sky?: string;
  readonly ambient: Ambient;
  /** One plan character per tile, every row the same width. */
  readonly plan: string;
  readonly legend: Readonly<Record<string, PlanCell>>;
  readonly rules?: readonly Rule[];
  readonly stamps?: readonly Stamped[];
  readonly edges?: readonly Edge[];
  /** Spawn points by name, at a tile; `main` is required. */
  readonly spawns: Readonly<
    Record<string, { readonly tile: Vec; readonly facing?: Spawn["facing"] }>
  >;
  /** The one thing the map is remembered by, at a tile. */
  readonly landmark: { readonly name: string; readonly tile: Vec };
  /** Extra solid tile rectangles: a sea wall's line, a fence. */
  readonly blocks?: readonly TileRect[];
  /** Rectangles in tiles, or a stamp region name. */
  readonly portals?: readonly {
    readonly id: string;
    readonly rect: TileRect | string;
    readonly to: string;
    readonly spawn: string;
  }[];
  readonly interactables?: readonly {
    readonly id: string;
    readonly kind: InteractableKind;
    readonly rect: TileRect | string;
  }[];
  readonly zones?: readonly (
    | (Omit<Extract<Zone, { kind: "safe" }>, "rect"> & { readonly rect: TileRect | string })
    | (Omit<Extract<Zone, { kind: "logout" }>, "rect"> & { readonly rect: TileRect | string })
    | (Omit<Extract<Zone, { kind: "monsters" }>, "rect"> & { readonly rect: TileRect | string })
    | (Omit<Extract<Zone, { kind: "gather" }>, "rect"> & { readonly rect: TileRect | string })
  )[];
}

// Built ----------------------------------------------------------------------------------------

export interface BuiltMap {
  readonly id: string;
  readonly name: string;
  /** Size in tiles. */
  readonly w: number;
  readonly h: number;
  readonly time: MapTime;
  /** Its name and where it stands, in world pixels. */
  readonly landmark: { readonly name: string; readonly x: number; readonly y: number };
  readonly ambient: Ambient;
  readonly lights: readonly LightSource[];
  /** Terrain and art by layer. `scene.lights` is the painted light for the contact sheet. */
  readonly scene: SceneDef;
  readonly collision: TileCollision;
  readonly spawns: Readonly<Record<string, Spawn>>;
  readonly portals: readonly Portal[];
  readonly interactables: readonly Interactable[];
  readonly zones: readonly Zone[];
}
