import { TICK_MS, TICK_RATE_HZ, TILE_SIZE } from "./constants.ts";

/** Seconds to whole simulation ticks, never below one. */
export function ticks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE_HZ));
}

// ── Control modes (PLAN §6) ─────────────────────────────────────────────────

export const CONTROL_MODES = ["auto", "semi", "skill", "manual"] as const;
export type ControlMode = (typeof CONTROL_MODES)[number];

/** Damage multiplier for playing by hand: +10% in 스킬 수동, +20% in 완전 수동. */
export const MODE_BONUS: Readonly<Record<ControlMode, number>> = {
  auto: 1,
  semi: 1,
  skill: 1.1,
  manual: 1.2,
};

// ── Critical hits ───────────────────────────────────────────────────────────

/** `roll` comes from the server's seeded generator, in [0, 1). */
export function rollCrit(roll: number, chance: number): boolean {
  return roll < chance;
}

export function critMultiplier(crit: boolean, critMult: number): number {
  return crit ? critMult : 1;
}

// ── Dodge roll (PLAN §6) ────────────────────────────────────────────────────

export const DODGE = {
  invulnerableSeconds: 0.25,
  cooldownSeconds: 3,
  /** The roll covers two and a half tiles inside its invulnerable window. */
  distance: 40,
} as const;

/** True while a roll that started at `startTick` still makes the player untouchable. */
export function dodgeInvulnerable(startTick: number, nowTick: number): boolean {
  return nowTick >= startTick && nowTick < startTick + ticks(DODGE.invulnerableSeconds);
}

export function dodgeReady(lastTick: number, nowTick: number, cooldownSeconds: number): boolean {
  return nowTick - lastTick >= ticks(cooldownSeconds);
}

// ── Knockback and collisions (PLAN §6 "Physics") ────────────────────────────

/** Knockback speed decays 15% per tick and stops below 2 px/s. */
export const KNOCK_DECAY = 0.15;
export const KNOCK_STOP_SPEED = 2;

/** Knockback impulse in px/s: attack knock value ÷ monster mass. */
export function knockbackSpeed(knock: number, mass: number): number {
  return knock / mass;
}

export function decayKnockback(speed: number): number {
  const next = speed * (1 - KNOCK_DECAY);
  return next < KNOCK_STOP_SPEED ? 0 : next;
}

/** Distance a knock travels when it moves first and decays after, each tick: v·dt / 0.15. */
export function knockbackDistance(speed: number): number {
  return (speed * TICK_MS) / 1000 / KNOCK_DECAY;
}

/** Slower than this, a knocked monster only nudges. */
export const COLLISION_MIN_SPEED = 30;
/** A collision passes momentum on; chains stop after this many links to bound server work. */
export const COLLISION_CHAIN_MAX = 3;

/**
 * A knocked monster that runs into another passes its momentum on. With 물리's 운동량 the impact
 * also hurts both: a share of the hit that launched it (`momentumCollisionShare` in content),
 * scaled by how much launch speed is left.
 */
export function collisionDamage(
  launchHit: number,
  impactSpeed: number,
  launchSpeed: number,
  share: number,
): number {
  if (impactSpeed < COLLISION_MIN_SPEED || launchSpeed <= 0) return 0;
  return launchHit * share * Math.min(1, impactSpeed / launchSpeed);
}

/** 1D elastic collision along the contact normal; B starts at rest. Returns the new speeds. */
export function elasticCollision(
  speed: number,
  massA: number,
  massB: number,
): { a: number; b: number } {
  const total = massA + massB;
  return { a: ((massA - massB) / total) * speed, b: ((2 * massA) / total) * speed };
}

// ── Armour ──────────────────────────────────────────────────────────────────

/** Armour is a share of damage removed. Q.E.D. ignores it; 방어 감소 lowers it. */
export function mitigate(damage: number, armor: number, ignoreArmor = false): number {
  return ignoreArmor ? damage : damage * (1 - Math.min(0.9, Math.max(0, armor)));
}

/** True when a hit from `fromAngle` lands inside a shield of `arcDegrees` centred on `facing`. */
export function insideArc(facing: number, fromAngle: number, arcDegrees: number): boolean {
  let d = Math.abs(fromAngle - facing) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d <= (arcDegrees * Math.PI) / 360;
}

// ── Kill credit: tagging and parties (PLAN §6) ──────────────────────────────

/** A player or party that dealt at least this share of a monster's health earns the kill. */
export const TAG_SHARE = 0.05;
export const PARTY_MAX = 4;
export const PARTY_RANGE = 20 * TILE_SIZE;
export const PARTY_EXP_PER_MEMBER = 0.1;

export function partyExpMultiplier(membersInRange: number): number {
  return 1 + PARTY_EXP_PER_MEMBER * (Math.min(PARTY_MAX, Math.max(1, membersInRange)) - 1);
}

export interface Contribution {
  readonly playerId: string;
  readonly partyId?: string | undefined;
  readonly damage: number;
}

export interface Bystander {
  readonly playerId: string;
  readonly partyId: string;
}

export interface KillCredit {
  readonly playerId: string;
  /** Multiplies the monster's EXP for this player. Each credited player also gets a loot roll. */
  readonly expMult: number;
}

/**
 * Who earns a kill. A party pools its damage for the 5% tag and every member within 20 tiles
 * shares it: full EXP each, +10% per extra member, and their own loot roll. If nobody reached
 * 5% (a crowd of twenty), the biggest contributor earns it.
 */
export function killCredits(
  maxHp: number,
  contributions: readonly Contribution[],
  partyInRange: readonly Bystander[] = [],
): KillCredit[] {
  const units = new Map<string, { damage: number; players: Set<string>; party: boolean }>();
  for (const c of contributions) {
    const key = c.partyId ? `p:${c.partyId}` : `s:${c.playerId}`;
    const unit = units.get(key) ?? { damage: 0, players: new Set(), party: !!c.partyId };
    unit.damage += c.damage;
    unit.players.add(c.playerId);
    units.set(key, unit);
  }
  for (const b of partyInRange) units.get(`p:${b.partyId}`)?.players.add(b.playerId);

  let tagged = [...units.values()].filter((u) => u.damage >= TAG_SHARE * maxHp);
  if (tagged.length === 0 && units.size > 0) {
    const best = [...units.values()].reduce((a, b) => (b.damage > a.damage ? b : a));
    tagged = [best];
  }
  const credits = new Map<string, number>();
  for (const unit of tagged) {
    const mult = unit.party ? partyExpMultiplier(unit.players.size) : 1;
    for (const id of unit.players) credits.set(id, Math.max(credits.get(id) ?? 0, mult));
  }
  return [...credits].map(([playerId, expMult]) => ({ playerId, expMult }));
}

// ── 기절 and revive (PLAN §6, §11) ──────────────────────────────────────────

export const KNOCKOUT = {
  /** Another player can revive within this window, else the player wakes in the 보건실. */
  reviveWindowSeconds: 10,
  /** Holding interact this long within range revives. */
  reviveChannelSeconds: 2,
  reviveRange: 24,
  reviveHpShare: 0.3,
  /** Untouchable after standing up, so a horde cannot knock them straight back down. */
  reviveInvulnerableSeconds: 2,
  demeritsOnWake: 1,
  meritsForReviver: 1,
} as const;

export type KnockoutState = "down" | "wake";

/** A downed player can still be revived, or must now wake in the 보건실. */
export function knockoutState(downTick: number, nowTick: number): KnockoutState {
  return nowTick - downTick < ticks(KNOCKOUT.reviveWindowSeconds) ? "down" : "wake";
}
