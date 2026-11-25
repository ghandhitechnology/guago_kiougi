/**
 * The living world's rules (PLAN §10, §11, §15): the server clock and its resets, 벌점 and 상점,
 * 명령퇴사, 층장, 급식, 졸음 and the joke awards. Pure functions and numbers; the server runs them
 * inside its operations and every client may run them for display.
 */
import { DROWSY, RESTED } from "./progress.ts";

// ── Clock ───────────────────────────────────────────────────────────────────

/**
 * The server's game time runs from one anchor at a rate: game = game anchor + (real − real anchor)
 * × rate. Rate 1 is a live server; a test server compresses a Page (13 weeks at rate 1456 take
 * 90 minutes). Every timer in the living world reads this time, never the wall clock.
 */
export interface ClockAnchor {
  /** Wall-clock ms when the anchor was set. */
  readonly realMs: number;
  /** Game ms at that moment. */
  readonly gameMs: number;
  readonly rate: number;
}

export const CLOCK_MAX_RATE = 100_000;

export function clockAt(anchor: ClockAnchor, realMs: number): number {
  return anchor.gameMs + (realMs - anchor.realMs) * anchor.rate;
}

/** The anchor after stepping `ms` of game time or changing the rate, without a jump. */
export function reanchor(
  anchor: ClockAnchor,
  realMs: number,
  change: { stepMs?: number; rate?: number },
): ClockAnchor {
  const rate = change.rate ?? anchor.rate;
  const step = change.stepMs ?? 0;
  if (!(step >= 0 && step <= CLOCK_MAX_STEP_MS)) throw new Error(`clock step ${step} out of range`);
  return checkAnchor({ realMs, gameMs: clockAt(anchor, realMs) + step, rate });
}

/** One step moves the clock at most a Theme: twelve Pages of thirteen weeks. */
export const CLOCK_MAX_STEP_MS = 156 * 7 * 24 * 3600 * 1000;
/** Game time stays a valid `Date` with room to spare (year 10,000). */
const CLOCK_MAX_MS = 253_402_300_800_000;

/** The anchor, if it can run a clock: finite, a rate in range, game time a valid date. */
export function checkAnchor(a: ClockAnchor): ClockAnchor {
  if (!(a.rate > 0 && a.rate <= CLOCK_MAX_RATE))
    throw new Error(`clock rate ${a.rate} out of range`);
  if (!Number.isFinite(a.realMs) || !(a.gameMs >= 0 && a.gameMs < CLOCK_MAX_MS)) {
    throw new Error(`clock anchor ${JSON.stringify(a)} out of range`);
  }
  return a;
}

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

/**
 * Boards reset at 05:00 KST (UTC+9), weeklies on Monday at 05:00 KST (PLAN §15). Day 0 is the
 * board day that began 1970-01-01 05:00 KST.
 */
const RESET_SHIFT_MS = (9 - 5) * HOUR_MS;

export function boardDay(ms: number): number {
  return Math.floor((ms + RESET_SHIFT_MS) / DAY_MS);
}

/** 1970-01-01 was a Thursday, so three days shift the count onto Mondays. */
export function boardWeek(ms: number): number {
  return Math.floor((boardDay(ms) + 3) / 7);
}

/** When board day `day` begins, in ms. */
export function dayStart(day: number): number {
  return day * DAY_MS - RESET_SHIFT_MS;
}

/** When board week `week` begins (a Monday, 05:00 KST), in ms. */
export function weekStart(week: number): number {
  return dayStart(week * 7 - 3);
}

// ── 벌점 and 상점 (PLAN §11) ────────────────────────────────────────────────

export const DEMERITS = {
  /** 기절 in a field. */
  knockout: 1,
  /** Spotted by a patrol in a 위험 구역. */
  patrol: 2,
  /** Caught eating in the 기숙사 by 권 사감. */
  "dorm-food": 1,
  /** A chat filter strike an admin confirmed. */
  chat: 3,
} as const;
export type DemeritReason = keyof typeof DEMERITS;

