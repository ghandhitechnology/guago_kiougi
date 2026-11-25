import { describe, expect, it } from "vitest";
import {
  addDemerits,
  addMerits,
  boardDay,
  boardStreak,
  boardWeek,
  clockAt,
  DAY_MS,
  dayStart,
  EXPEL,
  modifiers,
  NO_MODIFIERS,
  neatBonus,
  reanchor,
  WEEK_MS,
  weekStart,
} from "./live.ts";
import { DROWSY, RESTED } from "./progress.ts";

const kst = (iso: string) => new Date(`${iso}+09:00`).getTime();

describe("server clock", () => {
  it("runs at its rate from the anchor and steps without a jump backwards", () => {
    const a = { realMs: 1000, gameMs: 50_000, rate: 1456 };
    expect(clockAt(a, 2000)).toBe(50_000 + 1000 * 1456);
    const b = reanchor(a, 2000, { stepMs: WEEK_MS });
    expect(clockAt(b, 2000)).toBe(clockAt(a, 2000) + WEEK_MS);
    const c = reanchor(b, 3000, { rate: 1 });
    expect(clockAt(c, 3000)).toBe(clockAt(b, 3000));
    expect(clockAt(c, 4000)).toBe(clockAt(b, 3000) + 1000);
    expect(() => reanchor(a, 0, { rate: 0 })).toThrow();
  });

  it("thirteen weeks at rate 1456 take about ninety minutes", () => {
    expect((13 * WEEK_MS) / 1456 / 60_000).toBeCloseTo(90, 0);
  });
});

describe("board resets at 05:00 KST", () => {
  it("turns the day at 05:00, not at midnight", () => {
    expect(boardDay(kst("2026-11-25T04:59:59"))).toBe(boardDay(kst("2026-11-24T05:00:00")));
    expect(boardDay(kst("2026-11-25T05:00:00"))).toBe(boardDay(kst("2026-11-24T05:00:00")) + 1);
    expect(dayStart(boardDay(kst("2026-11-25T12:00:00")))).toBe(kst("2026-11-25T05:00:00"));
  });

  it("turns the week on Monday at 05:00", () => {
    // 2026-11-23 is a Monday.
    const monday = kst("2026-11-23T05:00:00");
    expect(boardWeek(monday)).toBe(boardWeek(monday - 1) + 1);
    expect(boardWeek(monday + 7 * DAY_MS - 1)).toBe(boardWeek(monday));
    expect(weekStart(boardWeek(monday + 3 * DAY_MS))).toBe(monday);
  });
});

describe("벌점 and 상점", () => {
  it("상점 cancels 벌점 one for one; only the rest is spare", () => {
    expect(addMerits({ demerits: 3 }, 1)).toEqual({ cancelled: 1, spare: 0, demerits: 2 });
    expect(addMerits({ demerits: 2 }, 5)).toEqual({ cancelled: 2, spare: 3, demerits: 0 });
    expect(addMerits({ demerits: 0 }, 1)).toEqual({ cancelled: 0, spare: 1, demerits: 0 });
  });

  it("명령퇴사 at 20 resets to 0", () => {
    expect(addDemerits({ demerits: 18 }, 1)).toEqual({ demerits: 19, expelled: false, reached: 19 });
    expect(addDemerits({ demerits: 18 }, 2)).toEqual({ demerits: 0, expelled: true, reached: 20 });
    expect(addDemerits({ demerits: 19 }, 3)).toEqual({ demerits: 0, expelled: true, reached: 22 });
    expect(() => addDemerits({ demerits: 0 }, 0)).toThrow();
  });

  it("단정한 복장 adds a point with its chance per point", () => {
    expect(neatBonus(5, [0.01, 0.5, 0.049, 0.05, 0.9])).toBe(2);
  });
});

describe("rule modifiers", () => {
  const base = { restedUntil: null, penaltyUntil: null, drowsy: false, meal: null, codex: {} };

  it("is no change by default", () => {
    expect(modifiers(base, 0)).toEqual(NO_MODIFIERS);
  });

  it("adds buffs to one factor and multiplies the penalties", () => {
    const m = modifiers(
      {
        restedUntil: 10,
        penaltyUntil: 10,
        drowsy: true,
        meal: { until: 10, stat: "exp", amount: 0.05 },
        codex: { exp: 0.02, damage: 0.02 },
      },
      5,
    );
    expect(m.exp).toBeCloseTo((1 + RESTED.bonus + 0.05 + 0.02) * (1 - DROWSY.penalty) * (1 - EXPEL.penalty));
    expect(m.damage).toBeCloseTo(1.02);
    // Everything timed is over at its end.
    const later = modifiers(
      { ...base, restedUntil: 10, penaltyUntil: 10, meal: { until: 10, stat: "exp", amount: 0.05 } },
      10,
    );
    expect(later.exp).toBe(1);
  });
});

describe("개근상 streak", () => {
  it("counts consecutive board days and starts over after a gap", () => {
    expect(boardStreak(null, 100)).toBe(1);
    expect(boardStreak({ day: 100, streak: 4 }, 101)).toBe(5);
    expect(boardStreak({ day: 100, streak: 4 }, 100)).toBe(4);
    expect(boardStreak({ day: 100, streak: 4 }, 102)).toBe(1);
  });
});
