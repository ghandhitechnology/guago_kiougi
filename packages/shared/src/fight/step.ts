import { stepEffects, stepMinions, stepWeapons } from "./attacks.ts";
import { settleKills } from "./damage.ts";
import { initDirector, onFieldKill, stepDirector } from "./director.ts";
import { rebuildHash, removeMonster, spawnMonster, stepDangers, stepMonsters } from "./monsters.ts";
import { type FightInputs, stepPlayers } from "./players.ts";
import type { FieldRule, SimRules } from "./rules.ts";
import { Ev, type FightMap, FightWorld, Gone, type Monster } from "./world.ts";

/** The flow field is rebuilt this often; monsters steer on a map at most this old. */
const FLOW_TICKS = 2;
/** A drop is picked up by its owner this close. */
const PICKUP_RANGE = 20;
/** The two halves of a split land this far apart (the 흙의 정령's pebbles, 7 px each side). */
const SPLIT_OFFSET = 7;

/** A new fight on `map`, with the field's director when it is a hunting field. */
export function createFight(
  map: FightMap,
  rules: SimRules,
  field: FieldRule | null,
  seed: number,
): FightWorld {
  const w = new FightWorld(map, rules, field, seed);
  initDirector(w);
  w.flow.build(w);
  return w;
}

function onKill(w: FightWorld, m: Monster): void {
  onFieldKill(w, m);
  const kind = m.kind;
  if (kind.splitInto >= 0) {
    const into = w.rules.monsters[kind.splitInto];
    if (!into) return;
    for (let i = 0; i < kind.splitCount; i++) {
      const side = i - (kind.splitCount - 1) / 2;
      const x = m.x + side * SPLIT_OFFSET * 2;
      const y = m.y;
      const child = spawnMonster(w, into, m.level, false, w.tileAt(x, y) === 0 ? x : m.x, y);
      if (!child) continue;
      child.kx = side * 1.5;
      child.ky = 0;
    }
  }
}

/** Drops walked over by their owner are collected; old ones fade. */
function stepPickups(w: FightWorld): void {
  w.grants.length = 0;
  const tick = w.tick;
  w.listShared();
  for (const k of w.drops) {
    if (!k.alive) continue;
    if (tick >= k.until) {
      k.alive = false;
      continue;
    }
    const p = w.players[k.owner];
    if (!p?.joined) {
      k.alive = false;
      continue;
    }
    if (p.down) continue;
    const dx = p.x - k.x;
    const dy = p.y - k.y;
    if (dx * dx + dy * dy > PICKUP_RANGE * PICKUP_RANGE) continue;
    k.alive = false;
    const ev = w.event(Ev.Collect);
    ev.a = p.index;
    ev.b = k.id;
    if (k.drop) w.grants.push({ player: p, drop: k.drop });
  }
}

/**
 * One fixed 20 Hz tick of the fight (PLAN §6, §19): players move or are played, the flow field
 * follows them, the director spawns, monsters think and move, tells land, books fire, effects and
 * minions strike, kills are settled, and drops are collected. Deterministic: the same seed and
 * the same inputs give the same world.
 */
export function stepFight(w: FightWorld, inputs?: FightInputs): void {
  w.tick++;
  w.eventCount = 0;
  w.endedCount = 0;
  w.removedCount = 0;
  for (const m of w.monsters) {
    if (!m.alive) continue;
    m.flash = false;
    m.dirty = 0;
  }
  for (const n of w.minions) n.dirty = 0;

  w.listShared();
  stepPlayers(w, inputs);
  if (w.tick % FLOW_TICKS === 0) w.flow.build(w);
  stepDirector(w);
  rebuildHash(w);
  stepMonsters(w, w.flow);
  stepDangers(w);
  stepWeapons(w);
  stepEffects(w);
  stepMinions(w);
  settleKills(w, (m) => onKill(w, m));
  for (const m of w.monsters) {
    if (!m.alive) continue;
    if (m.dying) {
      w.leave(m.entity, Gone.Died, m.x, m.y);
      removeMonster(w, m);
    } else if (m.gone) {
      w.leave(m.entity, Gone.Left, m.x, m.y);
      removeMonster(w, m);
    }
  }
  stepPickups(w);
}
