import { pushOut } from "../collision.ts";
import { Facing, slide } from "../movement.ts";
import {
  CONTACT_SAFE_TICKS,
  damageMonster,
  hurtPlayer,
  knockStep,
  monsterHit,
  monsterMaxHp,
  shovePlayer,
  slowOf,
  tickStatuses,
} from "./damage.ts";
import { FLOW_FAR, type FlowField } from "./flow.ts";
import { Behavior, type MonsterKind } from "./rules.ts";
import {
  Dirty,
  type Effect,
  Ev,
  type FightWorld,
  FxKind,
  HitFlag,
  HurtFlag,
  type Monster,
  MState,
  type Player,
} from "./world.ts";

/** Separation keeps this much air between two monsters' colliders. */
const GAP = 2;
/** Share of the gap between target and current velocity closed each tick: inertia that keeps a
 * crowd from shivering when it is pushed from several sides at once. */
const STEER = 0.3;
/** A monster turns to face the other way only once it walks that way faster than this, px per
 * tick, so a crowd pushing back and forth does not flicker left and right. */
const TURN_SPEED = 0.25;
/** How hard neighbours push, as a share of the monster's own speed. */
const SEPARATE = 0.9;
/** Monsters closer than this to their target walk straight at it. */
const DIRECT_PX = 40;
/** Ticks a ranged monster keeps circling one way before it may turn. */
const STRAFE_TICKS = 40;
/** A cast or a shot holds its animation this long. */
const ACT_TICKS = 8;

const step = { x: 0, y: 0 };
const dir = { x: 0, y: 0 };

/** Puts a monster of `kind` into the field at (x, y). */
export function spawnMonster(
  w: FightWorld,
  kind: MonsterKind,
  level: number,
  elite: boolean,
  x: number,
  y: number,
): Monster | null {
  const m = w.freeMonster();
  if (!m) return null;
  const rules = w.rules;
  const e = rules.elite;
  m.alive = true;
  m.entity = w.allocEntity();
  m.kind = kind;
  w.spawned++;
  w.kindAlive[kind.index] = (w.kindAlive[kind.index] as number) + 1;
  m.level = kind.level > 0 ? kind.level : level;
  m.rank = kind.rank > 0 ? kind.rank : elite ? e.rank : 1;
  m.elite = elite;
  m.x = x;
  m.y = y;
  m.vx = 0;
  m.vy = 0;
  m.kx = 0;
  m.ky = 0;
  m.launchSpeed = 0;
  m.launchBy = -1;
  m.chain = 0;
  m.chainMax = 0;
  m.maxHp = monsterMaxHp(kind, m.level, m.rank);
  m.hp = m.maxHp;
  m.armor = elite ? Math.max(kind.armor, e.armor) : kind.armor;
  m.mass = kind.mass * (elite ? e.massMult : 1);
  m.speed = kind.speed * (elite ? e.speedMult : 1);
  m.radius = kind.radius * (elite ? e.scale : 1);
  m.contact = monsterHit(m, kind.damage);
  m.state = MState.Move;
  m.stateUntil = 0;
  m.readyAt = w.tick + w.random.int(Math.max(1, kind.interval || kind.cooldown || 20));
  m.target = -1;
  m.contactReadyAt = w.tick;
  m.born = w.tick;
  m.farSince = -1;
  m.owner = -1;
  m.travelled = 0;
  m.facing = w.random.chance(0.5) ? Facing.Left : Facing.Right;
  m.heading = w.random.next() * Math.PI * 2;
  m.stacks.fill(0);
  m.statusUntil.fill(0);
  m.statusPower.fill(0);
  m.statusBy.fill(-1);
  m.statusMask = 0;
  const n = Math.min(16, rules.statuses.length);
  for (let i = 0; i < rules.statuses.length; i++) {
    if ((kind.innate >> i) & 1) {
      m.stacks[i] = 1;
      if (i < n) m.statusMask |= 1 << i;
    }
  }
  m.proofBy.fill(-1);
  m.proofStacks.fill(0);
  m.contribBy.fill(-1);
  m.contribDamage.fill(0);
  m.stampId.fill(0);
  m.stampNext = 0;
  m.rollKey = -1;
  m.flash = false;
  m.dirty = Dirty.State | Dirty.Hp | Dirty.Status;
  m.dying = false;
  m.gone = false;
  m.killedWith = null;
  return m;
}

