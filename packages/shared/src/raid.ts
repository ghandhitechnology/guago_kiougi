/**
 * The raid's rules that are formulas (PLAN §10 era boss raid): how big a phase's HP bar is, when
 * the nightly 토론 시간 runs, how the shield works, and which participation tier a character
 * reached in a phase. All times are Page clock milliseconds, so a time-compressed test server
 * calibrates, debates and finishes in minutes with the same numbers.
 */

import { DAY_MS, HOUR_MS } from "./live.ts";
import { monsterHP, Rank } from "./numbers.ts";

export const RAID = {
  /** Days of server damage a phase is calibrated from. */
  windowDays: 14,
  /**
   * Less than this much measured time is stretched to it, so a server that just started, or a
   * test server a few game hours old, does not size a phase from one lucky minute.
   */
  minMeasuredMs: 6 * HOUR_MS,
  /** Days a phase should take: an era 논제 about 4 to 5, a mid boss about 2. */
  targetDays: { era: 4.5, mid: 2 },
  /**
   * Share of the server's damage a standing boss draws, until the window holds enough hours
   * with a boss up to measure it.
   */
  bossShare: 0.3,
  /** A measured share is never taken below this: a boss nobody fought says little. */
  minShare: 0.02,
  /**
   * The smallest bar: what a small community deals in the target days, so a new or tiny server
   * never gets a phase that one visit empties. Four same-level players, two hours a day, each
   * putting this many same-level normal monsters' health a second into the pool (gates and the
   * shield included).
   */
  floor: { players: 4, hoursPerDay: 2, normalsPerSecond: 0.5 },
  /** 토론 시간: 21:00 to 22:00 KST, +50% damage taken and the full mechanic set. */
  debate: { utcOffsetHours: 9, startHour: 21, endHour: 22, damageTaken: 1.5 },
  /** A full shield lets this share of damage through; objectives strip it. */
  shieldLeak: 0.2,
  /** Share of the shield one objective strips, the same for every level. */
  shieldPerObjective: 0.05,
  /** A stripped shield grows back this much a Page hour, so objectives matter all phase long. */
  shieldRegrowPerHour: 0.1,
  /** 기여: 30 minutes of active fighting or 3 objectives; 핵심: 2 hours or 10. */
  tiers: {
    contribute: { activeMs: 30 * 60_000, objectives: 3 },
    core: { activeMs: 2 * HOUR_MS, objectives: 10 },
  },
  /** A real second counts as active fighting when the character hit, helped or did an objective. */
  activeWindowTicks: 20,
  /** Support board points: a revive, and an add of the boss's put down. */
  support: { revive: 5, add: 1 },
} as const;

export type RaidRank = keyof typeof RAID.targetDays;

/** The server's damage over the calibration window, in Page time. */
export interface DamageWindow {
  /** Everything the server's players dealt in the window, to anything. */
  readonly total: number;
  /** Of it, what went into raid bosses' pools. */
  readonly boss: number;
  /** How much of the window the server was measuring, at most `windowDays` days. */
  readonly measuredMs: number;
  /** Of it, the time a raid boss stood open, and the server's total damage in those hours. */
  readonly standingMs: number;
  readonly totalStanding: number;
}

export const NO_DAMAGE: DamageWindow = {
  total: 0,
  boss: 0,
  measuredMs: 0,
  standingMs: 0,
  totalStanding: 0,
};

/**
 * A phase's HP (PLAN §10 HP calibration): the server's daily damage over the last 14 days, times
 * the share a standing boss draws from it, times the days the phase should take, never below the
 * floor. A server that grows or shrinks gets a bar sized to it; a new or tiny one stands on the
 * floor. `rate` is the Page clock's rate: the floor is fighting time, so it shrinks with the clock.
 */
