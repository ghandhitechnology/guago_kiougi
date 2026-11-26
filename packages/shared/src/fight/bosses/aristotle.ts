/**
 * 아리스토텔레스, era boss of Page 1 (PLAN §5, §10 raid), lecturing four 논제 at the 리케이온.
 * Each 논제 is one of his wrong ideas made into the arena's rule, and each way through is what
 * replaced it:
 *
 * 1. 무거운 것이 더 빨리 떨어진다. Boulders and feathers drop on the class; the boulder's mark
 *    darkens fast and the feather's drifts in wide and faint, as if one fell faster. They land on
 *    the same tick. A class that dodges only the boulder learns Galileo the hard way.
 * 2. 모든 것은 제자리로 돌아간다. One element zone at a time lights and drags whoever stands in
 *    it toward its natural place: earth and water down, air and fire up. Holding a zone anyway,
 *    together, is the objective; nothing has a natural place it must return to.
 * 3. 움직이는 것은 무언가가 민다. He takes damage only while being pushed (walked into, or knocked
 *    back), and stops the moment the pushing stops, exactly as he says.
 * 4. 자연에 빈 곳은 없다. Until a student slides the marble block across the ice and it keeps
 *    going with nobody pushing: inertia. Each slide across stuns him and lets the class through.
 *
 * Every 논제 has its stele: breaking it strips the 반론 불가 shield. In 토론 시간 he uses the full
 * mechanic set: falls and zones join whatever 논제 is on.
 */

import { KNOCK_DECAY } from "../../combat.ts";
import { TICK_RATE_HZ } from "../../constants.ts";
import { slide, snap } from "../../movement.ts";
import type { Boss, BossBrain } from "../boss.ts";
import { BOSS_PLAYERS, ObjectiveKind, TellKind } from "../boss.ts";
import { monsterHit } from "../damage.ts";
import { type FightWorld, type Monster, MState, type Player } from "../world.ts";

/** The element zones, each dragging toward its natural place (+1 down, -1 up), px a tick. */
const ZONES = [
  { mark: "zone-earth", dy: 1, pull: 1.8 },
  { mark: "zone-water", dy: 1, pull: 1.2 },
  { mark: "zone-air", dy: -1, pull: 1.2 },
  { mark: "zone-fire", dy: -1, pull: 1.8 },
] as const;
/** A zone's ring on the ground, as the map's zone rect draws it. */
const ZONE_RX = 40;
const ZONE_RY = 26;
/** Ticks the lit zone must hold its players to count as held, and ticks it stays lit. */
const HOLD_TICKS = 120;
const ZONE_TICKS = 400;
/** His speed from a push that counts as moving, px a tick, and how fast a push dies on him. */
const MOVING = 0.3;
const FRICTION = 0.3;
/** Share of a body's walk into him (or the block) that it passes on. */
const BODY_PUSH = 0.5;
/** Pushed this far in all, he concedes an objective to whoever pushed last. */
const PUSH_STEP = 240;
/** Ticks he is stunned after the block slides across. */
const STUN = 500;
const STELE_BACK = 400;
/**
 * The frozen pool around the `ice` mark, as the band the block's centre may take on it: the mark
 * is the centre of a tile in the pool's lower half, the pool four tiles tall.
 */
const POOL_UP = 26;
const POOL_DOWN = 10;
/** Its rim gives a block back this share of the speed it hit it with. */
const RIM = 0.5;
/** Knocked off the ice and left lying, the block is set back on it after this many ticks. */
const BLOCK_BACK = 100;
/** Below this the knockback step stops a body outright, px a tick (`damage.ts`). */
const STILL = 2 / TICK_RATE_HZ;
const DROP_WARN = 36;
const SLAM_WARN = 24;
/** Ticks an announcement or a slam holds its animation. */
const ACT = 30;

