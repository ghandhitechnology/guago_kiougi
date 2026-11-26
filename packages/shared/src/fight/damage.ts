import {
  collisionDamage,
  critMultiplier,
  elasticCollision,
  KNOCK_DECAY,
  killCredits,
  mitigate,
  PARTY_RANGE,
  rollCrit,
  ticks,
} from "../combat.ts";
import { TICK_RATE_HZ } from "../constants.ts";
import { PLAYER_SPEED } from "../movement.ts";
import {
  expFalloff,
  expToNext,
  hitDamage,
  levelFactor,
  monsterDamage,
  monsterEXP,
  monsterHP,
} from "../numbers.ts";
import { Behavior, type MonsterKind, ReactionKind, type StatusPick, type Weapon } from "./rules.ts";
import {
  Dirty,
  Ev,
  type FightEvent,
  type FightWorld,
  HitFlag,
  HurtFlag,
  type Monster,
  MState,
  type Player,
} from "./world.ts";

/** Knockback below this, px per tick, has stopped (2 px/s). */
const KNOCK_STOP = 2 / TICK_RATE_HZ;
/** A knocked monster faster than this hits what it runs into (30 px/s). */
const COLLIDE_SPEED = 30 / TICK_RATE_HZ;
/** Statuses tick their damage this often (content `DOT_INTERVAL`, 0.5 s). */
export const DOT_TICKS = ticks(0.5);
/** Contact damage leaves a player untouchable by contact for this long, so a ring of monsters
 * cannot all land on the same tick. */
export const CONTACT_SAFE_TICKS = ticks(0.4);
/** A target passes a spread status to neighbours this close (content `spread`: 64 px). */
const SPREAD_RANGE = 64;
/** Shield block anim length. */
const BLOCK_TICKS = 6;

export const ATTACKER_NONE = -1;

/** A slow's share after the target's resistance (elites feel half, bosses a quarter). */
export function slowOf(w: FightWorld, m: Monster): number {
  let slow = 0;
  const st = w.rules.statuses;
  for (let i = 0; i < st.length; i++) {
    if (m.stacks[i] === 0) continue;
    const s = (st[i] as { slow: number }).slow;
    if (s > slow) slow = s;
  }
  if (slow === 0) return 0;
  const resist =
    m.kind.behavior === Behavior.Golem
      ? w.rules.slowResist.boss
      : m.elite
        ? w.rules.slowResist.elite
        : 1;
  return slow * resist;
}

function addContribution(m: Monster, player: number, amount: number): void {
  let free = -1;
  let smallest = 0;
  for (let i = 0; i < m.contribBy.length; i++) {
    const by = m.contribBy[i] as number;
    if (by === player) {
      m.contribDamage[i] = (m.contribDamage[i] as number) + amount;
      return;
    }
    if (by === -1 && free === -1) free = i;
    if (free === -1 && (m.contribDamage[i] as number) < (m.contribDamage[smallest] as number))
      smallest = i;
  }
  const slot = free === -1 ? smallest : free;
  m.contribBy[slot] = player;
  m.contribDamage[slot] = amount;
}

/** Whether `stamp` hit `m` within `interval` ticks; records it when not. 0: once ever. */
export function stampHit(w: FightWorld, m: Monster, stamp: number, interval: number): boolean {
  for (let i = 0; i < m.stampId.length; i++) {
    if (m.stampId[i] !== stamp) continue;
    if (interval > 0 && w.tick - (m.stampTick[i] as number) >= interval) {
      m.stampTick[i] = w.tick;
      return false;
    }
    return true;
  }
  const i = m.stampNext;
  m.stampId[i] = stamp;
  m.stampTick[i] = w.tick;
  m.stampNext = (i + 1) % m.stampId.length;
  return false;
}

function updateMask(w: FightWorld, m: Monster): void {
  let mask = 0;
  const n = Math.min(16, w.rules.statuses.length);
  for (let i = 0; i < n; i++) if ((m.stacks[i] as number) > 0) mask |= 1 << i;
  if (mask !== m.statusMask) {
    m.statusMask = mask;
    m.dirty |= Dirty.Status;
  }
}