/** Takes a monster out of the world. */
export function removeMonster(w: FightWorld, m: Monster): void {
  if (!m.alive) return;
  m.alive = false;
  w.kindAlive[m.kind.index] = (w.kindAlive[m.kind.index] as number) - 1;
  w.freeEntity(m.entity);
}

function setState(w: FightWorld, m: Monster, state: MState, ticks: number): void {
  if (m.state !== state) m.dirty |= Dirty.State;
  m.state = state;
  m.stateUntil = w.tick + ticks;
}

/** Unit direction from the monster toward its target, around walls when one is in the way. */
function chase(flow: FlowField, m: Monster, p: Player, d: number): void {
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  if (d > 1e-6) {
    const fd = flow.distanceAt(m.x, m.y);
    if (d < DIRECT_PX || (fd !== FLOW_FAR && fd * 16 <= d * 1.15 + 16)) {
      dir.x = dx / d;
      dir.y = dy / d;
      return;
    }
    if (flow.step(m.x, m.y, 1, step)) {
      const sx = step.x - m.x;
      const sy = step.y - m.y;
      const s = Math.sqrt(sx * sx + sy * sy) || 1;
      dir.x = sx / s;
      dir.y = sy / s;
      return;
    }
    dir.x = dx / d;
    dir.y = dy / d;
    return;
  }
  dir.x = 0;
  dir.y = 0;
}

function away(m: Monster, p: Player, d: number): void {
  if (d < 1e-6) {
    dir.x = m.facing === Facing.Left ? 1 : -1;
    dir.y = 0;
    return;
  }
  dir.x = (m.x - p.x) / d;
  dir.y = (m.y - p.y) / d;
}

/** Whether nothing solid lies on the straight line between two points. */
export function clearLine(w: FightWorld, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const n = Math.ceil(Math.sqrt(dx * dx + dy * dy) / 8);
  for (let i = 1; i < n; i++) {
    if (w.wallAt(ax + (dx * i) / n, ay + (dy * i) / n)) return false;
  }
  return true;
}

/** A monster's tell on the ground: a charge line, a fuse, a slam. Resolves at `fireAt`. */
function danger(
  w: FightWorld,
  m: Monster,
  x: number,
  y: number,
  radius: number,
  length: number,
  angle: number,
  fireAt: number,
  damage: number,
  knock: number,
): Effect | null {
  const e = w.freeEffect();
  if (!e) return null;
  e.kind = FxKind.Danger;
  e.source = m.index;
  e.owner = -1;
  e.x = x;
  e.y = y;
  e.radius = radius;
  e.length = length;
  e.angle = angle;
  e.width = radius;
  e.fireAt = fireAt;
  e.until = fireAt;
  e.damage = damage;
  e.knock = knock;
  e.count = m.kind.behavior;
  e.slot = m.entity;
  return e;
}

/**
 * Every monster thinks, steers and moves one tick (PLAN §6 monsters, physics). Decisions read the
 * flow field and the archetype's numbers; steering blends the wanted velocity with separation
 * from neighbours and keeps inertia; knockback moves it instead while it is fast; walls and safe
 * zones push it out. Then overlaps are pulled apart and contact hits land.
 */
