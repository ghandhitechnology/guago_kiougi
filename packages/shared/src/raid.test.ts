import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS } from "./live.ts";
import {
  bossShareOf,
  calibrateHp,
  countsObjective,
  type DamageWindow,
  isActive,
  isDebateHour,
  NO_DAMAGE,
  nextDebate,
  phaseFloor,
  RAID,
  RaidTier,
  raidDamage,
  regrowShield,
  stripShield,
  tierOf,
} from "./raid.ts";

/** `days` of the server dealing `daily` a day, a boss standing all of it and drawing `share`. */
function window(daily: number, days: number, share: number): DamageWindow {
  const total = daily * days;
  return {
    total,
    boss: total * share,
    measuredMs: days * DAY_MS,
    standingMs: days * DAY_MS,
    totalStanding: total,
  };
}

describe("phase HP calibration", () => {
  it("sizes a phase to about 4.5 days of the damage a standing boss draws", () => {
    const hp = calibrateHp("era", 100, window(5e9, 14, 0.4));
    expect(hp).toBe(Math.round(5e9 * 0.4 * 4.5));
  });

  it("empties in the target days at the measured rate, era or mid", () => {
    const w = window(3e9, 14, 0.5);
    expect(calibrateHp("era", 100, w) / (3e9 * 0.5)).toBeCloseTo(RAID.targetDays.era, 6);
    expect(calibrateHp("mid", 50, w) / (3e9 * 0.5)).toBeCloseTo(RAID.targetDays.mid, 6);
  });

  it("follows a server that grows or shrinks", () => {
    const busy = calibrateHp("era", 100, window(8e9, 14, 0.4));
    const quiet = calibrateHp("era", 100, window(2e9, 14, 0.4));
    expect(busy / quiet).toBeCloseTo(4, 6);
  });

  it("reads a shorter history as a rate, so a week-old server is sized the same", () => {
    expect(calibrateHp("era", 100, window(5e9, 7, 0.4))).toBe(
      calibrateHp("era", 100, window(5e9, 14, 0.4)),
    );
  });

  it("never looks back further than 14 days", () => {
    const w = { ...window(5e9, 14, 0.4), total: 5e9 * 28, measuredMs: 28 * DAY_MS };
    expect(calibrateHp("era", 100, w)).toBe(Math.round(((5e9 * 28) / 14) * 0.4 * 4.5));
  });

  it("assumes the default share until a boss has stood for six hours of the window", () => {
    const none = { ...window(5e9, 14, 0.9), standingMs: 5 * HOUR_MS };
    expect(bossShareOf(none)).toBe(RAID.bossShare);
    expect(bossShareOf(window(5e9, 14, 0.9))).toBeCloseTo(0.9, 9);
    expect(bossShareOf(window(5e9, 14, 0))).toBe(RAID.minShare);
  });

  it("stretches a few minutes of history to six hours instead of trusting it", () => {
    const w = { ...NO_DAMAGE, total: 1e12, measuredMs: 60_000 };
    expect(calibrateHp("era", 100, w)).toBe(
      Math.round((1e12 / (6 * HOUR_MS)) * DAY_MS * RAID.bossShare * 4.5),
    );
  });

  it("puts a new or tiny server on the floor for the boss's level", () => {
    expect(calibrateHp("era", 100, NO_DAMAGE)).toBe(Math.round(phaseFloor("era", 100)));
    expect(calibrateHp("era", 100, window(1, 14, 1))).toBe(Math.round(phaseFloor("era", 100)));
    expect(phaseFloor("era", 100)).toBeGreaterThan(phaseFloor("mid", 100));
    expect(phaseFloor("era", 200) / phaseFloor("era", 100)).toBeCloseTo(10, 6);
  });

  it("shrinks the floor with the Page clock, so a compressed server's floor is the same fighting", () => {
    expect(phaseFloor("era", 100, 1456) * 1456).toBeCloseTo(phaseFloor("era", 100), 3);
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
  const floor = RAID.tiers.present.activeMs;

  it("gives 참석 to a hit landed with five minutes of fighting, not to a last-second hit", () => {
    expect(tierOf(none)).toBe(RaidTier.None);
    expect(tierOf({ ...none, damage: 1e12 })).toBe(RaidTier.None);
    expect(tierOf({ ...none, damage: 1, activeMs: floor })).toBe(RaidTier.Present);
    expect(tierOf({ ...none, support: 50, activeMs: 3 * HOUR_MS })).toBe(RaidTier.None);
  });

  it("gives 기여 for 30 minutes or 3 objectives, 핵심 for 2 hours or 10, all on the floor", () => {
    expect(tierOf({ ...none, damage: 1, activeMs: 30 * 60_000 })).toBe(RaidTier.Contributor);
    expect(tierOf({ ...none, objectives: 3, activeMs: floor })).toBe(RaidTier.Contributor);
    expect(tierOf({ ...none, damage: 1, activeMs: 2 * HOUR_MS })).toBe(RaidTier.Core);
    expect(tierOf({ ...none, objectives: 10, activeMs: floor })).toBe(RaidTier.Core);
    expect(tierOf({ ...none, objectives: 10, activeMs: floor - 1 })).toBe(RaidTier.None);
    expect(tierOf({ ...none, damage: 1e12, activeMs: 29 * 60_000 })).toBe(RaidTier.Present);
  });

  it("counts an objective toward a tier at most once every six Page minutes", () => {
    let last: number | undefined;
    let counted = 0;
    // An alt walking zone to zone, an objective every 6 s for two minutes.
    for (let t = 0; t <= 120_000; t += 6000) {
      if (countsObjective(last, t)) {
        counted++;
        last = t;
      }
    }
    expect(counted).toBe(1);
    expect(countsObjective(0, RAID.objectiveGapMs)).toBe(true);
    expect(countsObjective(0, RAID.objectiveGapMs - 1)).toBe(false);
  });
});

describe("active fighting", () => {
  const at = { away: false, serverMoves: false, inputAt: 0, movedAt: 0, hitAt: 0 };
  const w = RAID.activeWindowTicks;

  it("is the player's own input within the window", () => {
    expect(isActive({ ...at, inputAt: 100 }, 100 + w - 1)).toBe(true);
    expect(isActive({ ...at, inputAt: 100 }, 100 + w)).toBe(false);
  });

  it("is never a dropped client's body, whatever it does", () => {
    const busy = { serverMoves: true, inputAt: 100, movedAt: 100, hitAt: 100 };
    expect(isActive({ ...busy, away: true }, 101)).toBe(false);
  });

  it("is never a body standing still with its books firing", () => {
    expect(isActive({ ...at, hitAt: 100 }, 101)).toBe(false);
    expect(isActive({ ...at, serverMoves: true, hitAt: 100 }, 101)).toBe(false);
  });

  it("is 완전 자동 with the tab open while it moves and hits, as anyone else", () => {
    expect(isActive({ ...at, serverMoves: true, hitAt: 100, movedAt: 99 }, 101)).toBe(true);
    expect(isActive({ ...at, serverMoves: false, hitAt: 100, movedAt: 99 }, 101)).toBe(false);
  });
});

describe("the shield", () => {
  it("lets a fifth through a full shield and everything through none, half again at night", () => {
    expect(raidDamage(100, 1, false)).toBeCloseTo(20);
    expect(raidDamage(100, 0, false)).toBe(100);
    expect(raidDamage(100, 0.5, false)).toBeCloseTo(60);
    expect(raidDamage(100, 0, true)).toBe(150);
  });

  it("loses the same share per objective whoever does it, and grows back on the Page clock", () => {
    expect(stripShield(1, 4)).toBeCloseTo(0.8);
    expect(stripShield(0.1, 4)).toBe(0);
    expect(regrowShield(0.5, 2 * HOUR_MS)).toBeCloseTo(0.7);
    expect(regrowShield(0.95, 10 * HOUR_MS)).toBe(1);
  });
});
