import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS } from "./live.ts";
import {
  calibrateHp,
  isDebateHour,
  nextDebate,
  phaseFloor,
  RAID,
  RaidTier,
  raidDamage,
  tierOf,
} from "./raid.ts";

describe("phase HP calibration", () => {
  it("sizes a phase to about 4.5 days of the server's daily damage", () => {
    const daily = 50_000_000;
    const hp = calibrateHp("era", 100, { damage: daily * 14, measuredMs: 14 * DAY_MS });
    expect(hp).toBe(Math.round(daily * 4.5));
  });

  it("reads a shorter history as a rate, so a week-old server is sized the same", () => {
    const daily = 50_000_000;
    const week = calibrateHp("era", 100, { damage: daily * 7, measuredMs: 7 * DAY_MS });
    const two = calibrateHp("era", 100, { damage: daily * 14, measuredMs: 14 * DAY_MS });
    expect(week).toBe(two);
  });

  it("never looks back further than 14 days", () => {
    const hp = calibrateHp("mid", 50, { damage: 28e9, measuredMs: 28 * DAY_MS });
    expect(hp).toBe(Math.round((28e9 / 14) * RAID.targetDays.mid));
  });

  it("stretches a few minutes of history to six hours instead of trusting it", () => {
    const tiny = calibrateHp("era", 100, { damage: 1e9, measuredMs: 60_000 });
    expect(tiny).toBe(Math.round((1e9 / (6 * HOUR_MS)) * DAY_MS * 4.5));
  });

  it("puts a new or empty server on the floor for the boss's level", () => {
    expect(calibrateHp("era", 100, { damage: 0, measuredMs: 0 })).toBe(phaseFloor("era", 100));
    expect(phaseFloor("era", 100)).toBeGreaterThan(phaseFloor("mid", 100));
    expect(phaseFloor("era", 200)).toBeGreaterThan(phaseFloor("era", 100));
  });

  it("sizes the bar so the measured rate empties it in the target days", () => {
    const daily = 3e8;
    const hp = calibrateHp("era", 1, { damage: daily * 14, measuredMs: 14 * DAY_MS });
    expect(hp / daily).toBeCloseTo(4.5, 6);
  });
});

describe("토론 시간", () => {
  // 2026-01-01 00:00 UTC is 09:00 KST.
  const midnightUtc = Date.UTC(2026, 0, 1);
  it("runs from 21:00 to 22:00 Korean time", () => {
    expect(isDebateHour(midnightUtc + 12 * HOUR_MS)).toBe(true); // 21:00 KST
    expect(isDebateHour(midnightUtc + 12.99 * HOUR_MS)).toBe(true);
    expect(isDebateHour(midnightUtc + 13 * HOUR_MS)).toBe(false); // 22:00 KST
    expect(isDebateHour(midnightUtc + 11.99 * HOUR_MS)).toBe(false);
  });

  it("knows when the next one starts", () => {
    expect(nextDebate(midnightUtc)).toBe(midnightUtc + 12 * HOUR_MS);
    expect(nextDebate(midnightUtc + 12.5 * HOUR_MS)).toBe(midnightUtc + 12.5 * HOUR_MS);
    expect(nextDebate(midnightUtc + 13 * HOUR_MS)).toBe(midnightUtc + 36 * HOUR_MS);
  });
});

describe("participation tiers", () => {
  const none = { damage: 0, activeMs: 0, objectives: 0, support: 0 };
  it("counts a single hit as 참석", () => {
    expect(tierOf(none)).toBe(RaidTier.None);
    expect(tierOf({ ...none, damage: 1 })).toBe(RaidTier.Present);
  });

  it("gives 기여 for 30 minutes or 3 objectives, 핵심 for 2 hours or 10", () => {
    expect(tierOf({ ...none, damage: 1, activeMs: 30 * 60_000 })).toBe(RaidTier.Contributor);
    expect(tierOf({ ...none, objectives: 3 })).toBe(RaidTier.Contributor);
    expect(tierOf({ ...none, damage: 1, activeMs: 2 * HOUR_MS })).toBe(RaidTier.Core);
    expect(tierOf({ ...none, objectives: 10 })).toBe(RaidTier.Core);
    expect(tierOf({ ...none, damage: 1e12, activeMs: 29 * 60_000 })).toBe(RaidTier.Present);
  });
});

describe("damage through the shield", () => {
  it("lets a fifth through a full shield and everything through none, half again at night", () => {
    expect(raidDamage(100, 1, false)).toBeCloseTo(20);
    expect(raidDamage(100, 0, false)).toBe(100);
    expect(raidDamage(100, 0.5, false)).toBeCloseTo(60);
    expect(raidDamage(100, 0, true)).toBe(150);
  });
});
