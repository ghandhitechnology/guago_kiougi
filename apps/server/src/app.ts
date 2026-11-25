import type { IncomingMessage, ServerResponse } from "node:http";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { type LookOptions, MAP_ROOM, WORLD_ROOM } from "@guago/shared";
import { type ApiRoute, createApiHandler, type HttpSettings } from "./auth/http.ts";
import type { AuthService } from "./auth/service.ts";
import { channels } from "./channels.ts";
import type { ChatFilter } from "./chat/filter.ts";
import type { ChatSink } from "./chat/log.ts";
import { type GrantBuffer, provideGrants } from "./economy/grants.ts";
import type { OpHandler } from "./economy/handler.ts";
import { enterRoute } from "./enter.ts";
import { sendHomeOnExpel } from "./home.ts";
import type { Live } from "./live/index.ts";
import { MapRoom } from "./map-room.ts";
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
  economy: {
    ops?: OpHandler;
    routes?: readonly ApiRoute[];
    grants?: GrantBuffer;
    live?: Live;
  } = {},
  world: { channelSeats?: number; emptyGraceSeconds?: number } = {},
) {
  const { grants, live } = economy;
  provideGrants(grants);
  // A character's pending combat credit lands before their seat is freed, so the next login
  // reads it; then the living world ends the session (the 자습 pool starts at logout).
  provideSeatServices({
    auth,
    ...settings,
    onLeave: async (id, slot, sessionId, replaced) => {
      await grants?.flush(id);
      await live?.left(id, slot, sessionId, replaced);
    },
    ...(live ? { onJoin: live.joined } : {}),
  });
  provideWorldServices({
    ...chat,
    ...(economy.ops ? { ops: economy.ops } : {}),
    ...(live ? { handlers: live.handlers } : {}),
  });
  if (world.channelSeats !== undefined) channels.seats = world.channelSeats;
  if (world.emptyGraceSeconds !== undefined) channels.graceSeconds = world.emptyGraceSeconds;
  const api = createApiHandler(auth, settings, looks, economy.routes);
  const enter = enterRoute();
  if (live) sendHomeOnExpel(live);

  // Clients join rooms; they never create one. Without `create`, the WorldRoom stays the one the
  // server made. Map rooms refuse every client matchmaking call: their seats come from
  // `POST /api/enter` and from doors, reserved by the server (channels.ts).
  matchMaker.controller.exposedMethods = ["joinOrCreate", "join", "joinById", "reconnect"];
  // Colyseus echoes any Origin with credentials by default; only the client's origin may call us.
  matchMaker.controller.getCorsHeaders = () => ({
    "Access-Control-Allow-Origin": settings.clientOrigin,
    Vary: "Origin",
  });

  return defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      [MAP_ROOM]: defineRoom(MapRoom),
      [WORLD_ROOM]: defineRoom(WorldRoom),
    },
    express: (app: { disable(setting: string): void; use(handler: Middleware): void }) => {
      app.disable("x-powered-by");
      app.use(enter);
      if (live) app.use(live.adminRoute);
      app.use(api);
    },
    greet: false,
  });
}
