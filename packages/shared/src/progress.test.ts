import { describe, expect, it } from "vitest";
import { earn, pay } from "./ledger.ts";
import { expToNext, killsPerLevel, monsterCoin, monsterEXP } from "./numbers.ts";
import {
  addExp,
  allocateStats,
  bestWindowRate,
  catchUp,
  claimPool,
  completeQuest,
  drowsyMult,
  hasUnlock,
  POOL,
  poolFill,
  questReward,
  repeatShare,
  resetStats,
  restedMult,
  statResetCost,
  tierAt,
} from "./progress.ts";
import { NO_STATS } from "./stats.ts";

describe("전직", () => {
  it("opens slots and unlocks by level", () => {
    expect(tierAt(1)).toMatchObject({ id: "freshman", books: 2, tools: 1 });
    expect(tierAt(59)).toMatchObject({ id: "first-year", books: 3, tools: 2 });
    expect(tierAt(100).id).toBe("second-year");
    expect(hasUnlock(tierAt(100), "minor")).toBe(true);
    expect(hasUnlock(tierAt(100), "trading")).toBe(true);
    expect(hasUnlock(tierAt(249), "evolution")).toBe(false);
    expect(tierAt(600)).toMatchObject({ books: 6, tools: 6 });
  });
});

describe("stats", () => {
  it("grants three points per level and refuses overspending", () => {
    expect(allocateStats(NO_STATS, { understanding: 30 }, 10).ok).toBe(true);
    expect(allocateStats(NO_STATS, { understanding: 31 }, 10).ok).toBe(false);
    expect(allocateStats(NO_STATS, { focus: -1 }, 10).ok).toBe(false);
  });

  it("charges a small growth-scaled reset fee", () => {
    expect(statResetCost(0)).toBe(50);
    expect(statResetCost(100)).toBe(500);
    const r = resetStats({ pinecone: 600 }, 100);
    expect(r.ok && r.state.purse.pinecone).toBe(100);
  });
});

describe("자습 pool", () => {
  const rate = { exp: 100, pinecone: 10, sheets: 0.01 };

  it("fills at its share for up to 8 hours", () => {
    const fill = poolFill(rate, 20 * 3600, "field");
    expect(fill.seconds).toBe(8 * 3600);
    expect(fill.exp).toBeCloseTo(100 * POOL.share * 8 * 3600, 6);
    expect(poolFill(rate, 3600, "dorm").exp).toBeCloseTo(100 * POOL.share * 3600, 6);
  });

  it("fills at its larger share for up to 10 hours in the 자습실, plus the 층장 hour", () => {
    const fill = poolFill(rate, 20 * 3600, "study-hall", true);
    expect(fill.seconds).toBe(11 * 3600);
    expect(fill.pinecone).toBeCloseTo(10 * POOL.studyHallShare * 11 * 3600, 6);
  });

  it("applies catch-up to the pool", () => {
    expect(poolFill(rate, 3600, "hub", false, 3).exp).toBeCloseTo(100 * POOL.share * 3600 * 3, 6);
  });

  it("takes the best ten-minute window by EXP", () => {
    const events = Array.from({ length: 1200 }, (_, t) => ({
      t,
      exp: t >= 500 && t < 1100 ? 5 : 1,
      pinecone: 1,
      sheets: 0,
    }));
    expect(bestWindowRate(events).exp).toBeCloseTo(5, 9);
    expect(bestWindowRate(events.slice(0, 300)).exp).toBe(0);
  });

  it("pays the purse and books it under the pool", () => {
    const r = claimPool({}, { exp: 50, pinecone: 12.7, sheets: 2.5, seconds: 60 }, "wangdo");
    if (!r.ok) throw new Error(r.error);
    expect(r.state.exp).toBe(50);
    expect(r.ledger).toEqual([
      { currency: "pinecone", amount: 12, key: "pool" },
      { currency: "sheet:wangdo", amount: 2, key: "pool" },
    ]);
  });
});

describe("EXP modifiers", () => {
  it("catches up by Pages to the frontier, up to ×8", () => {
    expect(catchUp(4, 4)).toBe(1);
    expect(catchUp(1, 3)).toBe(3);
    expect(catchUp(1, 12)).toBe(8);
  });

  it("rests for thirty minutes and gets drowsy after two hours of full auto", () => {
    expect(restedMult(true, 0)).toBe(1.5);
    expect(restedMult(true, 1800)).toBe(1);
    expect(restedMult(false, 0)).toBe(1);
    expect(drowsyMult(7199)).toBe(1);
    expect(drowsyMult(7200)).toBe(0.9);
  });
});

describe("수행평가", () => {
  it("steps repeatables down 100, 80, 60, 40, then 20%", () => {
    expect([0, 1, 2, 3, 4, 5, 30].map(repeatShare)).toEqual([1, 0.8, 0.6, 0.4, 0.2, 0.2, 0.2]);
  });

  it("pays in same-level kills, so a notice keeps its worth through a Page", () => {
    for (const level of [5, 50, 95]) {
      const daily = questReward("daily", level);
      expect(daily.exp / expToNext(level)).toBeCloseTo(150 / killsPerLevel(level), 9);
      expect(daily.pinecone).toBe(Math.round(monsterCoin(level, 1) * 150));
    }
    expect(questReward("repeat", 40, 2).exp).toBeCloseTo(monsterEXP(40, 1) * 50 * 0.6, 6);
  });

  it("books rewards under the cadence", () => {
    const r = completeQuest({}, questReward("weekly", 10), "weekly", "wangdo");
    if (!r.ok) throw new Error(r.error);
    expect(r.ledger.every((e) => e.key === "quest.weekly" && e.amount > 0)).toBe(true);
  });
});

describe("level and ledger arithmetic", () => {
  it("carries EXP across levels", () => {
    const r = addExp(1, 0, expToNext(1) + expToNext(2) + 5);
    expect(r.level).toBe(3);
    expect(r.exp).toBeCloseTo(5, 6);
  });

  it("refuses to pay what is not there and records signed entries", () => {
    expect(pay({ pinecone: 5 }, { pinecone: 6 }, "sink.x")).toBeNull();
    const e = earn({ pinecone: 5 }, { pinecone: 6, ink: 0 }, "drop");
    expect(e.purse.pinecone).toBe(11);
    expect(e.ledger).toEqual([{ currency: "pinecone", amount: 6, key: "drop" }]);
  });
});