/** Removes a status unless the monster carries it innately. */
function consume(w: FightWorld, m: Monster, status: number): void {
  if ((m.kind.innate >> status) & 1) return;
  m.stacks[status] = 0;
  m.statusBy[status] = -1;
  updateMask(w, m);
}

/**
 * Puts a status on a monster. A 화학 player completing a pair with what the target carries fires
 * the reaction instead (content `REACTIONS`): both statuses are consumed, innate ones stay.
 */
export function applyStatus(
  w: FightWorld,
  m: Monster,
  status: number,
  stacks: number,
  power: number,
  by: Player | null,
  weapon: Weapon | null,
  canReact = true,
): void {
  if (!m.alive || m.dying) return;
  const rule = w.rules.statuses[status];
  if (!rule || rule.onPlayer) return;
  if ((m.kind.immune >> status) & 1) return;
  if (canReact && by && by.kit.strength.chemistry > 0) {
    const n = w.rules.statuses.length;
    for (let c = 0; c < n; c++) {
      if (c === status || m.stacks[c] === 0) continue;
      const r = w.rules.reactionTable[status * n + c] as number;
      if (r < 0) continue;
      consume(w, m, c);
      react(w, m, r, power, by, weapon);
      return;
    }
  }
  const mult = weapon ? weapon.statusDuration : 1;
  if (weapon && rule.dot > 0) {
    power *= rule.id === "burn" ? weapon.burn : rule.id === "bleed" ? weapon.bleed : 1;
  }
  m.stacks[status] = Math.min(rule.maxStacks, (m.stacks[status] as number) + stacks);
  m.statusUntil[status] = w.tick + Math.round(rule.duration * mult);
  if (power > (m.statusPower[status] as number)) m.statusPower[status] = power;
  if (by) m.statusBy[status] = by.index;
  updateMask(w, m);
}

function react(
  w: FightWorld,
  m: Monster,
  index: number,
  hit: number,
  by: Player,
  weapon: Weapon | null,
): void {
  const r = w.rules.reactions[index];
  if (!r) return;
  const strength = by.kit.strength.chemistry;
  const ev = w.event(Ev.Reaction);
  ev.a = by.index;
  ev.c = m.entity;
  ev.d = index;
  ev.x = m.x;
  ev.y = m.y;
  switch (r.kind) {
    case ReactionKind.Shield: {
      const neutral = weapon && weapon.neutralizeShield > 0 ? weapon.neutralizeShield : 0;
      const share = (r.hpShare + neutral) * strength * (weapon ? weapon.shield : 1);
      by.shield = Math.max(by.shield, share * by.kit.maxHp);
      by.shieldUntil = w.tick + r.duration;
      if (weapon && weapon.neutralizeHeal > 0) {
        by.hp = Math.min(by.kit.maxHp, by.hp + weapon.neutralizeHeal * by.kit.maxHp);
      }
      break;
    }
    case ReactionKind.Burst:
      blast(w, by, null, m.x, m.y, r.radius, hit * r.damage * strength, r.knock, r.status, 0);
      break;
    case ReactionKind.Status:
      if (r.status) applyStatus(w, m, r.status.status, r.status.stacks, hit, by, weapon, false);
      break;
  }
}

/** Hits every monster within `radius` of (x, y) for an absolute amount, knocked outward. */
export function blast(
  w: FightWorld,
  by: Player | null,
  weapon: Weapon | null,
  x: number,
  y: number,
  radius: number,
  amount: number,
  knock: number,
  status: StatusPick | null,
  cast: number,
): void {
  const out = w.scratch3;
  const n = w.monsterHash.query(x, y, radius + 28, out);
  for (let i = 0; i < n; i++) {
    const m = w.monsters[out[i] as number] as Monster;
    if (!m.alive || m.dying) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const rr = radius + m.radius;
    if (dx * dx + dy * dy > rr * rr) continue;
    damageMonster(w, by, weapon, m, amount, x, y, knock, HitFlag.Reaction, cast, -1, true);
    if (status && w.random.chance(status.chance)) {
      applyStatus(w, m, status.status, status.stacks, amount, by, weapon, false);
    }
  }
}

