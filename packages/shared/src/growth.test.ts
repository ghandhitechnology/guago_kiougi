import { describe, expect, it } from "vitest";
import { growth } from "./growth";

describe("growth", () => {
  it("is 1 at level 0", () => {
    expect(growth(0)).toBe(1);
  });

  it("multiplies by 10 every 100 levels", () => {
    expect(growth(100)).toBeCloseTo(10, 12);
    expect(growth(200)).toBeCloseTo(100, 10);
    expect(growth(400)).toBeCloseTo(10_000, 8);
  });

  it("is a smooth exponential between Pages", () => {
    expect(growth(50)).toBeCloseTo(Math.sqrt(10), 12);
    expect(growth(130) / growth(30)).toBeCloseTo(10, 12);
  });
});
