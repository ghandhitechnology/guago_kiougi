import { TILE_SIZE } from "../constants.ts";
import { removeMonster, spawnMonster } from "./monsters.ts";
import type { FieldRule, MonsterKind } from "./rules.ts";
import { Ev, type FightWorld, type Monster, MState, type Player, type TileRect } from "./world.ts";

/** Tries for a spawn point before giving up until the next tick. */
const TRIES = 16;
/** Half the view (480×270) plus a margin: a spawn outside this box around every player is off
 * their screen. */
const VIEW_HALF_W = 240 + 24;
const VIEW_HALF_H = 135 + 24;
/** When a crowded field has no ground off every screen, a monster may rise in view at the
 * emptiest point it can find, never closer than this to anyone, harmless while it arrives. */
const IN_VIEW_MIN = 48;
/** Ticks a monster spends rising in view before it moves or hurts. */
export const ARRIVE_TICKS = 12;
/** A pack of 군집형 lands within this of its centre. */
const PACK_SPREAD = 18;

/**
 * The field's regions by walking distance from the arrival point: region 0 at the entrance,
 * deeper toward the far edge (content `FIELD_PACING.regionLevels`).
 */
export function initDirector(w: FightWorld): void {
  const d = w.director;
  d.startTick = w.tick;
  d.surge = true;
  d.eliteAt = 0;
  d.kills = 0;
  d.queue.length = 0;
  d.tokens = 0;
  const field = w.field;
  const { cols, rows, tiles } = w;
  const region = new Uint8Array(cols * rows);
  d.region = region;
  if (!field) return;
  d.regionCount = field.regions.length;
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue = new Int32Array(cols * rows);
  const sx = Math.floor(w.map.spawn.x / TILE_SIZE);
  const sy = Math.floor(w.map.spawn.y / TILE_SIZE);
  let head = 0;
  let tail = 0;
  if (sx >= 0 && sy >= 0 && sx < cols && sy < rows) {
    dist[sy * cols + sx] = 0;
    queue[tail++] = sy * cols + sx;
  }
  let far = 1;
  while (head < tail) {
    const i = queue[head++] as number;
    const tx = i % cols;
    const ty = (i - tx) / cols;
    const nd = (dist[i] as number) + 1;
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tx + ox;
      const ny = ty + oy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      const t = tiles[j] as number;
      if ((t !== 0 && t !== 3) || dist[j] !== -1) continue;
      dist[j] = nd;
      if (nd > far) far = nd;
      queue[tail++] = j;
    }
  }
  const count = d.regionCount;
  for (let i = 0; i < region.length; i++) {
    const v = dist[i] as number;
    region[i] = v < 0 ? count - 1 : Math.min(count - 1, Math.floor((v / (far + 1)) * count));
  }
}

function regionAt(w: FightWorld, x: number, y: number): number {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= w.cols || ty >= w.rows) return 0;
  return w.director.region[ty * w.cols + tx] as number;
}

function present(w: FightWorld): number {
  let n = 0;
  for (const p of w.players) if (p.joined) n++;
  return n;
}

/** Whether (x, y) is open ground monsters may stand on, off every player's screen. */
function spawnable(w: FightWorld, x: number, y: number): boolean {
  if (x < 16 || y < 16 || x > w.width - 16 || y > w.height - 16) return false;
  if (w.tileAt(x, y) !== 0) return false;
  for (const p of w.players) {
    if (!p.joined) continue;
    if (Math.abs(p.x - x) < VIEW_HALF_W && Math.abs(p.y - y) < VIEW_HALF_H) return false;
  }
  return true;
}

function inRect(r: TileRect, x: number, y: number): boolean {
  const tx = x / TILE_SIZE;
  const ty = y / TILE_SIZE;
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h;
}

/** Whether a spawn zone allows `kind` here: one naming it, else any zone at all. */
function zoneAllows(w: FightWorld, kind: MonsterKind, x: number, y: number): boolean {
  const zones = w.map.spawnZones;
  if (zones.length === 0) return true;
  let named = false;
  for (const z of zones) if (z.monster === kind.id) named = true;
  for (const z of zones) {
    if (named && z.monster !== kind.id) continue;
    if (inRect(z.rect, x, y)) return true;
  }
  return false;
}

const at = { x: 0, y: 0, inView: false };

/**
 * A spawn point for `kind`: off every player's screen but near enough to arrive within seconds
 * (content `FIELD_PACING.spawnMinDistance`, `spawnMaxDistance`), inside a zone that spawns it.
 * Falls back to anywhere in its zones away from players.
 */