/**
 * One hit of a player's weapon on a monster: the book's hit × `coef`, with crits, the die, the
 * level factor, the mode bonus, 운동량's speed bonus and 이해력 (PLAN §9), then armour, the
 * shield's arc and the tortoise's halving. 증명 stacks and Q.E.D. follow for 수학; the status
 * and 감염 follow after. Returns the damage dealt.
 */
export function hitMonster(
  w: FightWorld,
  p: Player,
  weapon: Weapon,
  slot: number,
  m: Monster,
  coef: number,
  fromX: number,
  fromY: number,
  knock: number,
  pick: StatusPick | null,
  cast: number,
): number {
  if (!m.alive || m.dying) return 0;
  const kit = p.kit;
  const random = w.random;
  let crit = rollCrit(random.next(), kit.critChance);
  if (
    !crit &&
    weapon.critOnStatus >= 0 &&
    (m.stacks[weapon.critOnStatus] as number) >= weapon.critOnStacks
  )
    crit = true;
  let roll = 1;
  if (weapon.rollMax > 0) {
    roll = weapon.rollMin + random.int(weapon.rollMax - weapon.rollMin + 1);
    if (weapon.rollRising) {
      const key = p.index * 8 + slot;
      if (m.rollKey === key && m.rollBest > roll) roll = m.rollBest;
      m.rollKey = key;
      m.rollBest = roll;
    }
  }
  const speed = Math.sqrt(p.movedX * p.movedX + p.movedY * p.movedY) * TICK_RATE_HZ;
  const momentum =
    kit.strength.physics > 0
      ? w.rules.momentumDamage(speed, PLAYER_SPEED, kit.strength.physics)
      : 1;
  const amount =
    hitDamage(
      weapon.hit * coef,
      kit.understanding,
      critMultiplier(crit, kit.critMult),
      levelFactor(p.level, m.level),
      w.rules.modeBonus[p.mode] ?? 1,
    ) *
    roll *
    momentum *
    kit.damage;
  const flags = (crit ? HitFlag.Crit : 0) | (knock >= 100 || roll >= 5 ? HitFlag.Heavy : 0);
  const dealt = damageMonster(
    w,
    p,
    weapon,
    m,
    amount,
    fromX,
    fromY,
    knock,
    flags,
    cast,
    slot,
    false,
  );
  if (dealt <= 0 || !m.alive) return dealt;

  const ev = hitEvent;
  if (kit.strength.math > 0) {
    hitEvent = ev;
    proof(w, p, m, dealt, cast);
  }
  if (pick && random.chance(pick.chance)) {
    if (pick.self) selfStatus(w, p, pick.status, weapon);
    else applyStatus(w, m, pick.status, pick.stacks, dealt, p, weapon);
  }
  if (kit.infectChance > 0 && random.chance(kit.infectChance)) {
    applyStatus(w, m, w.rules.status.infection, 1, dealt, p, weapon, false);
  }
  return dealt;
}

/** A status that lands on the attacker: 철's shield. */
export function selfStatus(w: FightWorld, p: Player, status: number, weapon: Weapon | null): void {
  const rule = w.rules.statuses[status];
  if (!rule?.onPlayer) return;
  if (rule.shield > 0) {
    const size = rule.shield * p.kit.maxHp * (weapon ? weapon.shield : 1);
    p.shield = Math.max(p.shield, size);
    p.shieldUntil = w.tick + Math.round(rule.duration * (weapon ? weapon.statusDuration : 1));
  }
}

