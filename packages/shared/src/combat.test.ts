import { describe, expect, it } from "vitest";
import {
  COLLISION_SHARE,
  collisionDamage,
  critMultiplier,
  DODGE,
  decayKnockback,
  dodgeInvulnerable,
  dodgeReady,
  elasticCollision,
  insideArc,
  KNOCKOUT,
  killCredits,
  knockbackDistance,
  knockbackSpeed,
  knockoutState,
  MODE_BONUS,
  mitigate,
  partyExpMultiplier,
  rollCrit,
  ticks,
} from "./combat.ts";

describe("ticks", () => {
  it("rounds seconds to 20 Hz ticks", () => {
    expect(ticks(DODGE.invulnerableSeconds)).toBe(5);
    expect(ticks(DODGE.cooldownSeconds)).toBe(60);
    expect(ticks(0.001)).toBe(1);
  });
});

describe("control mode bonus", () => {
  it("rewards manual play", () => {
    expect(MODE_BONUS.auto).toBe(1);
    expect(MODE_BONUS.semi).toBe(1);
    expect(MODE_BONUS.skill).toBe(1.1);
    expect(MODE_BONUS.manual).toBe(1.2);
  });
});

describe("crits", () => {
  it("crit when the roll is under the chance", () => {
    expect(rollCrit(0.04, 0.05)).toBe(true);
    expect(rollCrit(0.05, 0.05)).toBe(false);
    expect(critMultiplier(true, 2)).toBe(2);
    expect(critMultiplier(false, 2)).toBe(1);
  });
});

describe("dodge", () => {
  it("is invulnerable for 5 ticks and ready again after 60", () => {
    expect(dodgeInvulnerable(100, 100)).toBe(true);
    expect(dodgeInvulnerable(100, 104)).toBe(true);
    expect(dodgeInvulnerable(100, 105)).toBe(false);
    expect(dodgeReady(100, 159, 3)).toBe(false);
    expect(dodgeReady(100, 160, 3)).toBe(true);
  });
});

describe("knockback", () => {
  it("is knock ÷ mass and loses 15% per tick", () => {
    expect(knockbackSpeed(180, 2)).toBe(90);
    expect(decayKnockback(100)).toBeCloseTo(85, 12);
    expect(decayKnockback(2.2)).toBe(0);
  });

  it("travels v·dt / 0.15", () => {
    expect(knockbackDistance(180)).toBeCloseTo(60, 9);
    let speed = 180;
    let travelled = 0;
    while (speed > 0) {
      travelled += speed * 0.05;
      speed = decayKnockback(speed);
    }
    expect(travelled).toBeGreaterThan(58);
    expect(travelled).toBeLessThanOrEqual(60);
  });

  it("collisions hurt by remaining speed and pass momentum on", () => {
    expect(collisionDamage(100, 90, 90, COLLISION_SHARE)).toBeCloseTo(20, 9);
    expect(collisionDamage(100, 45, 90, COLLISION_SHARE)).toBeCloseTo(10, 9);
    expect(collisionDamage(100, 20, 90, COLLISION_SHARE)).toBe(0);
    expect(elasticCollision(100, 1, 1)).toEqual({ a: 0, b: 100 });
    const heavy = elasticCollision(100, 1, 3);
    expect(heavy.a).toBeCloseTo(-50, 9);
    expect(heavy.b).toBeCloseTo(50, 9);
  });
});

describe("armour", () => {
  it("removes a share of damage unless ignored", () => {
    expect(mitigate(100, 0.3)).toBeCloseTo(70, 9);
    expect(mitigate(100, 0.3, true)).toBe(100);
    expect(mitigate(100, 2)).toBeCloseTo(10, 9);
    expect(mitigate(100, -1)).toBe(100);
  });

  it("finds hits inside a frontal arc", () => {
    expect(insideArc(0, 0.5, 120)).toBe(true);
    expect(insideArc(0, Math.PI, 120)).toBe(false);
    expect(insideArc(0.1, Math.PI * 2 - 0.1, 120)).toBe(true);
  });
});

describe("kill credit", () => {
  const hp = 1000;

  it("gives every solo player with 5% the full kill", () => {
    const credits = killCredits(hp, [
      { playerId: "a", damage: 900 },
      { playerId: "b", damage: 50 },
      { playerId: "c", damage: 49 },
    ]);
    expect(credits).toEqual([
      { playerId: "a", expMult: 1 },
      { playerId: "b", expMult: 1 },
    ]);
  });

  it("pools party damage and shares with members in range", () => {
    const credits = killCredits(
      hp,
      [
        { playerId: "a", partyId: "p", damage: 30 },
        { playerId: "b", partyId: "p", damage: 30 },
        { playerId: "z", damage: 940 },
      ],
      [{ playerId: "c", partyId: "p" }],
    );
    expect(credits).toContainEqual({ playerId: "a", expMult: 1.2 });
    expect(credits).toContainEqual({ playerId: "c", expMult: 1.2 });
    expect(credits).toContainEqual({ playerId: "z", expMult: 1 });
    expect(credits).toHaveLength(4);
  });

  it("falls back to the top contributor in a crowd", () => {
    const crowd = Array.from({ length: 25 }, (_, i) => ({ playerId: `p${i}`, damage: 30 + i * 0.5 }));
    expect(killCredits(hp, crowd)).toEqual([{ playerId: "p24", expMult: 1 }]);
  });

  it("caps the party bonus at four members", () => {
    expect(partyExpMultiplier(1)).toBe(1);
    expect(partyExpMultiplier(4)).toBeCloseTo(1.3, 12);
    expect(partyExpMultiplier(9)).toBeCloseTo(1.3, 12);
  });
});

describe("기절", () => {
  it("can be revived for 10 seconds", () => {
    expect(knockoutState(0, 199)).toBe("down");
    expect(knockoutState(0, 200)).toBe("wake");
    expect(KNOCKOUT.demeritsOnWake).toBe(1);
  });
});
