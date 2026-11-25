/**
 * The 콜로세움's fixed numbers (PLAN §14): what every duel flattens a character to, how long its
 * rounds run, how many decide a match, where fighters stand, and the request limits. The rule
 * that applies them is `duelBuild` and `duelKit` in shared; the reasons are in docs/DECISIONS.md.
 */
import {
  type DuelMode,
  type DuelNorms,
  type DuelTiming,
  TEAM_SIZE,
  TILE_SIZE,
  ticks,
} from "@guago/shared";
import type { Arena } from "./maps/format.ts";

/**
 * Everyone duels at level 100 (the 2학년 tier: four books, four tools, the 부전공), every book a
 * 심화서 at +0, every tool at level 3, no stat points. Health is ×12 and damage ×0.7 on top of
 * that kit: player damage is tuned to clear monsters of the same level in a hit or two, and
 * against a player's health it would end a duel in about a second (see the time-to-kill table in
 * DECISIONS). Knockback on a fighter is half a monster's of mass 1, so a heavy tome moves a
 * fighter a few tiles, not across the floor.
 */
export const DUEL_NORMS: DuelNorms = {
  level: 100,
  grade: 2,
  pilgi: 0,
  toolLevel: 3,
  books: 4,
  tools: 4,
  hp: 20,
  damage: 0.7,
  classDamage: { math: 0.52, physics: 1.12, chemistry: 1.6, biology: 0.8, earth: 0.82 },
  knock: 0.5,
  mass: 1,
};

/**
 * Best of three, at most five rounds counting draws; 75 s a round, decided on health at time. A
 * round with no hit landed for 20 s is a draw, and five minutes of fighting ends the match, so
 * two players standing still cannot hold a floor.
 */
export const DUEL_TIMING: DuelTiming = {
  countdown: ticks(3),
  round: ticks(75),
  pause: ticks(4),
  wins: 2,
  maxRounds: 5,
  idle: ticks(20),
  matchCap: ticks(300),
};

/** Seconds a queued match waits for everyone to accept, and a challenge for its answer. */
export const DUEL_ACCEPT_SECONDS = 15;
export const DUEL_CHALLENGE_SECONDS = 30;
/** Seconds fighters have to arrive on the floor; whoever has not arrived forfeits. */
export const DUEL_ARRIVE_SECONDS = 20;
/** Seconds the result stays on the floor before everyone is sent back. */
export const DUEL_RESULT_SECONDS = 6;
/** Seconds a player who let a queued match lapse or refused it may not queue again. */
export const DUEL_QUEUE_LOCK_SECONDS = 60;
/**
 * Floors held at once across the server: one per 새벽관 channel. A match finding every floor
 * taken is called off (`no_floor`) rather than opening channel after channel.
 */
export const DUEL_FLOORS_MAX = 8;
/**
 * A match the other side forfeits counts as won only after this much fighting, unless a round
 * was fought out first: conceding at once never hands a friend a win for the player card.
 */
export const DUEL_FORFEIT_WIN_SECONDS = 15;
/**
 * Wins counted toward the record per lineup (the same winners over the same losers) a Korean day:
 * past it a match is still played and recorded as played, the win is not counted.
 */
export const DUEL_PAIR_WINS_DAILY = 3;
/** A character that landed or took a hit this recently is in a fight and may not start a duel. */
export const DUEL_COMBAT_SECONDS = 10;
/** Challenges waiting on one player at once. */
export const DUEL_CHALLENGES_IN_CAP = 5;

/**
 * Where each fighter starts on a floor, in world pixels: the sides face each other across the
 * floor's long axis, three tiles in from each end; a 3v3 side stands in a column three tiles apart.
 */
export function duelMarks(arena: Arena, mode: DuelMode): { team: number; x: number; y: number }[] {
  const { rect } = arena;
  const midY = rect.y + Math.floor(rect.h / 2);
  const west = rect.x + 3;
  const east = rect.x + rect.w - 4;
  const rows = TEAM_SIZE[mode] === 1 ? [midY] : [midY - 3, midY, midY + 3];
  const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE });
  return [
    ...rows.map((ty) => ({ team: 1, ...at(west, ty) })),
    ...rows.map((ty) => ({ team: 2, ...at(east, ty) })),
  ];
}