/** 증명 스택: one stack per hit per player; the hit that reaches the cap proves it. */
function proof(w: FightWorld, p: Player, m: Monster, hit: number, cast: number): void {
  const window = w.rules.proof.window;
  let slot = -1;
  let oldest = 0;
  for (let i = 0; i < m.proofBy.length; i++) {
    if (m.proofBy[i] === p.index) {
      slot = i;
      break;
    }
    if ((m.proofLast[i] as number) < (m.proofLast[oldest] as number)) oldest = i;
  }
  if (slot === -1) {
    slot = oldest;
    m.proofBy[slot] = p.index;
    m.proofStacks[slot] = 0;
  }
  if (w.tick - (m.proofLast[slot] as number) > window) m.proofStacks[slot] = 0;
  m.proofLast[slot] = w.tick;
  const stacks = (m.proofStacks[slot] as number) + 1;
  if (stacks < p.kit.proofCap) {
    m.proofStacks[slot] = stacks;
    if (hitEvent) hitEvent.e |= Math.min(15, stacks) << 12;
    return;
  }
  m.proofStacks[slot] = 0;
  if (hitEvent) hitEvent.e |= HitFlag.Qed;
  const burst = w.rules.qedDamage(hit, p.kit.strength.math) + p.kit.qedBonus;
  const ev = w.event(Ev.Qed);
  ev.a = p.index;
  ev.c = m.entity;
  ev.x = m.x;
  ev.y = m.y;
  damageMonster(w, p, null, m, burst, m.x, m.y, 0, HitFlag.Qed, cast, -1, true);
  if (p.kit.qedChain > 0) {
    const out = w.scratch3;
    const n = w.monsterHash.query(m.x, m.y, m.radius + 24, out);
    let chained = 0;
    for (let i = 0; i < n && chained < p.kit.qedChain; i++) {
      const o = w.monsters[out[i] as number] as Monster;
      if (o === m || !o.alive || o.dying) continue;
      const dx = o.x - m.x;
      const dy = o.y - m.y;
      const rr = o.radius + m.radius + 6;
      if (dx * dx + dy * dy > rr * rr) continue;
      damageMonster(w, p, null, o, burst, m.x, m.y, 0, HitFlag.Qed, cast, -1, true);
      // The burst record names the first three it carried to, for the chalk links.
      if (chained === 0) ev.d = o.entity;
      else if (chained === 1) ev.e = o.entity;
      else if (chained === 2) ev.f = o.entity;
      chained++;
    }
  }
}

/** The Hit event `damageMonster` wrote last, so the signature can add to it. */
let hitEvent: FightEvent | null = null;

/**
 * Takes `amount` off a monster: armour (or none), the 방패형 front arc, the tortoise's halving,
 * then the kill. Records the damage for tagging and the hit for the wire. `slot` is the weapon
 * slot for the hit event, -1 for a burst or a status.
 */
