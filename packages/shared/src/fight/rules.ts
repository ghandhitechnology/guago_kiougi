/**
 * What the combat step reads: the game's data compiled into flat numbers. `@guago/content` owns
 * the books, monsters, statuses and class rules and compiles them into these tables
 * (`simRules()` there); `shared` never imports `content`. Times are in ticks, distances in
 * pixels, speeds in pixels per tick, angles in radians. Every field is present, zero when unused,
 * so the hot loops read numbers and never test for absent options.
 */

import { TICK_RATE_HZ } from "../constants.ts";
import type { Modifiers } from "../live.ts";
import type { Random } from "../random.ts";
import type { Stats } from "../stats.ts";
import type { BossRule } from "./boss.ts";

// ── Attacks ─────────────────────────────────────────────────────────────────

/** The ten attack behaviours (content `attacks.ts`). */
export const Kind = {
  Orbit: 0,
  Beam: 1,
  Projectile: 2,
  Chain: 3,
  Cone: 4,
  Summon: 5,
  Telegraph: 6,
  Wave: 7,
  Zone: 8,
  Dash: 9,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

/** How a weapon with several statuses picks one per cast. */
export const StatusOrder = { Cycle: 0, Random: 1, Choose: 2 } as const;
export type StatusOrder = (typeof StatusOrder)[keyof typeof StatusOrder];

/** A status a hit applies: index into `SimRules.statuses`. */
export interface StatusPick {
  readonly status: number;
  readonly stacks: number;
  readonly chance: number;
  /** Lands on the attacker instead (철 from 주기율표 브로마이드). */
  readonly self: boolean;
}

/** A lingering area: a pool where a flask lands, a dash's axes, molten iron. */
export interface AreaRule {
  readonly radius: number;
  readonly duration: number;
  readonly interval: number;
  /** Multiplies the weapon's hit damage. */
  readonly damage: number;
  readonly status: StatusPick | null;
  /** Knock value toward the centre each pulse. */
  readonly pull: number;
  /** Radians per tick the area turns (선형 변환's axes). */
  readonly spin: number;
}

/**
 * One equipped book, resolved at its level with the owner's tools and stats. The hooks after
 * `kind`-specific numbers are the closed list of specials in content `attacks.ts`; each is one
 * branch in the step.
 */
export interface Weapon {
  /** Index into `SimRules.books`, for the client to pick the art. */
  readonly book: number;
  readonly evolved: boolean;
  readonly kind: Kind;
  /** Ticks from one cast to the next; fractional, spent at 1 + attack speed per tick. */
  readonly cooldown: number;
  /** One hit before crits, level factor, mode and signature: bookDamage × the attack's damage. */
  readonly hit: number;
  readonly knock: number;
  readonly statuses: readonly StatusPick[];
  readonly statusOrder: StatusOrder;
  /** The same shape strikes again after `delay` ticks (0: none). */
  readonly followDelay: number;
  readonly followDamage: number;
  readonly followStatus: StatusPick | null;

  // Shape: orbit, beam, projectile, chain, cone, summon, telegraph, wave, zone, dash.
  readonly count: number;
  readonly orbitRadius: number;
  readonly bodyRadius: number;
  /** Ticks per revolution, or per full swing and back. */
  readonly period: number;
  readonly duration: number;
  readonly hitInterval: number;
  /** Radians a pendulum swings through; 0 circles. */
  readonly sweep: number;
  /** Radians per tick the swing plane turns. */
  readonly precession: number;
  readonly length: number;
  readonly width: number;
  readonly amplitude: number;
  readonly wavelength: number;
  readonly reflect: number;
  /** Fan between shots or beams of one cast, radians. */
  readonly spread: number;
  readonly speed: number;
  /** Fake height gravity, px/tick²; 0 flies straight. */
  readonly gravity: number;
  readonly range: number;
  readonly radius: number;
  readonly impactRadius: number;
  readonly pierce: number;
  readonly bounce: number;
  /** Shots per volley on consecutive casts; empty for `count` every cast. */
  readonly burst: readonly number[];
  readonly pool: AreaRule | null;
  readonly jumps: number;
  readonly jumpRange: number;
  readonly falloff: number;
  /** Full cone angle, radians. */
  readonly angle: number;
  readonly hits: number;
  readonly perCast: number;
  readonly cap: number;
  readonly lifetime: number;
  readonly divideEvery: number;
  /** Telegraph mark: 0 circle, 1 line. */
  readonly line: boolean;
  readonly delay: number;
  readonly repeat: number;
  readonly repeatInterval: number;
  readonly scatter: number;
  /** Wave: ticks at full size before it pulls back; the pull's knock value. */
  readonly hold: number;
  readonly pull: number;
  readonly follow: boolean;
  /** Zone radius growth, px per tick. */
  readonly growth: number;
  /** An ally zone deals nothing and lends `buffAttackSpeed` and `buffCooldown`. */
  readonly allies: boolean;
  readonly buffAttackSpeed: number;
  readonly buffCooldown: number;
  readonly distance: number;
  readonly carry: boolean;

  // Hooks (content `Special`).
  readonly rollMin: number;
  /** 0: no die. */
  readonly rollMax: number;
  readonly rollRising: boolean;
  readonly keepBurst: boolean;
  readonly trail: AreaRule | null;
  readonly growPerHit: number;
  readonly growMax: number;
  readonly growWindow: number;
  readonly block: boolean;
  readonly healOnKill: number;
  readonly elastic: boolean;
  readonly party: boolean;
  /** Hits on a target with `critOnStacks` of `critOnStatus` always crit; -1 for none. */
  readonly critOnStatus: number;
  readonly critOnStacks: number;
  /** A target dying with this status passes it on; -1 for none. */
  readonly spreadStatus: number;
  readonly spreadCount: number;
  readonly spreadKeep: boolean;
  readonly specialize: boolean;
  readonly fork: number;
  readonly merge: boolean;
  readonly ricochet: number;
  readonly neutralizeShield: number;
  readonly neutralizeHeal: number;

  // Tool multipliers on effects that are not attack numbers (content `AttackMod`).
  readonly statusDuration: number;
  readonly burn: number;
  readonly bleed: number;
  readonly shield: number;
  readonly aura: number;
  readonly healing: number;
  /** 예보: delayed strikes multiply damage and area by these. */
  readonly forecastDamage: number;
  readonly forecastArea: number;
}

// ── Players ─────────────────────────────────────────────────────────────────

/** What a player brings into a fight; compiled into a `PlayerKit` by `SimRules.kit`. */
export interface PlayerBuild {
  readonly major: string;
  readonly minor: string | null;
  readonly level: number;
  readonly stats: Stats;
  readonly books: readonly {
    readonly def: string;
    readonly level: number;
    readonly grade: number;
    readonly pilgi: number;
    readonly evolved: boolean;
  }[];
  readonly tools: readonly { readonly def: string; readonly level: number }[];
}

/** Class signature strengths: 1 for the 전공, 0.5 for the 부전공, else 0. */
export interface Strengths {
  readonly math: number;
  readonly physics: number;
  readonly chemistry: number;
  readonly biology: number;
  readonly earth: number;
}

export interface PlayerKit {
  readonly major: string;
  readonly weapons: readonly Weapon[];
  /** Multiplies every hit (the live server's damage modifier). */
  readonly damage: number;
  readonly maxHp: number;
  /** Share of max HP regenerated per tick. */
  readonly regen: number;
  readonly critChance: number;
  readonly critMult: number;
  /** Walking speed, px per second (the client predicts with it). */
  readonly speed: number;
  readonly dodgeCooldown: number;
  readonly understanding: number;
  readonly dropMult: number;
  readonly coinMult: number;
  readonly strength: Strengths;
  /** 증명 스택 cap, and 증명 노트's extra burst (absolute damage) and chain. */
  readonly proofCap: number;
  readonly qedBonus: number;
  readonly qedChain: number;
  /** 증식: extra minions, infection on hit, spread count, heal per kill (share of max HP). */
  readonly minionCap: number;
  readonly infectChance: number;
  readonly infectSpread: number;
  readonly infectRange: number;
  readonly killHeal: number;
  /** 운동량: share of a launching hit dealt on collision. */
  readonly collisionShare: number;
}

/**
 * A kit with the living world's modifiers (buffs, penalties, 도감 sets) applied where the step
 * reads them; EXP is the player's own multiplier and is not part of the kit.
 */
export function withModifiers(kit: PlayerKit, m: Modifiers): PlayerKit {
  return {
    ...kit,
    damage: kit.damage * m.damage,
    maxHp: kit.maxHp * m.hp,
    regen: kit.regen + m.regen / TICK_RATE_HZ,
    speed: kit.speed * m.moveSpeed,
    dropMult: kit.dropMult * m.drop,
    coinMult: kit.coinMult * m.pinecone,
  };
}

/** Whether two modifier sets are the same, so a kit is rebuilt only when one changed. */
export function sameModifiers(a: Modifiers, b: Modifiers): boolean {
  return (
    a.exp === b.exp &&
    a.pinecone === b.pinecone &&
    a.damage === b.damage &&
    a.moveSpeed === b.moveSpeed &&
    a.regen === b.regen &&
    a.drop === b.drop &&
    a.hp === b.hp
  );
}

// ── Statuses and reactions ─────────────────────────────────────────────────

export interface StatusRule {
  readonly id: string;
  readonly onPlayer: boolean;
  readonly duration: number;
  readonly maxStacks: number;
  /** Damage per stack per second, as a multiple of the applying hit. */
  readonly dot: number;
  readonly slow: number;
  readonly damageTaken: number;
  readonly armorLoss: number;
  readonly shield: number;
}

export const ReactionKind = { Shield: 0, Burst: 1, Status: 2 } as const;
export type ReactionKind = (typeof ReactionKind)[keyof typeof ReactionKind];

export interface ReactionRule {
  readonly index: number;
  readonly a: number;
  readonly b: number;
  readonly kind: ReactionKind;
  readonly hpShare: number;
  readonly duration: number;
  readonly radius: number;
  readonly damage: number;
  readonly knock: number;
  readonly status: StatusPick | null;
}

// ── Monsters ────────────────────────────────────────────────────────────────

/** The eight archetypes, the Page 1 tortoise and the tutorial golem. */
export const Behavior = {
  Chaser: 0,
  Charger: 1,
  Ranged: 2,
  Splitter: 3,
  Shielded: 4,
  Bomber: 5,
  Healer: 6,
  Swarm: 7,
  Zeno: 8,
  Golem: 9,
  /** A boss body or one of its parts: no AI of its own, its damage goes to the boss's pool. */
  Boss: 10,
  /** A boss fight's objective (a stele, a block): stands still unless pushed, never credited. */
  Object: 11,
} as const;
export type Behavior = (typeof Behavior)[keyof typeof Behavior];

export interface MonsterKind {
  readonly index: number;
  readonly id: string;
  readonly sprite: string;
  readonly behavior: Behavior;
  readonly mass: number;
  readonly speed: number;
  readonly radius: number;
  /** Multipliers on `monsterHP`, `monsterDamage` (contact), `monsterEXP`, `monsterCoin`. */
  readonly hp: number;
  readonly damage: number;
  readonly exp: number;
  readonly coin: number;
  readonly armor: number;
  /** Bitmasks over status indices. */
  readonly innate: number;
  readonly immune: number;
  /** Auto-aim ignores it beyond this; Infinity when unset. */
  readonly autoAimRange: number;
  /** Auto-aim counts it this many times closer (치유형). */
  readonly aimPriority: number;
  /** May be promoted to an elite. */
  readonly promotable: boolean;
  /** Fixed rank and level for a boss; 0 for field monsters. */
  readonly rank: number;
  readonly level: number;

  // Behaviour numbers; unused ones are zero.
  readonly trigger: number;
  readonly windup: number;
  readonly chargeSpeed: number;
  readonly chargeDistance: number;
  readonly recover: number;
  readonly cooldown: number;
  /** Multiplies `monsterDamage` for the archetype's own attack (charge, shot, blast, slam). */
  readonly attackDamage: number;
  readonly keepMin: number;
  readonly keepMax: number;
  readonly interval: number;
  readonly projectileSpeed: number;
  readonly projectileRadius: number;
  readonly projectileRange: number;
  /** Kind index it splits into; -1 for none. */
  readonly splitInto: number;
  readonly splitCount: number;
  /** Half the shield's arc, radians. */
  readonly arc: number;
  readonly reduction: number;
  readonly turnRate: number;
  readonly rushRange: number;
  readonly rushSpeed: number;
  readonly armRange: number;
  readonly fuse: number;
  readonly blastRadius: number;
  readonly monsterShare: number;
  readonly healRange: number;
  readonly heal: number;
  readonly packMin: number;
  readonly packMax: number;
  readonly fleeSpeed: number;
  readonly halvings: number;
  readonly escapeAfter: number;
  readonly slamKnock: number;
  readonly enrageBelow: number;
  readonly enrageDelay: number;
  readonly enrageRadius: number;
  readonly summonEvery: number;
  readonly summonKind: number;
  readonly summonCount: number;
  readonly summonCap: number;
}

// ── Fields ──────────────────────────────────────────────────────────────────

export interface FieldRule {
  readonly id: string;
  readonly levels: { readonly min: number; readonly max: number };
  /** Levels of each region, entrance first (content `regionLevels`). */
  readonly regions: readonly { readonly min: number; readonly max: number }[];
  /** A spawn's level in a region; `roll` in [0, 1) (content `spawnLevel`). */
  levelAt(region: number, roll: number): number;
  /** The most alive at once in this field, whoever is present. */
  readonly populationMax: number;
  readonly roster: readonly {
    readonly kind: number;
    readonly weight: number;
    readonly from: number;
    readonly maxAlive: number;
  }[];
}

/** Content `FIELD_PACING` in ticks. */
export interface Pacing {
  readonly surge: number;
  readonly lull: number;
  readonly respawnDelay: number;
  readonly spawnMinDistance: number;
  readonly spawnMaxDistance: number;
  readonly regionLevels: number;
  readonly despawnDistance: number;
  readonly despawnAfter: number;
  population(players: number): number;
  /** Spawn events dropped around each player when a surge starts. */
  surgeOpening(players: number): number;
  /** Spawns per second the field may add. */
  refillCap(players: number, surge: boolean): number;
}

// ── Drops ───────────────────────────────────────────────────────────────────

/** What a pickup is, for the client's art. */
export const PickupKind = { Coin: 0, Page: 1, Ink: 2, Binding: 3, Tool: 4 } as const;
export type PickupKind = (typeof PickupKind)[keyof typeof PickupKind];

/** One rolled drop; `payload` is content's drop, handed back to the server on pickup. */
export interface SimDrop {
  readonly kind: PickupKind;
  readonly payload: unknown;
}

export interface DropContext {
  readonly field: string;
  /** The credited player's 전공: its books' 낱장 drop more often. */
  readonly major: string;
  readonly monster: MonsterKind;
  readonly level: number;
  readonly rank: number;
  readonly elite: boolean;
  readonly dropMult: number;
  readonly coinMult: number;
}

// ── Everything ──────────────────────────────────────────────────────────────

export interface SimRules {
  readonly monsters: readonly MonsterKind[];
  readonly statuses: readonly StatusRule[];
  /** Status indices the step treats specially. */
  readonly status: {
    readonly shield: number;
    readonly invulnerable: number;
    readonly infection: number;
  };
  readonly reactions: readonly ReactionRule[];
  /** `n × n` over status indices: the reaction index a pair makes, or -1. */
  readonly reactionTable: Int8Array;
  /** Book ids by index, for weapons and the wire. */
  readonly books: readonly string[];
  readonly proof: { readonly window: number; readonly qed: number };
  readonly elite: {
    readonly everyKills: number;
    readonly rank: number;
    readonly massMult: number;
    readonly speedMult: number;
    readonly armor: number;
    /** Drawn and collided at this scale. */
    readonly scale: number;
  };
  readonly pacing: Pacing;
  /** Ticks between two contact hits from one monster. */
  readonly contactInterval: number;
  readonly slowResist: { readonly elite: number; readonly boss: number };
  /** Damage bonus for playing by hand, by mode (auto, semi, skill, manual). */
  readonly modeBonus: readonly number[];
  readonly autoPlay: {
    readonly keepDistance: number;
    readonly retreatHp: number;
    readonly targetRange: number;
    readonly dodgeLead: number;
  };
  kit(build: PlayerBuild): PlayerKit;
  /** 운동량's walking bonus: ×(1 + share × strength × speed ÷ base). */
  momentumDamage(speed: number, baseSpeed: number, strength: number): number;
  /** Boss fights by id (`fight/boss.ts`); their kinds come after the golem in `monsters`. */
  readonly bosses: readonly BossRule[];
  qedDamage(triggerHit: number, strength: number): number;
  zenoDamage(remaining: number, maxHp: number, damage: number, halvings: number): number;
  rollDrops(random: Random, ctx: DropContext): SimDrop[];
}
