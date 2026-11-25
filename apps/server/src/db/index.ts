import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema.ts";

export { schema };

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  // An idle connection dropped by the server (restart, forced disconnect) must not crash the
  // process; the pool reconnects on the next query.
  pool.on("error", (error) => console.error("database connection lost:", error.message));
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

/**
 * A log line for a failed query that never carries its parameters: Drizzle's own message embeds
 * them (password and recovery-code hashes included), and Postgres messages can quote input.
 */
export function describeError(error: unknown): string {
  const cause = (error as { cause?: unknown })?.cause ?? error;
  const { code, constraint } = pgErrorCode(cause);
  if (code) {
    const { table, routine } = cause as { table?: unknown; routine?: unknown };
    return [`postgres ${code}`, constraint, table, routine]
      .filter((v) => typeof v === "string")
      .join(" ");
  }
  if (!(error instanceof Error)) return "unknown error";
  // A query error without a database code still has the parameters in its message.
  return "params" in error ? error.name : `${error.name}: ${error.message}`;
}
