import type { IncomingMessage, ServerResponse } from "node:http";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { type LookOptions, MAP_ROOM } from "@guago/shared";
import { createApiHandler, type HttpSettings } from "./auth/http.ts";
import type { AuthService } from "./auth/service.ts";
import { MapRoom } from "./map-room.ts";
import { allRooms } from "./metrics.ts";
import { provideSeatServices } from "./seats.ts";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

// A full patch of a busy map overflows the default 16 kB encode buffer (engine-notes §15).
Encoder.BUFFER_SIZE = 128 * 1024;

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** `GET /metrics`: every room's tick time, bandwidth and head counts, to tools on this machine only. */
const metrics: Middleware = (req, res, next) => {
  if (req.url !== "/metrics" || req.method !== "GET") return next();
  if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ rooms: allRooms() }));
};

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
      app.use(metrics);
      app.use(api);
    },
    greet: false,
  });
}
