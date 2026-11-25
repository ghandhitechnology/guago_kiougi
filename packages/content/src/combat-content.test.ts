import { Random } from "@guago/shared";
import { describe, expect, it } from "vitest";
import { type AttackContext, resolveAttack } from "./attacks.ts";
import { BOOKS, CAMPING_BIO, EM_LAB, ROUND_EARTH, toolById, WANGDO } from "./books.ts";
import {
  findReaction,
  forecast,
  momentumCollisionShare,
  momentumDamage,
  proliferation,
  proofHit,
  qedDamage,
  signatureStrength,
} from "./classes.ts";
import { dropLedger, rollDrops } from "./drops.ts";
import { fieldPopulation, PAGE1_FIELDS, spawnLevel, spawnRate, wavePhase } from "./fields.ts";
import { zenoDamage } from "./monsters.ts";

const must = <A>(b: { readonly attack: A | null }): A => {
  if (!b.attack) throw new Error("book has no attack");
  return b.attack;
};

const bare: AttackContext = { bookLevel: 1, tools: [], cooldownMult: 1, durationMult: 1 };

describe("resolveAttack", () => {
  it("adds level steps up to the book's level", () => {
    expect(resolveAttack(must(WANGDO), WANGDO.levels, bare).attack.count).toBe(3);
    const at50 = resolveAttack(must(WANGDO), WANGDO.levels, { ...bare, bookLevel: 50 });
    expect(at50.attack.count).toBe(6);
    expect(at50.attack.orbitRadius).toBe(32);
    const at100 = resolveAttack(must(WANGDO), WANGDO.levels, { ...bare, bookLevel: 100 });
    expect(at100.attack.count).toBe(8);
  });

  it("applies tools by stat and 암기력 to cooldown and duration", () => {
    const r = resolveAttack(must(WANGDO), [], {
      ...bare,
      tools: [{ def: toolById("compass"), level: 5 }],
      cooldownMult: 0.8,
      durationMult: 1.5,
    });
    expect(r.attack.orbitRadius).toBeCloseTo(28 * 1.4, 9);
    expect(r.attack.cooldown).toBeCloseTo(2.4, 9);
    // 2 s × 1.5 would outlast the 2.4 s cooldown, so it becomes a permanent orbit.
    expect(r.attack.duration).toBeCloseTo(2.4, 9);
  });

  it("adds chain jumps and minion cap as counts, only to their own kinds", () => {
    const battery = { def: toolById("battery"), level: 3 };
    expect(resolveAttack(must(EM_LAB), [], { ...bare, tools: [battery] }).attack.jumps).toBe(6);
    const scope = { def: toolById("microscope"), level: 2 };
    expect(resolveAttack(must(CAMPING_BIO), [], { ...bare, tools: [scope] }).attack.cap).toBe(6);
    expect(resolveAttack(must(WANGDO), [], { ...bare, tools: [battery] }).attack).toEqual(
      must(WANGDO),
    );
  });

  it("shortens telegraphs but keeps the base delay for 예보", () => {
    const r = resolveAttack(must(ROUND_EARTH), [], {
      ...bare,
      tools: [{ def: toolById("seismometer"), level: 5 }],
    });
    expect(r.attack.delay).toBeCloseTo(1.2 * 0.7, 9);
    expect(r.baseDelay).toBe(1.2);
  });

  it("returns status multipliers for status tools", () => {
    const r = resolveAttack(must(WANGDO), [], {
      ...bare,
      durationMult: 1.2,
      tools: [
        { def: toolById("pipette"), level: 5 },
        { def: toolById("alcohol-lamp"), level: 2 },
      ],
    });
    expect(r.mods.statusDuration).toBeCloseTo(1.8, 9);
    expect(r.mods.burn).toBeCloseTo(1.3, 9);
  });
});

