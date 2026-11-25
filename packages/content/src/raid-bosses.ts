/**
 * Page 1's bosses as data (PLAN §5 bosses, §10 raid, §13 탐구 토큰). The fight each one is lives
 * in its brain in `@guago/shared` (`fight/bosses/`); here are its bodies, the objective entities
 * players break or carry, its adds, how hard its tells hit and what it pays. Ids match the Page
 * lifecycle (`LIFECYCLES[0].bosses`) and the narrative's `BOSSES`.
 */

import { type RaidRank, Rank } from "@guago/shared";

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
  /** 논제: the era boss has four, a mid boss one. */
  readonly phases: number;
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
  /** A tell's hit share before the level factor. */
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
    phases: 1,
    body: { sprite: "boss-pythagoreans", radius: 30, mass: 1e9, armor: 0.2, damage: 0.4, speed: 0 },
    objects: [],
    add: { monster: "rational", every: 15, count: 3, cap: 8 },
    tellDamage: 0.9,
    gateLeak: 0.1,
    soloPhase: 0.5,
    rewards: { tokens: [0, 4, 10, 20], rolls: [0, 1, 1, 2] },
    firstClear: { tokens: 15 },
  },
  {
    id: "zeno",
    map: "p1-elea-track",
    rank: "mid",
    phases: 1,
    body: { sprite: "boss-zeno", radius: 16, mass: 1e9, armor: 0.1, damage: 0.3, speed: 0 },
    part: { sprite: "boss-zeno-ghost", radius: 14, mass: 1e9, armor: 0.1, damage: 0, speed: 0 },
    objects: [],
    add: null,
    tellDamage: 0.8,
    gateLeak: 0.1,
    soloPhase: 0.4,
    rewards: { tokens: [0, 4, 10, 20], rolls: [0, 1, 1, 2] },
    firstClear: { tokens: 15 },
  },
  {
    id: "aristotle",
    map: "p1-lyceum",
    rank: "era",
    phases: 4,
    body: { sprite: "boss-aristotle", radius: 40, mass: 10, armor: 0.3, damage: 0.5, speed: 0 },
    objects: [
      { id: "stele", sprite: "p1-stele", radius: 14, mass: 1e9, hp: 60 },
      { id: "block", sprite: "p1-block", radius: 14, mass: 8, hp: 1e9 },
    ],
    add: { monster: "element-earth", every: 12, count: 2, cap: 10 },
    tellDamage: 1,
    gateLeak: 0.1,
    soloPhase: 0.3,
    rewards: { tokens: [0, 8, 20, 40], rolls: [0, 1, 2, 3] },
    firstClear: { tokens: 30 },
  },
];

export function raidBoss(id: string): RaidBossDef | undefined {
  return RAID_BOSSES.find((b) => b.id === id);
}

/** The PLAN rank a boss body's HP is figured at. */
export const BOSS_BODY_RANK = Rank.FieldBoss;
