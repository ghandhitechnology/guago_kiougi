import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages,tools}/*/src/**/*.test.ts"],
    // Database tests run with `pnpm test:db` (vitest.db.config.ts).
    exclude: [...configDefaults.exclude, "**/*.db.test.ts"],
    // The fight replays and the property tests run for seconds on a busy machine.
    testTimeout: 30_000,
  },
});