export function stepMonsters(w: FightWorld, flow: FlowField): void {
  const hash = w.monsterHash;
  const out = w.scratch;
  const tick = w.tick;
  for (const m of w.monsters) {
    if (!m.alive || m.dying) continue;
    tickStatuses(w, m);
    if (m.dying) continue;
    const kind = m.kind;
    if (m.state === MState.Arrive) {
      if (tick < m.stateUntil) continue;
      setState(w, m, MState.Move, 0);
    }
    let ti = flow.ownerAt(m.x, m.y);
    let p = ti >= 0 ? w.players[ti] : undefined;
    if (p && (!p.joined || p.down)) {
      p = undefined;
      ti = -1;
    }
    m.target = ti;
    let d = 0;
    if (p) {
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      d = Math.sqrt(dx * dx + dy * dy);
    }
    const slow = 1 - slowOf(w, m);
    let want = 0;
    dir.x = 0;
    dir.y = 0;
    let steering = true;
    const touch = p ? m.radius + p.r + 1 : 0;

    switch (kind.behavior) {
      case Behavior.Charger: {
        if (m.state === MState.Windup) {
          if (tick >= m.stateUntil) {
            setState(w, m, MState.Charge, 0);
            m.travelled = 0;
          }
        } else if (m.state === MState.Charge) {
          steering = false;
          const v = kind.chargeSpeed;
          const before = { x: m.x, y: m.y };
          const at = slide(w.monsterMap, m.x, m.y, m.aimX * v, m.aimY * v, m.radius);
          const moved = Math.hypot(at.x - before.x, at.y - before.y);
          m.x = at.x;
          m.y = at.y;
          m.travelled += moved;
          for (const q of w.players) {
            if (!q.joined || q.down) continue;
            const qx = q.x - m.x;
            const qy = q.y - m.y;
            const rr = m.radius + q.r + 2;
            if (qx * qx + qy * qy > rr * rr) continue;
            if (tick < q.contactSafeUntil) continue;
            hurtPlayer(w, q, monsterHit(m, kind.attackDamage), m.entity, HurtFlag.Charge);
            q.contactSafeUntil = tick + CONTACT_SAFE_TICKS * 2;
          }
          if (m.travelled >= kind.chargeDistance || moved < v * 0.4) {
            setState(w, m, MState.Recover, kind.recover);
            m.readyAt = tick + kind.cooldown;
          }
        } else if (m.state === MState.Recover) {
          if (tick >= m.stateUntil) setState(w, m, MState.Move, 0);
        } else if (p) {
          chase(flow, m, p, d);
          want = d > touch ? m.speed : 0;
          if (d <= kind.trigger && tick >= m.readyAt && clearLine(w, m.x, m.y, p.x, p.y)) {
            m.aimX = (p.x - m.x) / (d || 1);
            m.aimY = (p.y - m.y) / (d || 1);
            setState(w, m, MState.Windup, kind.windup);
            danger(
              w,
              m,
              m.x,
              m.y,
              m.radius + 2,
              kind.chargeDistance,
              Math.atan2(m.aimY, m.aimX),
              tick + kind.windup,
              0,
              0,
            );
            want = 0;
          }
        }
        if (m.state !== MState.Move) want = 0;
        break;
      }
      case Behavior.Ranged: {
        if (m.state === MState.Windup) {
          if (tick >= m.stateUntil) {
            const tx = p ? p.x : m.aimX;
            const ty = p ? p.y : m.aimY;
            enemyShot(w, m, tx, ty);
            setState(w, m, MState.Fire, ACT_TICKS);
            m.readyAt = tick + kind.interval;
          }
        } else if (m.state === MState.Fire) {
          if (tick >= m.stateUntil) setState(w, m, MState.Move, 0);
        } else if (p) {
          if (d < kind.keepMin) {
            away(m, p, d);
            want = m.speed;
          } else if (d > kind.keepMax) {
            chase(flow, m, p, d);
            want = m.speed;
          } else {
            // Circle the target, turning now and then, so a line of them does not stand still.
            const turn = Math.floor((tick + m.index * 13) / STRAFE_TICKS) % 2 === 0 ? 1 : -1;
            const nx = (p.x - m.x) / (d || 1);
            const ny = (p.y - m.y) / (d || 1);
            dir.x = -ny * turn;
            dir.y = nx * turn;
            want = m.speed * 0.5;
          }
          if (tick >= m.readyAt && d <= kind.projectileRange && clearLine(w, m.x, m.y, p.x, p.y)) {
            m.aimX = p.x;
            m.aimY = p.y;
            setState(w, m, MState.Windup, kind.windup);
            want = 0;
          }
        }
        if (m.state !== MState.Move) want = 0;
        break;
      }
      case Behavior.Shielded: {
        if (p) {
          chase(flow, m, p, d);
          want = d > touch ? m.speed : 0;
          // The shield swings toward the target at its turn rate.
          const to = Math.atan2(p.y - m.y, p.x - m.x);
          let diff = to - m.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = kind.turnRate;
          m.heading += Math.max(-turn, Math.min(turn, diff));
          if (m.state !== MState.Block || tick >= m.stateUntil) {
            setState(w, m, d < 72 ? MState.Guard : MState.Move, 0);
          }
        }
        break;
      }
      case Behavior.Bomber: {
        if (m.state === MState.Fuse) {
          want = 0;
        } else if (p) {
          chase(flow, m, p, d);
          if (d <= kind.rushRange) {
            if (m.state !== MState.Rush) setState(w, m, MState.Rush, 0);
            want = kind.rushSpeed;
          } else {
            if (m.state !== MState.Move) setState(w, m, MState.Move, 0);
            want = m.speed;
          }
          if (d <= kind.armRange + touch) {
            setState(w, m, MState.Fuse, kind.fuse);
            const e = danger(
              w,
              m,
              m.x,
              m.y,
              kind.blastRadius,
              0,
              0,
              tick + kind.fuse,
              monsterHit(m, kind.attackDamage),
              0,
            );
            if (e) e.phase = kind.monsterShare;
            want = 0;
          }
        }
        break;
      }
      case Behavior.Healer: {
        if (m.state === MState.Cast && tick >= m.stateUntil) setState(w, m, MState.Move, 0);
        if (p) {
          if (d < kind.keepMin) {
            away(m, p, d);
            want = m.speed;
          } else if (d > kind.keepMin + 48) {
            chase(flow, m, p, d);
            want = m.speed;
          }
        }
        if (tick >= m.readyAt) {
          m.readyAt = tick + kind.interval;
          if (healAround(w, m)) setState(w, m, MState.Cast, ACT_TICKS * 2);
        }
        if (m.state === MState.Cast) want = 0;
        break;
      }
      case Behavior.Zeno: {
        if (tick - m.born >= kind.escapeAfter) {
          m.gone = true;
          continue;
        }
        if (p && d < 220) {
          away(m, p, d);
          if (flow.step(m.x, m.y, -1, step)) {
            const sx = step.x - m.x;
            const sy = step.y - m.y;
            const s = Math.sqrt(sx * sx + sy * sy) || 1;
            dir.x = dir.x * 0.5 + (sx / s) * 0.5;
            dir.y = dir.y * 0.5 + (sy / s) * 0.5;
          }
          want = kind.fleeSpeed;
        }
        break;
      }
      case Behavior.Golem: {
        if (m.state === MState.Slam) {
          want = 0;
          if (tick >= m.stateUntil) setState(w, m, MState.Move, 0);
        } else if (p) {
          chase(flow, m, p, d);
          want = d > touch ? m.speed : 0;
          if (tick >= m.readyAt && d <= kind.blastRadius + 24) {
            const fire = tick + kind.windup;
            setState(w, m, MState.Slam, kind.windup + 6);
            const dmg = monsterHit(m, kind.attackDamage);
            danger(w, m, m.x, m.y, kind.blastRadius, 0, 0, fire, dmg, kind.slamKnock);
            if (m.hp < m.maxHp * kind.enrageBelow) {
              const r = kind.blastRadius * kind.enrageRadius;
              danger(w, m, m.x, m.y, r, 0, 0, fire + kind.enrageDelay, dmg, kind.slamKnock);
            }
            m.readyAt = tick + kind.cooldown;
            want = 0;
          }
        }
        if (kind.summonEvery > 0 && (tick - m.born) % kind.summonEvery === kind.summonEvery - 1) {
          summon(w, m);
        }
        break;
      }
      default: {
        // 추격형, 군집형, 분열형: walk at the nearest player.
        if (p) {
          chase(flow, m, p, d);
          want = d > touch ? m.speed : 0;
        }
        if (m.state !== MState.Move) setState(w, m, MState.Move, 0);
      }
    }

    // Knockback moves it instead of its legs while it is faster than walking.
    const kSpeed = Math.sqrt(m.kx * m.kx + m.ky * m.ky);
    if (kSpeed > 0) {
      knockStep(w, m);
      const at = slide(w.monsterMap, m.x, m.y, m.kx, m.ky, m.radius);
      m.x = at.x;
      m.y = at.y;
      if (kSpeed > m.speed) {
        m.vx = 0;
        m.vy = 0;
        steering = false;
      }
    }
    if (!steering) continue;

    want *= slow;
    let tvx = dir.x * want;
    let tvy = dir.y * want;
    // Separation from neighbours, by how deep they stand inside its personal space.
    const n = hash.query(m.x, m.y, m.radius + 30, out);
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      const o = w.monsters[out[i] as number] as Monster;
      if (o === m || !o.alive) continue;
      const dx = m.x - o.x;
      const dy = m.y - o.y;
      const rr = m.radius + o.radius + GAP;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      if (d2 < 1e-6) {
        sx += (m.index & 1) === 0 ? 1 : -1;
        continue;
      }
      const dd = Math.sqrt(d2);
      const k = (rr - dd) / rr;
      sx += (dx / dd) * k;
      sy += (dy / dd) * k;
    }
    const push = m.speed * SEPARATE;
    tvx += sx * push;
    tvy += sy * push;
    const cap = Math.max(want, m.speed) * 1.25;
    const tv = Math.sqrt(tvx * tvx + tvy * tvy);
    if (tv > cap) {
      tvx *= cap / tv;
      tvy *= cap / tv;
    }
    m.vx += (tvx - m.vx) * STEER;
    m.vy += (tvy - m.vy) * STEER;
    if (Math.abs(m.vx) < 1e-4 && Math.abs(m.vy) < 1e-4) continue;
    const at = slide(w.monsterMap, m.x, m.y, m.vx, m.vy, m.radius);
    m.x = at.x;
    m.y = at.y;
    if (kind.behavior !== Behavior.Shielded) {
      if (m.vx > TURN_SPEED) m.facing = Facing.Right;
      else if (m.vx < -TURN_SPEED) m.facing = Facing.Left;
    }
  }

  // Shields and charges face their heading.
  for (const m of w.monsters) {
    if (!m.alive) continue;
    if (m.kind.behavior === Behavior.Shielded) {
      m.facing = Math.cos(m.heading) >= 0 ? Facing.Right : Facing.Left;
    } else if (m.kind.behavior === Behavior.Charger && m.state !== MState.Move) {
      m.facing = m.aimX >= 0 ? Facing.Right : Facing.Left;
    } else if (m.target >= 0 && Math.abs(m.vx) <= 0.05) {
      // Standing, it faces its target, once the target is clearly to one side.
      const p = w.players[m.target] as Player;
      if (p.x > m.x + 6) m.facing = Facing.Right;
      else if (p.x < m.x - 6) m.facing = Facing.Left;
    }
  }

  rebuildHash(w);
  separate(w);
  rebuildHash(w);
  contact(w);
}

