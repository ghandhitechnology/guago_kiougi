import { createEndpoint, createRouter, defineRoom, defineServer } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MAP_ROOM, SERVER_PORT } from "@guago/shared";
import { MapRoom } from "./map-room.ts";
import { allRooms } from "./metrics.ts";

// A full patch of a busy map overflows the default 16 kB encode buffer (engine-notes §15).
Encoder.BUFFER_SIZE = 128 * 1024;

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { [MAP_ROOM]: defineRoom(MapRoom) },
  routes: createRouter({
    metrics: createEndpoint("/metrics", { method: "GET" }, async () => ({ rooms: allRooms() })),
  }),
  greet: false,
});

const port = Number(process.env.PORT ?? SERVER_PORT);
await server.listen(port);
console.log(`game server on :${port}`);
