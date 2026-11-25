import { overlapsSolid } from "../collision.ts";
import { PARTY_RANGE } from "../combat.ts";
import { slide, snap } from "../movement.ts";
import { blast, hitMonster, selfStatus, stampHit } from "./damage.ts";
import { removeMonster } from "./monsters.ts";
import { Kind, StatusOrder, type StatusPick, type Weapon } from "./rules.ts";
import {
  type Effect,
  Ev,
  type FightWorld,
  FxKind,
  type Minion,
  MODE_AUTO,
  Mode,
  type Monster,
  type Player,
} from "./world.ts";

/** Where a cast is aimed: a point, the unit direction to it, and the monster there if any. */
export interface Aim {
  x: number;
  y: number;
  dx: number;
  dy: number;
  target: Monster | null;
}

const aim: Aim = { x: 0, y: 0, dx: 1, dy: 0, target: null };
/** Minions follow targets within this of their owner. */
const LEASH = 150;
/** Bursts (follow-ups, chains, marks) stay drawn this long. */
const FLASH_TICKS = 6;
/** Stamps are handed out in blocks so one effect can number its bodies and pulses. */
const STAMP_BLOCK = 64;

/** How far a weapon reaches from its owner: auto casts wait for a target this close. */
export function reachOf(wp: Weapon): number {
  switch (wp.kind) {
    case Kind.Orbit:
      return wp.orbitRadius + wp.bodyRadius + 24;
    case Kind.Beam:
      return wp.length * 0.9;
    case Kind.Projectile:
      return wp.range;
    case Kind.Chain:
      return wp.range;
    case Kind.Cone:
      return wp.range + wp.growMax * 0.5;
    case Kind.Summon:
      return LEASH;
    case Kind.Telegraph:
      return wp.line ? wp.range + wp.length * 0.8 : wp.range + wp.radius;
    case Kind.Wave:
      return wp.radius;
    case Kind.Zone:
      return wp.allies
        ? Number.POSITIVE_INFINITY
        : wp.follow
          ? wp.radius + 8
          : wp.range + wp.radius;
    case Kind.Dash:
      return wp.distance + wp.width;
  }
}

/**
 * The monster the server would aim at: lowest `distance ÷ priority` within `range`, skipping
 * monsters auto-aim may not see from here (그림자). Writes `aim` and returns whether found.
 */
export function autoTarget(w: FightWorld, p: Player, range: number): boolean {
  const out = w.scratch2;
  const n = w.monsterHash.query(p.x, p.y, range + 16, out);
  let best: Monster | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const m = w.monsters[out[i] as number] as Monster;
    if (!m.alive || m.dying) continue;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > range + m.radius || d > m.kind.autoAimRange) continue;
    const score = d / m.kind.aimPriority;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (!best) return false;
  setAim(p, best.x, best.y, best);
  return true;
}

function setAim(p: Player, x: number, y: number, target: Monster | null): void {
  aim.x = x;
  aim.y = y;
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1e-6) {
    aim.dx = dx / d;
    aim.dy = dy / d;
  } else {
    const f = facingDir(p);
    aim.dx = f[0];
    aim.dy = f[1];
  }
  aim.target = target;
}

const FACING_DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, -1],
  [-1, 0],
  [1, 0],
];

function facingDir(p: Player): readonly [number, number] {
  return FACING_DIRS[p.facing] as readonly [number, number];
}

/** Whether anything is within `range` of the player: self-centred books wait for that. */
function anyNear(w: FightWorld, p: Player, range: number): boolean {
  const out = w.scratch2;
  const n = w.monsterHash.query(p.x, p.y, range + 16, out);
  for (let i = 0; i < n; i++) {
    const m = w.monsters[out[i] as number] as Monster;
    if (!m.alive || m.dying) continue;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const rr = range + m.radius;
    if (dx * dx + dy * dy <= rr * rr) return true;
  }
  return false;
}

/**
 * Books tick down and fire. In the modes where books are automatic they fire when ready at the
 * aimed point or the best target in reach; in 완전 수동 only the casts the player asked for fire,
 * at the aim or the best target, else straight ahead.
 */
export function stepWeapons(w: FightWorld): void {
  for (const p of w.players) {
    if (!p.joined) continue;
    const weapons = p.kit.weapons;
    if (p.down) {
      p.casts = 0;
      continue;
    }
    if (w.tick > p.buffUntil) {
      p.attackSpeed = 0;
      p.cooldownBuff = 0;
    }
    const rate = (1 + p.attackSpeed) / Math.max(0.2, 1 - p.cooldownBuff);
    const autoBooks = MODE_AUTO[p.mode].books || p.away;
    const safe = w.inSafe(p.x, p.y);
    for (let s = 0; s < weapons.length; s++) {
      const wp = weapons[s] as Weapon;
      if ((p.ready[s] as number) > 0) p.ready[s] = (p.ready[s] as number) - rate;
      if ((p.ready[s] as number) > 0 || safe) continue;
      const asked = (p.casts >> s) & 1;
      if (!autoBooks && !asked) continue;
      const reach = reachOf(wp);
      let ok: boolean;
      if (wp.kind === Kind.Zone && wp.allies) {
        setAim(p, p.x, p.y, null);
        ok = true;
      } else if (
        wp.kind === Kind.Orbit ||
        wp.kind === Kind.Wave ||
        (wp.kind === Kind.Zone && wp.follow) ||
        wp.kind === Kind.Summon
      ) {
        ok = anyNear(w, p, reach);
        if (ok || asked) setAim(p, p.x + facingDir(p)[0] * 16, p.y + facingDir(p)[1] * 16, null);
        if (ok && p.aiming) setAim(p, p.x + p.aimX, p.y + p.aimY, null);
      } else if (p.aiming) {
        setAim(p, p.x + p.aimX, p.y + p.aimY, null);
        ok = true;
      } else {
        ok = autoTarget(w, p, Math.min(reach, w.rules.autoPlay.targetRange * 1.5));
      }
      if (!ok && asked) {
        const f = facingDir(p);
        setAim(p, p.x + f[0] * reach * 0.6, p.y + f[1] * reach * 0.6, null);
        ok = true;
      }
      if (!ok) continue;
      cast(w, p, s, wp, aim);
      p.ready[s] = wp.cooldown;
    }
    p.casts = 0;
  }
}

