import { describe, expect, it } from "vitest";
import { formatKorean } from "./korean.ts";

describe("formatKorean", () => {
  it("writes small numbers whole", () => {
    expect(formatKorean(0)).toBe("0");
    expect(formatKorean(7.9)).toBe("7");
    expect(formatKorean(9999)).toBe("9999");
  });

  it("keeps four significant digits in 만, 억 and 조", () => {
    expect(formatKorean(10_000)).toBe("1만");
    expect(formatKorean(12_345)).toBe("1.234만");
    expect(formatKorean(123_456)).toBe("12.34만");
    expect(formatKorean(1_234_567)).toBe("123.4만");
    expect(formatKorean(12_345_678)).toBe("1234만");
    expect(formatKorean(99_999_999)).toBe("9999만");
    expect(formatKorean(100_000_000)).toBe("1억");
    expect(formatKorean(150_000_000)).toBe("1.5억");
    expect(formatKorean(3.07e12)).toBe("3.07조");
  });

  it("never rounds up into the next unit", () => {
    expect(formatKorean(99_995_000)).toBe("9999만");
    expect(formatKorean(19_999)).toBe("1.999만");
  });

  it("stays in 조 past the font's last unit", () => {
    expect(formatKorean(1.2e16)).toBe("12000조");
    expect(formatKorean(-25_000)).toBe("-2.5만");
    expect(formatKorean(Number.NaN)).toBe("0");
  });
});
