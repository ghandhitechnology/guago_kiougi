import { defineConfig } from "vite";

/**
 * In development the browser talks to one origin: Vite proxies the HTTP API and the Colyseus
 * matchmaking and room sockets (under `/rooms`, see ROOMS_PATH in shared api.ts) to the game
 * server, so the session cookie reaches both.
 */
const gameServer = process.env.GAME_SERVER_URL ?? "http://localhost:2567";

export default defineConfig({
  server: {
    port: Number(process.env.CLIENT_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": { target: gameServer, xfwd: true },
      "/rooms": {
        target: gameServer,
        ws: true,
        xfwd: true,
        rewrite: (path) => path.replace(/^\/rooms/, ""),
      },
    },
  },
  build: {
    assetsInlineLimit: 0,
    // Phaser alone is about 1.5 MB minified (400 kB gzipped), inside the PLAN §19 first-load budget.
    chunkSizeWarningLimit: 2000,
  },
});
