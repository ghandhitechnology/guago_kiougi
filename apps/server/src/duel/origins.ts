/**
 * Where each fighter stood before its match, kept in the database for as long as the match lasts
 * (review finding 14): the trip to the floor saves the floor as the character's place, so a crash
 * mid-match would otherwise leave it on the 새벽관. The server puts every row back at start, and
 * a fighter who left the match while offline is put back at once.
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { duelOrigins } from "../db/schema.ts";

export interface DuelOrigins {
  save(rows: readonly { characterId: string; map: string; x: number; y: number }[]): Promise<void>;
  /** Writes the origin back as the character's place and forgets it. */
  restore(characterId: string): Promise<void>;
  forget(characterId: string): Promise<void>;
  /** At server start, before any room: every character still out at a match goes back. */
  restoreAll(): Promise<number>;
}

export function dbOrigins(db: Db): DuelOrigins {
  /** Places back from the rows (one character's, or all) and the rows gone, in one go. */
  const back = (characterId: string | undefined) =>
    db.transaction(async (tx) => {
      const one = characterId === undefined ? sql`` : sql`and o.character_id = ${characterId}`;
      const { rowCount } = await tx.execute(sql`
        update characters c set map_id = o.map_id, x = o.x, y = o.y
        from duel_origins o where o.character_id = c.id ${one}`);
      await tx.execute(
        characterId === undefined
          ? sql`delete from duel_origins`
          : sql`delete from duel_origins where character_id = ${characterId}`,
      );
      return rowCount ?? 0;
    });
  return {
    async save(rows) {
      if (rows.length === 0) return;
      await db
        .insert(duelOrigins)
        .values(rows.map((r) => ({ characterId: r.characterId, mapId: r.map, x: r.x, y: r.y })))
        .onConflictDoUpdate({
          target: duelOrigins.characterId,
          set: {
            mapId: sql`excluded.map_id`,
            x: sql`excluded.x`,
            y: sql`excluded.y`,
            at: sql`now()`,
          },
        });
    },
    async restore(characterId) {
      await back(characterId);
    },
    async forget(characterId) {
      await db.delete(duelOrigins).where(eq(duelOrigins.characterId, characterId));
    },
    restoreAll: () => back(undefined),
  };
}

/** Without a database (tests, tools). */
export function memoryOrigins(): DuelOrigins & {
  rows: Map<string, { map: string; x: number; y: number }>;
} {
  const rows = new Map<string, { map: string; x: number; y: number }>();
  return {
    rows,
    async save(list) {
      for (const r of list) rows.set(r.characterId, { map: r.map, x: r.x, y: r.y });
    },
    async restore(characterId) {
      rows.delete(characterId);
    },
    async forget(characterId) {
      rows.delete(characterId);
    },
    async restoreAll() {
      const n = rows.size;
      rows.clear();
      return n;
    },
  };
}
