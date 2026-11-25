/** Recreates the test database schema from the checked-in migrations before the run. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createDb, migrateDb } from "../db/index.ts";
import { ART_JSON } from "../looks.ts";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://guago:guago@127.0.0.1:54329/guago_test";

export default async function setup(): Promise<void> {
  if (!existsSync(ART_JSON)) execFileSync("pnpm", ["art:build"], { stdio: "ignore" });
  const db = createDb(TEST_DATABASE_URL);
  try {
    await db.pool.query("select 1").catch(() => {
      throw new Error(`no database at ${TEST_DATABASE_URL}; run pnpm db:start`);
    });
    await db.pool.query("drop schema if exists drizzle cascade");
    await db.pool.query("drop schema public cascade");
    await db.pool.query("create schema public");
    await migrateDb(db);
  } finally {
    await db.pool.end();
  }
}
