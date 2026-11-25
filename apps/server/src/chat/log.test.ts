import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.ts";
import { ChatLog, type ChatLogRow } from "./log.ts";

const row: ChatLogRow = {
  channel: "near",
  senderId: null,
  target: null,
  body: "안녕",
  masked: false,
  at: new Date(),
};

/** A database whose every insert fails, counting the attempts. */
function downDb() {
  const down = { inserts: 0 };
  const db = {
    insert: () => ({
      values: async () => {
        down.inserts++;
        throw new Error("connection refused");
      },
    }),
  } as unknown as Db;
  return { db, down };
}

afterEach(() => vi.restoreAllMocks());

describe("ChatLog while the database is down", () => {
  it("backs off instead of retrying on every line, and logs once", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, down } = downDb();
    const log = new ChatLog(db);
    for (let i = 0; i < 3000; i++) {
      log.push(row);
      if (i % 100 === 0) await new Promise((r) => setImmediate(r));
    }
    await log.flush();
    expect(down.inserts).toBe(1);
    expect(errors).toHaveBeenCalledTimes(1);
    await log.close();
  });
});
