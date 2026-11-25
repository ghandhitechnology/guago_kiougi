/**
 * A duel is a closed bracket around a character's real state (PLAN §14, nothing lost and nothing
 * gained): what a character is the instant before its match is what it is the instant after,
 * however the match ends. `takeBefore` reads it once, in the room the character stood in when the
 * match was made; `applyBefore` puts it back once, at whichever exit the character takes. The
 * kit, level, mode and party are the room's to rebuild (`MapRoom.restoreFromDuel`); these are the
 * numbers on the body.
 */
import type { Facing, Mode, Player } from "@guago/shared";

export interface Before {
  /** Where it stood: map, the channel's room, the spot and the way it faced. */
  readonly map: string;
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly level: number;
  readonly mode: Mode;
  /** Health as a share of its own kit. */
  readonly hpShare: number;
  readonly shield: number;
  /** Ticks left on the shield, each book slot, the dodge and an ally zone's buffs. */
  readonly shieldLeft: number;
  readonly ready: readonly number[];
  readonly dodgeLeft: number;
  readonly attackSpeed: number;
  readonly cooldownBuff: number;
  readonly buffLeft: number;
}

/** The body's state now, at `tick` of its room, standing at `place`. */
export function takeBefore(
  p: Player,
  tick: number,
  place: { readonly map: string; readonly roomId: string },
): Before {
  return {
    map: place.map,
    roomId: place.roomId,
    x: p.x,
    y: p.y,
    facing: p.facing,
    level: p.level,
    mode: p.mode,
    hpShare: p.down ? 1 : Math.min(1, Math.max(0, p.hp / p.kit.maxHp)),
    shield: p.shield,
    shieldLeft: Math.max(0, p.shieldUntil - tick),
    ready: Array.from(p.ready.subarray(0, p.kit.weapons.length), (v) => Math.max(0, v)),
    dodgeLeft: Math.max(0, p.dodgeReadyAt - tick),
    attackSpeed: p.attackSpeed,
    cooldownBuff: p.cooldownBuff,
    buffLeft: Math.max(0, p.buffUntil - tick),
  };
}

/**
 * The numbers back on a body already wearing its own kit, at `tick` of the room it is in now.
 * Everything a match put on it goes: knock-out, statuses, imposed movement, the freeze.
 */
export function applyBefore(p: Player, b: Before, tick: number): void {
  p.downAt = -1;
  p.reviver = -1;
  p.hp = Math.max(1, Math.min(p.kit.maxHp, b.hpShare * p.kit.maxHp));
  p.shield = b.shieldLeft > 0 ? b.shield : 0;
  p.shieldUntil = b.shieldLeft > 0 ? tick + b.shieldLeft : 0;
  p.ready.fill(0);
  for (let i = 0; i < b.ready.length && i < p.ready.length; i++) p.ready[i] = b.ready[i] as number;
  p.dodgeReadyAt = tick + b.dodgeLeft;
  p.attackSpeed = b.buffLeft > 0 ? b.attackSpeed : 0;
  p.cooldownBuff = b.buffLeft > 0 ? b.cooldownBuff : 0;
  p.buffUntil = b.buffLeft > 0 ? tick + b.buffLeft : 0;
  p.rollLeft = 0;
  p.forceX = 0;
  p.forceY = 0;
  p.forceTicks = 0;
  p.forceKeep = false;
  p.casts = 0;
  p.team = 0;
  p.statusMask = 0;
  p.slow = 0;
  p.flash = false;
  p.frozen = false;
}

/** The fields a match must leave as it found them, for comparing a before with an after. */
export function bracketView(b: Before): Omit<Before, "roomId" | "facing"> {
  const { roomId: _r, facing: _f, ...rest } = b;
  return rest;
}
