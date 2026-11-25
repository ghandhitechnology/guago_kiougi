import { Client, type Room } from "@colyseus/sdk";
import { MAP_ROOM, MapState, ROOMS_PATH } from "@guago/shared";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keeps one seat in the map room for as long as the page lives. Rooms are reached on the page's
 * own origin under ROOMS_PATH, so the session cookie goes along. `attach` wires a joined room and
 * returns a teardown; a failed join or a final leave waits and tries again, quietly. Short drops
 * are bridged by the SDK's own reconnection inside the room's 30 second window.
 */
export async function stayConnected(attach: (room: Room<unknown, MapState>) => () => void) {
  const client = new Client(ROOMS_PATH);
  let wait = 1000;
  for (;;) {
    try {
      const room = await client.joinOrCreate(MAP_ROOM, {}, MapState);
      wait = 1000;
      const detach = attach(room);
      await new Promise<void>((resolve) => room.onLeave(() => resolve()));
      detach();
    } catch {
      // No session yet, or the server is restarting; the ground stays up and we try again.
    }
    await sleep(wait);
    wait = Math.min(wait * 2, 8000);
  }
}
