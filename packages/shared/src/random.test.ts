import { describe, expect, it } from "vitest";
import { Random } from "./random.ts";

describe("Random", () => {
  it("replays the same rolls from the same seed", () => {
    const a = new Random(42);
    const b = new Random(42);
    const rollsA = Array.from({ length: 100 }, () => a.next());
    const rollsB = Array.from({ length: 100 }, () => b.next());
    expect(rollsA).toEqual(rollsB);
    expect(a.state).toBe(b.state);
  });

  it("resumes from a saved state", () => {
    const a = new Random(7);
    a.next();
    const resumed = new Random(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it("stays in range and roughly uniform", () => {
    const r = new Random(1);
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 40_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const k = r.int(4);
      buckets[k] = (buckets[k] ?? 0) + 1;
    }
    for (const count of buckets) expect(count).toBeGreaterThan(9_500);
  });

  it("weights choices", () => {
    const r = new Random(3);
    let heavy = 0;
    for (let i = 0; i < 10_000; i++)
      if (r.weighted(["a", "b"], (x) => (x === "a" ? 3 : 1)) === "a") heavy++;
    expect(heavy / 10_000).toBeGreaterThan(0.72);
    expect(heavy / 10_000).toBeLessThan(0.78);
  });
});
