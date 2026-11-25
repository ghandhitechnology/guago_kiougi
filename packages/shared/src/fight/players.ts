import { KNOCKOUT, ticks } from "../combat.ts";
import type { MoveInput } from "../movement.ts";
import { slide, snap } from "../movement.ts";
import { AI, autoPlay } from "./auto.ts";
import { castOf, InputFlag, ROLL_STEP, ROLL_STEPS, stepBody } from "./body.ts";
import { Ev, type FightWorld, MODE_AUTO, Mode, type Player } from "./world.ts";

/** Inputs carry flags for the dodge and the manual cast. */
export interface FightInput extends MoveInput {
  readonly flags?: number;
}

/** Inputs each player spends this tick, by session id, oldest first. */
export type FightInputs = ReadonlyMap<string, readonly FightInput[]>;

const REVIVE_TICKS = ticks(KNOCKOUT.reviveChannelSeconds);
const REVIVE_WINDOW = ticks(KNOCKOUT.reviveWindowSeconds);
const REVIVE_SAFE = ticks(KNOCKOUT.reviveInvulnerableSeconds);
/** A reviver may stand this much past the revive range while channelling. */
const REVIVE_SLACK = 8;
/** Regeneration lands in steps this many ticks apart, so health does not change every patch. */
const REGEN_TICKS = 10;
/** A shove decays like knockback; a server roll keeps its speed. */
const SHOVE_DECAY = 0.85;

/** Starts a roll the server imposes (an auto dodge): the same distance, not predicted. */
export function forceRoll(w: FightWorld, p: Player, dx: number, dy: number): void {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  p.forceX = (dx / len) * ROLL_STEP;
  p.forceY = (dy / len) * ROLL_STEP;
  p.forceTicks = ROLL_STEPS;
  p.forceKeep = true;
  startedRoll(w, p, dx / len, dy / len);
}

function startedRoll(w: FightWorld, p: Player, dx: number, dy: number): void {
  p.invulnerableUntil = w.tick + ROLL_STEPS;
  p.dodgeReadyAt = w.tick + p.kit.dodgeCooldown;
  const ev = w.event(Ev.Roll);
  ev.a = p.index;
  ev.x = dx;
  ev.y = dy;
}

function canRoll(w: FightWorld, p: Player): boolean {
  return !p.down && p.rollLeft === 0 && p.forceTicks === 0 && w.tick >= p.dodgeReadyAt;
}

/** One movement input, roll included, through the step the client predicts with. */
function move(w: FightWorld, p: Player, mx: number, my: number, flags: number): void {
  const ready = canRoll(w, p);
  const before = p.rollLeft;
  const b = stepBody(
    w.map,
    { x: p.x, y: p.y, facing: p.facing, roll: p.rollLeft, rdx: p.rollDx, rdy: p.rollDy },
    mx,
    my,
    flags,
    p.kit.speed,
    ready,
  );
  p.x = b.x;
  p.y = b.y;
  p.facing = b.facing;
  p.rollLeft = b.roll;
  p.rollDx = b.rdx;
  p.rollDy = b.rdy;
  if (before === 0 && b.roll > 0) startedRoll(w, p, b.rdx / ROLL_STEP, b.rdy / ROLL_STEP);
}

/**
 * Players spend their inputs, or the server plays them (완전 자동, 스킬 수동's movement, a dropped
 * connection), then imposed movement, regeneration and the knock-out clock.
 */
