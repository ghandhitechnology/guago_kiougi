import { defineConfig } from "vite";

export default defineConfig({
  server: { port: Number(process.env.CLIENT_PORT ?? 5173), strictPort: true },
  build: {
    assetsInlineLimit: 0,
    // Phaser alone is about 1.5 MB minified (400 kB gzipped), inside the PLAN §19 first-load budget.
    chunkSizeWarningLimit: 2000,
  },
});
