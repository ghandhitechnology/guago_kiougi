/**
 * `pnpm db:migrate`: applies the checked-in migrations to DATABASE_URL (default: local dev).
 * Run it with the game server stopped. Migrations build indexes and validate checks on large
 * tables (`economy_ledger`) under locks that would stall a running server's writes; this is one
 * process with no live deploy yet, so the server is simply stopped for it.
 */
import { config } from "../config.ts";
import { createDb, migrateDb } from "./index.ts";

const db = createDb(process.argv[2] ?? config.databaseUrl);
try {
  await migrateDb(db);
  console.log(`migrated ${new URL(process.argv[2] ?? config.databaseUrl).pathname.slice(1)}`);
} finally {
  await db.pool.end();
}