export function rebuildHash(w: FightWorld): void {
  const hash = w.monsterHash;
  hash.clear();
  for (const m of w.monsters) if (m.alive && !m.dying) hash.insert(m.index, m.x, m.y);
}

/** Pulls overlapping monsters apart, the lighter one further, then out of the walls again. */
function separate(w: FightWorld): void {
  const out = w.scratch;
  for (const m of w.monsters) {
    if (!m.alive || m.dying) continue;
    const n = w.monsterHash.query(m.x, m.y, m.radius + 28, out);
    let moved = false;
    for (let i = 0; i < n; i++) {
      const j = out[i] as number;
      if (j <= m.index) continue;
      const o = w.monsters[j] as Monster;
      if (!o.alive || o.dying) continue;
      let dx = o.x - m.x;
      let dy = o.y - m.y;
      const rr = m.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const overlap = (rr - d) * 0.5;
      const total = m.mass + o.mass;
      const mm = o.mass / total;
      const om = m.mass / total;
      m.x -= (dx / d) * overlap * mm;
      m.y -= (dy / d) * overlap * mm;
      o.x += (dx / d) * overlap * om;
      o.y += (dy / d) * overlap * om;
      moved = true;
    }
    if (moved) {
      const at = pushOut(w.monsterMap, m.x, m.y, m.radius);
      m.x = at.x;
      m.y = at.y;
    }
  }
  for (const m of w.monsters) {
    if (!m.alive || m.dying) continue;
    if (m.x < m.radius) m.x = m.radius;
    if (m.y < m.radius) m.y = m.radius;
    if (m.x > w.width - m.radius) m.x = w.width - m.radius;
    if (m.y > w.height - m.radius) m.y = w.height - m.radius;
  }
}

