import { TOOL_MAX_LEVEL } from "@guago/shared";
import type { StatusId } from "./statuses.ts";

/**
 * The attack model: ten behaviours the simulation implements once, configured by data. Each is
 * one movement or hit-test routine on the server and one visual routine on the client. All
 * thirty launch books (PLAN §8) and their evolutions fit them:
 *
 * - orbit       bodies circle (or swing past) the owner   수학의 왕도, 역학 실험 키트, 면역 필기
 * - beam        an instant line that pierces all          함수 그래프 노트, 광학 노트
 * - projectile  straight, or lobbed on a fake height      수열 문제집, 확률과 통계, 홀리데이
 *               axis; may leave a pool                    일반물리, 줌인 일반화학, 주기율표
 *                                                         브로마이드, 산·염기 적정 노트, 유전
 *                                                         가계도 문제집, 암석 표본 상자
 * - chain       jumps between nearby targets              전자기 실습서
 * - cone        small hits in a fan                       유기화학 노트, 실험 보고서, 몰 계산
 *                                                         문제집, 해부 실습서
 * - summon      minions up to a cap, may divide           캠핑 생명과학
 * - telegraph   a marked area that strikes late           지구는 둥글다, 천체 관측 일지, 화산
 * - wave        a ring that pushes, then pulls            조석 예보표, 유클리드 원론
 * - zone        a lingering area, placed or following     중력 탐구, 생태계, 효소 반응, 일기도
 * - dash        the owner moves, dragging what it hits    좌표 평면, 운동량 문제집
 *
 * 증명 노트 has no shape: it tunes the 증명 스택 (`BookDef.signature`). Behaviour a shape cannot
 * express with numbers is one of the `Special` hooks below, each a single branch in the server.
 * Adding an eleventh kind costs a server routine, a client routine and a load-test pass, so a new
 * book reuses a kind with new numbers, statuses, a `followUp` or a special first.
 *
 * Units: seconds, pixels, degrees. `damage` multiplies the book's damage (`bookDamage`) per hit.
 * Knockback impulse is `knock` ÷ target mass in px/s and travels about a third of that in px.
 */

export interface StatusApply {
  readonly id: StatusId;
  readonly stacks: number;
  /** Chance per hit, 0 to 1. */
  readonly chance: number;
  /** Lands on the owner instead of the target (철 from 주기율표 브로마이드). */
  readonly self?: boolean;
}

/** The same shape strikes again after `delay`, with its own damage and status. */
export interface FollowUp {
  readonly delay: number;
  readonly damage: number;
  readonly status?: StatusApply;
}

/** A lingering area some attacks leave behind. */
export interface Trail {
  readonly radius: number;
  readonly duration: number;
  readonly tickInterval: number;
  readonly damage: number;
  readonly status?: StatusApply;
  /** Knock value toward the trail each tick. */
  readonly pull?: number;
  /** Degrees per second the trail turns (선형 변환's axes). */
  readonly spin?: number;
}

/**
 * Hooks for behaviour beyond numbers. Closed: each is one branch in the simulation.
 * - roll: each hit multiplies by a die from `min` to `max`; `rising` never rolls lower than the
 *   best roll so far against the same target.
 * - keepBurst: a burst sequence does not restart while the last volley hit something.
 * - trail: the attack leaves a `Trail` where it ends (a dash) or where it strikes.
 * - grow: each hit within `window` seconds of the last adds `perHit` range, up to `max`.
 * - block: orbit bodies destroy enemy projectiles they touch.
 * - healOnKill: kills by this attack heal the owner `share` of max HP.
 * - elastic: collisions caused by this attack count as full-strength 운동량 and chain twice as far.
 * - party: orbit bodies also circle every party member within 20 tiles.
 * - critOn: hits on a target carrying `stacks` or more of `status` always crit.
 * - spread: a target dying with `status` passes it to `count` neighbours within 64 px; `keep`
 *   passes the full stacks instead of one.
 * - specialize: a dividing minion becomes a killer (×2 damage) next to an elite or boss, a
 *   bursting cell next to a swarm, a healer next to its owner below half HP.
 * - fork: every chained target arcs to `count` new ones instead of one.
 * - merge: pools that touch merge into one with the larger remaining time.
 * - ricochet: after a hit the projectile flies on to `count` new targets, taking the next status
 *   of the cycle each time.
 * - neutralize: 중화 from this attack's statuses gives `hpShare` shield and heals `heal`.
 */
