import { describe, expect, it } from "vitest";
import {
  deviceSource,
  HashBusy,
  hashSecret,
  ipKey,
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

describe("ipKey", () => {
  it("counts an IPv6 address by its /64 and an IPv4-mapped one as IPv4", () => {
    expect(ipKey("2001:db8:1:2:aaaa::1")).toBe(ipKey("2001:0db8:0001:0002:bbbb:cccc:dddd:eeee"));
    expect(ipKey("2001:db8:1:2::1")).not.toBe(ipKey("2001:db8:1:3::1"));
    expect(ipKey("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(ipKey("10.0.0.1")).toBe("10.0.0.1");
  });
});
