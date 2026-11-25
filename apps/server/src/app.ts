import type { IncomingMessage, ServerResponse } from "node:http";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { type LookOptions, MAP_ROOM, WORLD_ROOM } from "@guago/shared";
import { type ApiRoute, createApiHandler, type HttpSettings } from "./auth/http.ts";
import type { AuthService } from "./auth/service.ts";
import type { ChatFilter } from "./chat/filter.ts";
import type { ChatSink } from "./chat/log.ts";
import { type GrantBuffer, provideGrants } from "./economy/grants.ts";
import type { OpHandler } from "./economy/handler.ts";
import { inventoryLoadouts } from "./fight/loadout.ts";
import { MapRoom, provideFightServices } from "./map-room.ts";
import { provideSeatServices } from "./seats.ts";
import type { Social } from "./social/index.ts";
import { provideWorldServices, WorldRoom } from "./world-room.ts";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

// A full patch of a busy map overflows the default 16 kB encode buffer (engine-notes §15).
Encoder.BUFFER_SIZE = 128 * 1024;

/** The rooms and the `/api` routes on one HTTP server (PLAN §19), ready to `listen`. */
export function createGameServer(
  auth: AuthService,
  settings: HttpSettings,
  looks: () => LookOptions,
  chat: { filter?: ChatFilter; log?: ChatSink; social?: Social } = {},
  economy: { ops?: OpHandler; routes?: readonly ApiRoute[]; grants?: GrantBuffer } = {},
) {
  const { grants } = economy;
  provideGrants(grants);
  // A character's pending combat credit lands before their seat is freed, so the next login
  // reads it.
  provideSeatServices({
    auth,
    ...settings,
    ...(grants ? { onLeave: (id: string) => grants.flush(id) } : {}),
  });
  provideWorldServices({ ...chat, ...(economy.ops ? { ops: economy.ops } : {}) });
  const ops = economy.ops;
  if (ops) provideFightServices({ loadouts: inventoryLoadouts((id) => ops.snapshot(id)) });
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
    rooms: {
      [MAP_ROOM]: defineRoom(MapRoom).filterBy(["map"]),
      [WORLD_ROOM]: defineRoom(WorldRoom),
    },
    express: (app: { disable(setting: string): void; use(handler: Middleware): void }) => {
      app.disable("x-powered-by");
      app.use(api);
    },
    greet: false,
  });
}