export type Special =
  | { readonly kind: "roll"; readonly min: number; readonly max: number; readonly rising: boolean }
  | { readonly kind: "keepBurst" }
  | { readonly kind: "trail"; readonly trail: Trail }
  | {
      readonly kind: "grow";
      readonly perHit: number;
      readonly max: number;
      readonly window: number;
    }
  | { readonly kind: "block" }
  | { readonly kind: "healOnKill"; readonly share: number }
  | { readonly kind: "elastic" }
  | { readonly kind: "party" }
  | { readonly kind: "critOn"; readonly status: StatusId; readonly stacks: number }
  | {
      readonly kind: "spread";
      readonly status: StatusId;
      readonly count: number;
      readonly keep: boolean;
    }
  | { readonly kind: "specialize" }
  | { readonly kind: "fork"; readonly count: number }
  | { readonly kind: "merge" }
  | { readonly kind: "ricochet"; readonly count: number }
  | { readonly kind: "neutralize"; readonly hpShare: number; readonly heal: number };

interface AttackCommon {
  /** Seconds from one cast to the next. */
  readonly cooldown: number;
  readonly damage: number;
  readonly knock: number;
  /** Applied on hit. A list takes one entry per cast, in `statusOrder`. */
  readonly status?: StatusApply | readonly StatusApply[];
  /** `cycle` in order, `random` from the server's generator, `choose` by the player (auto picks
   * the entry that completes a reaction on the target). */
  readonly statusOrder?: "cycle" | "random" | "choose";
  readonly followUp?: FollowUp;
  readonly specials?: readonly Special[];
}

export interface OrbitAttack extends AttackCommon {
  readonly kind: "orbit";
  readonly count: number;
  readonly orbitRadius: number;
  readonly bodyRadius: number;
  /** Seconds per revolution, or per full swing and back. */
  readonly period: number;
  /** Seconds the bodies stay out per cast; never longer than the cooldown. */
  readonly duration: number;
  /** A body hits the same target at most this often. */
  readonly hitInterval: number;
  /** Degrees of arc a pendulum swings through; absent for a full circle. */
  readonly sweep?: number;
  /** Degrees per second the swing plane turns. */
  readonly precession?: number;
}

export interface BeamAttack extends AttackCommon {
  readonly kind: "beam";
  readonly length: number;
  readonly width: number;
  /** Seconds the beam stays drawn; each target is hit once per cast. */
  readonly duration: number;
  /** Sideways swing of the path, 0 for a straight beam. */
  readonly amplitude: number;
  readonly wavelength: number;
  /** Bounces off walls. */
  readonly reflect: number;
  /** Beams per cast, fanned over `spread` degrees. */
  readonly count?: number;
  readonly spread?: number;
}

export interface ProjectileAttack extends AttackCommon {
  readonly kind: "projectile";
  readonly count: number;
  /** Fan between shots of one cast, in degrees. */
  readonly spread: number;
  /** Ground speed in px/s. */
  readonly speed: number;
  /**
   * px/s² on the fake height axis. 0 flies straight and hits along the way. Above 0 the shot is
   * lobbed to land on the aim point, passes over everything and hits only where it lands.
   */
  readonly gravity: number;
  readonly range: number;
  /** Collider of a straight shot. */
  readonly radius: number;
  /** Area hit where a lobbed shot lands. */
  readonly impactRadius: number;
  /** Extra targets a straight shot passes through. */
  readonly pierce: number;
  /** Wall bounces. */
  readonly bounce: number;
  /** Shots per volley across consecutive casts; the list repeats. Absent for `count` every cast. */
  readonly burst?: readonly number[];
  /** A lingering pool where the shot lands. */
  readonly poolRadius?: number;
  readonly poolDuration?: number;
  readonly poolTickInterval?: number;
  readonly poolDamage?: number;
  readonly poolStatus?: StatusApply;
}

export interface ChainAttack extends AttackCommon {
  readonly kind: "chain";
  /** Reach to the first target. */
  readonly range: number;
  /** Jumps after the first hit, never to a target already struck this cast. */
  readonly jumps: number;
  readonly jumpRange: number;
  /** Damage kept on each jump. */
  readonly falloff: number;
}

export interface ConeAttack extends AttackCommon {
  readonly kind: "cone";
  readonly angle: number;
  readonly range: number;
  /** Hits per cast, spread over `duration`. */
  readonly hits: number;
  readonly duration: number;
}

export interface SummonAttack extends AttackCommon {
  readonly kind: "summon";
  readonly perCast: number;
  readonly cap: number;
  readonly speed: number;
  readonly radius: number;
  readonly lifetime: number;
  /** A minion hits the same target at most this often; `damage` is per contact. */
  readonly hitInterval: number;
  /** Seconds until a minion divides in two while under the cap; 0 never divides. */
  readonly divideEvery: number;
}

