/**
 * Depths of what the world scene draws outside the map view. The view is one layer at depth 0
 * that sorts, lights and shadows its own entities; anything at 1 or more draws over it, unlit.
 */
export const DUST_DEPTH = 1;
export const NAME_DEPTH = 2;
export const MARK_DEPTH = 3;
export const BUBBLE_DEPTH = 4;
export const PROMPT_DEPTH = 5;
export const CARD_DEPTH = 9;
export const FADE_DEPTH = 10;
