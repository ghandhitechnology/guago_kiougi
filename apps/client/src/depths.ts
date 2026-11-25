/**
 * Depths of what the world scene draws outside the map view. The view is one layer at depth 0
 * that sorts, lights and shadows its own entities; anything at 1 or more draws over it, unlit.
 * The world overlays (nameplates, bubbles, the prompt) sit at 1 000 000 and up.
 */
export const CONE_DEPTH = 1.5;
export const MARK_DEPTH = 3;
/** Over everything, the overlays included. */
export const FADE_DEPTH = 2_000_000;