/** The status this cast applies, by the weapon's order. */
function pickStatus(w: FightWorld, p: Player, s: number, wp: Weapon, target: Monster | null) {
  const list = wp.statuses;
  if (list.length === 0) return null;
  if (list.length === 1) return list[0] as StatusPick;
  switch (wp.statusOrder) {
    case StatusOrder.Random:
      return w.random.pick(list);
    case StatusOrder.Choose: {
      // Auto picks the entry that completes a reaction on the target.
      if (target && p.kit.strength.chemistry > 0) {
        const n = w.rules.statuses.length;
        for (const pick of list) {
          if (pick.self) continue;
          for (let c = 0; c < n; c++) {
            if (target.stacks[c] === 0) continue;
            if ((w.rules.reactionTable[pick.status * n + c] as number) >= 0) return pick;
          }
        }
      }
      const turn = ((p.statusTurn[s] as number) + 1) % list.length;
      p.statusTurn[s] = turn;
      return list[turn] as StatusPick;
    }
    default: {
      const pick = list[(p.statusTurn[s] as number) % list.length] as StatusPick;
      p.statusTurn[s] = ((p.statusTurn[s] as number) + 1) % list.length;
      return pick;
    }
  }
}

function effect(w: FightWorld, p: Player, s: number, wp: Weapon, kind: FxKind, c: number) {
  const e = w.freeEffect();
  if (!e) return null;
  w.nextStamp += STAMP_BLOCK;
  e.kind = kind;
  e.owner = p.index;
  e.weapon = wp;
  e.slot = s;
  e.cast = c;
  e.damage = 1;
  e.knock = wp.knock;
  return e;
}

function setStatus(e: Effect, pick: StatusPick | null): void {
  if (!pick) {
    e.status = -1;
    return;
  }
  e.status = pick.status;
  e.statusStacks = pick.stacks;
  e.statusChance = pick.chance;
  e.phase = pick.self ? 1 : 0;
}

/** The status an effect carries, as a pick. */
function pickOf(e: Effect): StatusPick | null {
  if (e.status < 0) return null;
  scratchPick.status = e.status;
  scratchPick.stacks = e.statusStacks;
  scratchPick.chance = e.statusChance;
  scratchPick.self = e.phase === 1;
  return scratchPick;
}
const scratchPick = { status: 0, stacks: 0, chance: 0, self: false };

function nextCast(w: FightWorld): number {
  const c = w.nextCast;
  w.nextCast = c >= 0xffff ? 1 : c + 1;
  return c;
}

/** One cast of a book: spawns its shape (content `attacks.ts`, the ten behaviours). */
export function cast(w: FightWorld, p: Player, s: number, wp: Weapon, a: Aim): void {
  const c = nextCast(w);
  const ev = w.event(Ev.Cast);
  ev.a = p.index;
  ev.b = s;
  ev.f = c;
  ev.x = a.x;
  ev.y = a.y;
  const pick = pickStatus(w, p, s, wp, a.target);
  const tick = w.tick;
  switch (wp.kind) {
    case Kind.Orbit: {
      orbit(w, p, p.index, s, wp, c, a);
      if (wp.party && p.party) {
        for (const q of w.players) {
          if (q === p || !q.joined || q.party !== p.party || q.down) continue;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          if (dx * dx + dy * dy <= PARTY_RANGE * PARTY_RANGE) orbit(w, p, q.index, s, wp, c, a);
        }
      }
      break;
    }
    case Kind.Beam: {
      const n = Math.max(1, wp.count);
      for (let i = 0; i < n; i++) {
        const off = n > 1 && wp.spread > 0 ? (i / (n - 1) - 0.5) * wp.spread : 0;
        const harmonic = n > 1 && wp.spread === 0 ? i + 1 : 1;
        const e = effect(w, p, s, wp, FxKind.Beam, c);
        if (!e) break;
        const ang = Math.atan2(a.dy, a.dx) + off;
        e.x = p.x;
        e.y = p.y;
        e.angle = ang;
        e.width = wp.width;
        e.until = tick + Math.max(1, wp.duration);
        setStatus(e, pick);
        tracePath(
          w,
          e,
          p.x,
          p.y,
          ang,
          wp.length,
          wp.amplitude / harmonic,
          wp.wavelength / harmonic,
          wp.reflect,
        );
        e.count = harmonic;
      }
      break;
    }
    case Kind.Projectile: {
      let n = wp.count;
      if (wp.burst.length > 0) {
        let at = p.burst[s] as number;
        if (wp.keepBurst && at >= wp.burst.length) at = wp.burst.length - 1;
        n = wp.burst[at % wp.burst.length] as number;
        const next = at + 1;
        p.burst[s] = wp.keepBurst
          ? p.burstHit[s]
            ? Math.min(next, wp.burst.length)
            : 0
          : next % wp.burst.length;
        if (wp.keepBurst && !p.burstHit[s] && at > 0) p.burst[s] = 0;
        p.burstHit[s] = 0;
      }
      const base = Math.atan2(a.dy, a.dx);
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i / (n - 1) - 0.5) * wp.spread : 0;
        shoot(w, p, s, wp, c, base + off, a, pick, i);
      }
      break;
    }
    case Kind.Chain:
      chain(w, p, s, wp, c, a, pick);
      break;
    case Kind.Cone: {
      const e = effect(w, p, s, wp, FxKind.Cone, c);
      if (!e) break;
      if (tick > (p.growUntil[s] as number)) p.grow[s] = 0;
      e.x = p.x;
      e.y = p.y;
      e.angle = Math.atan2(a.dy, a.dx);
      e.length = wp.range + (p.grow[s] as number);
      e.width = wp.angle / 2;
      e.count = Math.max(1, Math.round(wp.hits));
      e.interval = Math.max(1, wp.duration);
      e.fireAt = tick;
      e.until = tick + e.interval;
      e.follow = true;
      setStatus(e, pick);
      if (wp.followDelay > 0) {
        const f = effect(w, p, s, wp, FxKind.Cone, c);
        if (f) {
          f.x = e.x;
          f.y = e.y;
          f.angle = e.angle;
          f.length = e.length;
          f.width = e.width;
          f.count = 1;
          f.interval = 1;
          f.fireAt = tick + wp.followDelay;
          f.until = f.fireAt + 1;
          f.damage = wp.followDamage;
          f.knock = 0;
          setStatus(f, wp.followStatus);
        }
      }
      if (wp.trail) {
        const tx = p.x + a.dx * e.length * 0.6;
        const ty = p.y + a.dy * e.length * 0.6;
        area(
          w,
          p,
          s,
          wp,
          c,
          FxKind.Trail,
          tx,
          ty,
          wp.trail.radius,
          wp.trail.duration,
          wp.trail.interval,
          wp.trail.damage,
          wp.trail.status,
          wp.trail.pull,
          wp.trail.spin,
        );
      }
      break;
    }
    case Kind.Summon: {
      const cap = wp.cap + p.kit.minionCap;
      for (let i = 0; i < wp.perCast && p.minions < cap; i++) {
        const ang = w.random.next() * Math.PI * 2;
        spawnMinion(w, p, s, wp, p.x + Math.cos(ang) * 10, p.y + Math.sin(ang) * 10, 0);
      }
      break;
    }
    case Kind.Telegraph: {
      const n = Math.max(1, wp.count);
      const ang = Math.atan2(a.dy, a.dx);
      for (let i = 0; i < n; i++) {
        const e = effect(w, p, s, wp, FxKind.Mark, c);
        if (!e) break;
        let x: number;
        let y: number;
        let la = ang;
        if (wp.line) {
          if (wp.scatter === 0 && n > 1) la = ang + (i / (n - 1) - 0.5) * 0.7;
          x = p.x + Math.cos(la) * wp.range;
          y = p.y + Math.sin(la) * wp.range;
        } else {
          const dx = a.x - p.x;
          const dy = a.y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const k = d > wp.range ? wp.range / d : 1;
          x = p.x + dx * k;
          y = p.y + dy * k;
          if (wp.scatter === 0 && n > 1) {
            const side = (i - (n - 1) / 2) * wp.radius * 2.2;
            x += -Math.sin(ang) * side;
            y += Math.cos(ang) * side;
          }
        }
        if (wp.scatter > 0) {
          const sa = w.random.next() * Math.PI * 2;
          const sr = Math.sqrt(w.random.next()) * wp.scatter;
          x += Math.cos(sa) * sr;
          y += Math.sin(sa) * sr;
        }
        e.x = x;
        e.y = y;
        e.angle = la;
        e.radius = wp.radius * wp.forecastArea;
        e.length = wp.length * wp.forecastArea;
        e.width = wp.width * wp.forecastArea;
        e.damage = wp.forecastDamage;
        e.fireAt = tick + Math.max(1, Math.round(wp.delay));
        e.repeats = wp.repeat;
        e.interval = Math.max(1, wp.repeatInterval);
        e.until = e.fireAt + wp.repeat * e.interval + FLASH_TICKS;
        e.count = wp.line ? 1 : 0;
        setStatus(e, pick);
      }
      break;
    }
    case Kind.Wave: {
      const n = Math.max(1, wp.count);
      const out = Math.ceil(wp.radius / Math.max(0.01, wp.speed));
      for (let i = 0; i < n; i++) {
        const e = effect(w, p, s, wp, FxKind.Wave, c);
        if (!e) break;
        e.x = p.x;
        e.y = p.y;
        e.radius = wp.radius;
        e.speed = wp.speed;
        e.width = wp.width;
        e.fireAt = tick + i * out;
        e.interval = Math.max(0, wp.hold);
        e.pull = wp.pull;
        e.until = e.fireAt + out + e.interval + (wp.pull > 0 ? out : 0) + 1;
        setStatus(e, pick);
      }
      break;
    }
    case Kind.Zone: {
      let x = p.x;
      let y = p.y;
      if (!wp.follow && wp.range > 0) {
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const k = d > wp.range ? wp.range / d : 1;
        x = p.x + dx * k;
        y = p.y + dy * k;
      }
      const e = area(
        w,
        p,
        s,
        wp,
        c,
        FxKind.Zone,
        x,
        y,
        wp.radius,
        Math.max(1, wp.duration),
        Math.max(1, wp.hitInterval),
        1,
        pick,
        wp.pull,
        0,
      );
      if (!e) break;
      e.follow = wp.follow;
      e.growth = wp.growth;
      if (wp.followDelay > 0) e.fireAt = tick + wp.followDelay;
      break;
    }
    case Kind.Dash:
      dash(w, p, s, wp, c, a, pick);
      break;
  }
}