// Brain numbers.
const NEXT_DROP = 0;
const LIT = 1;
const HELD = 2;
const NEXT_ZONE = 3;
const STELE = 4;
const STELE_ENTITY = 5;
const STELE_AT = 6;
const BLOCK = 7;
const BLOCK_ENTITY = 8;
const BLOCK_VX = 9;
const BLOCK_VY = 10;
const STUNNED = 11;
const MOVED = 12;
const TRAVEL = 13;
const PUSHER = 14;
const NEXT_SLAM = 15;
const NEXT_FALL_CUE = 16;
const NEXT_ZONE_CUE = 17;
const HOME_X = 18;
const HOME_Y = 19;
const NEXT_PUSH_CUE = 20;
const BLOCK_PUSHER = 21;
const BLOCK_OFF = 22;
/** The corner the next wave of element spirits comes from, outside 논제 2. */
const ADD_ZONE = 23;
/** Each corner's spirit, in `ZONES` order. */
const SPIRITS = ["element-earth", "element-water", "element-air", "element-fire"] as const;

/** Mode bits in the boss record: the lit zone + 1 (0–4), moving, stunned. */
export const AristotleMode = { Zone: 7, Moving: 8, Stunned: 16 } as const;

export const aristotle: BossBrain = {
  start(b, w) {
    b.n[HOME_X] = b.core.x;
    b.n[HOME_Y] = b.core.y;
    b.n[STELE] = -1;
    b.n[BLOCK] = -1;
    b.n[LIT] = -1;
    b.n[PUSHER] = -1;
    b.n[BLOCK_PUSHER] = -1;
    b.n[NEXT_SLAM] = w.tick + 80;
  },

  /**
   * Each element's spirit comes out of its own corner: the lit one in 논제 2, every corner in
   * turn otherwise.
   */
  addAt(b, w, n) {
    const lit = b.n[LIT] as number;
    const z = lit >= 0 ? lit : ((b.n[ADD_ZONE] as number) + n) % ZONES.length;
    if (lit < 0 && n === 0) b.n[ADD_ZONE] = ((b.n[ADD_ZONE] as number) + 1) % ZONES.length;
    const zone = ZONES[z] as (typeof ZONES)[number];
    const at = b.mark(w, zone.mark, b.core.x, b.core.y);
    const id = SPIRITS[z];
    return { x: at.x, y: at.y, kind: w.rules.monsters.findIndex((k) => k.id === id) };
  },

  phase(b, w) {
    b.n[STELE_AT] = w.tick;
    b.n[NEXT_DROP] = w.tick + 40;
    b.n[NEXT_ZONE] = w.tick + 20;
    b.n[LIT] = -1;
    b.n[HELD] = 0;
    b.n[STUNNED] = 0;
    b.n[MOVED] = 0;
    b.n[TRAVEL] = 0;
    b.core.kx = 0;
    b.core.ky = 0;
    // Pushing him is the 논제 3 way through: his body does not hurt those who lean on it.
    b.core.contact = b.phase === 3 ? 0 : monsterHit(b.core, b.core.kind.damage);
    // A new 논제 stands its own stele; the old one crumbles.
    const old = monster(w, b.n[STELE] as number, b.n[STELE_ENTITY] as number);
    if (old) old.gone = true;
    b.n[STELE] = -1;
    if (b.phase === 4) standBlock(b, w);
    act(b, w, MState.Cast, ACT);
  },

  step(b, w) {
    const tick = w.tick;
    const phase = b.phase;
    const all = b.debate;
    if (b.core.state !== MState.Move && tick >= b.core.stateUntil) b.setState(b.core, MState.Idle);
    stele(b, w);
    if (phase === 1 || all) drops(b, w);
    if (phase === 2 || all) zones(b, w);
    else b.n[LIT] = -1;
    if (phase === 3) pushed(b, w);
    else home(b);
    if (phase === 4) slide4(b, w);
    if (tick >= (b.n[NEXT_SLAM] as number)) {
      b.n[NEXT_SLAM] = tick + (all ? 60 : 100);
      b.tell(w, TellKind.Slam, b.core.x, b.core.y, 80, 0, 0, 80, tick + SLAM_WARN, 1, 200);
      act(b, w, MState.Slam, SLAM_WARN + 6);
    }
    const stunned = tick < (b.n[STUNNED] as number);
    b.mode =
      ((b.n[LIT] as number) + 1) |
      ((b.n[MOVED] as number) > 0 ? AristotleMode.Moving : 0) |
      (stunned ? AristotleMode.Stunned : 0);
    const through = phase === 3 ? (b.n[MOVED] as number) > 0 : phase === 4 ? stunned : true;
    for (const p of w.players)
      if (p.index < BOSS_PLAYERS) b.open[p.index] = through && p.joined ? 1 : 0;
  },

  gate(b, w) {
    if (b.phase === 3) return (b.n[MOVED] as number) > 0 ? 1 : 0;
    if (b.phase === 4) return w.tick < (b.n[STUNNED] as number) ? 1 : 0;
    return 1;
  },

  pushable(b, part) {
    return b.phase === 3 && part === b.core;
  },

  objective(b, w, m, by) {
    if (m.index === b.n[STELE] && m.entity === b.n[STELE_ENTITY]) {
      b.complete(w, ObjectiveKind.Break, by, m.entity);
      b.n[STELE] = -1;
      b.n[STELE_AT] = w.tick + STELE_BACK;
    }
  },
};

