import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema.ts";

export { schema };

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return Object.assign(db, { pool });
}

export type Db = ReturnType<typeof createDb>;

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../drizzle");

export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

/** Postgres error codes the services turn into API errors. */
export function pgErrorCode(error: unknown): { code?: string; constraint?: string } {
  const e = (error as { cause?: unknown })?.cause ?? error;
  if (typeof e !== "object" || e === null) return {};
  const { code, constraint } = e as { code?: unknown; constraint?: unknown };
  return {
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof constraint === "string" ? { constraint } : {}),
  };
}
