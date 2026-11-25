import type { Surface } from "@guago/audio";
import type { TileCollision } from "@guago/shared";
import type { WorldOverlays } from "./overlays.ts";

/**
 * What the world scene tells the UI each frame and the UI reads: the map being walked, where the
 * player and everyone else stands, and the camera. The world scene writes it; the HUD, minimap,
 * chat bubbles and controls only read it. Positions are feet, in world pixels.
 */

/** A map as the minimap and footsteps need it: works for the lawn and for built maps alike. */
export interface MapView {
  readonly id: string;
  /** Shown under the minimap, in Korean. */
  readonly name: string;
  readonly collision: TileCollision;
  /** What the ground is made of at a tile. */
  surfaceAt(tx: number, ty: number): Surface;
  /** Doorways out, in tiles. */
  readonly portals: readonly {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[];
}

export type EntityKind = "player" | "npc";

export interface ViewEntity {
  readonly kind: EntityKind;
  x: number;
  y: number;
  name: string;
}

class WorldView {
  map: MapView | undefined;
  /** The player's own feet, once drawn. */
  self: { x: number; y: number } | undefined;
  /** Other players by map session id, NPCs by speaker id. */
  readonly others = new Map<string, ViewEntity>();
  /** The player's own session id in the map room: chat lines on 주변 name their speaker by it. */
  selfSid: string | undefined;
  /** Nameplates, bubbles and the prompt, while the world scene runs. */
  overlays: WorldOverlays | undefined;
  /** The interact action: the E key and the phone's context button call it while the world runs. */
  interact: (() => void) | undefined;
  /** Someone's nameplate tapped or clicked, by session or speaker id; chat whispers players. */
  onNameTap: ((id: string, name: string, kind: EntityKind) => void) | undefined;
  private readonly listeners = new Set<(map: MapView | undefined) => void>();

  /** The world scene started on a map. */
  enter(map: MapView): void {
    this.map = map;
    this.self = undefined;
    this.others.clear();
    for (const l of this.listeners) l(map);
  }

  /** The world scene stopped. */
  leave(): void {
    this.map = undefined;
    this.self = undefined;
    this.selfSid = undefined;
    this.overlays = undefined;
    this.interact = undefined;
    this.others.clear();
    for (const l of this.listeners) l(undefined);
  }

  /** Calls `fn` with the map now and whenever it changes; returns the unsubscribe. */
  onMap(fn: (map: MapView | undefined) => void): () => void {
    this.listeners.add(fn);
    fn(this.map);
    return () => this.listeners.delete(fn);
  }
}

export const worldView = new WorldView();
