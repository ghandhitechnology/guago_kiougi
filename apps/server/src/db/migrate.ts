/** `pnpm db:migrate`: applies the checked-in migrations to DATABASE_URL (default: local dev). */
import { config } from "../config.ts";
import { createDb, migrateDb } from "./index.ts";

const db = createDb(process.argv[2] ?? config.databaseUrl);
try {
  await migrateDb(db);
  console.log(`migrated ${new URL(process.argv[2] ?? config.databaseUrl).pathname.slice(1)}`);
} finally {
  await db.pool.end();
}
