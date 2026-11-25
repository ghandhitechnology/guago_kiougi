/**
 * Character progression (PLAN §7, §9, §11, §15): 전직 tiers, stat points, the offline 자습 pool,
 * catch-up, 숙면, 졸음 and the 수행평가 board's rewards. Pure functions; the operations return
 * ledger entries like the item operations do.
 */

import { growth } from "./growth.ts";
import { type Amounts, earn, type Outcome, type Purse, pay } from "./ledger.ts";
import { expFalloff, expToNext, monsterCoin, monsterEXP } from "./numbers.ts";
import { STAT_IDS, STAT_POINTS_PER_LEVEL, type Stats } from "./stats.ts";

// ── 전직 ───────────────────────────────────────────────────────────────────

export type TierUnlock = "dodge-upgrade" | "trading" | "club" | "minor" | "evolution" | "thesis";

export interface Tier {
  readonly id: string;
  readonly level: number;
  readonly books: number;
  readonly tools: number;
  readonly unlocks: readonly TierUnlock[];
}

/** PLAN §7. A tier is reached by its 구술 면접 once the level allows it. */
export const TIERS: readonly Tier[] = [
  { id: "freshman", level: 1, books: 2, tools: 1, unlocks: [] },
  {
    id: "first-year",
    level: 30,
    books: 3,
    tools: 2,
    unlocks: ["dodge-upgrade", "trading", "club"],
  },
  { id: "midterm", level: 60, books: 4, tools: 3, unlocks: [] },
  { id: "second-year", level: 100, books: 4, tools: 4, unlocks: ["minor"] },
  { id: "third-year", level: 250, books: 5, tools: 5, unlocks: ["evolution"] },
  { id: "researcher", level: 500, books: 6, tools: 6, unlocks: ["thesis"] },
];

/** The highest tier a level allows. */
export function tierAt(level: number): Tier {
  return TIERS.filter((t) => t.level <= level).at(-1) as Tier;
}

export function hasUnlock(tier: Tier, unlock: TierUnlock): boolean {
  return TIERS.some((t) => t.level <= tier.level && t.unlocks.includes(unlock));
}

/** A 부전공 fills at most two book and two tool slots, at half signature strength. */
export const MINOR_SLOTS = { books: 2, tools: 2 } as const;

// ── Stats ───────────────────────────────────────────────────────────────────

export function statPoints(level: number): number {
  return STAT_POINTS_PER_LEVEL * level;
}

export function statsSpent(stats: Stats): number {
  return STAT_IDS.reduce((sum, id) => sum + stats[id], 0);
}

/** Places points; refuses negatives, fractions and more than the level grants. */
export function allocateStats(stats: Stats, add: Partial<Stats>, level: number): Outcome<Stats> {
  const next = { ...stats };
  for (const [id, n] of Object.entries(add) as [keyof Stats, number][]) {
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: "stat_amount" };
    next[id] += n;
  }
  if (statsSpent(next) > statPoints(level)) return { ok: false, error: "stat_points" };
  return { ok: true, state: next, ledger: [] };
}

/** "Cheap to reset": about a minute of same-level hunting coin, at any level. */
export const STAT_RESET_BASE = 50;

export function statResetCost(level: number): number {
  return Math.ceil(STAT_RESET_BASE * growth(level));
}

export function resetStats(purse: Purse, level: number): Outcome<{ purse: Purse }> {
  const paid = pay(purse, { pinecone: statResetCost(level) }, "sink.stat-reset");
  if (!paid) return { ok: false, error: "reset_cost" };
  return { ok: true, state: { purse: paid.purse }, ledger: paid.ledger };
}

// ── 자습 pool (PLAN §9) ─────────────────────────────────────────────────────

/**
 * Income per second, measured by the server over a window. The pool pays all four; 잉크 is an
 * addition to PLAN §9's list so a player who mostly lives on the pool can still write 필기.
 */
export interface Rate {
  readonly exp: number;
  readonly pinecone: number;
  readonly sheets: number;
  readonly ink: number;
}

const RATE_KEYS = ["exp", "pinecone", "sheets", "ink"] as const;
const ZERO_RATE: Rate = { exp: 0, pinecone: 0, sheets: 0, ink: 0 };

export type LogoutPlace = "field" | "hub" | "study-hall" | "dorm";