describe("class signatures", () => {
  it("scales by 전공 and 부전공", () => {
    expect(signatureStrength("math", "math")).toBe(1);
    expect(signatureStrength("math", "physics", "math")).toBe(0.5);
    expect(signatureStrength("math", "physics", "earth")).toBe(0);
  });

  it("proves on the tenth hit and restarts", () => {
    let stacks = 0;
    let proofs = 0;
    for (let i = 0; i < 25; i++) {
      const r = proofHit(stacks);
      stacks = r.stacks;
      if (r.qed) proofs++;
    }
    expect(proofs).toBe(2);
    expect(stacks).toBe(5);
    expect(qedDamage(100, 0.5)).toBe(250);
  });

  it("운동량 raises collision share and rewards speed", () => {
    expect(momentumCollisionShare(0)).toBe(0);
    expect(momentumCollisionShare(1)).toBeCloseTo(0.6, 12);
    expect(momentumCollisionShare(0.5)).toBeCloseTo(0.3, 12);
    expect(momentumDamage(0, 72, 1)).toBe(1);
    expect(momentumDamage(72, 72, 1)).toBeCloseTo(1.3, 12);
  });

  it("finds reactions in either order", () => {
    expect(findReaction(["flammable"], "burn")?.id).toBe("combustion");
    expect(findReaction(["acid", "slow"], "metal")?.id).toBe("corrosion");
    expect(findReaction(["burn"], "acid")).toBeUndefined();
  });

  it("예보 grows with the base delay", () => {
    const f = forecast(1.2, 1);
    expect(f.damage).toBeCloseTo(1.48, 12);
    expect(f.area).toBeCloseTo(1.18, 12);
    expect(forecast(1.2, 0).damage).toBe(1);
  });

  it("증식 rounds counts down at half strength", () => {
    expect(proliferation(1)).toMatchObject({ minionCap: 2, spread: 2 });
    expect(proliferation(0.5)).toMatchObject({ minionCap: 1, spread: 1 });
  });
});

describe("제논의 거북이", () => {
  it("falls to the eleventh hit however hard each one is", () => {
    const max = 1000;
    let hp = max;
    let hits = 0;
    while (hp > 0) {
      hp -= zenoDamage(hp, max, 1e9, 10);
      hits++;
    }
    expect(hits).toBe(11);
    expect(zenoDamage(1000, 1000, 10, 10)).toBe(10);
  });
});

describe("field pacing", () => {
  it("holds population between 60 and 150", () => {
    expect(fieldPopulation(0)).toBe(60);
    expect(fieldPopulation(1)).toBe(60);
    expect(fieldPopulation(4)).toBe(105);
    expect(fieldPopulation(40)).toBe(150);
  });

  it("spawns only during a surge", () => {
    expect(wavePhase(10)).toBe("surge");
    expect(wavePhase(55)).toBe("lull");
    expect(wavePhase(62)).toBe("surge");
    expect(spawnRate(1, "surge")).toBe(1.5);
    expect(spawnRate(3, "lull")).toBe(0);
  });

  it("spawns near the players' level inside the field", () => {
    const field = PAGE1_FIELDS[0];
    if (!field) throw new Error("no field");
    expect(spawnLevel(field, 10, 0)).toBe(8);
    expect(spawnLevel(field, 10, 0.999)).toBe(12);
    expect(spawnLevel(field, 1, 0)).toBe(1);
    expect(spawnLevel(field, 40, 0.5)).toBe(25);
  });
});

describe("drops", () => {
  const roll = {
    source: { kind: "monster", fieldId: "f", monsterId: "odap", rank: "elite" },
    level: 10,
    rank: 12,
    coin: 1,
    dropMult: 1,
    coinMult: 1,
    books: BOOKS,
    tools: [],
    spotlight: "math",
  } as const;

  it("always pays coin and gives an elite pages, the same for the same seed", () => {
    const a = rollDrops(new Random(9), roll);
    const b = rollDrops(new Random(9), roll);
    expect(a).toEqual(b);
    expect(a[0]?.item).toEqual({ kind: "coin", amount: Math.round(2 * 10 ** 0.1 * 12 ** 0.8) });
    expect(a[1]?.item.kind).toBe("page");
    const first = a[0];
    if (!first) throw new Error("no drop");
    expect(dropLedger(first)).toEqual({
      currency: "pinecone",
      amount: Math.round(2 * 10 ** 0.1 * 12 ** 0.8),
      key: "drop.elite.odap.f",
    });
  });
});