export function stepPlayers(w: FightWorld, inputs: FightInputs | undefined): void {
  const tick = w.tick;
  for (const p of w.players) {
    if (!p.joined) continue;
    const x0 = p.x;
    const y0 = p.y;
    const list = inputs?.get(p.id);
    if (p.down) {
      if (list && list.length > 0) p.seq = (list[list.length - 1] as FightInput).seq;
      knockedOut(w, p);
      p.movedX = 0;
      p.movedY = 0;
      continue;
    }
    const mode = p.away ? Mode.Auto : p.mode;
    const auto = MODE_AUTO[mode];
    let playerDodge = false;
    if (!auto.move) {
      for (const input of list ?? []) {
        const flags = input.flags ?? 0;
        const slot = castOf(flags);
        if (slot >= 0 && !auto.books) p.casts |= 1 << slot;
        move(w, p, input.mx, input.my, auto.dodge ? flags & ~InputFlag.Dodge : flags);
        p.seq = input.seq;
      }
    } else {
      for (const input of list ?? []) {
        const flags = input.flags ?? 0;
        if (!auto.dodge && flags & InputFlag.Dodge) playerDodge = true;
        p.seq = input.seq;
      }
    }
    // The server's own play: movement where it drives, dodges where it dodges.
    if (auto.move || auto.dodge) {
      autoPlay(w, p, auto.move, auto.dodge);
      if (auto.move) {
        const flags = AI.dodge || playerDodge ? InputFlag.Dodge : 0;
        move(w, p, AI.mx, AI.my, flags);
      } else if (AI.dodge && canRoll(w, p)) {
        forceRoll(w, p, AI.rx, AI.ry);
      }
    }
    if (p.forceTicks > 0) {
      const at = slide(w.map, p.x, p.y, p.forceX, p.forceY, p.r);
      p.x = snap(at.x);
      p.y = snap(at.y);
      p.forceTicks--;
      if (!p.forceKeep) {
        p.forceX *= SHOVE_DECAY;
        p.forceY *= SHOVE_DECAY;
      }
      if (p.forceTicks === 0) p.forceKeep = false;
    }
    p.movedX = p.x - x0;
    p.movedY = p.y - y0;
    if ((tick + p.index) % REGEN_TICKS === 0 && p.hp < p.kit.maxHp) {
      p.hp = Math.min(p.kit.maxHp, p.hp + p.kit.regen * REGEN_TICKS * p.kit.maxHp);
    }
    if (p.shield > 0 && tick >= p.shieldUntil) p.shield = 0;
  }
}

/** A downed player: revived by someone channelling beside them, or wakes at the spawn. */
function knockedOut(w: FightWorld, p: Player): void {
  const tick = w.tick;
  const r = w.players[p.reviver];
  if (r?.joined && !r.down) {
    const dx = r.x - p.x;
    const dy = r.y - p.y;
    const reach = KNOCKOUT.reviveRange + REVIVE_SLACK;
    if (dx * dx + dy * dy > reach * reach) {
      p.reviver = -1;
    } else if (tick - p.reviveFrom >= REVIVE_TICKS) {
      p.downAt = -1;
      p.reviver = -1;
      p.hp = p.kit.maxHp * KNOCKOUT.reviveHpShare;
      p.invulnerableUntil = tick + REVIVE_SAFE;
      const ev = w.event(Ev.Revive);
      ev.a = p.index;
      ev.b = r.index;
      w.event(Ev.Merit).a = r.index;
      return;
    }
  } else {
    p.reviver = -1;
  }
  if (tick - p.downAt >= REVIVE_WINDOW) {
    // Nobody came: wake at the map's arrival point (the 보건실 until it exists).
    p.downAt = -1;
    p.reviver = -1;
    const at = w.map.wake ?? w.map.spawn;
    p.x = snap(at.x);
    p.y = snap(at.y);
    p.hp = p.kit.maxHp;
    p.invulnerableUntil = tick + REVIVE_SAFE;
    p.forceTicks = 0;
    p.rollLeft = 0;
    w.event(Ev.Wake).a = p.index;
  }
}

/** Starts `by` reviving `target` if both qualify; true when the channel began or continues. */
export function startRevive(w: FightWorld, by: Player, target: Player): boolean {
  if (!by.joined || by.down || !target.joined || !target.down || by === target) return false;
  const dx = by.x - target.x;
  const dy = by.y - target.y;
  const reach = KNOCKOUT.reviveRange + REVIVE_SLACK;
  if (dx * dx + dy * dy > reach * reach) return false;
  if (target.reviver === by.index) return true;
  if (target.reviver >= 0) return false;
  target.reviver = by.index;
  target.reviveFrom = w.tick;
  return true;
}
