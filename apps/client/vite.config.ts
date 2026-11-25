import { defineConfig } from "vite";

/** Where the dev server sends `/api`: the game server's HTTP side. */
const api = process.env.API_TARGET ?? "http://localhost:2567";

export default defineConfig({
  server: { port: 5173, strictPort: true, proxy: { "/api": { target: api, changeOrigin: true } } },
  build: {
    assetsInlineLimit: 0,
    // Phaser alone is about 1.5 MB minified (400 kB gzipped), inside the PLAN §19 first-load budget.
    chunkSizeWarningLimit: 2000,
  },
});
