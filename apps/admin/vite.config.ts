import { defineConfig } from "vite";

/**
 * The admin page. In development Vite serves it and proxies `/admin/api` to the admin listener
 * (start the server with `ADMIN_ORIGIN=http://localhost:<ADMIN_DEV_PORT>`). Built, the admin
 * listener serves `dist` itself on its own address.
 */
export default defineConfig({
  server: {
    port: Number(process.env.ADMIN_DEV_PORT ?? 5174),
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/admin/api": { target: process.env.ADMIN_API_URL ?? "http://127.0.0.1:2767" },
    },
  },
  build: { assetsInlineLimit: 0 },
});