export function damageMonster(
  w: FightWorld,
  p: Player | null,
  weapon: Weapon | null,
  m: Monster,
  amount: number,
  fromX: number,
  fromY: number,
  knock: number,
  flags: number,
  cast: number,
  slot: number,
  ignoreArmor: boolean,
): number {
  if (!m.alive || m.dying || amount <= 0) return 0;
  const kind = m.kind;
  const st = w.rules.statuses;
  let armorLoss = 0;
  let taken = 0;
  for (let i = 0; i < st.length; i++) {
    const s = m.stacks[i] as number;
    if (s === 0) continue;
    const rule = st[i] as { armorLoss: number; damageTaken: number };
    armorLoss += rule.armorLoss * s;
    taken += rule.damageTaken * s;
  }
  let dmg = mitigate(amount, m.armor - armorLoss, ignoreArmor) * (1 + taken);
  if (kind.behavior === Behavior.Shielded && !(flags & HitFlag.Dot)) {
    const from = Math.atan2(fromY - m.y, fromX - m.x);
    let d = Math.abs(from - m.heading) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d <= kind.arc && (fromX !== m.x || fromY !== m.y)) {
      dmg *= 1 - kind.reduction;
      flags |= HitFlag.Blocked;
      if (m.state === MState.Guard || m.state === MState.Move) {
        m.state = MState.Block;
        m.stateUntil = w.tick + BLOCK_TICKS;
        m.dirty |= Dirty.State;
      }
    }
  }
  if (kind.behavior === Behavior.Zeno) dmg = w.rules.zenoDamage(m.hp, m.maxHp, dmg, kind.halvings);
  if (m.fighter >= 0) {
    // A duel fighter's stand-in: the hit lands on the player (duel.ts).
    const dealt = w.pvp ? w.pvp.land(w, p, m, dmg, fromX, fromY, knock, flags, cast, slot) : 0;
    hitEvent = dealt > 0 && w.pvp ? w.pvp.hit : null;
    return dealt;
  }
  const boss = m.part ? w.boss : null;
  if (boss) {
    // A boss part's hit goes to the boss's one pool, through its gimmick and its shield.
    const full = dmg;
    dmg = boss.take(w, p, m, dmg);
    if (dmg < full * 0.999) flags |= HitFlag.Blocked;
  } else {
    if (dmg > m.hp) dmg = m.hp;
    m.hp -= dmg;
    if (p) addContribution(m, p.index, dmg);
  }
  m.flash = true;
  m.dirty |= Dirty.Hp;
  if (knock > 0 && kind.behavior !== Behavior.Golem && (!boss || boss.pushable(m)))
    push(w, m, p, weapon, fromX, fromY, knock, dmg);
  const killed = !boss && m.hp <= 1e-9;
  if (killed) {
    m.hp = 0;
    m.dying = true;
    w.dead.push(m);
    m.target = p ? p.index : -1;
    m.killedWith = weapon;
  }
  hitEvent = null;
  if (p) {
    p.lastHit = w.tick;
    const ev = w.event(Ev.Hit);
    ev.a = p.index;
    ev.b = m.index;
    ev.c = m.entity;
    ev.d = dmg;
    ev.e = flags | (killed ? HitFlag.Kill : 0) | ((slot & 15) << 8);
    ev.f = cast;
    ev.x = m.kx;
    ev.y = m.ky;
    hitEvent = ev;
  }
  return dmg;
}

/** Knockback as a velocity impulse: knock ÷ mass px/s, away from (fromX, fromY). */
function push(
  _w: FightWorld,
  m: Monster,
  p: Player | null,
  weapon: Weapon | null,
  fromX: number,
  fromY: number,
  knock: number,
  hit: number,
): void {
  let dx = m.x - fromX;
  let dy = m.y - fromY;
  let d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) {
    dx = m.facing === 2 ? 1 : -1;
    dy = 0;
    d = 1;
  }
  const v = knock / m.mass / TICK_RATE_HZ;
  m.kx += (dx / d) * v;
  m.ky += (dy / d) * v;
  const speed = Math.sqrt(m.kx * m.kx + m.ky * m.ky);
  m.launchSpeed = speed;
  m.launchHit = hit;
  m.launchBy = p ? p.index : -1;
  const elastic = weapon?.elastic ?? false;
  m.launchShare = elastic
    ? Math.max(p ? p.kit.collisionShare : 0, 0.6)
    : p
      ? p.kit.collisionShare
      : 0;
  m.chain = 0;
  m.chainMax = elastic ? 6 : 3;
}

/**
 * Moves a knocked monster one tick and lets it run into others: momentum passes on along the
 * contact normal (an elastic collision), and with 운동량 both take a share of the launching hit
 * (PLAN §6 physics). Chains stop after a few links.
 */