function orbit(
  w: FightWorld,
  p: Player,
  anchor: number,
  s: number,
  wp: Weapon,
  c: number,
  a: Aim,
): void {
  const e = effect(w, p, s, wp, FxKind.Orbit, c);
  if (!e) return;
  const q = w.players[anchor] as Player;
  e.source = anchor;
  e.x = q.x;
  e.y = q.y;
  e.count = Math.max(1, Math.round(wp.count));
  e.radius = wp.orbitRadius;
  e.width = wp.bodyRadius;
  e.speed = (Math.PI * 2) / Math.max(1, wp.period);
  e.angle = Math.atan2(a.dy, a.dx);
  e.length = wp.sweep;
  e.spin = wp.precession;
  e.interval = Math.max(1, Math.round(wp.hitInterval));
  e.until = w.tick + Math.max(1, Math.round(wp.duration));
}

/** Where body `i` of an orbit is `t` ticks after it came out. */
export function orbitBody(
  e: {
    x: number;
    y: number;
    angle: number;
    speed: number;
    count: number;
    length: number;
    spin: number;
    radius: number;
  },
  i: number,
  t: number,
  out: { x: number; y: number },
): void {
  let th: number;
  if (e.length > 0) {
    const base = e.angle + e.spin * t + (Math.PI * 2 * i) / e.count;
    th = base + (e.length / 2) * Math.sin(e.speed * t);
  } else {
    th = e.angle + e.speed * t + (Math.PI * 2 * i) / e.count;
  }
  out.x = e.x + Math.cos(th) * e.radius;
  out.y = e.y + Math.sin(th) * e.radius;
}

/** Lays a beam's path: straight or a sine about its axis, reflecting off walls. */
function tracePath(
  w: FightWorld,
  e: Effect,
  x: number,
  y: number,
  ang: number,
  length: number,
  amp: number,
  wave: number,
  reflect: number,
): void {
  const STEP = 4;
  const SAMPLE = 8;
  const max = Math.ceil(length / SAMPLE) + 4 + reflect * 2;
  if (e.path.length < max * 2) e.path = new Float64Array(max * 2 + 16);
  let dx = Math.cos(ang);
  let dy = Math.sin(ang);
  let ax = x;
  let ay = y;
  let s = 0;
  let left = reflect;
  let pts = 0;
  const put = (px: number, py: number) => {
    if (pts * 2 + 1 >= e.path.length) return;
    e.path[pts * 2] = px;
    e.path[pts * 2 + 1] = py;
    pts++;
  };
  put(x, y);
  let sinceSample = 0;
  while (s < length) {
    const nx = ax + dx * STEP;
    const ny = ay + dy * STEP;
    if (w.wallAt(nx, ny)) {
      if (left <= 0) break;
      left--;
      // Reflect off the face it crossed.
      const hx = w.wallAt(nx, ay);
      const hy = w.wallAt(ax, ny);
      if (hx || !hy) dx = -dx;
      if (hy || !hx) dy = -dy;
      put(ax, ay);
      sinceSample = 0;
      continue;
    }
    ax = nx;
    ay = ny;
    s += STEP;
    sinceSample += STEP;
    if (sinceSample >= SAMPLE) {
      sinceSample = 0;
      const off = amp > 0 && wave > 0 ? amp * Math.sin((Math.PI * 2 * s) / wave) : 0;
      put(ax - dy * off, ay + dx * off);
    }
  }
  put(ax, ay);
  e.points = pts;
}

