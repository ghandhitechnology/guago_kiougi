/**
 * 아리스토텔레스, era boss of Page 1 (PLAN §5, §10 raid), lecturing four 논제 at the 리케이온.
 * Each 논제 is one of his wrong ideas made into the arena's rule, and each way through is what
 * replaced it:
 *
 * 1. 무거운 것이 더 빨리 떨어진다. Boulders and feathers drop from the tower; the boulder's mark
 *    darkens fast and the feather's drifts in wide and faint, as if one fell faster. They land on
 *    the same tick. A class that dodges only the boulder learns Galileo the hard way.
 * 2. 모든 것은 제자리로 돌아간다. One element zone at a time lights and drags whoever stands in
 *    it toward its natural place: earth and water down, air and fire up. Holding a zone anyway,
 *    together, is the objective; nothing has a natural place it must return to.
 * 3. 움직이는 것은 무언가가 민다. He takes damage only while being pushed, and stops the moment
 *    the pushing stops, exactly as he says.
 * 4. 자연에 빈 곳은 없다. Until a student slides the marble block across the ice and it keeps
 *    going with nobody pushing: inertia. Each slide across stuns him and lets the class through.
 *
 * Every 논제 has its stele: breaking it strips the 반론 불가 shield. In 토론 시간 he uses the full
 * mechanic set: falls and zones join whatever 논제 is on.
 */

import type { Boss, BossBrain } from "../boss.ts";
import { ObjectiveKind, TellKind } from "../boss.ts";
import { shovePlayer } from "../damage.ts";
import { type FightWorld, type Monster, MState, type Player } from "../world.ts";

const ZONES = [
  { mark: "zone-earth", dy: 1, pull: 70 },
  { mark: "zone-water", dy: 1, pull: 45 },
  { mark: "zone-air", dy: -1, pull: 45 },
  { mark: "zone-fire", dy: -1, pull: 70 },
] as const;
const ZONE_R = 72;
/** Player-ticks of standing in a lit zone that hold it (30 player-seconds). */
const HOLD = 600;
/** Ticks a zone stays lit before the next. */
const ZONE_TICKS = 300;
/** His speed from a push that counts as moving, px per tick. */
const MOVING = 0.12;
/** Pushed this far in all, he concedes an objective to whoever pushed last. */
const PUSH_STEP = 96;
/** Ticks he is stunned after the block slides across. */
const STUN = 500;
const STELE_BACK = 400;
const BLOCK_ON_ICE = 28;

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

/** Mode bits in the boss record: the lit zone + 1 (0–4), moving, stunned. */
export const AristotleMode = { Zone: 7, Moving: 8, Stunned: 16 } as const;

