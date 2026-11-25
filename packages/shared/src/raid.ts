/**
 * The raid's rules that are formulas (PLAN §10 era boss raid): how big a phase's HP bar is, when
 * the nightly 토론 시간 runs, and which participation tier a character reached in a phase. All
 * times are Page clock milliseconds, so a time-compressed test server calibrates, debates and
 * finishes in minutes with the same numbers.
 */

import { DAY_MS, HOUR_MS } from "./live.ts";
import { monsterHP } from "./numbers.ts";

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
  /** The PLAN's monster HP rank the smallest bar stands on: 300 is a field boss. */
  floorRank: { era: 600, mid: 300 },
  /** 토론 시간: 21:00 to 22:00 KST, +50% damage taken and the full mechanic set. */
  debate: { utcOffsetHours: 9, startHour: 21, endHour: 22, damageTaken: 1.5 },
  /** A full shield lets this share of damage through; objectives strip it. */
  shieldLeak: 0.2,
  /** Share of the shield one objective strips, the same for every level. */
  shieldPerObjective: 0.05,
  /** 기여: 30 minutes of active fighting or 3 objectives; 핵심: 2 hours or 10. */
  tiers: {
    contribute: { activeMs: 30 * 60_000, objectives: 3 },
    core: { activeMs: 2 * HOUR_MS, objectives: 10 },
  },
  /** A second of fighting counts as active when the character hit, helped or did an objective in it. */
  activeStepMs: 1000,
} as const;

export type RaidRank = keyof typeof RAID.targetDays;

export interface DamageWindow {
  /** Damage the whole server dealt in the window. */
  readonly damage: number;
  /** How much of the window the server was measuring, at most `windowDays` days. */
  readonly measuredMs: number;
}

/**
 * A phase's HP: the server's daily damage over the last 14 days times the days the phase should
 * take, never below the floor for the boss's level. A new or tiny server lands on the floor and
 * takes longer; a busy one gets a bar sized to it.
 */
export function calibrateHp(rank: RaidRank, level: number, window: DamageWindow): number {
  const measured = Math.min(
    RAID.windowDays * DAY_MS,
    Math.max(RAID.minMeasuredMs, window.measuredMs),
  );
  const daily = (Math.max(0, window.damage) / measured) * DAY_MS;
  const sized = daily * RAID.targetDays[rank];
  return Math.round(Math.max(phaseFloor(rank, level), sized));
}

/** The smallest a phase can be: the PLAN's monster HP formula at the boss's rank. */
export function phaseFloor(rank: RaidRank, level: number): number {
  return monsterHP(Math.max(1, level), RAID.floorRank[rank]);
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

export const RaidTier = { None: 0, Present: 1, Contributor: 2, Core: 3 } as const;
export type RaidTier = (typeof RaidTier)[keyof typeof RaidTier];
export const RAID_TIER_NAMES = ["", "참석", "기여", "핵심"] as const;

export interface Participation {
  readonly damage: number;
  readonly activeMs: number;
  readonly objectives: number;
  readonly support: number;
}

/** 참석 landed a hit (or did an objective); 기여 and 핵심 by active time or objectives. */
export function tierOf(p: Participation): RaidTier {
  const { contribute, core } = RAID.tiers;
  if (p.activeMs >= core.activeMs || p.objectives >= core.objectives) return RaidTier.Core;
  if (p.activeMs >= contribute.activeMs || p.objectives >= contribute.objectives)
    return RaidTier.Contributor;
  if (p.damage > 0 || p.objectives > 0) return RaidTier.Present;
  return RaidTier.None;
}

/** Damage a boss takes after its shield and 토론 시간. */
export function raidDamage(amount: number, shield: number, debate: boolean): number {
  const s = Math.min(1, Math.max(0, shield));
  const through = 1 - s * (1 - RAID.shieldLeak);
  return amount * through * (debate ? RAID.debate.damageTaken : 1);
}
