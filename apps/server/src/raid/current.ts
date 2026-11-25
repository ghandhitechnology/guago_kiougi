/** The process's raid hub, for the map rooms' arenas (`raids()?.raidFor(bossId)`). */
import type { RaidHub } from "./hub.ts";

let hub: RaidHub | undefined;

/** Called once at server start. */
export function provideRaids(h: RaidHub | undefined): void {
  hub = h;
}

export function raids(): RaidHub | undefined {
  return hub;
}
