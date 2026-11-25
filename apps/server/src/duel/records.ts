/**
 * Duels played and won per character (PLAN §14 casual, no rating): one row each, written once a
 * match is decided, never on the tick. A forfeit counts as played.
 */
import type { DuelRecord } from "@guago/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { duelRecords } from "../db/schema.ts";

export interface DuelRecords {
  /** Adds one played match to each, and a win to the winners, in one transaction. */
  add(rows: readonly { characterId: string; won: boolean }[]): Promise<void>;
  read(characterId: string): Promise<DuelRecord>;
}

export function dbRecords(db: Db): DuelRecords {
  return {
    async add(rows) {
      if (rows.length === 0) return;
      // Sorted, so two matches writing the same players lock rows in one order.
      const sorted = [...rows].sort((a, b) => (a.characterId < b.characterId ? -1 : 1));
      await db.transaction(async (tx) => {
        for (const r of sorted) {
          const won = r.won ? 1 : 0;
          await tx
            .insert(duelRecords)
            .values({ characterId: r.characterId, played: 1, won })
            .onConflictDoUpdate({
              target: duelRecords.characterId,
              set: {
                played: sql`${duelRecords.played} + 1`,
                won: sql`${duelRecords.won} + ${won}`,
                updatedAt: sql`now()`,
              },
            });
        }
      });
    },
    async read(characterId) {
      const [row] = await db
        .select({ played: duelRecords.played, won: duelRecords.won })
        .from(duelRecords)
        .where(eq(duelRecords.characterId, characterId));
      return row ?? { played: 0, won: 0 };
    },
  };
}

/** For a server run without a database (tests, tools). */
export function memoryRecords(): DuelRecords {
  const rows = new Map<string, DuelRecord>();
  return {
    async add(list) {
      for (const r of list) {
        const now = rows.get(r.characterId) ?? { played: 0, won: 0 };
        rows.set(r.characterId, { played: now.played + 1, won: now.won + (r.won ? 1 : 0) });
      }
    },
    async read(characterId) {
      return rows.get(characterId) ?? { played: 0, won: 0 };
    },
  };
}