function placeFor(w: FightWorld, kind: MonsterKind, anchor: Player | null): boolean {
  const pacing = w.rules.pacing;
  const min = pacing.spawnMinDistance;
  const max = pacing.spawnMaxDistance;
  const random = w.random;
  at.inView = false;
  // Off every screen first, on a ring around a player, then anywhere in its zones; a crowded
  // field that leaves no such ground lets it rise in view, never close.
  if (anchor) {
    for (let i = 0; i < TRIES; i++) {
      const a = random.next() * Math.PI * 2;
      const r = min + random.next() * (max - min);
      const x = anchor.x + Math.cos(a) * r;
      const y = anchor.y + Math.sin(a) * r;
      if (!spawnable(w, x, y) || !zoneAllows(w, kind, x, y)) continue;
      at.x = x;
      at.y = y;
      return true;
    }
  }
  // No room on the ring: the point of its zones farthest from everyone, off screen if any is.
  let best = -1;
  for (let i = 0; i < TRIES; i++) {
    sample(w, kind, scratchPoint);
    const { x, y } = scratchPoint;
    if (w.tileAt(x, y) !== 0 || x < 16 || y < 16 || x > w.width - 16 || y > w.height - 16) continue;
    if (spawnable(w, x, y)) {
      at.x = x;
      at.y = y;
      return true;
    }
    const d = nearestPlayer(w, x, y);
    if (d > best) {
      best = d;
      at.x = x;
      at.y = y;
    }
  }
  if (best < IN_VIEW_MIN) return false;
  at.inView = true;
  return true;
}

const scratchPoint = { x: 0, y: 0 };

function sample(w: FightWorld, kind: MonsterKind, out: { x: number; y: number }): void {
  if (w.map.spawnZones.length > 0) {
    const z = pickZone(w, kind);
    out.x = (z.x + w.random.next() * z.w) * TILE_SIZE;
    out.y = (z.y + w.random.next() * z.h) * TILE_SIZE;
  } else {
    out.x = w.random.next() * w.width;
    out.y = w.random.next() * w.height;
  }
}