function shoot(
  w: FightWorld,
  p: Player,
  s: number,
  wp: Weapon,
  c: number,
  ang: number,
  a: Aim,
  pick: StatusPick | null,
  i: number,
): void {
  const lob = wp.gravity > 0;
  const e = effect(w, p, s, wp, lob ? FxKind.Lob : FxKind.Shot, c);
  if (!e) return;
  setStatus(e, pick);
  e.x = p.x;
  e.y = p.y;
  e.radius = wp.radius;
  e.pierce = wp.pierce;
  e.bounce = wp.bounce;
  e.ricochets = wp.ricochet;
  e.angle = ang;
  if (lob) {
    const dx = a.x - p.x;
    const dy = a.y - p.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > wp.range) dist = wp.range;
    // Shots of a fan land on an arc around the aim point.
    if (i > 0 || wp.count > 1) dist = Math.max(24, dist);
    launchLob(e, p.x, p.y, Math.cos(ang), Math.sin(ang), Math.max(16, dist), wp);
  } else {
    e.vx = Math.cos(ang) * wp.speed;
    e.vy = Math.sin(ang) * wp.speed;
    e.speed = wp.speed;
    e.range = wp.range;
    e.until = w.tick + Math.ceil(wp.range / Math.max(0.01, wp.speed)) + 2;
  }
  void i;
}

function launchLob(
  e: Effect,
  x: number,
  y: number,
  dx: number,
  dy: number,
  dist: number,
  wp: Weapon,
): void {
  const flight = Math.max(4, Math.round(dist / Math.max(0.01, wp.speed)));
  e.x = x;
  e.y = y;
  e.tx = x + dx * dist;
  e.ty = y + dy * dist;
  e.vx = (e.tx - x) / flight;
  e.vy = (e.ty - y) / flight;
  e.gravity = wp.gravity;
  e.vz = (wp.gravity * flight) / 2;
  e.z = 0;
  e.range = flight;
  e.fireAt = 0;
  e.until = Math.max(e.until, 0);
  e.length = dist;
}

function chain(
  w: FightWorld,
  p: Player,
  s: number,
  wp: Weapon,
  c: number,
  a: Aim,
  pick: StatusPick | null,
): void {
  const first = a.target ?? nearestTo(w, a.x, a.y, wp.range, null);
  if (!first) return;
  const e = effect(w, p, s, wp, FxKind.Chain, c);
  if (!e) return;
  const fork = Math.max(1, wp.fork);
  const capacity = Math.min(48, 1 + wp.jumps * fork);
  if (e.chain.length < capacity) {
    e.chain = new Int32Array(capacity);
    e.chainParent = new Int32Array(capacity);
  }
  e.x = p.x;
  e.y = p.y;
  e.until = w.tick + FLASH_TICKS;
  setStatus(e, pick);
  e.chain[0] = first.index;
  e.chainParent[0] = -1;
  let n = 1;
  stampHit(w, first, e.stamp, 0);
  // Breadth first: depth by depth, each struck target arcs on to `fork` new ones.
  let from = 0;
  for (let depth = 0; depth < wp.jumps && n < capacity; depth++) {
    const to = n;
    for (let k = from; k < to && n < capacity; k++) {
      const src = w.monsters[e.chain[k] as number] as Monster;
      for (let f = 0; f < fork && n < capacity; f++) {
        const next = nearestTo(w, src.x, src.y, wp.jumpRange, e);
        if (!next) break;
        stampHit(w, next, e.stamp, 0);
        e.chain[n] = next.index;
        e.chainParent[n] = k;
        n++;
      }
    }
    from = to;
    if (from === n) break;
  }
  e.chainCount = n;
  for (let k = 0; k < n; k++) {
    const m = w.monsters[e.chain[k] as number] as Monster;
    let depth = 0;
    for (let q = k; (e.chainParent[q] as number) >= 0; q = e.chainParent[q] as number) depth++;
    const parent = e.chainParent[k] as number;
    const src = parent >= 0 ? (w.monsters[e.chain[parent] as number] as Monster) : p;
    hitMonster(w, p, wp, s, m, wp.falloff ** depth, src.x, src.y, wp.knock, pickOf(e), c);
  }
}

/** The nearest live monster to a point within `range`, not yet struck by `e`. */
function nearestTo(
  w: FightWorld,
  x: number,
  y: number,
  range: number,
  e: Effect | null,
): Monster | null {
  const out = w.scratch3;
  const n = w.monsterHash.query(x, y, range + 16, out);
  let best: Monster | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const m = w.monsters[out[i] as number] as Monster;
    if (!m.alive || m.dying) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const d2 = dx * dx + dy * dy;
    const rr = range + m.radius;
    if (d2 > rr * rr || d2 >= bestD) continue;
    if (e && struck(m, e.stamp)) continue;
    bestD = d2;
    best = m;
  }
  return best;
}

function struck(m: Monster, stamp: number): boolean {
  for (let i = 0; i < m.stampId.length; i++) if (m.stampId[i] === stamp) return true;
  return false;
}

function area(
  w: FightWorld,
  p: Player,
  s: number,
  wp: Weapon,
  c: number,
  kind: FxKind,
  x: number,
  y: number,
  radius: number,
  duration: number,
  interval: number,
  damage: number,
  pick: StatusPick | null,
  pull: number,
  spin: number,
): Effect | null {
  const e = effect(w, p, s, wp, kind, c);
  if (!e) return null;
  e.x = x;
  e.y = y;
  e.radius = radius;
  e.until = w.tick + Math.max(1, Math.round(duration));
  e.interval = Math.max(1, Math.round(interval));
  e.nextAt = w.tick;
  e.damage = damage;
  e.knock = 0;
  e.pull = pull;
  e.spin = spin;
  setStatus(e, pick);
  return e;
}

function dash(
  w: FightWorld,
  p: Player,
  s: number,
  wp: Weapon,
  c: number,
  a: Aim,
  pick: StatusPick | null,
): void {
  const e = effect(w, p, s, wp, FxKind.Dash, c);
  if (!e) return;
  setStatus(e, pick);
  e.x = p.x;
  e.y = p.y;
  e.angle = Math.atan2(a.dy, a.dx);
  e.vx = a.dx;
  e.vy = a.dy;
  e.width = wp.width;
  e.length = wp.distance;
  e.chainCount = 0;
  if (wp.carry && e.chain.length < 16) {
    e.chain = new Int32Array(16);
    e.chainParent = new Int32Array(16);
  }
  if (wp.duration <= 0) {
    // A blink: the farthest free point along the line, hitting everything on the way.
    let tx = p.x;
    let ty = p.y;
    for (let d = 4; d <= wp.distance; d += 4) {
      const x = p.x + a.dx * d;
      const y = p.y + a.dy * d;
      if (overlapsSolid(w.map, x, y, p.r)) break;
      tx = x;
      ty = y;
    }
    sweep(w, p, s, wp, e, p.x, p.y, tx, ty);
    p.x = snap(tx);
    p.y = snap(ty);
    e.tx = p.x;
    e.ty = p.y;
    e.until = w.tick + FLASH_TICKS;
    e.range = 0;
    if (wp.trail) trailAt(w, p, s, wp, c, p.x, p.y);
  } else {
    e.range = Math.max(1, Math.round(wp.duration));
    e.speed = wp.distance / e.range;
    e.until = w.tick + e.range;
    e.tx = p.x + a.dx * wp.distance;
    e.ty = p.y + a.dy * wp.distance;
  }
}

