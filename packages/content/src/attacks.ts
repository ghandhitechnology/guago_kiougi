import type { StatusId } from "./statuses.ts";

/**
 * The attack model: ten behaviours the simulation implements once, configured by data. Each is
 * one movement or hit-test routine on the server and one visual routine on the client. Every
 * launch book in PLAN §8 fits one of them:
 *
 * - orbit       bodies circle the owner           수학의 왕도, 역학 실험 키트 (pendulum), 면역 필기
 * - beam        an instant line that pierces all  함수 그래프 노트, 광학 노트 (reflect)
 * - projectile  straight, or arcing on a fake     홀리데이 일반물리, 줌인 일반화학 (pool), 암석 표본
 *               height axis with gravity          상자, 수열 문제집 (burst), 확률과 통계, 주기율표
 * - chain       jumps between nearby targets      전자기 실습서, 유전 가계도 문제집
 * - cone        many small hits in a fan          해부 실습서, 실험 보고서, 몰 계산 문제집, 유기화학
 * - summon      minions up to a cap, may divide   캠핑 생명과학
 * - telegraph   a marked area that strikes late   지구는 둥글다, 천체 관측 일지, 화산 탐구 보고서
 * - wave        a ring that pushes, then pulls    조석 예보표
 * - zone        a lingering area, maybe following 생태계 보고서, 중력 탐구, 일기도, 효소 반응 노트
 * - dash        the owner moves and drags targets 운동량 문제집, 좌표 평면 (blink)
 *
 * 증명 노트 has no shape: it tunes the 증명 스택 and is handled by the class rules. Adding an eleventh
 * kind costs a server routine, a client routine and a load-test pass, so a new book reuses one of
 * these with new numbers, statuses and a `followUp` before a new kind is considered.
 *
 * Units: seconds, pixels, degrees. `damage` multiplies the book's damage (`bookDamage`) per hit.
 * Knockback impulse is `knock` ÷ target mass in px/s and travels about a third of that in px.
 */

export interface StatusApply {
  readonly id: StatusId;
  readonly stacks: number;
  /** Chance per hit, 0 to 1. */
  readonly chance: number;
}

/** The same shape strikes again after `delay`, with its own damage and status. */
export interface FollowUp {
  readonly delay: number;
  readonly damage: number;
  readonly status?: StatusApply;
}

interface AttackCommon {
  /** Seconds from one cast to the next. */
  readonly cooldown: number;
  readonly damage: number;
  readonly knock: number;
  /** Applied on hit. A list cycles one entry per cast. */
  readonly status?: StatusApply | readonly StatusApply[];
  readonly followUp?: FollowUp;
}

export interface OrbitAttack extends AttackCommon {
  readonly kind: "orbit";
  readonly count: number;
  readonly orbitRadius: number;
  readonly bodyRadius: number;
  /** Seconds per revolution. */
  readonly period: number;
  /** Seconds the bodies stay out per cast; never longer than the cooldown. */
  readonly duration: number;
  /** A body hits the same target at most this often. */
  readonly hitInterval: number;
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
  /** Shots per volley across consecutive casts; the list repeats. Empty for `count` every cast. */
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
}

export interface WaveAttack extends AttackCommon {
  readonly kind: "wave";
  readonly radius: number;
  /** Ring growth in px/s. */
  readonly speed: number;
  readonly width: number;
  /** Seconds at full size before it pulls back. */
  readonly hold: number;
  /** Knock value pulling inward on the way back. */
  readonly pull: number;
}

export interface ZoneAttack extends AttackCommon {
  readonly kind: "zone";
  readonly range: number;
  readonly radius: number;
  readonly duration: number;
  readonly tickInterval: number;
  /** Rides on the owner instead of staying where it was placed. */
  readonly follow: boolean;
  /** Knock value toward the centre each tick. */
  readonly pull: number;
}

export interface DashAttack extends AttackCommon {
  readonly kind: "dash";
  readonly distance: number;
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
 * What a tool's passive touches. Tools are global passives (PLAN §8), so a tool helps every
 * equipped book with the matching number; its linked book is the one it evolves.
 */
export type ToolStat =
  | "area"
  | "range"
  | "knock"
  | "chain"
  | "statusDuration"
  | "burn"
  | "bleed"
  | "minionCap"
  | "telegraphSpeed"
  | "impact";

export interface ToolDef {
  readonly id: string;
  readonly name: string;
  readonly stat: ToolStat;
  /** Effect per tool level, 1 to 5: a share for multipliers, a count for `chain` and `minionCap`. */
  readonly perLevel: number;
  readonly description: string;
  readonly icon: string;
}

export const TOOL_MAX_LEVEL = 5;

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
  /** Multiplies the duration of every status this attack applies. */
  readonly statusDuration: number;
  /** Multiplies the damage over time of these statuses when this attack applied them. */
  readonly dot: Partial<Record<StatusId, number>>;
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

  let statusDuration = ctx.durationMult;
  const dot: Partial<Record<StatusId, number>> = {};
  const baseDelay = num("delay") ?? 0;
  for (const { def, level } of ctx.tools) {
    const lv = Math.min(TOOL_MAX_LEVEL, Math.max(0, level));
    const mult = 1 + def.perLevel * lv;
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
      case "chain":
        if (a.kind === "chain") a.jumps = (num("jumps") ?? 0) + def.perLevel * lv;
        break;
      case "minionCap":
        if (a.kind === "summon") a.cap = (num("cap") ?? 0) + def.perLevel * lv;
        break;
      case "telegraphSpeed":
        if (a.kind === "telegraph") a.delay = baseDelay * Math.max(0.5, 1 - def.perLevel * lv);
        break;
      case "impact":
        if (a.kind === "projectile" || a.kind === "telegraph") scale(["damage"], mult);
        break;
      case "statusDuration":
        statusDuration *= mult;
        break;
      case "burn":
        dot.burn = (dot.burn ?? 1) * mult;
        break;
      case "bleed":
        dot.bleed = (dot.bleed ?? 1) * mult;
        break;
    }
  }

  scale(["cooldown"], ctx.cooldownMult);
  scale(DURATION_KEYS, ctx.durationMult);
  if (a.kind === "orbit") a.duration = Math.min(num("duration") ?? 0, num("cooldown") ?? 0);
  if (a.kind === "cone") a.angle = Math.min(360, num("angle") ?? 0);
  return { attack: a as unknown as A, baseDelay, statusDuration, dot };
}
