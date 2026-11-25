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
  | { readonly t: "read"; readonly id: string; readonly name: string; readonly desc: string };

const listeners = new Set<(e: WorldUiEvent) => void>();

export function onWorld(listener: (e: WorldUiEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitWorld(e: WorldUiEvent): void {
  for (const l of listeners) l(e);
}
