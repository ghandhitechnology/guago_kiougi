import type { Surface } from "@guago/audio";
import { TILE_SIZE } from "@guago/shared";
import { footstep } from "./audio.ts";

/** A terrain name from the art (`grass`, `walk`, `marble-dust`) as the sound a shoe makes on it. */
export function surfaceOf(terrain: string | null | undefined): Surface {
  const t = terrain ?? "";
  if (/grass|lawn|moss|turf/.test(t)) return "grass";
  if (/sand|beach|dust/.test(t)) return "sand";
  if (/dirt|path|field|soil|mud|track/.test(t)) return "dirt";
  if (/floor|wood|tile|carpet|board|mat/.test(t)) return "floor";
  return "stone";
}

/** What the ground is made of at a tile. */
export type SurfaceAt = (tx: number, ty: number) => Surface;

/** Steps fall off with distance and stop at this many pixels from the listener. */
const HEAR_PX = 8 * TILE_SIZE;
/** Pan reaches full left or right this far to the side. */
const PAN_PX = 6 * TILE_SIZE;

/**
 * Footstep sounds on the ground under the feet: the player's own at full volume, everyone else's
 * quieter with distance and panned to where they walk.
 */
export class StepSounds {
  private readonly surfaceAt: SurfaceAt;

  constructor(surfaceAt: SurfaceAt) {
    this.surfaceAt = surfaceAt;
  }

  step(x: number, y: number, listener: { x: number; y: number } | undefined, self: boolean): void {
    const surface = this.surfaceAt(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
    if (self || !listener) {
      footstep(surface, 0, self ? 0.9 : 0.5);
      return;
    }
    const dx = x - listener.x;
    const d = Math.hypot(dx, y - listener.y);
    if (d >= HEAR_PX) return;
    footstep(surface, dx / PAN_PX, 0.45 * (1 - d / HEAR_PX));
  }
}