/** He acts out `state` for `ticks`, then goes back to lecturing. */
function act(b: Boss, w: FightWorld, state: MState, ticks: number): void {
  b.setState(b.core, state);
  b.core.stateUntil = w.tick + ticks;
}

function monster(w: FightWorld, index: number, entity: number): Monster | null {
  const m = index >= 0 ? w.monsters[index] : undefined;
  return m?.alive && !m.dying && m.entity === entity ? m : null;
}

/** The 논제's stele stands until broken, and is raised again a while later. */
function stele(b: Boss, w: FightWorld): void {
  if (monster(w, b.n[STELE] as number, b.n[STELE_ENTITY] as number)) return;
  if (w.tick < (b.n[STELE_AT] as number)) return;
  const at = b.mark(w, `stele-${b.phase}`, b.core.x, b.core.y + 140);
  const s = b.addObject(w, 0, at.x, at.y);
  if (!s) return;
  b.n[STELE] = s.index;
  b.n[STELE_ENTITY] = s.entity;
}

/**
 * A boulder and a feather for a few players chosen by the seeded random (more in a bigger class):
 * they look different and land on the same tick.
 */
function drops(b: Boss, w: FightWorld): void {
  const tick = w.tick;
  if (tick < (b.n[NEXT_DROP] as number)) return;
  b.n[NEXT_DROP] = tick + (b.debate ? 40 : 60);
  let standing = 0;
  for (const p of w.players) if (p.joined && !p.down) standing++;
  if (standing === 0) return;
  const want = Math.min(8, 1 + Math.floor(standing / 5), standing);
  const land = tick + DROP_WARN;
  let seen = 0;
  let given = 0;
  for (const p of w.players) {
    if (!p.joined || p.down) continue;
    // Selection sampling: each of the rest is taken with the share still wanted.
    if (w.random.next() * (standing - seen++) >= want - given) continue;
    given++;
    const a = w.random.next() * Math.PI * 2;
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    b.tell(w, TellKind.Boulder, p.x + ax * 10, p.y + ay * 10, 24, 0, 0, 24, land, 1);
    b.tell(w, TellKind.Feather, p.x - ax * 26, p.y - ay * 26, 48, 0, 0, 48, land, 0.6);
  }
  if (given > 0 && tick >= (b.n[NEXT_FALL_CUE] as number)) {
    b.n[NEXT_FALL_CUE] = tick + 240;
    b.cue(w, "fall", -1, b.core.x, b.core.y);
  }
}

function inZone(p: Player, x: number, y: number): boolean {
  const dx = (p.x - x) / ZONE_RX;
  const dy = (p.y - y) / ZONE_RY;
  return dx * dx + dy * dy <= 1;
}

/**
 * One element zone lit at a time drags whoever stands in it toward its natural place. Enough of
 * the class standing in it anyway, long enough, holds it, and the next lights.
 */
