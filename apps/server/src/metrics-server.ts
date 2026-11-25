import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { faults } from "./background.ts";
import { allRooms } from "./metrics.ts";

/**
 * Serves every room's numbers as JSON on a port of their own, bound to the loopback address
 * only. Not a route on the game server: anything the public proxy forwards there, under
 * `/rooms` or not, would arrive from loopback too.
 */
export function serveMetrics(
  port: number,
  host = "127.0.0.1",
  /** Loopback-only controls (the living world's `POST /admin/live`), for the same reason. */
  control?: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
): Promise<Server> {
  const notFound = (res: ServerResponse) => {
    res.statusCode = 404;
    res.end();
  };
  const server = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/metrics") {
      if (control) control(req, res, () => notFound(res));
      else notFound(res);
      return;
    }
    res.setHeader("content-type", "application/json");
    const { rss, heapUsed } = process.memoryUsage();
    // `faults`: timer, listener and background failures by name since start (background.ts).
    res.end(JSON.stringify({ rooms: allRooms(), memory: { rss, heapUsed }, faults: faults() }));
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
