/**
 * Duel origins against a real Postgres (review finding 14): a fighter's place before its match
 * survives a crash and is written back, one character at a time or all at server start.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/index.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { dbOrigins } from "./origins.ts";

let db: Db;
let next = 0;

async function character(): Promise<string> {
  const n = ++next;
  const { rows } = await db.execute(sql`
    with a as (
      insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
      values (${`origin${n}-${Date.now()}`}, 'x', true, 'ip') returning id)
    insert into characters (account_id, name, major, look, map_id, x, y, cohort, level)
    select id, ${`org${n}${Date.now() % 100000}`}, 'math', '{}'::jsonb, 'saebyeok', 600, 220, 1, 1
    from a returning id`);
  return rows[0]?.id as string;
}

async function placeOf(id: string) {
  const { rows } = await db.execute(sql`select map_id, x, y from characters where id = ${id}`);
  return rows[0] as { map_id: string; x: number; y: number };
}

beforeAll(() => {
  db = createDb(TEST_DATABASE_URL);
});

afterAll(async () => {
  await db.pool.end();
});

describe("duel origins", () => {
  it("put one fighter back, and every stranded one at start, then forget them", async () => {
    const origins = dbOrigins(db);
    const a = await character();
    const b = await character();
    const c = await character();
    await origins.save([
      { characterId: a, map: "campus-yard", x: 300, y: 310 },
      { characterId: b, map: "cafeteria", x: 120, y: 140 },
      { characterId: c, map: "p1-agora", x: 50, y: 60 },
    ]);
    await origins.restore(a);
    expect(await placeOf(a)).toEqual({ map_id: "campus-yard", x: 300, y: 310 });
    expect(await placeOf(b)).toMatchObject({ map_id: "saebyeok" });
    // Home already: nothing to put back for it at start.
    await origins.forget(c);
    expect(await origins.restoreAll()).toBeGreaterThanOrEqual(1);
    expect(await placeOf(b)).toEqual({ map_id: "cafeteria", x: 120, y: 140 });
    expect(await placeOf(c)).toMatchObject({ map_id: "saebyeok" });
    const { rows } = await db.execute(sql`select count(*)::int as n from duel_origins`);
    expect(rows[0]?.n).toBe(0);
  });
});
