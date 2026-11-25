/**
 * 명령퇴사 (PLAN §11): the living world sends a player home; navigation moves them to the 집
 * at once, wherever they stand. Entering while sent home lands there too (`enter.ts`), and the
 * 집's room sends them back to school when the time is up (`MapRoom.letGoHome`).
 */
import { matchMaker } from "@colyseus/core";
import { guarded } from "./background.ts";
import type { Live } from "./live/index.ts";
import type { MapRoom } from "./map-room.ts";
import { places } from "./places.ts";
import { HOME_MAP } from "./world-maps.ts";

export function sendHomeOnExpel(l: Live): () => void {
  return l.onSentHome(
    guarded("send home", (characterId: string) => {
      const place = places.get(characterId);
      if (!place || place.mapId === HOME_MAP) return;
      const room = matchMaker.getLocalRoomById(place.roomId) as MapRoom | undefined;
      room?.relocate(characterId, HOME_MAP, "main", "home");
    }),
  );
}
