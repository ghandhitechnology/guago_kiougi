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
   * Share of the server's damage a standing boss draws, for a phase whose window holds less
   * than six hours of a boss standing (a Page's first boss phase after field weeks).
   */
  bossShare: 0.3,
  /**
   * The smallest bar: what a small community deals in the target days, so a new or tiny server
   * never gets a phase that one visit empties. Four same-level players, two hours a day, each
   * putting this many same-level normal monsters' health a second into the pool (gates and the
   * shield included).
   */
  floor: { players: 4, hoursPerDay: 2, normalsPerSecond: 1 },
  /** 토론 시간: 21:00 to 22:00 KST, +50% damage taken and the full mechanic set. */
  debate: { utcOffsetHours: 9, startHour: 21, endHour: 22, damageTaken: 1.5 },
  /** A full shield lets this share of damage through; objectives strip it. */
  shieldLeak: 0.2,
  /** Share of the shield one objective strips, the same for every level. */
  shieldPerObjective: 0.05,
  /**
   * A stripped shield grows back this much an hour of fighting (real time, so a compressed test
   * clock keeps the live balance against objectives), and objectives matter all phase long.
   */
  shieldRegrowPerHour: 0.1,
  /**
   * 참석: a hit landed (or an objective) and 5 minutes of active fighting; 기여: 30 minutes or 3
   * objectives; 핵심: 2 hours or 10. Every tier stands on 참석's floor of presence.
   */
  tiers: {
    present: { activeMs: 5 * 60_000 },
    contribute: { activeMs: 30 * 60_000, objectives: 3 },
    core: { activeMs: 2 * HOUR_MS, objectives: 10 },
  },
  /**
   * Objectives count toward a tier at most one per this much Page time per character: an
   * objective is an event of the fight, not a faucet, so 핵심 by objectives takes an hour there.
   */
  objectiveGapMs: 6 * 60_000,
  /** How recent, in ticks, an input or a moving hit keeps a tick of fighting active (3 s). */
  activeWindowTicks: 60,
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
 * A phase's HP (PLAN §10 HP calibration): the damage a standing boss takes in a Page day, from
 * the server's last 14 days, times the days the phase should take, never below the floor. A
 * server that grows or shrinks gets a bar sized to it; a new or tiny one stands on the floor.
 * `rate` is the Page clock's rate: the floor is fighting time, so it shrinks with the clock.
 */
export function calibrateHp(rank: RaidRank, level: number, window: DamageWindow, rate = 1): number {
  const sized = bossDaily(window) * RAID.targetDays[rank];
  return Math.round(Math.max(phaseFloor(rank, level, rate), sized));
}

/**
 * The damage a standing boss takes in a Page day: what bosses took over the hours one stood,
 * once the window holds six of them; before that, the server's daily damage (a few minutes of
 * history stretched to six hours) times the share a standing boss is assumed to draw.
 */
export function bossDaily(window: DamageWindow): number {
  if (window.standingMs >= RAID.minMeasuredMs)
    return (Math.max(0, window.boss) / window.standingMs) * DAY_MS;
  const measured = Math.min(
    RAID.windowDays * DAY_MS,
    Math.max(RAID.minMeasuredMs, window.measuredMs),
  );
  return (Math.max(0, window.total) / measured) * DAY_MS * RAID.bossShare;
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

/**
 * A phase's tier (PLAN §10): 참석 landed a hit (or did an objective) and stood its floor of
 * active fighting; 기여 and 핵심 by active time or by objectives counted (`countsObjective`).
 */
export function tierOf(p: Participation): RaidTier {
  const { present, contribute, core } = RAID.tiers;
  if (!(p.damage > 0 || p.objectives > 0) || p.activeMs < present.activeMs) return RaidTier.None;
  if (p.activeMs >= core.activeMs || p.objectives >= core.objectives) return RaidTier.Core;
  if (p.activeMs >= contribute.activeMs || p.objectives >= contribute.objectives)
    return RaidTier.Contributor;
  return RaidTier.Present;
}

/** What a tick of a character's fight shows of the player behind it, as ticks (0 for never). */
export interface Activity {
  /** The client dropped: the server plays the body until it comes back. */
  readonly away: boolean;
  /** The server moves the body (완전 자동, 스킬 수동). */
  readonly serverMoves: boolean;
  /** The last tick the player's own input arrived: a step, a dodge, a cast (never an aim). */
  readonly inputAt: number;
  /** The last tick the body moved. */
  readonly movedAt: number;
  /** The last tick its own hit landed on the boss, and the last it helped: an objective, a
   * revive, one of the boss's adds put down. */
  readonly hitAt: number;
  readonly helpAt: number;
}

/**
 * Whether a tick counts as active fighting: never while the client is away; otherwise the
 * character's own hit or help within the window, while the player steers it (its own input in
 * the window) or, for a body the server moves for a connected client (완전 자동 with the tab
 * open), while it moves. A body parked with its books firing, or a script that only keeps
 * sending inputs, is not fighting.
 */
export function isActive(a: Activity, tick: number): boolean {
  if (a.away) return false;
  const recent = (at: number) => at > 0 && tick - at < RAID.activeWindowTicks;
  if (!recent(a.hitAt) && !recent(a.helpAt)) return false;
  return recent(a.inputAt) || (a.serverMoves && recent(a.movedAt));
}

/** Whether an objective at `nowMs` counts toward the tier after the last one that did. */
export function countsObjective(lastCountedMs: number | undefined, nowMs: number): boolean {
  return lastCountedMs === undefined || nowMs - lastCountedMs >= RAID.objectiveGapMs;
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
