/**
 * What a client asks of the world between two ticks (PLAN §19 determinism): aim, a control mode,
 * a revive. A room queues them as they arrive and applies them, in arrival order, at the start of
 * the next tick, so a session is the seed plus the inputs plus these records, each at a tick
 * boundary. Movement and casts travel in the input stream itself (`FightInputs`).
 */

import { startRevive } from "./players.ts";
import type { FightWorld, Mode } from "./world.ts";

export type Between =
  | { readonly t: "aim"; readonly player: string; readonly aim: { dx: number; dy: number } | null }
  | { readonly t: "mode"; readonly player: string; readonly mode: Mode }
  | { readonly t: "revive"; readonly player: string; readonly target: string };

/** Applies one record to the world; a record for a body that has gone is dropped. */
export function applyBetween(w: FightWorld, e: Between): void {
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
