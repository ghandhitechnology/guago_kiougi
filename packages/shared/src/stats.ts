/** The six stats (PLAN §9). Three free points per level. */
export const STAT_IDS = [
  "understanding",
  "memory",
  "focus",
  "vitality",
  "agility",
  "luck",
] as const;
export type StatId = (typeof STAT_IDS)[number];
export type Stats = Readonly<Record<StatId, number>>;

export const STAT_NAMES: Readonly<Record<StatId, string>> = {
  understanding: "이해력",
  memory: "암기력",
  focus: "집중력",
  vitality: "체력",
  agility: "순발력",
  luck: "운",
};

export const STAT_POINTS_PER_LEVEL = 3;

// Coefficients the PLAN leaves open. 이해력 (damage) and 체력 (HP) are fixed in `numbers.ts`.
// At 300 points (level 100) a stat roughly doubles its effect; nothing reaches a hard wall.

/** 암기력: cooldowns shrink hyperbolically (300 → ×0.625), durations grow linearly (300 → ×1.6). */
export const MEMORY_COOLDOWN = 0.002;
export const MEMORY_DURATION = 0.002;

/** 집중력: 5% base crit at ×1.5. 300 points → 50% at ×3, close to 이해력's ×2.5 in expectation. */
export const CRIT_BASE_CHANCE = 0.05;
export const CRIT_CHANCE_CAP = 0.8;
export const FOCUS_CRIT_CHANCE = 0.0015;
export const CRIT_BASE_MULT = 1.5;
export const FOCUS_CRIT_MULT = 0.005;

/** 체력: regeneration in shares of max HP per second (300 → 1%/s). */
export const REGEN_BASE = 0.004;
export const VITALITY_REGEN = 0.00002;

/** 순발력: move speed +0.1% per point up to +50%; dodge cooldown 3 s down to 1.5 s. */
export const AGILITY_SPEED = 0.001;
export const SPEED_CAP = 1.5;
export const AGILITY_DODGE = 0.002;
export const DODGE_COOLDOWN_FLOOR = 1.5;

/** 운: 낱장 drop chance and 솔방울 gain (300 → ×1.6). */
export const LUCK_DROP = 0.002;
export const LUCK_COIN = 0.002;

export interface StatEffects {
  readonly cooldownMult: number;
  readonly durationMult: number;
  readonly critChance: number;
  readonly critMult: number;
  readonly regenPerSecond: number;
  readonly speedMult: number;
  readonly dodgeCooldown: number;
  readonly dropMult: number;
  readonly coinMult: number;
}

/** What a stat block does. 이해력 and 체력 enter `hitDamage` and `playerHP` directly. */
export function statEffects(stats: Stats, dodgeCooldownBase = 3): StatEffects {
  return {
    cooldownMult: 1 / (1 + MEMORY_COOLDOWN * stats.memory),
    durationMult: 1 + MEMORY_DURATION * stats.memory,
    critChance: Math.min(CRIT_CHANCE_CAP, CRIT_BASE_CHANCE + FOCUS_CRIT_CHANCE * stats.focus),
    critMult: CRIT_BASE_MULT + FOCUS_CRIT_MULT * stats.focus,
    regenPerSecond: REGEN_BASE + VITALITY_REGEN * stats.vitality,
    speedMult: Math.min(SPEED_CAP, 1 + AGILITY_SPEED * stats.agility),
    dodgeCooldown: Math.max(
      DODGE_COOLDOWN_FLOOR,
      dodgeCooldownBase / (1 + AGILITY_DODGE * stats.agility),
    ),
    dropMult: 1 + LUCK_DROP * stats.luck,
    coinMult: 1 + LUCK_COIN * stats.luck,
  };
}

export const NO_STATS: Stats = {
  understanding: 0,
  memory: 0,
  focus: 0,
  vitality: 0,
  agility: 0,
  luck: 0,
};
