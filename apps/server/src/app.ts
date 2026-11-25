import type { IncomingMessage, ServerResponse } from "node:http";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { type LookOptions, MAP_ROOM, WORLD_ROOM } from "@guago/shared";
import { type ApiRoute, createApiHandler, type HttpSettings } from "./auth/http.ts";
import type { AuthService } from "./auth/service.ts";
import type { ChatFilter } from "./chat/filter.ts";
import type { ChatSink } from "./chat/log.ts";
import type { OpHandler } from "./economy/handler.ts";
import { MapRoom } from "./map-room.ts";
import { provideSeatServices } from "./seats.ts";
import { provideWorldServices, WorldRoom } from "./world-room.ts";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** The rooms and the `/api` routes on one HTTP server (PLAN §19), ready to `listen`. */
export function createGameServer(
  auth: AuthService,
  settings: HttpSettings,
  looks: () => LookOptions,
  chat: { filter?: ChatFilter; log?: ChatSink } = {},
  economy: { ops?: OpHandler; routes?: readonly ApiRoute[] } = {},
) {
  provideSeatServices({ auth, ...settings });
  provideWorldServices({ ...chat, ...(economy.ops ? { ops: economy.ops } : {}) });
  const api = createApiHandler(auth, settings, looks, economy.routes);

  // Clients join rooms; they never create one on demand. Without `create`, the WorldRoom stays
  // the one the server made, and map rooms open only through `joinOrCreate`, when none has room.
  matchMaker.controller.exposedMethods = ["joinOrCreate", "join", "joinById", "reconnect"];
  // Colyseus echoes any Origin with credentials by default; only the client's origin may call us.
  matchMaker.controller.getCorsHeaders = () => ({
    "Access-Control-Allow-Origin": settings.clientOrigin,
    Vary: "Origin",
  });

  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { [MAP_ROOM]: defineRoom(MapRoom), [WORLD_ROOM]: defineRoom(WorldRoom) },
    express: (app: { disable(setting: string): void; use(handler: Middleware): void }) => {
      app.disable("x-powered-by");
      app.use(api);
    },
    greet: false,
  });
}
