import { describe, expect, it } from "vitest";
import {
  BookGrade,
  bookDamage,
  bookExpToNext,
  expFalloff,
  expToNext,
  hitDamage,
  K_BASE,
  K_CAP,
  K_SLOPE,
  killsPerLevel,
  levelFactor,
  monsterCoin,
  monsterDamage,
  monsterEXP,
  monsterHP,
  playerHP,
  Rank,
} from "./numbers.ts";
import { NO_STATS, statEffects } from "./stats.ts";

describe("monster numbers", () => {
  it("follow PLAN §9 at level 0", () => {
    expect(monsterHP(0, Rank.Normal)).toBe(40);
    expect(monsterHP(0, Rank.Elite)).toBe(480);
    expect(monsterEXP(0, Rank.Normal)).toBe(10);
    expect(monsterCoin(0, Rank.Normal)).toBe(2);
    expect(monsterEXP(0, Rank.FieldBoss)).toBeCloseTo(10 * 300 ** 0.8, 9);
    expect(monsterDamage(0, Rank.Normal)).toBe(10);
  });

  it("grow ×10 per Page", () => {
    expect(monsterHP(100, 1) / monsterHP(0, 1)).toBeCloseTo(10, 12);
    expect(monsterEXP(250, 12) / monsterEXP(150, 12)).toBeCloseTo(10, 12);
  });
});

describe("level curve", () => {
  it("K rises by its slope and holds at its cap", () => {
    expect(killsPerLevel(1)).toBe(K_BASE + K_SLOPE);
    expect(killsPerLevel(2) - killsPerLevel(1)).toBe(K_SLOPE);
    expect(killsPerLevel(1200)).toBe(K_CAP);
    const capAt = Math.ceil((K_CAP - K_BASE) / K_SLOPE);
    expect(killsPerLevel(capAt - 1)).toBeLessThan(K_CAP);
    expect(killsPerLevel(capAt)).toBe(K_CAP);
  });

  it("expToNext is K same-level kills", () => {
    expect(expToNext(30)).toBeCloseTo(monsterEXP(30, 1) * killsPerLevel(30), 6);
  });

  it("a book's curve is a tenth of its owner's", () => {
    expect(bookExpToNext(70)).toBeCloseTo(expToNext(70) / 10, 6);
  });
});

describe("damage", () => {
  it("multiplies grade, 필기 and affixes into book damage", () => {
    expect(bookDamage(20, 0, BookGrade.Textbook, 0)).toBe(20);
    expect(bookDamage(20, 0, BookGrade.Advanced, 10)).toBeCloseTo(20 * 2.2 * 1.4, 9);
    expect(bookDamage(20, 100, BookGrade.Original, 0, 1.1)).toBeCloseTo(20 * 10 * 5 * 1.1, 9);
  });

  it("applies 이해력, crit, level factor and mode bonus to a hit", () => {
    expect(hitDamage(100, 200, 1.5, 0.8, 1.2)).toBeCloseTo(100 * 2 * 1.5 * 0.8 * 1.2, 9);
  });

  it("weakens attacks on monsters above the player down to 0.2", () => {
    expect(levelFactor(50, 40)).toBe(1);
    expect(levelFactor(50, 50)).toBe(1);
    expect(levelFactor(50, 60)).toBeCloseTo(0.8, 12);
    expect(levelFactor(50, 200)).toBe(0.2);
  });

  it("fades EXP from monsters more than 10 levels below down to 0.1", () => {
    expect(expFalloff(50, 40)).toBe(1);
    expect(expFalloff(50, 30)).toBeCloseTo(0.5, 12);
    expect(expFalloff(50, 1)).toBe(0.1);
    expect(expFalloff(50, 70)).toBe(1);
  });
});

describe("player", () => {
  it("HP grows with level and 체력", () => {
    expect(playerHP(0, 0)).toBe(200);
    expect(playerHP(100, 200)).toBeCloseTo(4000, 9);
  });

  it("stat effects stay inside their caps", () => {
    const none = statEffects(NO_STATS);
    expect(none.cooldownMult).toBe(1);
    expect(none.critChance).toBe(0.05);
    expect(none.critMult).toBe(1.5);
    expect(none.dodgeCooldown).toBe(3);
    const maxed = statEffects({
      understanding: 0,
      memory: 300,
      focus: 3000,
      vitality: 300,
      agility: 3000,
      luck: 300,
    });
    expect(maxed.cooldownMult).toBeCloseTo(0.625, 12);
    expect(maxed.durationMult).toBeCloseTo(1.6, 12);
    expect(maxed.critChance).toBe(0.8);
    expect(maxed.speedMult).toBe(1.5);
    expect(maxed.dodgeCooldown).toBe(1.5);
    expect(maxed.regenPerSecond).toBeCloseTo(0.01, 12);
    expect(maxed.coinMult).toBeCloseTo(1.6, 12);
  });
});

describe("large numbers through level 1,200", () => {
  const top = 1200;

  it("stay finite and keep their precision", () => {
    const hp = monsterHP(top, Rank.FieldBoss);
    expect(hp).toBeCloseTo(1.2e16, 0);
    expect(Number.isFinite(hp)).toBe(true);
    // A modest hit at the top still moves the biggest health bar.
    const hit = bookDamage(20, top, BookGrade.Textbook, 0);
    expect(hp - hit).toBeLessThan(hp);
    expect((hp - (hp - hit) - hit) / hit).toBeLessThan(1e-3);
  });

  it("keeps one kill's EXP visible inside a level's progress", () => {
    const need = expToNext(top);
    const progress = need * 0.999;
    const exp = monsterEXP(top, Rank.Normal);
    expect(progress + exp - progress).toBeCloseTo(exp, -2);
    expect((progress + exp - progress) / exp).toBeCloseTo(1, 9);
  });

  it("sums a whole career without overflow", () => {
    let total = 0;
    for (let l = 1; l <= top; l++) total += expToNext(l);
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBeLessThan(Number.MAX_SAFE_INTEGER * 1e4);
    const strongest = hitDamage(bookDamage(20, top, BookGrade.Original, 30, 2), 3600, 4, 1, 1.2);
    expect(Number.isFinite(strongest)).toBe(true);
  });
});