export function knockStep(w: FightWorld, m: Monster): void {
  const speed = Math.sqrt(m.kx * m.kx + m.ky * m.ky);
  if (speed < KNOCK_STOP) {
    m.kx = 0;
    m.ky = 0;
    return;
  }
  if (speed >= COLLIDE_SPEED && m.chain < m.chainMax) {
    const out = w.scratch3;
    const n = w.monsterHash.query(m.x, m.y, m.radius + 30, out);
    for (let i = 0; i < n; i++) {
      const o = w.monsters[out[i] as number] as Monster;
      if (o === m || !o.alive || o.dying) continue;
      const dx = o.x - m.x;
      const dy = o.y - m.y;
      const rr = o.radius + m.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const along = m.kx * nx + m.ky * ny;
      if (along <= COLLIDE_SPEED) continue;
      const { a, b } = elasticCollision(along, m.mass, o.mass);
      m.kx += (a - along) * nx;
      m.ky += (a - along) * ny;
      o.kx += b * nx;
      o.ky += b * ny;
      o.launchSpeed = Math.max(o.launchSpeed, b);
      o.launchHit = m.launchHit;
      o.launchBy = m.launchBy;
      o.launchShare = m.launchShare;
      o.chain = m.chain + 1;
      o.chainMax = m.chainMax;
      const by = m.launchBy >= 0 ? (w.players[m.launchBy] ?? null) : null;
      if (by?.joined && m.launchShare > 0) {
        const dmg = collisionDamage(
          m.launchHit,
          along * TICK_RATE_HZ,
          m.launchSpeed * TICK_RATE_HZ,
          m.launchShare,
        );
        if (dmg > 0) {
          damageMonster(w, by, null, o, dmg, m.x, m.y, 0, HitFlag.Collision, 0, -1, false);
          damageMonster(w, by, null, m, dmg, o.x, o.y, 0, HitFlag.Collision, 0, -1, false);
        }
      }
      m.chain++;
      if (m.chain >= m.chainMax) break;
    }
  }
  m.kx *= 1 - KNOCK_DECAY;
  m.ky *= 1 - KNOCK_DECAY;
}

/** Status damage and expiry for one monster, every `DOT_TICKS`. */
export function tickStatuses(w: FightWorld, m: Monster): void {
  if (m.statusMask === 0) return;
  const st = w.rules.statuses;
  const due = (w.tick + m.index) % DOT_TICKS === 0;
  let changed = false;
  for (let i = 0; i < st.length; i++) {
    const s = m.stacks[i] as number;
    if (s === 0) continue;
    const innate = (m.kind.innate >> i) & 1;
    if (!innate && (m.statusUntil[i] as number) <= w.tick) {
      m.stacks[i] = 0;
      m.statusBy[i] = -1;
      changed = true;
      continue;
    }
    const rule = st[i] as { dot: number };
    if (due && rule.dot > 0 && !innate) {
      const by = w.players[m.statusBy[i] as number];
      const amount = rule.dot * (m.statusPower[i] as number) * s * (DOT_TICKS / TICK_RATE_HZ);
      damageMonster(
        w,
        by?.joined ? by : null,
        null,
        m,
        amount,
        m.x,
        m.y,
        0,
        HitFlag.Dot,
        0,
        -1,
        true,
      );
    }
  }
  if (changed) updateMask(w, m);
}

// ── Players getting hurt ───────────────────────────────────────────────────

/** Damage to a player: dodges and i-frames first, then the shield, then 기절 at zero. */
export function hurtPlayer(
  w: FightWorld,
  p: Player,
  amount: number,
  source: number,
  flags: number,
): void {
  if (!p.joined || p.down || w.tick < p.invulnerableUntil) return;
  if (w.inSafe(p.x, p.y)) return;
  let rest = amount;
  if (p.shield > 0 && w.tick < p.shieldUntil) {
    const took = Math.min(p.shield, rest);
    p.shield -= took;
    rest -= took;
    flags |= HurtFlag.Shielded;
  }
  p.hp -= rest;
  p.lastHurt = w.tick;
  if (p.hp <= 0) {
    p.hp = 0;
    p.downAt = w.tick;
    p.rollLeft = 0;
    p.forceTicks = 0;
    p.reviver = -1;
    flags |= HurtFlag.Down;
    w.event(Ev.Down).a = p.index;
  }
  const ev = w.event(Ev.Hurt);
  ev.a = p.index;
  ev.c = source;
  ev.d = amount;
  ev.e = flags;
}