function trailAt(
  w: FightWorld,
  p: Player,
  s: number,
  wp: Weapon,
  c: number,
  x: number,
  y: number,
): void {
  const t = wp.trail;
  if (!t) return;
  area(
    w,
    p,
    s,
    wp,
    c,
    FxKind.Trail,
    x,
    y,
    t.radius,
    t.duration,
    t.interval,
    t.damage,
    t.status,
    t.pull,
    t.spin,
  );
}

/** Hits every monster within the dash's width of a segment, once per dash. */
function sweep(
  w: FightWorld,
  p: Player,
  s: number,
  wp: Weapon,
  e: Effect,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const half = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) / 2;
  const out = w.scratch3;
  const n = w.monsterHash.query(mx, my, half + wp.width + 16, out);
  for (let i = 0; i < n; i++) {
    const m = w.monsters[out[i] as number] as Monster;
    if (!m.alive || m.dying) continue;
    if (segDist(m.x, m.y, x0, y0, x1, y1) > wp.width / 2 + m.radius) continue;
    if (stampHit(w, m, e.stamp, 0)) continue;
    hitMonster(w, p, wp, s, m, 1, x0, y0, wp.carry ? 0 : wp.knock, pickOf(e), e.cast);
    if (wp.carry && m.alive && !m.dying && e.chainCount < e.chain.length) {
      e.chain[e.chainCount++] = m.index;
    }
  }
}

/** Distance from a point to a segment. */
export function segDist(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
  t = t < 0 ? 0 : Math.min(t, 1);
  const cx = x0 + dx * t - px;
  const cy = y0 + dy * t - py;
  return Math.sqrt(cx * cx + cy * cy);
}

/** Whether a point lies inside a cone of half-angle `half` and `range` about `angle`. */
function inCone(
  m: Monster,
  x: number,
  y: number,
  angle: number,
  half: number,
  range: number,
): boolean {
  const dx = m.x - x;
  const dy = m.y - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > range + m.radius) return false;
  if (d < m.radius + 2) return true;
  let diff = Math.atan2(dy, dx) - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= half + Math.asin(Math.min(1, m.radius / d));
}

const body = { x: 0, y: 0 };

/** Every player effect advances one tick and lands its hits. */
export function stepEffects(w: FightWorld): void {
  const tick = w.tick;
  for (const e of w.effects) {
    if (!e.alive || e.owner < 0) continue;
    const p = w.players[e.owner] as Player;
    const wp = e.weapon as Weapon;
    if (!p.joined) {
      w.endFx(e);
      continue;
    }
    switch (e.kind) {
      case FxKind.Orbit: {
        const anchor = w.players[e.source];
        if (!anchor?.joined || anchor.down) {
          w.endFx(e);
          break;
        }
        e.x = anchor.x;
        e.y = anchor.y;
        const t = tick - e.born;
        for (let i = 0; i < e.count; i++) {
          orbitBody(e, i, t, body);
          const out = w.scratch3;
          const n = w.monsterHash.query(body.x, body.y, e.width + 28, out);
          for (let k = 0; k < n; k++) {
            const m = w.monsters[out[k] as number] as Monster;
            if (!m.alive || m.dying) continue;
            const dx = m.x - body.x;
            const dy = m.y - body.y;
            const rr = e.width + m.radius;
            if (dx * dx + dy * dy > rr * rr) continue;
            if (stampHit(w, m, e.stamp + i, e.interval)) continue;
            hitMonster(w, p, wp, e.slot, m, e.damage, e.x, e.y, e.knock, pickOf(e), e.cast);
          }
          if (wp.block) blockShots(w, body.x, body.y, e.width);
        }
        if (tick >= e.until) w.endFx(e);
        break;
      }
      case FxKind.Beam: {
        for (let i = 0; i + 1 < e.points; i++) {
          const x0 = e.path[i * 2] as number;
          const y0 = e.path[i * 2 + 1] as number;
          const x1 = e.path[i * 2 + 2] as number;
          const y1 = e.path[i * 2 + 3] as number;
          const mx = (x0 + x1) / 2;
          const my = (y0 + y1) / 2;
          const half = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) / 2;
          const out = w.scratch3;
          const n = w.monsterHash.query(mx, my, half + e.width + 16, out);
          for (let k = 0; k < n; k++) {
            const m = w.monsters[out[k] as number] as Monster;
            if (!m.alive || m.dying) continue;
            if (segDist(m.x, m.y, x0, y0, x1, y1) > e.width / 2 + m.radius) continue;
            if (stampHit(w, m, e.stamp, 0)) continue;
            hitMonster(w, p, wp, e.slot, m, e.damage, e.x, e.y, e.knock, pickOf(e), e.cast);
          }
        }
        if (tick >= e.until) w.endFx(e);
        break;
      }
      case FxKind.Shot:
        stepShot(w, p, wp, e);
        break;
      case FxKind.Lob:
        stepLob(w, p, wp, e);
        break;
      case FxKind.Chain:
        if (tick >= e.until) w.endFx(e);
        break;
      case FxKind.Cone: {
        if (e.follow) {
          e.x = p.x;
          e.y = p.y;
        }
        if (tick >= e.fireAt && tick < e.fireAt + e.interval) {
          const t = tick - e.fireAt;
          // Pulse k lands on tick floor(k × duration ÷ hits).
          for (let k = 0; k < e.count; k++) {
            if (Math.floor((k * e.interval) / e.count) !== t) continue;
            const out = w.scratch3;
            const n = w.monsterHash.query(e.x, e.y, e.length + 16, out);
            let hit = false;
            for (let q = 0; q < n; q++) {
              const m = w.monsters[out[q] as number] as Monster;
              if (!m.alive || m.dying) continue;
              if (!inCone(m, e.x, e.y, e.angle, e.width, e.length)) continue;
              if (stampHit(w, m, e.stamp + k, 0)) continue;
              hitMonster(w, p, wp, e.slot, m, e.damage, e.x, e.y, e.knock, pickOf(e), e.cast);
              hit = true;
            }
            if (hit && wp.growPerHit > 0 && e.damage === 1) {
              p.grow[e.slot] = Math.min(wp.growMax, (p.grow[e.slot] as number) + wp.growPerHit);
              p.growUntil[e.slot] = tick + wp.growWindow;
            }
          }
        }
        if (tick >= e.until) w.endFx(e);
        break;
      }
      case FxKind.Mark: {
        if (tick === e.fireAt) {
          strikeMark(w, p, wp, e);
          if (wp.trail) trailAt(w, p, e.slot, wp, e.cast, e.x, e.y);
          if (e.repeats > 0) {
            e.repeats--;
            e.fireAt += e.interval;
            e.stamp += 1;
          }
        }
        if (tick >= e.until) w.endFx(e);
        break;
      }
      case FxKind.Wave:
        stepWave(w, p, wp, e);
        break;
      case FxKind.Zone:
      case FxKind.Pool:
      case FxKind.Trail:
        stepArea(w, p, wp, e);
        break;
      case FxKind.Dash:
        stepDash(w, p, wp, e);
        break;
    }
  }
}

