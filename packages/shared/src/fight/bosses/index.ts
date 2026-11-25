/** Page 1's boss brains by id, and starting a boss fight in a world. */

import { Boss, type BossBrain } from "../boss.ts";
import type { FightWorld } from "../world.ts";
import { aristotle } from "./aristotle.ts";
import { pythagoreans } from "./pythagoreans.ts";
import { zeno } from "./zeno.ts";

export { AristotleMode } from "./aristotle.ts";
export { CROTON_GRID } from "./pythagoreans.ts";
export { ZenoMode } from "./zeno.ts";

export const BOSS_BRAINS: Readonly<Record<string, BossBrain>> = { pythagoreans, zeno, aristotle };

/** Where each boss stands at the start, by map mark. */
const HOME_MARK: Readonly<Record<string, string>> = {
  pythagoreans: "grid-center",
  zeno: "zeno",
  aristotle: "lectern",
};

/**
 * Starts boss `id` in `w` at `level`, its first phase at `hp` (its solo size when omitted).
 * `external` leaves phase changes to whoever shares the pool (the server's raid).
 */
export function startBoss(
  w: FightWorld,
  id: string,
  level: number,
  opts: { hp?: number; external?: boolean } = {},
): Boss {
  const rule = w.rules.bosses.find((r) => r.id === id);
  const brain = BOSS_BRAINS[id];
  if (!rule || !brain) throw new Error(`no boss ${id}`);
  const at = w.map.marks?.[HOME_MARK[id] ?? "boss"] ?? w.map.marks?.boss ?? w.map.spawn;
  const b = new Boss(rule, brain, level);
  b.external = opts.external ?? false;
  b.start(w, at.x, at.y, opts.hp);
  return b;
}
