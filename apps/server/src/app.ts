import type { IncomingMessage, ServerResponse } from "node:http";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { type LookOptions, MAP_ROOM } from "@guago/shared";
import { createApiHandler, type HttpSettings } from "./auth/http.ts";
import type { AuthService } from "./auth/service.ts";
import { MapRoom } from "./map-room.ts";
import { provideSeatServices } from "./seats.ts";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** The rooms and the `/api` routes on one HTTP server (PLAN §19), ready to `listen`. */
export function createGameServer(
  auth: AuthService,
  settings: HttpSettings,
  looks: () => LookOptions,
) {
  provideSeatServices({ auth, ...settings });
  const api = createApiHandler(auth, settings, looks);

  // Colyseus echoes any Origin with credentials by default; only the client's origin may call us.
  matchMaker.controller.getCorsHeaders = () => ({
    "Access-Control-Allow-Origin": settings.clientOrigin,
    Vary: "Origin",
  });

  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { [MAP_ROOM]: defineRoom(MapRoom) },
    express: (app: { disable(setting: string): void; use(handler: Middleware): void }) => {
      app.disable("x-powered-by");
      app.use(api);
    },
    greet: false,
  });
}