function nearestPlayer(w: FightWorld, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of w.players) {
    if (!p.joined) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

function pickZone(w: FightWorld, kind: MonsterKind): TileRect {
  const zones = w.map.spawnZones;
  let total = 0;
  let named = false;
  for (const z of zones) if (z.monster === kind.id) named = true;
  for (const z of zones)
    if (!named || z.monster === kind.id) total += z.weight * z.rect.w * z.rect.h;
  let r = w.random.next() * total;
  for (const z of zones) {
    if (named && z.monster !== kind.id) continue;
    r -= z.weight * z.rect.w * z.rect.h;
    if (r <= 0) return z.rect;
  }
  return (zones[zones.length - 1] as (typeof zones)[number]).rect;
}

function aliveOf(w: FightWorld, kind: number): number {
  return w.kindAlive[kind] as number;
}

/** A roster entry by weight among those allowed at `level`; null when none fits. */
function pickKind(w: FightWorld, field: FieldRule, level: number): MonsterKind | null {
  let total = 0;
  for (const e of field.roster) {
    if (e.from > level || (e.maxAlive > 0 && aliveOf(w, e.kind) >= e.maxAlive)) continue;
    total += e.weight;
  }
  if (total <= 0) return null;
  let r = w.random.next() * total;
  for (const e of field.roster) {
    if (e.from > level || (e.maxAlive > 0 && aliveOf(w, e.kind) >= e.maxAlive)) continue;
    r -= e.weight;
    if (r <= 0) return w.rules.monsters[e.kind] ?? null;
  }
  return null;
}

/** Picks a player to spawn around, skipping those safe at the entrance. */
function anchorPlayer(w: FightWorld): Player | null {
  let count = 0;
  for (const p of w.players) if (p.joined && !w.inSafe(p.x, p.y)) count++;
  if (count === 0) return null;
  let k = w.random.int(count);
  for (const p of w.players) {
    if (!p.joined || w.inSafe(p.x, p.y)) continue;
    if (k-- === 0) return p;
  }
  return null;
}

/** One spawn event: a monster (a whole pack for 군집형). Returns how many came. */
function spawnOne(w: FightWorld, field: FieldRule, anchor: Player | null): number {
  // Choose the place by the roster's first pick, then the level there, then a kind that fits it.
  const first = pickKind(w, field, field.levels.max);
  if (!first || !placeFor(w, first, anchor)) return 0;
  const x = at.x;
  const y = at.y;
  const inView = at.inView;
  const region = regionAt(w, x, y);
  const level = field.levelAt(region, w.random.next());
  let kind: MonsterKind | null = first;
  const entry = field.roster.find((e) => e.kind === first.index);
  if (entry && entry.from > level) kind = pickKind(w, field, level);
  if (!kind) return 0;
  const pack = kind.packMax > 0 ? kind.packMin + w.random.int(kind.packMax - kind.packMin + 1) : 1;
  let n = 0;
  for (let i = 0; i < pack; i++) {
    let px = x;
    let py = y;
    if (i > 0) {
      const a = w.random.next() * Math.PI * 2;
      const r = 6 + w.random.next() * PACK_SPREAD;
      px = x + Math.cos(a) * r;
      py = y + Math.sin(a) * r;
      if (w.tileAt(px, py) !== 0) continue;
    }
    const m = spawnMonster(w, kind, level, false, px, py);
    if (!m) continue;
    n++;
    if (inView) {
      m.state = MState.Arrive;
      m.stateUntil = w.tick + ARRIVE_TICKS;
    }
  }
  return n;
}

function aliveCount(w: FightWorld): number {
  let n = 0;
  for (const m of w.monsters) if (m.alive && !m.dying) n++;
  return n;
}

/**
 * Field pacing (PLAN §6, content `FIELD_PACING`): surges and 쉬는 시간, a population that follows
 * the players present, refill that follows clear speed under the per-second cap, spawns off
 * screen inside the map's spawn zones at the region's levels, despawning of the forgotten, and an
 * elite every 200 kills.
 */
export function stepDirector(w: FightWorld): void {
  const field = w.field;
  if (!field) return;
  const d = w.director;
  const pacing = w.rules.pacing;
  const players = present(w);
  if (players === 0) return;
  const tick = w.tick;
  const cycle = pacing.surge + pacing.lull;
  const surge = (tick - d.startTick) % cycle < pacing.surge;
  if (surge !== d.surge) {
    d.surge = surge;
    w.event(Ev.Phase).d = surge ? 1 : 0;
    if (surge) d.openingDone = false;
  }
  const population = Math.min(pacing.population(players), field.populationMax);
  let alive = aliveCount(w);
  d.alive = alive;
  const cap = pacing.refillCap(players, surge);
  d.tokens = Math.min(cap, d.tokens + cap / 20);

  if (surge && !d.openingDone) {
    d.openingDone = true;
    // A ring dropped around each player at the start of a surge.
    for (const p of w.players) {
      if (!p.joined || w.inSafe(p.x, p.y) || alive >= population) continue;
      for (let i = 0; i < pacing.surgeOpening && alive < population; i += 1) {
        alive += spawnOne(w, field, p);
      }
    }
  }
  if (surge) {
    // Kills queue their respawns; any shortfall against the population is due now.
    let due = 0;
    for (const t of d.queue) if (t <= tick) due++;
    const missing = population - alive - d.queue.length;
    if (missing > 0) due += missing;
    while (due > 0 && d.tokens >= 1 && alive < population) {
      const n = spawnOne(w, field, anchorPlayer(w));
      if (n === 0) break;
      alive += n;
      d.tokens -= n;
      due -= 1;
      const qi = d.queue.findIndex((t) => t <= tick);
      if (qi >= 0) d.queue.splice(qi, 1);
    }
  }

  // Monsters nobody has been near for a while go back into the queue.
  const far = pacing.despawnDistance;
  for (const m of w.monsters) {
    if (!m.alive || m.dying || m.owner >= 0 || m.elite) continue;
    let near = false;
    for (const p of w.players) {
      if (!p.joined) continue;
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      if (dx * dx + dy * dy < far * far) {
        near = true;
        break;
      }
    }
    if (near) m.farSince = -1;
    else if (m.farSince < 0) m.farSince = tick;
    else if (tick - m.farSince >= pacing.despawnAfter) {
      m.gone = true;
      d.queue.push(tick);
    }
  }

  // An elite each time the kill count comes round.
  if (d.kills - d.eliteAt >= w.rules.elite.everyKills) {
    d.eliteAt += w.rules.elite.everyKills;
    spawnElite(w, field);
  }
}

function spawnElite(w: FightWorld, field: FieldRule): void {
  const zones = w.map.eliteZones;
  for (let tries = 0; tries < TRIES; tries++) {
    let x: number;
    let y: number;
    if (zones.length > 0) {
      const z = zones[w.random.int(zones.length)] as TileRect;
      x = (z.x + w.random.next() * z.w) * TILE_SIZE;
      y = (z.y + w.random.next() * z.h) * TILE_SIZE;
    } else {
      const p = anchorPlayer(w);
      if (!p) return;
      const a = w.random.next() * Math.PI * 2;
      const r = w.rules.pacing.spawnMinDistance;
      x = p.x + Math.cos(a) * r;
      y = p.y + Math.sin(a) * r;
    }
    if (w.tileAt(x, y) !== 0) continue;
    const level = field.levelAt(regionAt(w, x, y), w.random.next());
    const kinds = field.roster.filter((e) => {
      const k = w.rules.monsters[e.kind];
      return k?.promotable && e.from <= level;
    });
    if (kinds.length === 0) return;
    const entry = w.random.weighted(kinds, (e) => e.weight);
    const kind = w.rules.monsters[entry.kind] as MonsterKind;
    const m = spawnMonster(w, kind, level, true, x, y);
    if (m) w.event(Ev.Elite).c = m.entity;
    return;
  }
}

/** A kill feeds the elite count and, during a surge, queues the respawn. */
export function onFieldKill(w: FightWorld, m: Monster): void {
  if (!w.field || m.owner >= 0) return;
  const d = w.director;
  d.kills++;
  if (d.surge) d.queue.push(w.tick + w.rules.pacing.respawnDelay);
}

export { removeMonster };