export const POOL = {
  share: 0.08,
  capSeconds: 8 * 3600,
  studyHallShare: 0.112,
  studyHallCapSeconds: 10 * 3600,
  /** 층장 of the week: one more hour on the cap (PLAN §11). */
  floorLeaderSeconds: 3600,
  /** The rate is the best window of this length in the last field hunted. */
  windowSeconds: 600,
} as const;

/** Share of the measured rate and the fill cap for where the player logged out. */
export function poolTerms(place: LogoutPlace, floorLeader = false): { share: number; cap: number } {
  const hall = place === "study-hall";
  return {
    share: hall ? POOL.studyHallShare : POOL.share,
    cap:
      (hall ? POOL.studyHallCapSeconds : POOL.capSeconds) +
      (floorLeader ? POOL.floorLeaderSeconds : 0),
  };
}

export interface PoolFill extends Rate {
  readonly seconds: number;
}

/** What a pool holds after `offlineSeconds`. Sheets and 잉크 stay fractional until claimed. */
export function poolFill(
  rate: Rate,
  offlineSeconds: number,
  place: LogoutPlace,
  floorLeader = false,
  catchUpMult = 1,
): PoolFill {
  const { share, cap } = poolTerms(place, floorLeader);
  const seconds = Math.min(cap, Math.max(0, offlineSeconds));
  const k = share * seconds;
  return {
    exp: rate.exp * k * catchUpMult,
    pinecone: rate.pinecone * k,
    sheets: rate.sheets * k,
    ink: rate.ink * k,
    seconds,
  };
}

/** Income that landed at `t`, seconds since the session started. */
export interface IncomeEvent extends Rate {
  readonly t: number;
}

const add = (a: Rate, b: Rate, sign: 1 | -1): Rate =>
  Object.fromEntries(RATE_KEYS.map((k) => [k, a[k] + sign * b[k]])) as unknown as Rate;

/** Best `window`-second income in a session, chosen by EXP. Zero below one full window. */
export function bestWindowRate(events: readonly IncomeEvent[], window = POOL.windowSeconds): Rate {
  let best = ZERO_RATE;
  const last = events.at(-1);
  if (!last || last.t < window) return best;
  let start = 0;
  let sum = ZERO_RATE;
  for (const e of events) {
    sum = add(sum, e, 1);
    while ((events[start] as IncomeEvent).t <= e.t - window) {
      sum = add(sum, events[start] as IncomeEvent, -1);
      start++;
    }
    if (e.t >= window && sum.exp / window > best.exp)
      best = Object.fromEntries(RATE_KEYS.map((k) => [k, sum[k] / window])) as unknown as Rate;
  }
  return best;
}

/** Claiming pays the whole pool. EXP goes to the character, the rest to the purse. */
export function claimPool(
  purse: Purse,
  fill: PoolFill,
  sheetBook: string | undefined,
): Outcome<{ purse: Purse; exp: number }> {
  const gain: Amounts = { pinecone: Math.floor(fill.pinecone), ink: Math.floor(fill.ink) };
  if (sheetBook && fill.sheets >= 1) gain[`sheet:${sheetBook}`] = Math.floor(fill.sheets);
  const paid = earn(purse, gain, "pool");
  return { ok: true, state: { purse: paid.purse, exp: fill.exp }, ledger: paid.ledger };
}

// ── EXP modifiers (PLAN §9 catch-up, §11) ───────────────────────────────────

/**
 * Catch-up, measured on the character: below the live Page's band every EXP they earn is
 * ×`CATCH_UP_MAX`, fading in a straight line to ×1 over the last `CATCH_UP_FADE` levels before
 * the band. A character at or above the frontier gets ×1 wherever they hunt, so a veteran cannot
 * farm sealed Pages with it. It multiplies EXP only, never 솔방울 or 낱장.
 */
export const CATCH_UP_MAX = 8;
export const CATCH_UP_FADE = 25;

export function catchUp(level: number, frontierPage: number): number {
  const below = (frontierPage - 1) * 100 + 1 - level;
  if (below <= 0) return 1;
  return Math.min(CATCH_UP_MAX, 1 + ((CATCH_UP_MAX - 1) * below) / CATCH_UP_FADE);
}

