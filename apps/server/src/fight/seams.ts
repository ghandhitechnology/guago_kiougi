import type { Drop } from "@guago/content";

/**
 * What the fight tells the rest of the server, and what it asks of it. Both run on the tick with
 * no database work: `FightFacts.add` must only buffer (the live server batches facts the way
 * the grant buffer batches credit), and `ExpModifiers.multiplier` must answer from memory.
 */

/** Something a character did or suffered in a fight, for quests, the 도감 and 벌점 / 상점. */
export type FightFact =
  /** A kill this character was credited with by tagging (PLAN §6), elites and bosses marked. */
  | {
      readonly kind: "kill";
      readonly characterId: string;
      readonly field: string;
      readonly monster: string;
      readonly level: number;
      readonly rank: "normal" | "elite" | "boss";
    }
  /** A drop the character walked over. */
  | { readonly kind: "collect"; readonly characterId: string; readonly drop: Drop }
  /** A surge the character was present for from start to end; `hit` when anything hurt it. */
  | {
      readonly kind: "wave";
      readonly characterId: string;
      readonly field: string;
      readonly hit: boolean;
    }
  /** Knocked out (기절). */
  | { readonly kind: "down"; readonly characterId: string; readonly field: string }
  /** Nobody came in the 10 seconds: woke at the arrival point (the 보건실, +1 벌점, PLAN §6). */
  | { readonly kind: "wake"; readonly characterId: string; readonly field: string }
  /** `characterId` revived `target` (the reviver earns 상점). */
  | { readonly kind: "revive"; readonly characterId: string; readonly target: string };

export interface FightFacts {
  add(fact: FightFact): void;
}

/**
 * The EXP multiplier the server applies to a character right now: 숙면, 졸음 and its cures,
 * 급식, 명령퇴사's penalty, 도감 bonuses, all multiplied together. Read every couple of seconds
 * and applied inside the step to every EXP the character earns, so the fight's own level and
 * the granted EXP agree.
 */
export interface ExpModifiers {
  multiplier(characterId: string): number;
}

let facts: FightFacts | undefined;
let modifiers: ExpModifiers | undefined;

/** Called once at server start by whoever consumes facts or supplies modifiers. */
export function provideFightSeams(s: { facts?: FightFacts; modifiers?: ExpModifiers }): void {
  if (s.facts) facts = s.facts;
  if (s.modifiers) modifiers = s.modifiers;
}

export function fightFacts(): FightFacts | undefined {
  return facts;
}

/** 1 when nobody supplies modifiers, and for anything that is not a positive finite number. */
export function expMultiplier(characterId: string): number {
  const m = modifiers?.multiplier(characterId) ?? 1;
  return Number.isFinite(m) && m > 0 ? m : 1;
}
