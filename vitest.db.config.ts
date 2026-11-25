import { defineConfig } from "vitest/config";

/** Integration tests against a real Postgres (PLAN §26). `pnpm db:start` first, or set TEST_DATABASE_URL. */
export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.db.test.ts"],
    globalSetup: ["apps/server/src/test/db-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