/** Antibodies destroy enemy shots they touch. */
function blockShots(w: FightWorld, x: number, y: number, r: number): void {
  for (const s of w.effects) {
    if (!s.alive || s.kind !== FxKind.EnemyShot) continue;
    const dx = s.x - x;
    const dy = s.y - y;
    const rr = r + s.radius;
    if (dx * dx + dy * dy <= rr * rr) w.endFx(s);
  }
}

function stepShot(w: FightWorld, p: Player, wp: Weapon, e: Effect): void {
  const n = Math.max(1, Math.ceil(e.speed / Math.max(3, e.radius)));
  const sx = e.vx / n;
  const sy = e.vy / n;
  for (let k = 0; k < n; k++) {
    let nx = e.x + sx;
    let ny = e.y + sy;
    if (w.wallAt(nx, ny)) {
      if (e.bounce <= 0) {
        w.endFx(e);
        break;
      }
      e.bounce--;
      const hx = w.wallAt(nx, e.y);
      const hy = w.wallAt(e.x, ny);
      if (hx || !hy) e.vx = -e.vx;
      if (hy || !hx) e.vy = -e.vy;
      e.angle = Math.atan2(e.vy, e.vx);
      nx = e.x;
      ny = e.y;
      redirected(w, e);
      break;
    }
    e.x = nx;
    e.y = ny;
    e.range -= e.speed / n;
    const out = w.scratch3;
    const found = w.monsterHash.query(e.x, e.y, e.radius + 28, out);
    for (let q = 0; q < found && e.alive; q++) {
      const m = w.monsters[out[q] as number] as Monster;
      if (!m.alive || m.dying) continue;
      const dx = m.x - e.x;
      const dy = m.y - e.y;
      const rr = e.radius + m.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (stampHit(w, m, e.stamp, 0)) continue;
      hitMonster(w, p, wp, e.slot, m, e.damage, e.x - e.vx, e.y - e.vy, e.knock, pickOf(e), e.cast);
      e.hitSomething = true;
      if (e.pierce > 0) {
        e.pierce--;
        continue;
      }
      if (e.ricochets > 0 && ricochet(w, p, wp, e, m)) continue;
      w.endFx(e);
    }
    if (!e.alive) break;
    if (e.range <= 0) {
      w.endFx(e);
      break;
    }
  }
  if (!e.alive && e.hitSomething) p.burstHit[e.slot] = 1;
}

/** 암석의 순환: after a hit the shot flies on to a new target with the next status of the cycle. */
function ricochet(w: FightWorld, p: Player, wp: Weapon, e: Effect, from: Monster): boolean {
  const next = nearestTo(w, from.x, from.y, 96, e);
  if (!next) return false;
  e.ricochets--;
  const dx = next.x - e.x;
  const dy = next.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  e.vx = (dx / d) * e.speed;
  e.vy = (dy / d) * e.speed;
  e.angle = Math.atan2(e.vy, e.vx);
  e.range = Math.max(e.range, d + 8);
  const list = wp.statuses;
  if (list.length > 1) {
    p.statusTurn[e.slot] = ((p.statusTurn[e.slot] as number) + 1) % list.length;
    setStatus(e, list[p.statusTurn[e.slot] as number] as StatusPick);
  }
  redirected(w, e);
  return true;
}

/** A shot changed course in a way the client cannot foresee: it is sent again from here. */
function redirected(w: FightWorld, e: Effect): void {
  e.born = w.tick;
  e.fx = w.allocFx();
}

function stepLob(w: FightWorld, p: Player, wp: Weapon, e: Effect): void {
  e.x += e.vx;
  e.y += e.vy;
  e.z += e.vz;
  e.vz -= e.gravity;
  e.range--;
  if (e.range > 0) return;
  // Landed: everything under the impact, a pool, then maybe a hop onward.
  e.x = e.tx;
  e.y = e.ty;
  e.z = 0;
  const out = w.scratch3;
  const r = Math.max(wp.impactRadius, e.radius);
  const n = w.monsterHash.query(e.x, e.y, r + 28, out);
  for (let q = 0; q < n; q++) {
    const m = w.monsters[out[q] as number] as Monster;
    if (!m.alive || m.dying) continue;
    const dx = m.x - e.x;
    const dy = m.y - e.y;
    const rr = r + m.radius;
    if (dx * dx + dy * dy > rr * rr) continue;
    if (stampHit(w, m, e.stamp, 0)) continue;
    hitMonster(w, p, wp, e.slot, m, e.damage, e.x, e.y, e.knock, pickOf(e), e.cast);
  }
  const pool = wp.pool;
  if (pool) poolAt(w, p, wp, e, pool.radius);
  if (e.bounce > 0) {
    e.bounce--;
    e.stamp = w.nextStamp;
    w.nextStamp += STAMP_BLOCK;
    const d = Math.max(16, e.length / 2);
    launchLob(e, e.x, e.y, Math.cos(e.angle), Math.sin(e.angle), d, wp);
    redirected(w, e);
    return;
  }
  w.endFx(e);
}

/** A pool where a flask lands; with 왕수's merge, a pool touching another joins it. */
function poolAt(w: FightWorld, p: Player, wp: Weapon, e: Effect, radius: number): void {
  const pool = wp.pool;
  if (!pool) return;
  if (wp.merge) {
    for (const o of w.effects) {
      if (!o.alive || o.kind !== FxKind.Pool || o.owner !== p.index || o.weapon !== wp) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const rr = o.radius + radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      // The merged pool covers both and keeps the longer time.
      const d = Math.sqrt(dx * dx + dy * dy);
      const r2 = Math.max(o.radius, (d + o.radius + radius) / 2);
      o.until = Math.max(o.until, w.tick + pool.duration);
      if (r2 > o.radius + 0.5) {
        o.x = (o.x + e.x) / 2;
        o.y = (o.y + e.y) / 2;
        o.radius = Math.min(r2, radius * 3);
        redirected(w, o);
      }
      return;
    }
  }
  area(
    w,
    p,
    e.slot,
    wp,
    e.cast,
    FxKind.Pool,
    e.x,
    e.y,
    radius,
    pool.duration,
    pool.interval,
    pool.damage,
    pool.status,
    pool.pull,
    0,
  );
}

