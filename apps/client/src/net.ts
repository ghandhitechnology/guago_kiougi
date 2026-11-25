import { Client, type Room } from "@colyseus/sdk";
import { MAP_ROOM, MapState, SERVER_PORT } from "@guago/shared";

/**
 * The game server's address: `VITE_SERVER_URL` when set, else this host on `VITE_SERVER_PORT`
 * (default 2567). In development `?server=ws://host:port` overrides both, so one dev server can
 * feed clients that go through the link simulator and clients that do not.
 */
function serverUrl(): string {
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(location.search).get("server");
    if (override) return override;
  }
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const port = (import.meta.env.VITE_SERVER_PORT as string | undefined) ?? String(SERVER_PORT);
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.hostname}:${port}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keeps one seat in the map room for as long as the page lives. `attach` wires a joined room
 * and returns a teardown; a failed join or a final leave waits and tries again, quietly. Short
 * drops are bridged by the SDK's own reconnection inside the room's 30 second window.
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