export function calibrateHp(rank: RaidRank, level: number, window: DamageWindow, rate = 1): number {
  const measured = Math.min(
    RAID.windowDays * DAY_MS,
    Math.max(RAID.minMeasuredMs, window.measuredMs),
  );
  const daily = (Math.max(0, window.total) / measured) * DAY_MS;
  const sized = daily * bossShareOf(window) * RAID.targetDays[rank];
  return Math.round(Math.max(phaseFloor(rank, level, rate), sized));
}

/** The share of the server's damage a standing boss draws: measured when it can be. */
export function bossShareOf(window: DamageWindow): number {
  if (window.standingMs < RAID.minMeasuredMs || !(window.totalStanding > 0)) return RAID.bossShare;
  return Math.min(1, Math.max(RAID.minShare, window.boss / window.totalStanding));
}

/** The smallest a phase can be: the small community's damage over the target days (`RAID.floor`). */
export function phaseFloor(rank: RaidRank, level: number, rate = 1): number {
  const f = RAID.floor;
  const perSecond = f.players * f.normalsPerSecond * monsterHP(Math.max(1, level), Rank.Normal);
  const seconds = (f.hoursPerDay * HOUR_MS * RAID.targetDays[rank]) / 1000;
  return (perSecond * seconds) / Math.max(1, rate);
}

/** Whether `gameMs` falls in the nightly 토론 시간 (Korean time). */
export function isDebateHour(gameMs: number): boolean {
  const d = RAID.debate;
  const hour = (((gameMs / HOUR_MS + d.utcOffsetHours) % 24) + 24) % 24;
  return hour >= d.startHour && hour < d.endHour;
}

/** Page clock ms when the next 토론 시간 starts, at or after `gameMs`. */
export function nextDebate(gameMs: number): number {
  const d = RAID.debate;
  const offset = d.utcOffsetHours * HOUR_MS;
  const local = gameMs + offset;
  const day = Math.floor(local / DAY_MS) * DAY_MS;
  let start = day + d.startHour * HOUR_MS;
  if (local >= day + d.endHour * HOUR_MS) start += DAY_MS;
  return Math.max(gameMs, start - offset);
}

/** The shield after `ms` of Page time growing back. */
export function regrowShield(shield: number, ms: number): number {
  return Math.min(1, Math.max(0, shield) + (RAID.shieldRegrowPerHour * Math.max(0, ms)) / HOUR_MS);
}

/** The shield after `n` objectives: a fixed share each, whatever the level of who did them. */
export function stripShield(shield: number, n: number): number {
  return Math.max(0, shield - RAID.shieldPerObjective * Math.max(0, n));
}

export const RaidTier = { None: 0, Present: 1, Contributor: 2, Core: 3 } as const;
export type RaidTier = (typeof RaidTier)[keyof typeof RaidTier];
export const RAID_TIER_NAMES = ["", "참석", "기여", "핵심"] as const;

export interface Participation {
  readonly damage: number;
  /** Page ms of active fighting. */
  readonly activeMs: number;
  readonly objectives: number;
  readonly support: number;
}

/** 참석 landed a hit (or did an objective); 기여 and 핵심 by active time or objectives. */
export function tierOf(p: Participation): RaidTier {
  const { contribute, core } = RAID.tiers;
  const present = p.damage > 0 || p.objectives > 0;
  if (!present) return RaidTier.None;
  if (p.activeMs >= core.activeMs || p.objectives >= core.objectives) return RaidTier.Core;
  if (p.activeMs >= contribute.activeMs || p.objectives >= contribute.objectives)
    return RaidTier.Contributor;
  return RaidTier.Present;
}

/** Damage a boss takes after its shield and 토론 시간. */
export function raidDamage(amount: number, shield: number, debate: boolean): number {
  const s = Math.min(1, Math.max(0, shield));
  const through = 1 - s * (1 - RAID.shieldLeak);
  return amount * through * (debate ? RAID.debate.damageTaken : 1);
}

/** The boards that grant titles (PLAN §10): damage, support and objectives. */
export const RAID_BOARDS = ["damage", "support", "objectives"] as const;
export type RaidBoard = (typeof RAID_BOARDS)[number];