/** Contact hits: a monster touching its target hits once a second, and the player then has a
 * short window where no other contact lands. */
function contact(w: FightWorld): void {
  const tick = w.tick;
  for (const m of w.monsters) {
    if (!m.alive || m.dying || m.target < 0 || m.contact <= 0) continue;
    if (m.state === MState.Charge || m.state === MState.Fuse || m.state === MState.Arrive) continue;
    if (tick < m.contactReadyAt) continue;
    const p = w.players[m.target] as Player;
    if (!p.joined || p.down || tick < p.contactSafeUntil) continue;
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const rr = m.radius + p.r + 2;
    if (dx * dx + dy * dy > rr * rr) continue;
    hurtPlayer(w, p, m.contact, m.entity, HurtFlag.Contact);
    m.contactReadyAt = tick + w.rules.contactInterval;
    p.contactSafeUntil = tick + CONTACT_SAFE_TICKS;
  }
}

/** 치유형: heals every wounded monster in range. True when anyone was healed. */
function healAround(w: FightWorld, m: Monster): boolean {
  const out = w.scratch2;
  const range = m.kind.healRange;
  const n = w.monsterHash.query(m.x, m.y, range, out);
  let healed = false;
  for (let i = 0; i < n; i++) {
    const o = w.monsters[out[i] as number] as Monster;
    if (o === m || !o.alive || o.dying || o.hp >= o.maxHp) continue;
    const dx = o.x - m.x;
    const dy = o.y - m.y;
    if (dx * dx + dy * dy > range * range) continue;
    o.hp = Math.min(o.maxHp, o.hp + m.kind.heal * o.maxHp);
    o.dirty |= Dirty.Hp;
    healed = true;
  }
  if (healed) {
    const ev = w.event(Ev.Heal);
    ev.c = m.entity;
    ev.x = m.x;
    ev.y = m.y;
    ev.d = range;
  }
  return healed;
}