export interface TelegraphAttack extends AttackCommon {
  readonly kind: "telegraph";
  readonly shape: "circle" | "line";
  readonly count: number;
  /** Distance from the owner to the mark. */
  readonly range: number;
  /** Seconds the mark shows before it strikes. */
  readonly delay: number;
  readonly radius: number;
  readonly length: number;
  readonly width: number;
  /** Extra strikes on the same mark, `repeatInterval` apart. */
  readonly repeat: number;
  readonly repeatInterval: number;
  /** Marks land at random within this many px of the aim point. */
  readonly scatter?: number;
}

export interface WaveAttack extends AttackCommon {
  readonly kind: "wave";
  readonly radius: number;
  /** Ring growth in px/s. */
  readonly speed: number;
  readonly width: number;
  /** Seconds at full size before it pulls back. */
  readonly hold: number;
  /** Knock value pulling inward on the way back; 0 never comes back. */
  readonly pull: number;
  /** Rings per cast, one after another. */
  readonly count?: number;
}

export interface ZoneAttack extends AttackCommon {
  readonly kind: "zone";
  readonly range: number;
  readonly radius: number;
  readonly duration: number;
  readonly tickInterval: number;
  /** Rides on the owner instead of staying where it was placed. */
  readonly follow: boolean;
  /** Knock value toward the centre each tick; negative pushes out. */
  readonly pull: number;
  /** px per second the radius grows while it lasts. */
  readonly growth?: number;
  /** Who it touches. An ally zone deals no damage and grants `buff`. */
  readonly affects?: "enemies" | "allies";
  readonly buff?: { readonly attackSpeed: number; readonly cooldown: number };
}

export interface DashAttack extends AttackCommon {
  readonly kind: "dash";
  readonly distance: number;
  /** 0 is a blink. */
  readonly duration: number;
  readonly width: number;
  /** Targets hit ride along to the end of the dash. */
  readonly carry: boolean;
}

export type Attack =
  | OrbitAttack
  | BeamAttack
  | ProjectileAttack
  | ChainAttack
  | ConeAttack
  | SummonAttack
  | TelegraphAttack
  | WaveAttack
  | ZoneAttack
  | DashAttack;

export type AttackKind = Attack["kind"];

type NumericKeys<A> = { [K in keyof A]-?: A[K] extends number | undefined ? K : never }[keyof A];

/** Book level milestones: at `at`, add these to the attack's numbers. */
export interface LevelStep<A extends Attack> {
  readonly at: number;
  readonly add: Partial<Record<Exclude<NumericKeys<A>, "kind">, number>>;
}

// ── Tools ───────────────────────────────────────────────────────────────────

/**
 * What a tool's passive touches. Tools are global passives (PLAN §8): a tool helps every
 * equipped book with the matching number, or only the kinds in `ToolDef.kinds`. Its linked
 * book is the one it evolves. Player stats (`critChance`, `critDamage`, `moveSpeed`, `luck`)
 * come from `toolPassives` instead.
 */
export type ToolStat =
  | "area"
  | "range"
  | "knock"
  | "chain"
  | "cooldown"
  | "attackSpeed"
  | "pierce"
  | "hits"
  | "pull"
  | "minionCap"
  | "telegraphSpeed"
  | "impact"
  | "statusDuration"
  | "burn"
  | "bleed"
  | "shield"
  | "spread"
  | "aura"
  | "healing"
  | "forecast"
  | "critChance"
  | "critDamage"
  | "moveSpeed"
  | "luck";

export interface ToolDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly stat: ToolStat;
  /** Effect per tool level, 1 to 5: a share for multipliers, a count for counted stats. */
  readonly perLevel: number;
  /** Kinds the passive reaches; absent for every kind. */
  readonly kinds?: readonly AttackKind[];
  readonly icon: string;
}

const AREA_KEYS = [
  "radius",
  "width",
  "orbitRadius",
  "bodyRadius",
  "impactRadius",
  "poolRadius",
  "angle",
];
const RANGE_KEYS = ["range", "length", "jumpRange", "distance"];
const DURATION_KEYS = ["duration", "poolDuration", "lifetime"];
const TEMPO_KEYS = ["period", "hitInterval", "tickInterval", "poolTickInterval"];
const COUNTED: readonly ToolStat[] = ["chain", "pierce", "hits", "minionCap", "spread"];

/** Multipliers an attack's tools put on effects that are not attack numbers. */
export type AttackMod =
  | "statusDuration"
  | "burn"
  | "bleed"
  | "shield"
  | "spread"
  | "aura"
  | "healing"
  | "forecast";