export const MERITS = {
  revive: 1,
  /** Finishing a 도움 notice for a lower-level player. */
  help: 1,
  /** The 청소 당번 daily. */
  cleaning: 1,
  "floor-leader": 5,
} as const;
export type MeritReason = keyof typeof MERITS;

/** From this many 벌점 a new one comes with a reminder of where 명령퇴사 is. */
export const DEMERIT_WARNING = 15;

export const EXPEL = {
  /** 벌점 that sends a player home. */
  at: 20,
  homeSeconds: 600,
  /** The penalty runs for this long after the player is back. */
  penaltySeconds: 3600,
  penalty: 0.3,
} as const;

export interface Conduct {
  /** 벌점 held. */
  readonly demerits: number;
}

export interface DemeritResult {
  /** 벌점 after the event (0 after 명령퇴사). */
  readonly demerits: number;
  /** True when this event reached `EXPEL.at`. */
  readonly expelled: boolean;
  /** 벌점 that reached the threshold, before the reset. */
  readonly reached: number;
}

export function addDemerits(c: Conduct, amount: number): DemeritResult {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("demerits are whole and positive");
  const reached = c.demerits + amount;
  return reached >= EXPEL.at
    ? { demerits: 0, expelled: true, reached }
    : { demerits: reached, expelled: false, reached };
}

export interface MeritResult {
  /** 벌점 cancelled one for one. */
  readonly cancelled: number;
  /** 상점 left over, paid into the wallet as 학생회 상점 currency. */
  readonly spare: number;
  readonly demerits: number;
}

/** A 상점 cancels a 벌점 first; only what is left over is spendable (PLAN §11). */
export function addMerits(c: Conduct, amount: number): MeritResult {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("merits are whole and positive");
  const cancelled = Math.min(c.demerits, amount);
  return { cancelled, spare: amount - cancelled, demerits: c.demerits - cancelled };
}

/**
 * 단정한 복장: +5% 상점 gain. 상점 are whole points, so each point earned in uniform in the hub
 * brings one more with this chance, rolled by the server.
 */
export const NEAT_MERIT_BONUS = 0.05;

export function neatBonus(amount: number, rolls: readonly number[]): number {
  let extra = 0;
  for (let i = 0; i < amount; i++) if ((rolls[i] ?? 1) < NEAT_MERIT_BONUS) extra++;
  return extra;
}

/**
 * Club EXP a member's finished notice brings their 동아리 (PLAN §12: 수행평가 is club activity).
 * A level 10 club (81,000) takes ten members on full boards about three months.
 */
export const CLUB_EXP_FOR_NOTICE = {
  daily: 10,
  weekly: 30,
  repeat: 5,
  story: 20,
  help: 15,
} as const;

/**
 * 상점 a day that count toward the week's 층장 tally, by reason. Everything earned is still paid
 * (it cancels 벌점, the rest is spendable); past the cap it only stops counting for 층장. The
 * 층장's own +5 never counts, so a 층장 is not chosen again by being one.
 */
export const MERIT_TALLY_DAILY: Readonly<Record<MeritReason, number>> = {
  revive: 5,
  help: 3,
  cleaning: 1,
  "floor-leader": 0,
};

/** How much of `amount` new 상점 counts toward the tally, with `counted` already today. */
export function tallyCredit(reason: MeritReason, amount: number, counted: number): number {
  return Math.max(0, Math.min(amount, MERIT_TALLY_DAILY[reason] - counted));
}

/** A 도움 between the same helper and poster pays its 상점 once a board day. */
export const HELP_PAIR_DAILY = 1;

/** 층장: the five players with the most 상점 in a week (PLAN §11). */
export const FLOOR_LEADERS = 5;

// ── Buffs and penalties (PLAN §9, §11) ──────────────────────────────────────

