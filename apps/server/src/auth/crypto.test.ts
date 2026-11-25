import { describe, expect, it } from "vitest";
import {
  deviceSource,
  HashBusy,
  hashSecret,
  MAX_HASH_WAITING,
  MAX_HASHING,
  newDeviceToken,
} from "./crypto.ts";

describe("hashing slots", () => {
  it("refuses hashes past the running and waiting caps instead of queueing them", async () => {
    const total = MAX_HASHING + MAX_HASH_WAITING + 8;
    const results = await Promise.allSettled(
      Array.from({ length: total }, (_, i) => hashSecret(`password ${i}`)),
    );
    const refused = results.filter((r) => r.status === "rejected");
    expect(refused).toHaveLength(8);
    for (const r of refused) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(HashBusy);
    // The slots drain: a later hash runs.
    await expect(hashSecret("afterwards")).resolves.toMatch(/^\$argon2id\$/);
  });
});

describe("device cookie", () => {
  it("counts only for the login id it was issued to, and only with the right key", () => {
    const token = newDeviceToken("sora_01", "key");
    expect(deviceSource(token, "sora_01", "key")).toMatch(/^device:[0-9a-f]{64}$/);
    expect(deviceSource(token, "someone", "key")).toBeNull();
    expect(deviceSource(token, "sora_01", "other key")).toBeNull();
    expect(deviceSource(`${token}x`, "sora_01", "key")).toBeNull();
    expect(deviceSource(undefined, "sora_01", "key")).toBeNull();
  });
});