function zones(b: Boss, w: FightWorld): void {
  const tick = w.tick;
  if (tick >= (b.n[NEXT_ZONE] as number)) {
    b.n[LIT] = ((b.n[LIT] as number) + 1 + ZONES.length) % ZONES.length;
    b.n[HELD] = 0;
    b.n[NEXT_ZONE] = tick + ZONE_TICKS;
  }
  const z = ZONES[b.n[LIT] as number];
  if (!z) return;
  const c = b.mark(w, z.mark, b.core.x, b.core.y);
  let inside = 0;
  let joined = 0;
  for (const p of w.players) {
    if (!p.joined) continue;
    joined++;
    if (p.down || !inZone(p, c.x, c.y)) continue;
    inside++;
    const at = slide(w.map, p.x, p.y, 0, z.dy * z.pull, p.r);
    p.y = snap(at.y);
    if (tick >= (b.n[NEXT_ZONE_CUE] as number)) {
      b.n[NEXT_ZONE_CUE] = tick + 300;
      b.cue(w, "element-zone", p.index, p.x, p.y);
    }
  }
  const need = Math.min(6, Math.max(1, Math.ceil(joined * 0.1)));
  b.n[HELD] = inside >= need ? (b.n[HELD] as number) + 1 : Math.max(0, (b.n[HELD] as number) - 2);
  if ((b.n[HELD] as number) < HOLD_TICKS) return;
  b.completeHeld(w, ObjectiveKind.Hold, (p) => inZone(p, c.x, c.y));
  b.n[NEXT_ZONE] = tick;
}

/**
 * Bodies walking into `m` push it: each passes on a share of its step along the line to `m`'s
 * centre, and none walks through it. Returns the player who pushed hardest, or -1.
 */
function bodyPush(w: FightWorld, m: Monster): number {
  let best = -1;
  let hardest = 0;
  for (const p of w.players) {
    if (!p.joined || p.down) continue;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const reach = m.radius + p.r + 1;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const along = p.movedX * nx + p.movedY * ny;
    if (along > 0.2) {
      m.kx += nx * along * BODY_PUSH;
      m.ky += ny * along * BODY_PUSH;
      if (along > hardest) {
        hardest = along;
        best = p.index;
      }
    }
    // It is solid to whoever leans on it.
    if (d < m.radius + p.r) {
      const at = slide(
        w.map,
        p.x,
        p.y,
        -nx * (m.radius + p.r - d),
        -ny * (m.radius + p.r - d),
        p.r,
      );
      p.x = snap(at.x);
      p.y = snap(at.y);
    }
  }
  return best;
}

/** 논제 3: moving only while pushed, stopping the moment nobody pushes. */
function pushed(b: Boss, w: FightWorld): void {
  const m = b.core;
  const by = bodyPush(w, m);
  const speed = Math.hypot(m.kx, m.ky);
  const moving = speed > MOVING;
  // Who is moving him: whoever leans on him, else whoever knocked him last.
  if (by >= 0) b.n[PUSHER] = by;
  else if (moving && m.launchBy >= 0) b.n[PUSHER] = m.launchBy;
  const was = (b.n[MOVED] as number) > 0;
  if (moving) {
    b.n[TRAVEL] = (b.n[TRAVEL] as number) + speed * FRICTION;
    if ((b.n[TRAVEL] as number) >= PUSH_STEP) {
      b.n[TRAVEL] = 0;
      const p = w.players[b.n[PUSHER] as number];
      b.complete(w, ObjectiveKind.Carry, p?.joined ? p : null);
    }
  }
  if (moving !== was && w.tick >= (b.n[NEXT_PUSH_CUE] as number)) {
    b.n[NEXT_PUSH_CUE] = w.tick + 120;
    b.cue(w, moving ? "push" : "unpushed", moving ? (b.n[PUSHER] as number) : -1, m.x, m.y);
  }
  b.n[MOVED] = moving ? 1 : 0;
  if (moving) b.setState(m, MState.Move);
  else if (was) b.setState(m, MState.Idle);
  // Aristotelian friction: the push dies almost at once.
  m.kx *= FRICTION;
  m.ky *= FRICTION;
  if (!moving) home(b);
}

/** Unpushed, he walks back to his lectern. */
function home(b: Boss): void {
  const m = b.core;
  if (b.phase !== 3) b.n[MOVED] = 0;
  const dx = (b.n[HOME_X] as number) - m.x;
  const dy = (b.n[HOME_Y] as number) - m.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  const step = Math.min(d, 0.6);
  b.place(m, m.x + (dx / d) * step, m.y + (dy / d) * step);
}

