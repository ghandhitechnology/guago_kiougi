/** Fixed simulation step rate (PLAN §19). */
export const TICK_RATE_HZ = 20;
export const TICK_MS = 1000 / TICK_RATE_HZ;

/** Internal render resolution, integer-scaled only (PLAN §6, §16). */
export const INTERNAL_WIDTH = 480;
export const INTERNAL_HEIGHT = 270;

/** Tile edge in pixels (PLAN §6). */
export const TILE_SIZE = 16;

/** Player sprite frame in pixels (PLAN §16). */
export const PLAYER_SPRITE_WIDTH = 16;
export const PLAYER_SPRITE_HEIGHT = 24;

/** Interest management cell edge in tiles (PLAN §19). */
export const INTEREST_CELL_TILES = 16;

/** Collision spatial hash cell edge in pixels (PLAN §6). */
export const SPATIAL_HASH_CELL_PX = 32;
