/**
 * What changes the world between two ticks (PLAN §19 determinism): a client's aim, control mode
 * or revive, and a boss arena's shared pool (`boss`: the body going up, the pool every channel
 * left, a new 논제, 토론 시간, freed). A room queues them and applies them, in order, at the start
 * of the next tick, so a session is the seed plus the inputs plus these records, each at a tick
 * boundary. Movement and casts travel in the input stream itself (`FightInputs`).
 */

import { Boss } from "./boss.ts";
import { startBoss } from "./bosses/index.ts";
import { startRevive } from "./players.ts";
import type { FightWorld, Mode } from "./world.ts";

/** A boss arena's shared numbers as the raid left them after a tick (`raid/arena.ts`). */
export interface BossRecord {
  readonly t: "boss";
  readonly id: string;
  readonly level: number;
  readonly phase: number;
  readonly hp: number;
  readonly max: number;
  readonly shield: number;
  readonly emptied: boolean;
  readonly debate: boolean;
  readonly freed: boolean;
}

export type Between =
  | { readonly t: "aim"; readonly player: string; readonly aim: { dx: number; dy: number } | null }
  | { readonly t: "mode"; readonly player: string; readonly mode: Mode }
  | { readonly t: "revive"; readonly player: string; readonly target: string }
  | BossRecord;

/**
 * The arena's boss as the record says: put up (at its phase) if this world has none standing,
 * freed, or its phase, pool, shield and 토론 시간 set.
 */
function applyBoss(w: FightWorld, e: BossRecord): void {
  const now = w.boss instanceof Boss && w.boss.rule.id === e.id && !w.boss.freed ? w.boss : null;
  if (!now) {
    if (e.freed) return;
    const b = startBoss(w, e.id, e.level, { hp: e.max, external: true });
    if (e.phase > 1) b.setPhase(w, e.phase, e.max, e.shield);
    b.sync(e.hp, e.max, e.shield, e.emptied);
    b.debate = e.debate;
    return;
  }
  if (e.freed) {
    now.free(w);
    return;
  }
  if (e.phase !== now.phase) now.setPhase(w, e.phase, e.max, e.shield);
  now.sync(e.hp, e.max, e.shield, e.emptied);
  now.debate = e.debate;
}

/** Applies one record to the world; a record for a body that has gone is dropped. */
export function applyBetween(w: FightWorld, e: Between): void {
  if (e.t === "boss") {
    applyBoss(w, e);
    return;
  }
  const p = w.playerById(e.player);
  if (!p) return;
  switch (e.t) {
    case "aim":
      p.aiming = e.aim !== null;
      p.aimX = e.aim?.dx ?? 0;
      p.aimY = e.aim?.dy ?? 0;
      break;
    case "mode":
      p.mode = e.mode;
      p.casts = 0;
      break;
    case "revive": {
      const target = w.playerById(e.target);
      if (target) startRevive(w, p, target);
      break;
    }
  }
}
