import type { DoorRefusal } from "@guago/shared";

/**
 * What the world tells the UI. The world scene emits; the HUD, panels and dialogue box (the UI
 * lane) subscribe with `onWorld` and attach themselves without reaching into the scene.
 */
export type WorldUiEvent =
  /** Arrived on a map: its id, Korean name and channel. */
  | { readonly t: "place"; readonly map: string; readonly name: string; readonly channel: number }
  /** The zones the player stands in changed (ids from the map's zones). */
  | { readonly t: "zones"; readonly zones: readonly string[] }
  /** A station, shop or board was used: open its panel. `kind` is the interactable kind. */
  | { readonly t: "open"; readonly id: string; readonly kind: string }
  /** A cast member answered the player: speaker id and the narrative text key. */
  | { readonly t: "talk"; readonly speaker: string; readonly text: string }
  /** A notice or lore object was read: its narrative name and description keys. */
  | { readonly t: "read"; readonly id: string; readonly name: string; readonly desc: string }
  /** The player pushed a door that will not open, and why: the line to say goes by `why`. */
  | { readonly t: "door"; readonly id: string; readonly why: DoorRefusal }
  /** The 급식 counter answered: served, already fed this meal, or sent home. */
  | { readonly t: "ate"; readonly id: string; readonly result: "ok" | "meal_full" | "sent_home" }
  /** A patrol's guard saw the player, who is back at the entrance with 벌점. */
  | { readonly t: "caught"; readonly patrol: string };

const listeners = new Set<(e: WorldUiEvent) => void>();

export function onWorld(listener: (e: WorldUiEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitWorld(e: WorldUiEvent): void {
  for (const l of listeners) l(e);
}
