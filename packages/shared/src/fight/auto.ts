import { overlapsSolid } from "../collision.ts";
import { MOVE_MAX } from "../movement.ts";
import { segDist } from "./attacks.ts";
import { ROLL_STEPS } from "./body.ts";
import { startRevive } from "./players.ts";
import { Behavior } from "./rules.ts";
import { type FightWorld, FxKind, type Monster, MState, type Player } from "./world.ts";

/** What the server decided for a player this tick. */
export const AI = { mx: 0, my: 0, dodge: false, rx: 0, ry: 0 };

/** Sixteen headings the auto player chooses between. */
const HEADINGS = 16;
const HX = new Float64Array(HEADINGS);
const HY = new Float64Array(HEADINGS);
for (let i = 0; i < HEADINGS; i++) {
  HX[i] = Math.cos((i / HEADINGS) * Math.PI * 2);
  HY[i] = Math.sin((i / HEADINGS) * Math.PI * 2);
}

/** Monsters it pays attention to, and the few close enough to walk into. */
const SIGHT = 160;
const NEAR = new Int32Array(64);
/** How far a roll carries, for checking it does not end in a wall. */
const ROLL_REACH = 40;
/** Ticks between two choices of heading; dodges are checked every tick. */
const THINK_TICKS = 2;
/** Re-pick where to look for monsters this often when nothing is in sight. */
const EXPLORE_TICKS = 160;

function inDanger(w: FightWorld, p: Player, lead: number, out: { x: number; y: number }): number {
  // Returns ticks until the soonest hit it stands in, writing the way out; Infinity when safe.
  let soonest = Number.POSITIVE_INFINITY;
  out.x = 0;
  out.y = 0;
  const tick = w.tick;
  for (const e of w.dangers) {
    if (!e.alive) continue;
    if (e.kind === FxKind.Danger) {
      const t = e.fireAt - tick;
      if (t < 0 || t > lead + 8) continue;
      let ex = 0;
      let ey = 0;
      if (e.length > 0) {
        const x1 = e.x + Math.cos(e.angle) * e.length;
        const y1 = e.y + Math.sin(e.angle) * e.length;
        if (segDist(p.x, p.y, e.x, e.y, x1, y1) > e.radius + p.r + 4) continue;
        // Step off the line, to the side the player already stands on.
        const nx = -Math.sin(e.angle);
        const ny = Math.cos(e.angle);
        const side = (p.x - e.x) * nx + (p.y - e.y) * ny >= 0 ? 1 : -1;
        ex = nx * side;
        ey = ny * side;
      } else {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > e.radius + p.r + 4) continue;
        ex = d > 0.5 ? dx / d : 1;
        ey = d > 0.5 ? dy / d : 0;
      }
      out.x += ex;
      out.y += ey;
      if (t < soonest) soonest = t;
    } else if (e.kind === FxKind.EnemyShot) {
      // Closest approach of the shot in the next second.
      const rx = p.x - e.x;
      const ry = p.y - e.y;
      const vv = e.vx * e.vx + e.vy * e.vy;
      if (vv < 1e-6) continue;
      const t = (rx * e.vx + ry * e.vy) / vv;
      if (t < 0 || t > 20) continue;
      const cx = e.x + e.vx * t - p.x;
      const cy = e.y + e.vy * t - p.y;
      if (cx * cx + cy * cy > (p.r + e.radius + 4) ** 2) continue;
      const n = Math.sqrt(vv);
      const side = rx * -e.vy + ry * e.vx >= 0 ? 1 : -1;
      out.x += (-e.vy / n) * side;
      out.y += (e.vx / n) * side;
      if (t < soonest) soonest = t;
    }
  }
  return soonest;
}

const away = { x: 0, y: 0 };

/** Whether a roll in this direction ends on open ground. */
function rollClear(w: FightWorld, p: Player, dx: number, dy: number): boolean {
  return (
    !overlapsSolid(w.map, p.x + dx * ROLL_REACH * 0.5, p.y + dy * ROLL_REACH * 0.5, p.r) &&
    !overlapsSolid(w.map, p.x + dx * ROLL_REACH, p.y + dy * ROLL_REACH, p.r)
  );
}

