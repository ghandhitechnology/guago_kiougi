/**
 * What a character's body carries out of a fight and back in (PLAN §6, §19 reconnect): its share
 * of HP, its cooldowns and the control mode it chose. A body leaves on a disconnect that is not
 * held, a door or 명령퇴사; whatever map it enters next, within a quarter of an hour, it comes
 * back as it left instead of rested. A body that leaves while knocked out has woken at the
 * 보건실: full HP, and the 기절 counted against it by the room. The control mode is the
 * character's own and is stored with it (`characters.control_mode`).
 */

import { CONTROL_MODES, Mode, type Player } from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";

/** How long a left body's numbers are remembered. */
const KEEP_MS = 15 * 60_000;

interface Carried {
  readonly hpShare: number;
  /** Ticks left on each book slot and on the dodge. */
  readonly ready: readonly number[];
  readonly dodgeLeft: number;
  readonly at: number;
}

const carried = new Map<string, Carried>();

/** Remembers a leaving body's numbers; one that leaves knocked out has woken rested. */
export function carryOut(characterId: string, p: Player, tick: number): void {
  const woke = p.down;
  carried.set(characterId, {
    hpShare: woke ? 1 : Math.min(1, Math.max(0.01, p.hp / p.kit.maxHp)),
    ready: Array.from(p.ready.subarray(0, p.kit.weapons.length), (v) => Math.max(0, v)),
    dodgeLeft: Math.max(0, p.dodgeReadyAt - tick),
    at: Date.now(),
  });
  if (carried.size > 10_000) forgetOld();
}

/** Puts a re-entering body back as it left, if it left recently. */
export function carryIn(characterId: string, p: Player, tick: number): void {
  const c = carried.get(characterId);
  carried.delete(characterId);
  if (!c || Date.now() - c.at > KEEP_MS) return;
  p.hp = Math.max(1, c.hpShare * p.kit.maxHp);
  for (let i = 0; i < c.ready.length && i < p.ready.length; i++) {
    p.ready[i] = Math.max(p.ready[i] as number, c.ready[i] as number);
  }
  p.dodgeReadyAt = tick + c.dodgeLeft;
}

function forgetOld(): void {
  const now = Date.now();
  for (const [id, c] of carried) if (now - c.at > KEEP_MS) carried.delete(id);
}

/** Reads and writes a character's control mode. */
export interface ModeStore {
  read(characterId: string): Promise<Mode | undefined>;
  write(characterId: string, mode: Mode): Promise<void>;
}

/** Without a database (tests, tools): every character starts in 반자동. */
export const memoryModes: ModeStore = {
  read: async () => undefined,
  write: async () => {},
};

/** The control mode in `characters.control_mode`. */
export function dbModes(db: Db): ModeStore {
  return {
    async read(characterId) {
      const { rows } = await db.execute(
        sql`select control_mode from characters where id = ${characterId}`,
      );
      const name = rows[0]?.control_mode as string | undefined;
      const i = name === undefined ? -1 : (CONTROL_MODES as readonly string[]).indexOf(name);
      return i >= 0 ? (i as Mode) : undefined;
    },
    async write(characterId, mode) {
      const name = CONTROL_MODES[mode] ?? "semi";
      await db.execute(sql`update characters set control_mode = ${name} where id = ${characterId}`);
    },
  };
}

export const DEFAULT_MODE: Mode = Mode.Semi;
