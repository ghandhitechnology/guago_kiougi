import { growth } from "./growth.ts";

/**
 * Monster rank multiplies HP directly and EXP, coin and damage by a power of it (PLAN §9).
 * `TutorialBoss` sits between elite and field boss so one new player can beat the 오답노트 골렘.
 */
export const Rank = { Normal: 1, Elite: 12, TutorialBoss: 40, FieldBoss: 300 } as const;

export function monsterHP(level: number, rank: number): number {
  return 40 * growth(level) * rank;
}

export function monsterEXP(level: number, rank: number): number {
  return 10 * growth(level) * rank ** 0.8;
}

export function monsterCoin(level: number, rank: number): number {
  return 2 * growth(level) * rank ** 0.8;
}

/**
 * Damage of one monster contact hit. PLAN §9 is silent: a normal monster takes 5% of a
 * same-level player's base HP per hit, and rank^0.5 keeps telegraphed boss hits survivable.
 */
export function monsterDamage(level: number, rank: number): number {
  return 10 * growth(level) * rank ** 0.5;
}

/** K(L) = min(cap, base + slope × L): how many same-level normal kills one level costs. */
export const K_BASE = 100;
export const K_SLOPE = 75;
export const K_CAP = 3600;

export function killsPerLevel(level: number): number {
  return Math.min(K_CAP, K_BASE + K_SLOPE * level);
}

export function expToNext(level: number): number {
  return monsterEXP(level, Rank.Normal) * killsPerLevel(level);
}

/** Share of its owner's EXP an equipped book earns (PLAN §8). */
export const BOOK_EXP_SHARE = 0.1;

/**
 * A book's own level curve. PLAN §8 is silent; at 10% of the character curve a book equipped
 * from the start keeps pace with its owner, and a late book catches up on fed 낱장.
 */
export function bookExpToNext(level: number): number {
  return BOOK_EXP_SHARE * expToNext(level);
}

export const BookGrade = { Textbook: 0, Reference: 1, Advanced: 2, Major: 3, Original: 4 } as const;
export type BookGrade = (typeof BookGrade)[keyof typeof BookGrade];

/** Damage multiplier per grade, indexed by `BookGrade` (PLAN §8). */
export const GRADE_MULTIPLIER: readonly number[] = [1, 1.5, 2.2, 3.3, 5];

/** Each 필기 step adds 4% damage (PLAN §8). */
export const PILGI_DAMAGE = 0.04;

/** Base damage every book starts from; attacks scale it by their hit coefficients. */
export const BOOK_BASE_DAMAGE = 20;

export function bookDamage(
  base: number,
  bookLevel: number,
  grade: BookGrade,
  pilgi: number,
  affixes = 1,
): number {
  return (
    base * growth(bookLevel) * (GRADE_MULTIPLIER[grade] ?? 1) * (1 + PILGI_DAMAGE * pilgi) * affixes
  );
}

/** Damage per 이해력 point (PLAN §9). */
export const UNDERSTANDING_DAMAGE = 0.005;

export function hitDamage(
  bookDmg: number,
  understanding: number,
  critMult: number,
  levelFactor: number,
  modeBonus: number,
): number {
  return bookDmg * (1 + UNDERSTANDING_DAMAGE * understanding) * critMult * levelFactor * modeBonus;
}

/** HP per 체력 point (PLAN §9). */
export const VITALITY_HP = 0.005;

export function playerHP(level: number, vitality: number): number {
  return 200 * growth(level) * (1 + VITALITY_HP * vitality);
}

/** Damage factor against a monster above the player. Monsters at or below the player give 1. */
export function levelFactor(playerLevel: number, monsterLevel: number): number {
  const d = monsterLevel - playerLevel;
  return d <= 0 ? 1 : Math.max(0.2, 1 - 0.02 * d);
}

/** EXP factor for a monster more than 10 levels below the player. */
export function expFalloff(playerLevel: number, monsterLevel: number): number {
  const d = playerLevel - monsterLevel;
  return d <= 10 ? 1 : Math.max(0.1, 1 - 0.05 * (d - 10));
}
