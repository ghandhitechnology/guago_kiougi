import { MAJORS, type Major } from "@guago/shared";
import type { StatusApply } from "./attacks.ts";
import type { TextKey } from "./narrative/schema.ts";
import { termKey } from "./narrative/study.ts";
import type { StatusId } from "./statuses.ts";

/** The five majors. One list for the whole project: `MAJORS` in `@guago/shared`. */
export const CLASS_IDS = MAJORS;
export type ClassId = Major;

export const CLASS_NAMES: Readonly<Record<ClassId, TextKey>> = Object.fromEntries(
  CLASS_IDS.map((id) => [id, termKey("class", id)]),
) as Record<ClassId, TextKey>;

/** A 부전공 runs its class mechanic at half strength (PLAN §7). */
export const MINOR_STRENGTH = 0.5;

/** 1 for the 전공, 0.5 for the 부전공, 0 otherwise. Scales every signature number below. */
export function signatureStrength(cls: ClassId, major: ClassId, minor?: ClassId): number {
  if (cls === major) return 1;
  return cls === minor ? MINOR_STRENGTH : 0;
}

// ── 수학: 증명 스택 and Q.E.D. ───────────────────────────────────────────────

/**
 * Every hit a 수학 player lands adds one 증명 stack on that target, counted per player. A gap of
 * `window` seconds without a hit clears them. The hit that reaches `maxStacks` also fires Q.E.D.:
 * a burst on the same target worth `qed` × that hit, ignoring armour, and the stacks restart.
 * Ten hits for a fivefold burst is +50% single-target damage for a full stacker.
 */
export const PROOF = { maxStacks: 10, window: 2, qed: 5 } as const;

/** The stack counter over a target (frames `n1` to `n10`) and the burst. */
export const PROOF_CUES = {
  counter: "fx-proof",
  burst: "fx-qed",
  sound: "sfx.signature.qed",
} as const;

/** Stacks after one more hit, and whether that hit proves it. */
export function proofHit(stacks: number): { stacks: number; qed: boolean } {
  const next = stacks + 1;
  return next >= PROOF.maxStacks ? { stacks: 0, qed: true } : { stacks: next, qed: false };
}

export function qedDamage(triggerHit: number, strength: number): number {
  return triggerHit * PROOF.qed * strength;
}

// ── 물리: 운동량 ─────────────────────────────────────────────────────────────

/**
 * Knockback collisions deal `collisionShare` of the launching hit (other classes only push), and
 * moving adds damage: `speedDamage` × current speed ÷ base walking speed. Standing still adds
 * nothing; walking adds 30%; a fast build with 순발력 adds up to 45%.
 */
export const MOMENTUM = { collisionShare: 0.6, speedDamage: 0.3 } as const;

export function momentumCollisionShare(strength: number): number {
  return MOMENTUM.collisionShare * strength;
}

export function momentumDamage(speed: number, baseSpeed: number, strength: number): number {
  return 1 + MOMENTUM.speedDamage * strength * Math.max(0, speed / baseSpeed);
}

// ── 화학: 반응 표 ────────────────────────────────────────────────────────────

export type ReactionEffect =
  | { readonly kind: "shield"; readonly hpShare: number; readonly duration: number }
  | {
      readonly kind: "burst";
      readonly radius: number;
      readonly damage: number;
      readonly knock: number;
      readonly status?: StatusApply;
    }
  | { readonly kind: "status"; readonly status: StatusApply };

export interface Reaction {
  readonly id: string;
  readonly name: TextKey;
  readonly from: readonly [StatusId, StatusId];
  /** `damage` multiplies the hit that completed the pair; `hpShare` the reactor's max HP. */
  readonly effect: ReactionEffect;
  readonly cue: { readonly vfx: string; readonly sfx: string };
}

/**
 * When a 화학 player's hit puts the second half of a pair on a target, the pair reacts: both
 * statuses are consumed (innate ones stay) and the effect fires for that player, scaled by their
 * signature strength. Other classes' statuses sit side by side and never react.
 */
export const REACTIONS: readonly Reaction[] = [
  {
    id: "neutralize",
    name: termKey("reaction", "neutralize"),
    from: ["acid", "base"],
    effect: { kind: "shield", hpShare: 0.1, duration: 5 },
    cue: { vfx: "fx-neutralize", sfx: "sfx.reaction.neutralize" },
  },
  {
    id: "combustion",
    name: termKey("reaction", "combustion"),
    from: ["flammable", "burn"],
    effect: {
      kind: "burst",
      radius: 32,
      damage: 1.5,
      knock: 40,
      status: { id: "burn", stacks: 1, chance: 1 },
    },
    cue: { vfx: "fx-combust", sfx: "sfx.reaction.combustion" },
  },
  {
    id: "corrosion",
    name: termKey("reaction", "corrosion"),
    from: ["metal", "acid"],
    effect: { kind: "status", status: { id: "armorBreak", stacks: 3, chance: 1 } },
    cue: { vfx: "fx-corrosion", sfx: "sfx.reaction.corrosion" },
  },
  {
    id: "explosion",
    name: termKey("reaction", "explosion"),
    from: ["wet", "sodium"],
    effect: { kind: "burst", radius: 40, damage: 3, knock: 200 },
    cue: { vfx: "fx-explosion", sfx: "sfx.reaction.explosion" },
  },
];

/** The reaction a newly applied status completes with what the target already carries. */
export function findReaction(
  carried: readonly StatusId[],
  applied: StatusId,
): Reaction | undefined {
  return REACTIONS.find(
    ({ from: [a, b] }) =>
      (applied === a && carried.includes(b)) || (applied === b && carried.includes(a)),
  );
}

// ── 생명: 증식 ───────────────────────────────────────────────────────────────

/**
 * Minions divide (the book sets how fast) and a 생명 player's cap grows by `minionCap`. A target
 * that dies with 감염 passes it to the `spread` nearest monsters within `spreadRange`. Every kill
 * by the player or their minions heals `healOnKill` of max HP.
 */
export const PROLIFERATION = {
  minionCap: 2,
  infectOnHit: { id: "infection", stacks: 1, chance: 0.2 } satisfies StatusApply,
  spread: 2,
  spreadRange: 48,
  healOnKill: 0.005,
} as const;

/** Whole counts round down at half strength: a 부전공 spreads to one neighbour, +1 minion. */
export function proliferation(strength: number): {
  minionCap: number;
  spread: number;
  healOnKill: number;
  infectChance: number;
} {
  return {
    minionCap: Math.floor(PROLIFERATION.minionCap * strength),
    spread: Math.floor(PROLIFERATION.spread * strength),
    healOnKill: PROLIFERATION.healOnKill * strength,
    infectChance: PROLIFERATION.infectOnHit.chance * strength,
  };
}

// ── 지구과학: 예보 ───────────────────────────────────────────────────────────

/**
 * Delayed strikes grow with their telegraph: +40% damage and +15% area per second of delay. The
 * delay counted is the book's own, before 지진계 shortens it, so a faster telegraph loses nothing.
 */
export const FORECAST = { damagePerSecond: 0.4, areaPerSecond: 0.15 } as const;

export function forecast(baseDelay: number, strength: number): { damage: number; area: number } {
  return {
    damage: 1 + FORECAST.damagePerSecond * baseDelay * strength,
    area: 1 + FORECAST.areaPerSecond * baseDelay * strength,
  };
}