/**
 * The server's play for a character (PLAN §6 control modes, content `AUTO_PLAY`). Dodging: roll
 * out of a tell about to land or a shot about to hit, never into a wall. Moving: hold the
 * nearest monster at a personal distance, back off when hurt, sweep up its own drops when it is
 * calm, revive a downed player nearby, and go looking when nothing is in sight. It picks one of
 * sixteen headings with a little loyalty to the last one, so it turns in curves.
 */
export function autoPlay(w: FightWorld, p: Player, drive: boolean, dodge: boolean): void {
  AI.mx = 0;
  AI.my = 0;
  AI.dodge = false;
  const rules = w.rules.autoPlay;
  const soon = inDanger(w, p, rules.dodgeLead, away);
  const ready = w.tick >= p.dodgeReadyAt && p.rollLeft === 0 && p.forceTicks === 0;
  if (dodge && ready && soon <= rules.dodgeLead + 1) {
    let best = -1;
    let bestScore = -2;
    const len = Math.sqrt(away.x * away.x + away.y * away.y) || 1;
    for (let i = 0; i < HEADINGS; i++) {
      const hx = HX[i] as number;
      const hy = HY[i] as number;
      const score = (hx * away.x + hy * away.y) / len;
      if (score <= bestScore || !rollClear(w, p, hx, hy)) continue;
      bestScore = score;
      best = i;
    }
    if (best >= 0 && bestScore > 0) {
      AI.dodge = true;
      AI.rx = HX[best] as number;
      AI.ry = HY[best] as number;
      AI.mx = Math.round(AI.rx * MOVE_MAX);
      AI.my = Math.round(AI.ry * MOVE_MAX);
      p.aiX = AI.rx;
      p.aiY = AI.ry;
      p.aiHold = ROLL_STEPS;
      return;
    }
  }
  if (!drive) return;

  // Between choices it keeps the last heading.
  if (
    (w.tick + p.index) % THINK_TICKS !== 0 &&
    p.aiHold <= 0 &&
    soon === Number.POSITIVE_INFINITY
  ) {
    AI.mx = Math.round(p.aiX * MOVE_MAX);
    AI.my = Math.round(p.aiY * MOVE_MAX);
    return;
  }
  if (p.aiHold > 0) p.aiHold--;

  const out = w.scratch2;
  const n = w.monsterHash.query(p.x, p.y, SIGHT, out);
  let near = 0;
  let gx = 0;
  let gy = 0;
  let closest: Monster | null = null;
  let closestD = Number.POSITIVE_INFINITY;
  const keep = p.aiKeep;
  const hurt = p.hp < p.kit.maxHp * rules.retreatHp;
  for (let i = 0; i < n; i++) {
    const m = w.monsters[out[i] as number] as Monster;
    if (!m.alive || m.dying) continue;
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > SIGHT) continue;
    if (d < closestD) {
      closestD = d;
      closest = m;
    }
    if (d < 40 && near < NEAR.length) NEAR[near++] = m.index;
    // Things that are about to hurt count for more.
    let weight = 1;
    const b = m.kind.behavior;
    if (b === Behavior.Bomber && (m.state === MState.Rush || m.state === MState.Fuse)) weight = 3;
    else if (b === Behavior.Charger && m.state === MState.Windup) weight = 2;
    else if (b === Behavior.Golem) weight = 2.5;
    const reach = (hurt ? keep * 1.8 : keep) + m.radius;
    if (d < reach && d > 1e-3) {
      const k = (1 - d / reach) ** 2 * weight * 2.2;
      gx += (dx / d) * k;
      gy += (dy / d) * k;
    }
  }
  if (closest && !hurt) {
    const dx = closest.x - p.x;
    const dy = closest.y - p.y;
    if (closestD > keep + 10) {
      const k = Math.min(1, (closestD - keep) / 60);
      gx += (dx / closestD) * k;
      gy += (dy / closestD) * k;
    }
  }
  if (away.x !== 0 || away.y !== 0) {
    gx += away.x * 4;
    gy += away.y * 4;
  }
  if (!closest || closestD > 80) {
    const goal = calmGoal(w, p);
    if (goal) {
      const dx = goal.x - p.x;
      const dy = goal.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 2) {
        gx += (dx / d) * 0.8;
        gy += (dy / d) * 0.8;
      }
    }
  }
  const g = Math.sqrt(gx * gx + gy * gy);
  if (g < 0.12) {
    // Content to stand: a monster at the right distance, or nothing to do.
    p.aiX *= 0.5;
    p.aiY *= 0.5;
    if (Math.abs(p.aiX) < 0.2 && Math.abs(p.aiY) < 0.2) {
      p.aiX = 0;
      p.aiY = 0;
    }
    AI.mx = Math.round(p.aiX * MOVE_MAX);
    AI.my = Math.round(p.aiY * MOVE_MAX);
    return;
  }
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < HEADINGS; i++) {
    const hx = HX[i] as number;
    const hy = HY[i] as number;
    let score = (hx * gx + hy * gy) / g + 0.25 * (hx * p.aiX + hy * p.aiY);
    if (overlapsSolid(w.map, p.x + hx * 10, p.y + hy * 10, p.r)) score -= 2;
    const ax = p.x + hx * 16;
    const ay = p.y + hy * 16;
    for (let k = 0; k < near; k++) {
      const m = w.monsters[NEAR[k] as number] as Monster;
      const dx = m.x - ax;
      const dy = m.y - ay;
      const rr = m.radius + p.r + 6;
      if (dx * dx + dy * dy < rr * rr) score -= 0.7;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  p.aiX = HX[best] as number;
  p.aiY = HY[best] as number;
  AI.mx = Math.round(p.aiX * MOVE_MAX);
  AI.my = Math.round(p.aiY * MOVE_MAX);
}

const goalOut = { x: 0, y: 0 };

/** Where to walk when no monster is close: a friend to revive, its own drops, else a hunt. */
function calmGoal(w: FightWorld, p: Player): { x: number; y: number } | null {
  let best = 140 * 140;
  let found = false;
  for (const q of w.players) {
    if (!q.joined || !q.down || q === p) continue;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      goalOut.x = q.x;
      goalOut.y = q.y;
      found = true;
      if (d2 < 24 * 24) startRevive(w, p, q);
    }
  }
  if (found) return goalOut;
  best = 220 * 220;
  for (const k of w.drops) {
    if (!k.alive || k.owner !== p.index) continue;
    const dx = k.x - p.x;
    const dy = k.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      goalOut.x = k.x;
      goalOut.y = k.y;
      found = true;
    }
  }
  if (found) return goalOut;
  // Nothing near: walk toward a part of the field where monsters live, re-picked now and then.
  if (w.tick >= p.aiGoalUntil || Math.abs(p.aiGoalX - p.x) + Math.abs(p.aiGoalY - p.y) < 24) {
    p.aiGoalUntil = w.tick + EXPLORE_TICKS;
    const zones = w.map.spawnZones;
    for (let tries = 0; tries < 12; tries++) {
      let x: number;
      let y: number;
      if (zones.length > 0) {
        const z = (zones[w.random.int(zones.length)] as (typeof zones)[number]).rect;
        x = (z.x + w.random.next() * z.w) * 16;
        y = (z.y + w.random.next() * z.h) * 16;
      } else {
        x = p.x + (w.random.next() - 0.5) * 400;
        y = p.y + (w.random.next() - 0.5) * 400;
      }
      if (w.tileAt(x, y) !== 0) continue;
      p.aiGoalX = x;
      p.aiGoalY = y;
      break;
    }
  }
  goalOut.x = p.aiGoalX;
  goalOut.y = p.aiGoalY;
  return goalOut;
}
