import { Client, type Room } from "@colyseus/sdk";
import { CLOSE_SESSION_REPLACED, MAP_ROOM, MapState, ROOMS_PATH } from "@guago/shared";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Which map room to sit in; the server ignores it outside development. */
export interface MapChoice {
  readonly map?: string;
}

export type JoinMap = (choice: MapChoice) => Promise<Room<unknown, MapState>>;

export interface MapLink {
  /** Leaves the map room the player is in and joins the next one; never read as a replaced seat. */
  moveTo(choice: MapChoice): Promise<void>;
  /** Settles when the link gives up for good: another tab or device took the seat. */
  readonly ended: Promise<"replaced">;
}

const joinOnPage: JoinMap = (() => {
  let client: Client | undefined;
  return (choice) => {
    client ??= new Client(ROOMS_PATH);
    return client.joinOrCreate(MAP_ROOM, choice, MapState);
  };
})();

/**
 * Keeps one seat in a map room for as long as the page lives. Rooms are reached on the page's
 * own origin under ROOMS_PATH, so the session cookie goes along. `attach` wires a joined room and
 * returns a teardown; a failed join or a dropped seat waits and tries again, quietly, and short
 * drops are bridged by the SDK's own reconnection inside the room's 30 second window. A seat
 * taken over by another tab or device ends the link: rejoining would only take it back and start
 * the two pages trading it forever.
 */
export function stayConnected(
  attach: (room: Room<unknown, MapState>) => () => void,
  join: JoinMap = joinOnPage,
): MapLink {
  let choice: MapChoice = {};
  let current: Room<unknown, MapState> | undefined;
  let moving = false;

  const run = async (): Promise<"replaced"> => {
    let wait = 1000;
    for (;;) {
      let room: Room<unknown, MapState>;
      try {
        room = await join(choice);
      } catch (error) {
        if ((error as { code?: unknown }).code === 409) return "replaced";
        // No session yet, or the server is restarting; the ground stays up and we try again.
        await sleep(wait);
        wait = Math.min(wait * 2, 8000);
        continue;
      }
      wait = 1000;
      current = room;
      const detach = attach(room);
      const code = await new Promise<number>((resolve) => room.onLeave((c) => resolve(c)));
      detach();
      current = undefined;
      if (code === CLOSE_SESSION_REPLACED) return "replaced";
      if (moving) {
        moving = false;
        continue;
      }
      await sleep(wait);
    }
  };

  return {
    ended: run(),
    async moveTo(next) {
      choice = next;
      moving = true;
      // A consented leave first, so the old room is gone before the next one seats us.
      await current?.leave(true);
    },
  };
}