export const aristotle: BossBrain = {
  start(b, w) {
    b.n[HOME_X] = b.core.x;
    b.n[HOME_Y] = b.core.y;
    b.n[STELE] = -1;
    b.n[BLOCK] = -1;
    b.n[LIT] = -1;
    b.n[NEXT_SLAM] = w.tick + 80;
  },

  phase(b, w) {
    b.n[STELE_AT] = w.tick;
    b.n[NEXT_DROP] = w.tick + 40;
    b.n[NEXT_ZONE] = w.tick + 20;
    b.n[LIT] = -1;
    b.n[HELD] = 0;
    b.n[STUNNED] = 0;
    // A new 논제 stands its own stele; the old one crumbles.
    const old = monster(w, b.n[STELE] as number, b.n[STELE_ENTITY] as number);
    if (old) old.gone = true;
    b.n[STELE] = -1;
    if (b.phase === 4) standBlock(b, w);
    b.setState(b.core, MState.Cast);
  },

  step(b, w) {
    const tick = w.tick;
    const phase = b.phase;
    const all = b.debate;
    stele(b, w);
    if (phase === 1 || all) drops(b, w);
    if (phase === 2 || all) zones(b, w);
    else b.n[LIT] = -1;
    if (phase === 3) pushed(b, w);
    else home(b);
    if (phase === 4) slide(b, w);
    if (tick >= (b.n[NEXT_SLAM] as number)) {
      b.n[NEXT_SLAM] = tick + (all ? 60 : 100);
      b.tell(w, TellKind.Slam, b.core.x, b.core.y, 84, 0, 0, 84, tick + 24, 1, 200);
    }
    const stunned = tick < (b.n[STUNNED] as number);
    b.mode =
      ((b.n[LIT] as number) + 1) |
      ((b.n[MOVED] as number) > 0 ? AristotleMode.Moving : 0) |
      (stunned ? AristotleMode.Stunned : 0);
    const through = phase === 3 ? (b.n[MOVED] as number) > 0 : phase === 4 ? stunned : true;
    for (const p of w.players)
      if (p.index < b.open.length) b.open[p.index] = through && p.joined ? 1 : 0;
  },

  gate(b, w, p) {
    if (b.phase === 3) {
      if (p) b.n[PUSHER] = p.index;
      return (b.n[MOVED] as number) > 0 ? 1 : 0;
    }
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

/** A boulder and a feather for a few players: they look different and land together. */
function drops(b: Boss, w: FightWorld): void {
  const tick = w.tick;
  if (tick < (b.n[NEXT_DROP] as number)) return;
  b.n[NEXT_DROP] = tick + (b.debate ? 40 : 60);
  const land = tick + 36;
  let given = 0;
  for (const p of w.players) {
    if (!p.joined || p.down || given >= 3) continue;
    if (w.random.next() > 0.5) continue;
    given++;
    const a = w.random.next() * Math.PI * 2;
    b.tell(
      w,
      TellKind.Boulder,
      p.x + Math.cos(a) * 10,
      p.y + Math.sin(a) * 10,
      24,
      0,
      0,
      24,
      land,
      1,
    );
    b.tell(
      w,
      TellKind.Feather,
      p.x - Math.cos(a) * 26,
      p.y - Math.sin(a) * 26,
      40,
      0,
      0,
      40,
      land,
      0.6,
    );
  }
  if (given > 0 && tick >= (b.n[NEXT_FALL_CUE] as number)) {
    b.n[NEXT_FALL_CUE] = tick + 240;
    b.cue(w, "fall", -1, b.core.x, b.core.y);
  }
}

/** One element zone lit at a time drags its occupants toward their natural place. */
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
  for (const p of w.players) {
    if (!p.joined || p.down) continue;
    if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 > ZONE_R * ZONE_R) continue;
    inside++;
    // Pulled toward its natural place: a shove from the opposite side, twice a second.
    if (tick % 10 === 0) shovePlayer(p, p.x, p.y - z.dy * 8, z.pull);
    if (tick >= (b.n[NEXT_ZONE_CUE] as number)) {
      b.n[NEXT_ZONE_CUE] = tick + 300;
      b.cue(w, "element-zone", p.index, p.x, p.y);
    }
  }
  b.n[HELD] = (b.n[HELD] as number) + inside;
  if ((b.n[HELD] as number) < HOLD) return;
  for (const p of w.players) {
    if (p.joined && !p.down && (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= ZONE_R * ZONE_R)
      b.complete(w, ObjectiveKind.Hold, p);
  }
  b.n[NEXT_ZONE] = tick;
}

/** 논제 3: moving only while pushed, stopping the moment nobody pushes. */
function pushed(b: Boss, w: FightWorld): void {
  const m = b.core;
  const speed = Math.hypot(m.kx, m.ky);
  const moving = speed > MOVING;
  const was = (b.n[MOVED] as number) > 0;
  if (moving) {
    b.n[TRAVEL] = (b.n[TRAVEL] as number) + speed;
    if ((b.n[TRAVEL] as number) >= PUSH_STEP) {
      b.n[TRAVEL] = 0;
      const by = w.players[b.n[PUSHER] as number];
      b.complete(w, ObjectiveKind.Carry, by?.joined ? by : null);
    }
  }
  if (moving !== was && w.tick >= (b.n[NEXT_PUSH_CUE] as number)) {
    b.n[NEXT_PUSH_CUE] = w.tick + 120;
    b.cue(w, moving ? "push" : "unpushed", moving ? (b.n[PUSHER] as number) : -1, m.x, m.y);
  }
  b.n[MOVED] = moving ? 1 : 0;
  // Aristotelian friction: the push dies at once.
  m.kx *= 0.55;
  m.ky *= 0.55;
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
    old.x = at.x;
    old.y = at.y;
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
}

/** 논제 4: on the ice the block keeps the speed it was pushed to; across, he is refuted. */
function slide(b: Boss, w: FightWorld): void {
  const block = monster(w, b.n[BLOCK] as number, b.n[BLOCK_ENTITY] as number);
  if (!block) {
    standBlock(b, w);
    return;
  }
  const ice = b.mark(w, "ice", block.x, block.y);
  const start = b.mark(w, "block-start", ice.x - 220, ice.y);
  const far = b.mark(w, "far-edge", ice.x + 210, ice.y);
  const onIce =
    Math.abs(block.y - ice.y) <= BLOCK_ON_ICE && block.x >= start.x - 16 && block.x <= far.x + 16;
  const vx = b.n[BLOCK_VX] as number;
  const vy = b.n[BLOCK_VY] as number;
  if (Math.hypot(block.kx, block.ky) > Math.hypot(vx, vy) + 0.05) {
    b.n[BLOCK_VX] = block.kx;
    b.n[BLOCK_VY] = block.ky;
  } else if (onIce) {
    // Nothing pushes it, and it keeps going.
    block.kx = vx;
    block.ky = vy;
  } else {
    b.n[BLOCK_VX] = vx * 0.85;
    b.n[BLOCK_VY] = vy * 0.85;
  }
  if (block.x < far.x - 6) return;
  const by = topContributor(w, block);
  b.complete(w, ObjectiveKind.Carry, by, block.entity);
  b.n[STUNNED] = w.tick + STUN;
  b.cue(w, "ice", by ? by.index : -1, block.x, block.y);
  b.setState(b.core, MState.Recover);
  block.contribBy.fill(-1);
  block.contribDamage.fill(0);
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
