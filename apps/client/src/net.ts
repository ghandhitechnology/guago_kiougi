import { Client, type Room } from "@colyseus/sdk";
import { MAP_ROOM, MapState, SERVER_PORT } from "@guago/shared";

function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.hostname}:${SERVER_PORT}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keeps one seat in the map room for as long as the page lives. `attach` wires a joined room
 * and returns a teardown; a failed join or a final leave waits and tries again, quietly.
 */
export async function stayConnected(attach: (room: Room<unknown, MapState>) => () => void) {
  const client = new Client(serverUrl());
  let wait = 1000;
  for (;;) {
    try {
      const room = await client.joinOrCreate(MAP_ROOM, {}, MapState);
      wait = 1000;
      const detach = attach(room);
      await new Promise<void>((resolve) => room.onLeave(() => resolve()));
      detach();
    } catch {
      // The server is down or restarting; the ground stays up and we try again.
    }
    await sleep(wait);
    wait = Math.min(wait * 2, 8000);
  }
}