/** The golem calls its kind up around itself, up to its cap. */
function summon(w: FightWorld, m: Monster): void {
  const kind = w.rules.monsters[m.kind.summonKind];
  if (!kind) return;
  let mine = 0;
  for (const o of w.monsters) if (o.alive && o.owner === m.index) mine++;
  const count = Math.min(m.kind.summonCount, m.kind.summonCap - mine);
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * Math.PI * 2 + w.random.next();
    const x = m.x + Math.cos(a) * (m.radius + 14);
    const y = m.y + Math.sin(a) * (m.radius + 14);
    if (w.monsterMap.collision.rows[Math.floor(y / 16)]?.[Math.floor(x / 16)] !== ".") continue;
    const s = spawnMonster(w, kind, m.level, false, x, y);
    if (s) s.owner = m.index;
  }
}

/** A 원거리형 shot: slow, straight, stopped by walls and by antibodies. */
function enemyShot(w: FightWorld, m: Monster, tx: number, ty: number): void {
  const e = w.freeEffect();
  if (!e) return;
  const k = m.kind;
  let dx = tx - m.x;
  let dy = ty - m.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= d;
  dy /= d;
  e.kind = FxKind.EnemyShot;
  e.source = m.index;
  e.slot = m.entity;
  e.x = m.x;
  e.y = m.y;
  e.vx = dx * k.projectileSpeed;
  e.vy = dy * k.projectileSpeed;
  e.radius = k.projectileRadius;
  e.range = k.projectileRange;
  e.damage = monsterHit(m, k.attackDamage);
  e.until = w.tick + Math.ceil(k.projectileRange / Math.max(0.01, k.projectileSpeed)) + 1;
}