function strikeMark(w: FightWorld, p: Player, wp: Weapon, e: Effect): void {
  const out = w.scratch3;
  const line = e.count === 1;
  const reach = line ? e.length + e.width : e.radius;
  const cx = line ? e.x + (Math.cos(e.angle) * e.length) / 2 : e.x;
  const cy = line ? e.y + (Math.sin(e.angle) * e.length) / 2 : e.y;
  const n = w.monsterHash.query(cx, cy, reach + 28, out);
  const ex = e.x + Math.cos(e.angle) * e.length;
  const ey = e.y + Math.sin(e.angle) * e.length;
  for (let q = 0; q < n; q++) {
    const m = w.monsters[out[q] as number] as Monster;
    if (!m.alive || m.dying) continue;
    if (line) {
      if (segDist(m.x, m.y, e.x, e.y, ex, ey) > e.width / 2 + m.radius) continue;
    } else {
      const dx = m.x - e.x;
      const dy = m.y - e.y;
      const rr = e.radius + m.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
    }
    if (stampHit(w, m, e.stamp, 0)) continue;
    hitMonster(w, p, wp, e.slot, m, e.damage, cx, cy, e.knock, pickOf(e), e.cast);
  }
}

function stepWave(w: FightWorld, p: Player, wp: Weapon, e: Effect): void {
  const tick = w.tick;
  if (tick < e.fireAt) return;
  const t = tick - e.fireAt;
  const outTicks = Math.ceil(e.radius / Math.max(0.01, e.speed));
  let r: number;
  let back = false;
  if (t <= outTicks) r = Math.min(e.radius, e.speed * t);
  else if (t <= outTicks + e.interval) r = e.radius;
  else {
    back = true;
    r = Math.max(0, e.radius - e.speed * (t - outTicks - e.interval));
  }
  if (back && e.pull <= 0) {
    w.endFx(e);
    return;
  }
  const out = w.scratch3;
  const n = w.monsterHash.query(e.x, e.y, r + e.width + 16, out);
  for (let q = 0; q < n; q++) {
    const m = w.monsters[out[q] as number] as Monster;
    if (!m.alive || m.dying) continue;
    const dx = m.x - e.x;
    const dy = m.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(d - r) > e.width / 2 + m.radius) continue;
    if (!back) {
      if (stampHit(w, m, e.stamp, 0)) continue;
      hitMonster(w, p, wp, e.slot, m, e.damage, e.x, e.y, e.knock, pickOf(e), e.cast);
    } else {
      if (stampHit(w, m, e.stamp + 1, 0)) continue;
      pullToward(m, e.x, e.y, e.pull);
    }
  }
  if (back && r <= 0) w.endFx(e);
  else if (tick >= e.until) w.endFx(e);
}

/** A pull: a knock toward (x, y), or away for a negative value. */
function pullToward(m: Monster, x: number, y: number, value: number): void {
  const dx = x - m.x;
  const dy = y - m.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 2) return;
  const v = value / m.mass / 20;
  m.kx += (dx / d) * v;
  m.ky += (dy / d) * v;
}

function stepArea(w: FightWorld, p: Player, wp: Weapon, e: Effect): void {
  const tick = w.tick;
  if (e.follow) {
    e.x = p.x;
    e.y = p.y;
  }
  if (e.growth > 0) e.radius += e.growth;
  if (wp.allies && e.kind === FxKind.Zone) {
    if (tick >= e.nextAt) {
      e.nextAt = tick + e.interval;
      const until = e.nextAt + 1;
      const boost = wp.buffAttackSpeed * wp.aura;
      const cool = wp.buffCooldown * wp.aura;
      for (const q of w.players) {
        if (!q.joined || q.down) continue;
        if (q !== p && (!p.party || q.party !== p.party)) continue;
        const dx = q.x - e.x;
        const dy = q.y - e.y;
        if (dx * dx + dy * dy > e.radius * e.radius) continue;
        q.attackSpeed = Math.max(q.attackSpeed, boost);
        q.cooldownBuff = Math.max(q.cooldownBuff, cool);
        q.buffUntil = Math.max(q.buffUntil, until);
      }
    }
    if (tick >= e.until) w.endFx(e);
    return;
  }
  const pulse = tick >= e.nextAt;
  const strike = e.fireAt > 0 && tick === e.fireAt;
  if (pulse || strike) {
    if (pulse) e.nextAt = tick + e.interval;
    const out = w.scratch3;
    const n = w.monsterHash.query(e.x, e.y, e.radius + 28, out);
    const stamp = strike ? e.stamp + 2 : 0;
    for (let q = 0; q < n; q++) {
      const m = w.monsters[out[q] as number] as Monster;
      if (!m.alive || m.dying) continue;
      const dx = m.x - e.x;
      const dy = m.y - e.y;
      const rr = e.radius + m.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (pulse) {
        if (e.damage > 0) {
          hitMonster(w, p, wp, e.slot, m, e.damage, e.x, e.y, 0, pickOf(e), e.cast);
        } else if (e.status >= 0) {
          const pick = pickOf(e);
          if (pick && w.random.chance(pick.chance)) selfOr(w, p, wp, m, pick);
        }
        if (e.pull !== 0 && m.alive) pullToward(m, e.x, e.y, e.pull);
      }
      if (strike && !stampHit(w, m, stamp, 0)) {
        hitMonster(
          w,
          p,
          wp,
          e.slot,
          m,
          wp.followDamage,
          e.x,
          e.y,
          wp.knock,
          wp.followStatus,
          e.cast,
        );
      }
    }
  }
  if (tick >= e.until) w.endFx(e);
}

function selfOr(w: FightWorld, p: Player, wp: Weapon, m: Monster, pick: StatusPick): void {
  if (pick.self) selfStatus(w, p, pick.status, wp);
  else hitMonster(w, p, wp, -1, m, 0, m.x, m.y, 0, pick, 0);
}

