import type * as Phaser from "phaser";
import { edges } from "../ui/screen.ts";

/**
 * The column under the minimap where small moments land (a 도감 entry found, a notice done), so
 * several arriving together sit one under another instead of on top of each other.
 */

const held: { y: number; h: number }[] = [];
const GAP = 4;

/** The top of a free slot `h` tall under the minimap, held for `ms`. */
export function momentSlot(scene: Phaser.Scene, h: number, ms: number): number {
  const top = edges().top + 90;
  let y = top;
  for (const s of [...held].sort((a, b) => a.y - b.y)) {
    if (y + h + GAP <= s.y) break;
    y = Math.max(y, s.y + s.h + GAP);
  }
  const slot = { y, h };
  held.push(slot);
  scene.time.delayedCall(ms, () => {
    const i = held.indexOf(slot);
    if (i >= 0) held.splice(i, 1);
  });
  return y;
}