function standBlock(b: Boss, w: FightWorld): void {
  const at = b.mark(w, "block-start", b.core.x - 220, b.core.y + 500);
  const old = monster(w, b.n[BLOCK] as number, b.n[BLOCK_ENTITY] as number);
  if (old) {
    b.place(old, at.x, at.y);
    old.kx = 0;
    old.ky = 0;
  } else {
    const block = b.addObject(w, 1, at.x, at.y);
    if (!block) return;
    b.n[BLOCK] = block.index;
    b.n[BLOCK_ENTITY] = block.entity;
  }
  b.n[BLOCK_VX] = 0;
  b.n[BLOCK_VY] = 0;
  b.n[BLOCK_OFF] = 0;
}

/**
 * 논제 4: on the ice the block keeps whatever speed it was given, with nobody pushing, and the
 * pool's rim keeps it on the ice; across, he is refuted. Off the ice it slows as anything would.
 */
function slide4(b: Boss, w: FightWorld): void {
  const block = monster(w, b.n[BLOCK] as number, b.n[BLOCK_ENTITY] as number);
  if (!block) {
    standBlock(b, w);
    return;
  }
  const by = bodyPush(w, block);
  if (by >= 0) b.n[BLOCK_PUSHER] = by;
  const ice = b.mark(w, "ice", block.x, block.y);
  const start = b.mark(w, "block-start", ice.x - 220, ice.y);
  const far = b.mark(w, "far-edge", ice.x + 210, ice.y);
  const top = ice.y - POOL_UP;
  const bottom = ice.y + POOL_DOWN;
  const onIce =
    block.y >= top - 1 && block.y <= bottom + 1 && block.x >= start.x - 8 && block.x <= far.x + 8;
  // Last tick's knockback step took its decay off the speed it slid at; on the ice nothing slows
  // it, so the decay is given back and new pushes add to what it had. A block barely creeping
  // (under `STILL`) has stopped. Off the ice it slows like any knocked body.
  const vx = b.n[BLOCK_VX] as number;
  const vy = b.n[BLOCK_VY] as number;
  if (onIce) {
    if (Math.hypot(vx, vy) >= STILL) {
      block.kx += vx * KNOCK_DECAY;
      block.ky += vy * KNOCK_DECAY;
    }
    // The rim on three sides; the far edge is where it is meant to go.
    if (block.y + block.ky < top) {
      block.ky = Math.abs(block.ky) * RIM;
      b.place(block, block.x, top);
    } else if (block.y + block.ky > bottom) {
      block.ky = -Math.abs(block.ky) * RIM;
      b.place(block, block.x, bottom);
    }
    if (block.x + block.kx < start.x) {
      block.kx = Math.abs(block.kx) * RIM;
      b.place(block, start.x, block.y);
    }
  }
  b.n[BLOCK_VX] = block.kx;
  b.n[BLOCK_VY] = block.ky;
  if (!onIce) {
    if (Math.hypot(block.kx, block.ky) >= STILL) b.n[BLOCK_OFF] = 0;
    else if (!b.n[BLOCK_OFF]) b.n[BLOCK_OFF] = w.tick;
    else if (w.tick - (b.n[BLOCK_OFF] as number) >= BLOCK_BACK) standBlock(b, w);
    return;
  }
  b.n[BLOCK_OFF] = 0;
  if (block.x < far.x - 6) return;
  const credit = w.players[b.n[BLOCK_PUSHER] as number] ?? topContributor(w, block);
  const p = credit?.joined ? credit : null;
  b.complete(w, ObjectiveKind.Carry, p, block.entity);
  b.n[STUNNED] = w.tick + STUN;
  b.cue(w, "ice", p ? p.index : -1, block.x, block.y);
  act(b, w, MState.Recover, STUN);
  block.contribBy.fill(-1);
  block.contribDamage.fill(0);
  b.n[BLOCK_PUSHER] = -1;
  standBlock(b, w);
}

function topContributor(w: FightWorld, m: Monster): Player | null {
  let best = -1;
  let dealt = 0;
  for (let i = 0; i < m.contribBy.length; i++) {
    if ((m.contribDamage[i] as number) > dealt) {
      dealt = m.contribDamage[i] as number;
      best = m.contribBy[i] as number;
    }
  }
  const p = best >= 0 ? w.players[best] : undefined;
  return p?.joined ? p : null;
}