function stepDash(w: FightWorld, p: Player, wp: Weapon, e: Effect): void {
  if (e.range <= 0) {
    if (w.tick >= e.until) w.endFx(e);
    return;
  }
  if (p.down) {
    w.endFx(e);
    return;
  }
  const x0 = p.x;
  const y0 = p.y;
  const at = slide(w.map, p.x, p.y, e.vx * e.speed, e.vy * e.speed, p.r);
  p.x = snap(at.x);
  p.y = snap(at.y);
  sweep(w, p, e.slot, wp, e, x0, y0, p.x, p.y);
  // What it carries rides just ahead of it.
  for (let i = 0; i < e.chainCount; i++) {
    const m = w.monsters[e.chain[i] as number] as Monster;
    if (!m.alive || m.dying) continue;
    m.x = p.x + e.vx * (p.r + m.radius + 2) + ((i % 3) - 1) * m.radius * -e.vy;
    m.y = p.y + e.vy * (p.r + m.radius + 2) + ((i % 3) - 1) * m.radius * e.vx;
    m.kx = 0;
    m.ky = 0;
  }
  e.range--;
  e.x = p.x;
  e.y = p.y;
  if (e.range > 0) return;
  // Flung at the end.
  for (let i = 0; i < e.chainCount; i++) {
    const m = w.monsters[e.chain[i] as number] as Monster;
    if (!m.alive || m.dying) continue;
    pullToward(m, m.x - e.vx * 10, m.y - e.vy * 10, -wp.knock);
    m.launchBy = p.index;
    m.launchShare = wp.elastic ? Math.max(p.kit.collisionShare, 0.6) : p.kit.collisionShare;
    m.launchSpeed = Math.sqrt(m.kx * m.kx + m.ky * m.ky);
    m.chain = 0;
    m.chainMax = wp.elastic ? 6 : 3;
  }
  if (wp.trail) trailAt(w, p, e.slot, wp, e.cast, p.x, p.y);
  w.endFx(e);
}

// ── Minions (증식) ──────────────────────────────────────────────────────────

/** 0 plain, 1 killer, 2 bursting, 3 healer. */
export const MinionRole = { Plain: 0, Killer: 1, Burster: 2, Healer: 3 } as const;

function spawnMinion(
  w: FightWorld,
  p: Player,
  s: number,
  wp: Weapon,
  x: number,
  y: number,
  role: number,
): Minion | null {
  const m = w.freeMinion();
  if (!m) return null;
  m.alive = true;
  m.entity = w.allocEntity();
  m.owner = p.index;
  m.weapon = wp;
  m.slot = s;
  m.x = x;
  m.y = y;
  m.vx = 0;
  m.vy = 0;
  m.until = w.tick + Math.max(1, Math.round(wp.lifetime));
  m.divideAt = wp.divideEvery > 0 ? w.tick + Math.round(wp.divideEvery) : 0;
  m.role = role;
  m.stamp = w.nextStamp;
  w.nextStamp += STAMP_BLOCK;
  m.born = w.tick;
  m.dirty = 1;
  p.minions++;
  return m;
}

/** Minions hunt near their owner, bite on contact, divide while under the cap. */
export function stepMinions(w: FightWorld): void {
  const tick = w.tick;
  for (const n of w.minions) {
    if (!n.alive) continue;
    const p = w.players[n.owner] as Player;
    const wp = n.weapon as Weapon;
    if (!p.joined || tick >= n.until) {
      w.killMinion(n);
      continue;
    }
    // Hunt the nearest monster within the leash, else heel.
    let target: Monster | null = null;
    let best = Number.POSITIVE_INFINITY;
    const out = w.scratch3;
    const found = w.monsterHash.query(n.x, n.y, 96, out);
    for (let i = 0; i < found; i++) {
      const m = w.monsters[out[i] as number] as Monster;
      if (!m.alive || m.dying) continue;
      const ox = m.x - p.x;
      const oy = m.y - p.y;
      if (ox * ox + oy * oy > LEASH * LEASH) continue;
      const dx = m.x - n.x;
      const dy = m.y - n.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        target = m;
      }
    }
    let gx: number;
    let gy: number;
    if (target && n.role !== MinionRole.Healer) {
      gx = target.x;
      gy = target.y;
    } else {
      const a = (n.index * 2.4 + tick * 0.05) % (Math.PI * 2);
      gx = p.x + Math.cos(a) * 18;
      gy = p.y + Math.sin(a) * 18;
    }
    const dx = gx - n.x;
    const dy = gy - n.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const speed = wp.speed * (1 + p.attackSpeed * 0.5);
    const tvx = d > 1 ? (dx / d) * speed : 0;
    const tvy = d > 1 ? (dy / d) * speed : 0;
    n.vx += (tvx - n.vx) * 0.4;
    n.vy += (tvy - n.vy) * 0.4;
    const at = slide(w.map, n.x, n.y, n.vx, n.vy, wp.radius);
    n.x = at.x;
    n.y = at.y;
    if (target) {
      const tx = target.x - n.x;
      const ty = target.y - n.y;
      const rr = wp.radius + target.radius + 1;
      if (tx * tx + ty * ty <= rr * rr) {
        const interval = Math.max(1, Math.round(wp.hitInterval / (1 + p.attackSpeed)));
        if (!stampHit(w, target, n.stamp, interval)) {
          if (n.role === MinionRole.Burster) {
            blast(w, p, wp, n.x, n.y, 24, wp.hit * 3, wp.knock * 2, null, 0);
            w.killMinion(n);
            continue;
          }
          const coef = n.role === MinionRole.Killer ? 2 : 1;
          hitMonster(w, p, wp, n.slot, target, coef, n.x, n.y, wp.knock, null, 0);
        }
      }
    }
    if (n.role === MinionRole.Healer && tick % 20 === 0 && p.hp < p.kit.maxHp && !p.down) {
      p.hp = Math.min(p.kit.maxHp, p.hp + 0.01 * p.kit.maxHp * wp.healing);
    }
    if (n.divideAt > 0 && tick >= n.divideAt) {
      n.divideAt = tick + Math.round(wp.divideEvery);
      if (p.minions < wp.cap + p.kit.minionCap) {
        const role = wp.specialize ? specializeFor(w, p, n) : MinionRole.Plain;
        const c = spawnMinion(w, p, n.slot, wp, n.x + 6, n.y, role);
        if (c) c.until = Math.max(c.until, n.until);
      }
    }
  }
}

/** 줄기세포: a dividing cell becomes what its surroundings need. */
function specializeFor(w: FightWorld, p: Player, n: Minion): number {
  if (p.hp < p.kit.maxHp / 2) return MinionRole.Healer;
  const out = w.scratch3;
  const found = w.monsterHash.query(n.x, n.y, 64, out);
  let swarm = 0;
  for (let i = 0; i < found; i++) {
    const m = w.monsters[out[i] as number] as Monster;
    if (!m.alive) continue;
    if (m.elite || m.rank > 1) return MinionRole.Killer;
    if (m.kind.packMax > 0) swarm++;
  }
  return swarm >= 3 ? MinionRole.Burster : MinionRole.Plain;
}

/** Dead or departed monsters leave their carried positions. */
export function forgetMonster(w: FightWorld, m: Monster): void {
  removeMonster(w, m);
}

export { Mode };
