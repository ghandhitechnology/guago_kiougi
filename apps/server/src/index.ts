import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MAP_ROOM, SERVER_PORT } from "@guago/shared";
import { MapRoom } from "./map-room.ts";

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { [MAP_ROOM]: defineRoom(MapRoom) },
  greet: false,
});

const port = Number(process.env.PORT ?? SERVER_PORT);
await server.listen(port);
console.log(`game server on :${port}`);