/** 숙면: logging out in the 기숙사 gives +50% EXP for the first 30 minutes of the next session. */
export const RESTED = { bonus: 0.5, seconds: 1800 } as const;
/** 졸음: two hours of unbroken full-auto hunting costs 10% EXP until cleared. */
export const DROWSY = { afterSeconds: 7200, penalty: 0.1 } as const;

export function restedMult(rested: boolean, sessionSeconds: number): number {
  return rested && sessionSeconds < RESTED.seconds ? 1 + RESTED.bonus : 1;
}

export function drowsyMult(fullAutoSeconds: number): number {
  return fullAutoSeconds >= DROWSY.afterSeconds ? 1 - DROWSY.penalty : 1;
}

// ── 수행평가 board (PLAN §15) ───────────────────────────────────────────────

export type Cadence = "daily" | "weekly" | "repeat";

export const BOARD = {
  daily: 5,
  weekly: 3,
  /** Repeatable rewards for the 1st, 2nd … completion of the day; the last step holds. */
  repeatSteps: [1, 0.8, 0.6, 0.4, 0.2],
} as const;

/**
 * Rewards in same-level kills, so a notice is worth the same share of a level anywhere in a
 * Page. A daily is worth about two minutes of hunting on top of the hunting it asks for.
 */
export const QUEST_REWARD: Readonly<
  Record<Cadence, { kills: number; ink: number; binding: number; sheets: number }>
> = {
  daily: { kills: 450, ink: 330, binding: 0, sheets: 0 },
  weekly: { kills: 3600, ink: 300, binding: 2, sheets: 3 },
  repeat: { kills: 150, ink: 0, binding: 0, sheets: 0 },
};

export function repeatShare(completedToday: number): number {
  const steps = BOARD.repeatSteps;
  return steps[Math.min(completedToday, steps.length - 1)] as number;
}

export interface QuestReward {
  readonly exp: number;
  readonly pinecone: number;
  readonly ink: number;
  readonly binding: number;
  readonly sheets: number;
}

/**
 * What a notice pays. `level` is the level of the field's monsters the notice sends the player
 * after, so its EXP falls off like those kills would for a `playerLevel` far above them; a
 * notice never pays more than hunting there. `completedToday` steps repeatables down; in a sealed
 * Page `catchUpMult` multiplies the EXP like every other EXP there (PLAN §9).
 */
export function questReward(
  cadence: Cadence,
  level: number,
  completedToday = 0,
  playerLevel = level,
  catchUpMult = 1,
): QuestReward {
  const r = QUEST_REWARD[cadence];
  const share = cadence === "repeat" ? repeatShare(completedToday) : 1;
  return {
    exp: monsterEXP(level, 1) * r.kills * share * expFalloff(playerLevel, level) * catchUpMult,
    pinecone: Math.round(monsterCoin(level, 1) * r.kills * share),
    ink: r.ink,
    binding: r.binding,
    sheets: r.sheets,
  };
}

/**
 * A story chapter's first clear (PLAN §15): a daily's reward, a weekly's for a chapter that ends
 * in a boss being freed.
 */
export function storyReward(
  boss: boolean,
  level: number,
  playerLevel = level,
  catchUpMult = 1,
): QuestReward {
  return questReward(boss ? "weekly" : "daily", level, 0, playerLevel, catchUpMult);
}

/** Turning in a notice. Sheets land on the book the player named when accepting it. */
export function completeQuest(
  purse: Purse,
  reward: QuestReward,
  cadence: Cadence | "story" | "help",
  sheetBook: string,
): Outcome<{ purse: Purse; exp: number }> {
  const gain: Amounts = { pinecone: reward.pinecone, ink: reward.ink, binding: reward.binding };
  if (reward.sheets > 0) gain[`sheet:${sheetBook}`] = reward.sheets;
  const paid = earn(purse, gain, `quest.${cadence}`);
  return { ok: true, state: { purse: paid.purse, exp: reward.exp }, ledger: paid.ledger };
}

// ── Character level ─────────────────────────────────────────────────────────

/** Adds EXP and levels up as far as it reaches. Levels have no cap (PLAN §9). */
export function addExp(level: number, exp: number, gained: number): { level: number; exp: number } {
  let l = level;
  let e = exp + gained;
  while (e >= expToNext(l)) {
    e -= expToNext(l);
    l++;
  }
  return { level: l, exp: e };
}