/** Shoves a player (a slam, a blast): server-imposed movement that decays like knockback. */
export function shovePlayer(p: Player, fromX: number, fromY: number, knock: number): void {
  let dx = p.x - fromX;
  let dy = p.y - fromY;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= d;
  dy /= d;
  const v = knock / TICK_RATE_HZ;
  p.forceX = dx * v;
  p.forceY = dy * v;
  p.forceTicks = 12;
}

/** A monster's own attack damage at its level and rank. */
export function monsterHit(m: Monster, mult: number): number {
  return monsterDamage(m.level, m.rank) * mult;
}

// ── Kills ───────────────────────────────────────────────────────────────────

/** HP of a monster of this kind, level and rank. */
export function monsterMaxHp(kind: MonsterKind, level: number, rank: number): number {
  return monsterHP(level, rank) * kind.hp;
}

/** Adds EXP and levels up, rebuilding the kit at each new level. */
export function gainExp(w: FightWorld, p: Player, earned: number): void {
  const amount = earned * p.expMult;
  if (!(amount > 0)) return;
  p.exp += amount;
  p.expEarned += amount;
  let levelled = false;
  while (p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level++;
    levelled = true;
    const ev = w.event(Ev.LevelUp);
    ev.a = p.index;
    ev.d = p.level;
  }
  if (levelled && p.rebuild) w.setKit(p, p.rebuild(p.level));
}

const contributions: { playerId: string; partyId?: string | undefined; damage: number }[] = [];

/**
 * Settles every monster that died this tick: kill credit by tagging (PLAN §6, 5% of its health
 * earns full EXP and a loot roll), party sharing within 20 tiles, EXP with its falloff, drops,
 * splitting, spreading statuses and heals on kill.
 */
export function settleKills(w: FightWorld, onKill: (m: Monster) => void): void {
  for (let k = 0; k < w.dead.length; k++) {
    const m = w.dead[k] as Monster;
    const weapon = m.killedWith;
    m.killedWith = null;
    if (m.kind.behavior === Behavior.Object || m.part) {
      // Objectives and boss parts earn no EXP or drops: the boss fight credits them.
      if (m.kind.behavior === Behavior.Object) {
        const by = m.target >= 0 ? w.players[m.target] : undefined;
        w.boss?.objective(w, m, by?.joined ? by : null);
      }
      const ev = w.event(Ev.Kill);
      ev.a = -1;
      ev.c = m.entity;
      ev.x = m.x;
      ev.y = m.y;
      continue;
    }
    contributions.length = 0;
    for (let i = 0; i < m.contribBy.length; i++) {
      const by = m.contribBy[i] as number;
      if (by < 0) continue;
      const p = w.players[by];
      if (!p?.joined) continue;
      contributions.push({
        playerId: String(by),
        partyId: p.party ?? undefined,
        damage: m.contribDamage[i] as number,
      });
    }
    const bystanders: { playerId: string; partyId: string }[] = [];
    if (contributions.some((c) => c.partyId)) {
      for (const q of w.players) {
        if (!q.joined || !q.party || q.down) continue;
        const dx = q.x - m.x;
        const dy = q.y - m.y;
        if (dx * dx + dy * dy <= PARTY_RANGE * PARTY_RANGE)
          bystanders.push({ playerId: String(q.index), partyId: q.party });
      }
    }
    // A 복습's adds die as usual but earn nobody EXP or drops (`BossHooks.pays`).
    const pays = !w.boss || w.boss.pays(m);
    const credits =
      pays && contributions.length > 0 ? killCredits(m.maxHp, contributions, bystanders) : [];
    const exp = monsterEXP(m.level, m.rank) * m.kind.exp;
    for (const c of credits) {
      const p = w.players[Number(c.playerId)];
      if (!p?.joined) continue;
      gainExp(w, p, exp * c.expMult * expFalloff(p.level, m.level));
      dropFor(w, p, m);
      const credit = w.event(Ev.Credit);
      credit.a = p.index;
      credit.c = m.entity;
      credit.d = m.kind.index;
      credit.e = m.level;
      credit.f = m.kind.behavior === Behavior.Golem ? 2 : m.elite ? 1 : 0;
      const heal = p.kit.killHeal + (weapon && lastKillerIs(m, p) ? weapon.healOnKill : 0);
      if (heal > 0 && !p.down) p.hp = Math.min(p.kit.maxHp, p.hp + heal * p.kit.maxHp);
    }
    const killer = m.target >= 0 ? w.players[m.target] : undefined;
    const ev = w.event(Ev.Kill);
    ev.a = killer?.joined ? killer.index : -1;
    ev.c = m.entity;
    ev.x = m.x;
    ev.y = m.y;
    if (killer?.joined && weapon && weapon.spreadStatus >= 0) {
      spreadStatus(w, m, weapon.spreadStatus, weapon.spreadCount, weapon.spreadKeep, killer);
    }
    const infection = w.rules.status.infection;
    if ((m.stacks[infection] as number) > 0) {
      const by = w.players[m.statusBy[infection] as number];
      if (by?.joined && by.kit.infectSpread > 0)
        spreadStatus(w, m, infection, by.kit.infectSpread, false, by, by.kit.infectRange);
    }
    onKill(m);
  }
  w.dead.length = 0;
}