export interface AttackContext {
  readonly bookLevel: number;
  /** Every equipped tool and its level. */
  readonly tools: readonly { readonly def: ToolDef; readonly level: number }[];
  /** From 암기력 (`statEffects`). */
  readonly cooldownMult: number;
  readonly durationMult: number;
}

export interface ResolvedAttack<A extends Attack> {
  readonly attack: A;
  /** A telegraph's delay before 지진계 shortened it; 예보 sizes the strike from this. */
  readonly baseDelay: number;
  /** Multipliers, or added counts for `spread`, from tools; 1 (or 0 for `spread`) when absent. */
  readonly mods: Readonly<Record<AttackMod, number>>;
}

/** The numbers an attack has at a book level with the owner's tools and stats. */
export function resolveAttack<A extends Attack>(
  base: A,
  levels: readonly LevelStep<A>[],
  ctx: AttackContext,
): ResolvedAttack<A> {
  const a: Record<string, unknown> = { ...base };
  const num = (key: string) => (typeof a[key] === "number" ? (a[key] as number) : undefined);
  const scale = (keys: readonly string[], mult: number) => {
    for (const key of keys) {
      const v = num(key);
      if (v !== undefined) a[key] = v * mult;
    }
  };

  for (const step of levels) {
    if (step.at > ctx.bookLevel) continue;
    for (const [key, add] of Object.entries(step.add) as [string, number][]) {
      a[key] = (num(key) ?? 0) + add;
    }
  }

  const mods: Record<AttackMod, number> = {
    statusDuration: ctx.durationMult,
    burn: 1,
    bleed: 1,
    shield: 1,
    spread: 0,
    aura: 1,
    healing: 1,
    forecast: 1,
  };
  const baseDelay = num("delay") ?? 0;
  const kind = a.kind as AttackKind;
  for (const { def, level } of ctx.tools) {
    if (def.kinds && !def.kinds.includes(kind)) continue;
    const lv = Math.min(TOOL_MAX_LEVEL, Math.max(0, level));
    const mult = 1 + def.perLevel * lv;
    const add = COUNTED.includes(def.stat) ? def.perLevel * lv : 0;
    switch (def.stat) {
      case "area":
        scale(AREA_KEYS, mult);
        break;
      case "range":
        scale(RANGE_KEYS, mult);
        break;
      case "knock":
        scale(["knock"], mult);
        break;
      case "cooldown":
        scale(["cooldown"], 1 / mult);
        break;
      case "attackSpeed":
        scale(TEMPO_KEYS, 1 / mult);
        break;
      case "chain":
        if (kind === "chain") a.jumps = (num("jumps") ?? 0) + add;
        break;
      case "pierce":
        if (kind === "projectile") a.pierce = (num("pierce") ?? 0) + add;
        if (kind === "beam") a.reflect = (num("reflect") ?? 0) + add;
        break;
      case "hits":
        if (kind === "cone") a.hits = (num("hits") ?? 0) + add;
        break;
      case "pull":
        if ((num("pull") ?? 0) > 0) scale(["pull", "radius"], mult);
        break;
      case "minionCap":
        if (kind === "summon") a.cap = (num("cap") ?? 0) + add;
        break;
      case "telegraphSpeed":
        if (kind === "telegraph") a.delay = baseDelay * Math.max(0.5, 1 - def.perLevel * lv);
        break;
      case "impact":
        if (kind === "projectile" || kind === "telegraph") scale(["damage"], mult);
        break;
      case "statusDuration":
        mods.statusDuration *= mult;
        break;
      case "spread":
        mods.spread += add;
        break;
      case "burn":
      case "bleed":
      case "shield":
      case "aura":
      case "healing":
      case "forecast":
        mods[def.stat] *= mult;
        break;
      case "critChance":
      case "critDamage":
      case "moveSpeed":
      case "luck":
        break;
    }
  }

  scale(["cooldown"], ctx.cooldownMult);
  scale(DURATION_KEYS, ctx.durationMult);
  if (kind === "orbit") a.duration = Math.min(num("duration") ?? 0, num("cooldown") ?? 0);
  if (kind === "cone") a.angle = Math.min(360, num("angle") ?? 0);
  return { attack: a as unknown as A, baseDelay, mods };
}

/** Player-stat passives of the equipped tools: shares added to crit chance and so on. */
export function toolPassives(
  tools: AttackContext["tools"],
): Readonly<Record<"critChance" | "critDamage" | "moveSpeed" | "luck", number>> {
  const out = { critChance: 0, critDamage: 0, moveSpeed: 0, luck: 0 };
  for (const { def, level } of tools) {
    if (def.stat in out)
      out[def.stat as keyof typeof out] +=
        def.perLevel * Math.min(TOOL_MAX_LEVEL, Math.max(0, level));
  }
  return out;
}
