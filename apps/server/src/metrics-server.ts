import { createServer, type Server } from "node:http";
import { allRooms } from "./metrics.ts";

/**
 * Serves every room's numbers as JSON on a port of their own, bound to the loopback address
 * only. Not a route on the game server: anything the public proxy forwards there, under
 * `/rooms` or not, would arrive from loopback too.
 */
export function serveMetrics(port: number, host = "127.0.0.1"): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/metrics") {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    const { rss, heapUsed } = process.memoryUsage();
    res.end(JSON.stringify({ rooms: allRooms(), memory: { rss, heapUsed } }));
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