function lastKillerIs(m: Monster, p: Player): boolean {
  return m.target === p.index;
}

/** Passes a status from a dying monster to its nearest neighbours. */
function spreadStatus(
  w: FightWorld,
  m: Monster,
  status: number,
  count: number,
  keep: boolean,
  by: Player,
  range = SPREAD_RANGE,
): void {
  const out = w.scratch3;
  const n = w.monsterHash.query(m.x, m.y, range, out);
  const stacks = keep ? Math.max(1, m.stacks[status] as number) : 1;
  const power = m.statusPower[status] as number;
  for (let given = 0; given < count; given++) {
    let best: Monster | null = null;
    let bestD = range * range;
    for (let i = 0; i < n; i++) {
      const o = w.monsters[out[i] as number] as Monster;
      if (o === m || !o.alive || o.dying || (o.stacks[status] as number) > 0) continue;
      const dx = o.x - m.x;
      const dy = o.y - m.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = o;
      }
    }
    if (!best) return;
    applyStatus(w, best, status, stacks, power, by, null, false);
  }
}

/** Rolls a credited player's own drops and scatters them around the body. */
function dropFor(w: FightWorld, p: Player, m: Monster): void {
  const drops = w.rules.rollDrops(w.random, {
    field: w.field?.id ?? w.map.id,
    major: p.kit.major,
    monster: m.kind,
    level: m.level,
    rank: m.rank,
    elite: m.elite,
    dropMult: p.kit.dropMult,
    coinMult: p.kit.coinMult,
  });
  for (const drop of drops) {
    const k = w.freePickup();
    if (!k) return;
    const a = w.random.next() * Math.PI * 2;
    const r = 10 + w.random.next() * 16;
    let x = m.x + Math.cos(a) * r;
    let y = m.y + Math.sin(a) * r;
    if (w.tileAt(x, y) === 1 || w.tileAt(x, y) === 2) {
      x = m.x;
      y = m.y;
    }
    k.alive = true;
    k.id = w.allocPickup();
    k.owner = p.index;
    k.x = x;
    k.y = y;
    k.fromX = m.x;
    k.fromY = m.y;
    k.drop = drop;
    k.born = w.tick;
    k.until = w.tick + PICKUP_TICKS;
  }
}

/** Uncollected drops vanish after a minute (content `DROPS.despawnSeconds`). */
export const PICKUP_TICKS = ticks(60);