/** Monster effects: tells that land, and enemy shots in flight. */
export function stepDangers(w: FightWorld): void {
  const tick = w.tick;
  for (const e of w.effects) {
    if (!e.alive) continue;
    if (e.kind === FxKind.EnemyShot) {
      e.x += e.vx;
      e.y += e.vy;
      e.range -= Math.sqrt(e.vx * e.vx + e.vy * e.vy);
      if (e.range <= 0 || w.wallAt(e.x, e.y)) {
        w.endFx(e);
        continue;
      }
      for (const p of w.players) {
        if (!p.joined || p.down) continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const rr = p.r + e.radius + 1;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (tick < p.invulnerableUntil) continue;
        hurtPlayer(w, p, e.damage, e.slot, HurtFlag.Shot);
        w.endFx(e);
        break;
      }
      continue;
    }
    if (e.kind !== FxKind.Danger || e.fireAt !== tick) continue;
    const src = w.monsters[e.source];
    const owner = src?.alive && src.entity === e.slot ? src : null;
    if (e.damage > 0) {
      const flags =
        e.count === Behavior.Golem
          ? HurtFlag.Slam
          : e.count === Behavior.Bomber
            ? HurtFlag.Blast
            : 0;
      for (const p of w.players) {
        if (!p.joined || p.down) continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const rr = e.radius + p.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (tick < p.invulnerableUntil) continue;
        hurtPlayer(w, p, e.damage, e.slot, flags);
        if (e.knock > 0 && !p.down) shovePlayer(p, e.x, e.y, e.knock);
      }
    }
    if (e.count === Behavior.Bomber) {
      // The blast hurts monsters caught in it, by a share of their own health.
      const out = w.scratch2;
      const n = w.monsterHash.query(e.x, e.y, e.radius + 14, out);
      for (let i = 0; i < n; i++) {
        const o = w.monsters[out[i] as number] as Monster;
        if (!o.alive || o.dying || o === owner) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        const rr = e.radius + o.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        damageMonster(
          w,
          null,
          null,
          o,
          o.maxHp * e.phase,
          e.x,
          e.y,
          60,
          HitFlag.Reaction,
          0,
          -1,
          true,
        );
      }
      if (owner && !owner.dying) {
        // It goes up with its own blast; whoever tagged it still earns it.
        owner.hp = 0;
        owner.dying = true;
        owner.target = -1;
        owner.killedWith = null;
        w.dead.push(owner);
      }
    }
    w.endFx(e);
  }
}
