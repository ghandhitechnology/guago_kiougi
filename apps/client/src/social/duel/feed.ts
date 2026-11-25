import type { Room } from "@colyseus/sdk";
import { type MapState, type SnapshotReader, WirePlayer } from "@guago/shared";
import type { FightFeed } from "../../world-events.ts";

/**
 * The fight as a floor's banner reads it from a map room: the newest tick the snapshot carried
 * (the clock counts down to the floor's `endsAt` in those ticks) and each fighter's health share,
 * from the 0–255 share every player body carries in the snapshot.
 */
export function fightFeed(
  room: Room<unknown, MapState>,
  reader: () => SnapshotReader | undefined,
): FightFeed {
  return {
    tick: () => reader()?.tick ?? 0,
    health(sid) {
      const r = reader();
      if (!r || !sid) return undefined;
      let slot = -1;
      for (const [k, p] of room.state.players) if (p.sid === sid) slot = Number(k);
      if (slot < 0) return undefined;
      for (const m of r.members.values()) {
        if (m.kind === WirePlayer && m.slot === slot) return m.hp / 255;
      }
      return undefined;
    },
  };
}
