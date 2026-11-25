/** Retention maintenance against a real Postgres: old partitions go without stalling inserts. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/index.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { maintainChatLog } from "./log.ts";

let db: Db;

beforeAll(() => {
  db = createDb(TEST_DATABASE_URL);
});
afterAll(async () => {
  await db.pool.end();
});

const partitions = async () =>
  (
    await db.pool.query<{ relname: string }>(
      "select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'chat_log'::regclass order by 1",
    )
  ).rows.map((r) => r.relname);

describe("chat_log maintenance", () => {
  it("drops a partition past retention while a long read runs, and inserts never wait", async () => {
    await db.pool.query(
      "create table if not exists chat_log_20200101 partition of chat_log for values from ('2020-01-01 00:00+00') to ('2020-01-02 00:00+00')",
    );
    // A long read holds its lock on the table the whole time.
    const reader = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await reader.connect();
    await reader.query("begin");
    await reader.query("select count(*) from chat_log");

    const maintaining = maintainChatLog(db).then(
      () => "done",
      () => "deferred",
    );
    await new Promise((r) => setTimeout(r, 100));
    const started = performance.now();
    await db.pool.query(
      "insert into chat_log (channel, body, masked, at) values ('near', 'still here', false, now())",
    );
    const insertMs = performance.now() - started;
    const outcome = await maintaining;
    await reader.query("commit");
    await reader.end();

    expect(insertMs).toBeLessThan(250);
    // Behind the read the drop either finished or gave up after its lock timeout; the next run
    // finishes it either way.
    expect(["done", "deferred"]).toContain(outcome);
    await maintainChatLog(db);
    expect(await partitions()).not.toContain("chat_log_20200101");
  });
});
