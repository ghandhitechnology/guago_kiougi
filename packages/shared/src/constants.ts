/** Fixed simulation step rate (PLAN §19). */
export const TICK_RATE_HZ = 20;
export const TICK_MS = 1000 / TICK_RATE_HZ;

/** Internal render resolution, integer-scaled only (PLAN §6, §16). */
export const INTERNAL_WIDTH = 480;
export const INTERNAL_HEIGHT = 270;

/** Tile edge in pixels (PLAN §6). */
export const TILE_SIZE = 16;

/**
 * Positions live on a grid of 1/POS_SCALE pixel, in the simulation and on the wire alike, so a
 * client predicting its own movement lands on exactly the value the server sends back. A uint16
 * coordinate on this grid reaches 8191 px, 511 tiles.
 */
export const POS_SCALE = 8;
export const MAX_MAP_PX = Math.floor(0xffff / POS_SCALE);

/** Player sprite frame in pixels (PLAN §16). */
export const PLAYER_SPRITE_WIDTH = 16;
export const PLAYER_SPRITE_HEIGHT = 24;

/** Interest management cell edge in tiles (PLAN §19). */
export const INTEREST_CELL_TILES = 16;

/** Collision spatial hash cell edge in pixels (PLAN §6). */
export const SPATIAL_HASH_CELL_PX = 32;

/** Game server port and the room every map runs in (PLAN §19 "Runtime topology"). */
export const SERVER_PORT = 2567;
export const MAP_ROOM = "map";

/** Seconds a dropped client keeps its seat (PLAN §19 "Reconnect"). */
export const RECONNECT_SECONDS = 30;

/** Clients draw other entities this far in the past (PLAN §19 "Other entities"). */
export const INTERPOLATION_DELAY_MS = 100;
