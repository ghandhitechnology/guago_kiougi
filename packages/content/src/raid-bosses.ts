/**
 * Page 1's bosses as data (PLAN §5 bosses, §10 raid, §13 탐구 토큰). The fight each one is lives
 * in its brain in `@guago/shared` (`fight/bosses/`); here are its bodies, the objective entities
 * players break or carry, its adds, how hard its tells hit and what it pays. Ids match the Page
 * lifecycle (`LIFECYCLES[0].bosses`) and the narrative's `BOSSES`.
 */

import { MAJORS, type RaidRank, type Random, Rank } from "@guago/shared";
import { BOOKS, type BookDef, TOOLS } from "./books.ts";
import type { ClassId } from "./classes.ts";
import { type Drop, rollDrops } from "./drops.ts";

export interface RaidBossBody {
  readonly sprite: string;
  readonly radius: number;
  /** Knockback resistance; a huge mass never moves. */
  readonly mass: number;
  readonly armor: number;
  /** Contact damage share (`monsterHit`). */
  readonly damage: number;
  readonly speed: number;
}

export interface RaidObjectDef {
  readonly id: string;
  readonly sprite: string;
  readonly radius: number;
  readonly mass: number;
  /** HP in level-scaled normal monsters; a carried object cannot be broken. */
  readonly hp: number;
}

export interface RaidBossDef {
  readonly id: "pythagoreans" | "zeno" | "aristotle";
  readonly map: string;
  readonly rank: RaidRank;
  /** The live raid's level; 복습 runs at the player's own. */
  readonly level: number;
  /** 논제: the era boss has four, a mid boss one. */
  readonly phases: number;
  /** The spawn knocked-out players wake at: the arena's entrance, with no 벌점 (PLAN §10). */
  readonly entrance: string;
  readonly body: RaidBossBody;
  /** A second body whose hits go to the same pool. */
  readonly part?: RaidBossBody;
  readonly objects: readonly RaidObjectDef[];
  readonly add: {
    readonly monster: string;
    readonly every: number;
    readonly count: number;
    readonly cap: number;
  } | null;
  /**
   * A tell's hit share of the body's `monsterDamage` (rank 300): 0.5 is about 43% of a same-level
   * player's health, so a missed tell hurts and two kill.
   */
  readonly tellDamage: number;
  /** Share of a hit that gets through while the gimmick's gate is shut. */
  readonly gateLeak: number;
  /** A phase alone (복습): the body's own HP times this. */
  readonly soloPhase: number;
  /** 탐구 토큰 and personal loot rolls by tier (none, 참석, 기여, 핵심), per phase. */
  readonly rewards: { readonly tokens: readonly number[]; readonly rolls: readonly number[] };
  /** 복습's first clear. */
  readonly firstClear: { readonly tokens: number };
}

export const RAID_BOSSES: readonly RaidBossDef[] = [
  {
    id: "pythagoreans",
    map: "p1-croton-school",
    rank: "mid",
    level: 50,
    phases: 1,
    entrance: "main",
    body: { sprite: "boss-pythagoreans", radius: 30, mass: 1e9, armor: 0.2, damage: 0.4, speed: 0 },
    objects: [],
    add: { monster: "rational", every: 15, count: 3, cap: 8 },
    tellDamage: 0.5,
    gateLeak: 0.1,
    soloPhase: 0.5,
    rewards: { tokens: [0, 4, 10, 20], rolls: [0, 1, 1, 2] },
    firstClear: { tokens: 15 },
  },
  {
    id: "zeno",
    map: "p1-elea-track",
    rank: "mid",
    level: 80,
    phases: 1,
    entrance: "main",
    body: { sprite: "boss-zeno", radius: 16, mass: 1e9, armor: 0.1, damage: 0.3, speed: 0 },
    part: { sprite: "boss-zeno-ghost", radius: 14, mass: 1e9, armor: 0.1, damage: 0, speed: 0 },
    objects: [],
    add: null,
    tellDamage: 0.45,
    gateLeak: 0.1,
    soloPhase: 0.4,
    rewards: { tokens: [0, 4, 10, 20], rolls: [0, 1, 1, 2] },
    firstClear: { tokens: 15 },
  },
  {
    id: "aristotle",
    map: "p1-lyceum",
    rank: "era",
    level: 100,
    phases: 4,
    entrance: "respawn",
    body: { sprite: "boss-aristotle", radius: 40, mass: 10, armor: 0.3, damage: 0.5, speed: 0 },
    objects: [
      { id: "stele", sprite: "p1-stele", radius: 14, mass: 1e9, hp: 60 },
      { id: "block", sprite: "p1-block", radius: 14, mass: 8, hp: 1e9 },
    ],
    add: { monster: "element-earth", every: 12, count: 2, cap: 10 },
    tellDamage: 0.6,
    gateLeak: 0.1,
    soloPhase: 0.3,
    rewards: { tokens: [0, 8, 20, 40], rolls: [0, 1, 2, 3] },
    firstClear: { tokens: 30 },
  },
];

export function raidBoss(id: string): RaidBossDef | undefined {
  return RAID_BOSSES.find((b) => b.id === id);
}

/** The boss whose arena `mapId` is, if any. */
export function raidBossOn(mapId: string): RaidBossDef | undefined {
  return RAID_BOSSES.find((b) => b.map === mapId);
}

/** The PLAN rank a boss body's HP is figured at. */
export const BOSS_BODY_RANK = Rank.FieldBoss;

/**
 * One personal loot roll from a boss (PLAN §10 rewards by tier): a boss-rank drop of the boss's
 * Page at its level. An era boss's drops are bound (PLAN §13); the major sets the spotlight
 * subject the 낱장 lean to.
 */
export function bossLoot(random: Random, def: RaidBossDef, major: string): Drop[] {
  const books = bossLootBooks(def);
  return rollDrops(random, {
    source: {
      kind: "monster",
      fieldId: def.map,
      monsterId: def.id,
      rank: "boss",
      ...(def.rank === "era" ? { era: true as const } : {}),
    },
    level: def.level,
    rank: BOSS_BODY_RANK,
    coin: 1,
    dropMult: 1,
    coinMult: 1,
    books,
    tools: TOOLS.filter((t) => books.some((b) => b.tool === t.id)),
    spotlight: (MAJORS as readonly string[]).includes(major) ? (major as ClassId) : "math",
  });
}

/** The books a boss's 낱장 can land on: its Page's. */
export function bossLootBooks(_def: RaidBossDef): readonly BookDef[] {
  return PAGE1_BOOKS;
}

const PAGE1_BOOKS = BOOKS.filter((b) => b.page === 1);