export const MEAL = { seconds: 1800 } as const;
/** Standing at a 졸방대 this long clears 졸음. */
export const DESK_CURE_SECONDS = 30;

export type BuffStat = "exp" | "pinecone" | "damage" | "moveSpeed" | "regen";

/** What the combat side multiplies by, from the living world's rules. 1 means no change. */
export interface Modifiers {
  readonly exp: number;
  readonly pinecone: number;
  readonly damage: number;
  readonly moveSpeed: number;
  /** Extra regeneration, as a share of max HP a second. */
  readonly regen: number;
  readonly drop: number;
  readonly hp: number;
}

export const NO_MODIFIERS: Modifiers = {
  exp: 1,
  pinecone: 1,
  damage: 1,
  moveSpeed: 1,
  regen: 0,
  drop: 1,
  hp: 1,
};

export interface RuleState {
  readonly restedUntil: number | null;
  readonly penaltyUntil: number | null;
  readonly drowsy: boolean;
  readonly meal: {
    readonly until: number;
    readonly stat: BuffStat;
    readonly amount: number;
  } | null;
  /** Small permanent bonuses from completed 도감 sets, as additive shares. */
  readonly codex: Partial<Record<keyof Modifiers, number>>;
}

/**
 * Every rule-side multiplier at `now`. EXP: 숙면 +50%, 졸음 −10%, 명령퇴사 −30%, 급식 and 도감
 * shares add to one factor, the penalties multiply it.
 */
export function modifiers(s: RuleState, now: number): Modifiers {
  const add: Record<keyof Modifiers, number> = {
    exp: 0,
    pinecone: 0,
    damage: 0,
    moveSpeed: 0,
    regen: 0,
    drop: 0,
    hp: 0,
  };
  for (const [k, v] of Object.entries(s.codex) as [keyof Modifiers, number][]) add[k] += v;
  if (s.meal && s.meal.until > now) add[s.meal.stat] += s.meal.amount;
  if (s.restedUntil !== null && s.restedUntil > now) add.exp += RESTED.bonus;
  let expFactor = 1;
  if (s.drowsy) expFactor *= 1 - DROWSY.penalty;
  if (s.penaltyUntil !== null && s.penaltyUntil > now) expFactor *= 1 - EXPEL.penalty;
  return {
    exp: (1 + add.exp) * expFactor,
    pinecone: 1 + add.pinecone,
    damage: 1 + add.damage,
    moveSpeed: 1 + add.moveSpeed,
    regen: add.regen,
    drop: 1 + add.drop,
    hp: 1 + add.hp,
  };
}

// ── Joke awards (PLAN §11) ──────────────────────────────────────────────────

export const AWARD_RULES = {
  /** 딱 걸렸상: caught by patrols this many times. */
  caught: 10,
  /** 개근상: full daily boards on this many board days in a row. */
  attendance: 30,
} as const;

/** The 개근상 streak after finishing a full daily board on `day`. */
export function boardStreak(last: { day: number; streak: number } | null, day: number): number {
  if (!last) return 1;
  if (last.day === day) return last.streak;
  return last.day === day - 1 ? last.streak + 1 : 1;
}

// ── 도움 notices (PLAN §15) ─────────────────────────────────────────────────

export const HELP = {
  /** A player may post when this many levels or more below the frontier level. */
  belowFrontier: 25,
  /** A helper must be at least this many levels above the poster. */
  helperAbove: 10,
  /** Hours of game time a notice stays up. */
  hours: 24,
  /** Open notices one player may have at once. */
  open: 1,
} as const;

export function mayPostHelp(level: number, frontierLevel: number): boolean {
  return level <= frontierLevel - HELP.belowFrontier;
}

export function mayHelp(helperLevel: number, posterLevel: number): boolean {
  return helperLevel >= posterLevel + HELP.helperAbove;
}

// ── Seeds ───────────────────────────────────────────────────────────────────

/** A uint32 seed from text (FNV-1a), for draws that must repeat exactly: a board, a menu. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
