import type { IncomingMessage, ServerResponse } from "node:http";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MAP_ROOM } from "@guago/shared";
import { createApiHandler } from "./auth/http.ts";
import { createAuthService } from "./auth/service.ts";
import { assertDeployConfig, config } from "./config.ts";
import { createDb } from "./db/index.ts";
import { studentLooks } from "./looks.ts";
import { MapRoom } from "./map-room.ts";
import { evictAccount, provideSeatServices } from "./seats.ts";

assertDeployConfig();
studentLooks();

const db = createDb(config.databaseUrl);
const auth = createAuthService({ db, onSessionsRevoked: evictAccount });
provideSeatServices({ auth, ...config });
const api = createApiHandler(auth, config, studentLooks);

// Colyseus echoes any Origin with credentials by default; only the client's origin may call us.
matchMaker.controller.getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": config.clientOrigin,
  Vary: "Origin",
});

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { [MAP_ROOM]: defineRoom(MapRoom) },
  express: (app: { disable(setting: string): void; use(handler: Middleware): void }) => {
    app.disable("x-powered-by");
    app.use(api);
  },
  greet: false,
});

await server.listen(config.port);
setInterval(() => auth.sweep().catch(() => {}), 10 * 60 * 1000).unref();
console.log(`game server on :${config.port}`);
