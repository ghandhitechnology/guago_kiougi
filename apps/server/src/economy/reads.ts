/**
 * The login read (PLAN §19 "Character state loads on join"): a character's wallet, materials,
 * items, progression, 도감 and quests in one consistent snapshot. After it, the client follows
 * the change notice each operation returns.
 */
import type { InventorySnapshot } from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import {
  CHARACTER_COLUMNS,
  characterFromDb,
  ITEM_COLUMNS,
  itemFromDb,
  itemView,
  progressionView,
  questFromDb,
  questView,
} from "./rows.ts";

/** Null when the character does not exist, or has no wallet yet (no kit was made). */
export async function readInventory(
  db: Db,
  characterId: string,
  now: Date,
  page: number,
): Promise<InventorySnapshot | null> {
  // One snapshot of the database for every query, so no operation lands halfway through.
  return db.transaction(
    async (tx) => {
      const c = await tx.execute(
        sql`select ${sql.raw(CHARACTER_COLUMNS)} from characters c where c.id = ${characterId}`,
      );
      const w = await tx.execute(
        sql`select pinecones, merit_points, tokens from wallets where character_id = ${characterId}`,
      );
      const charRow = c.rows[0];
      const wallet = w.rows[0] as Record<string, string> | undefined;
      if (!charRow || !wallet) return null;
      const character = characterFromDb(charRow);
      const [materials, items, codex, quests] = [
        await tx.execute(
          sql`select def_id, qty from materials where character_id = ${characterId} and qty > 0 order by def_id`,
        ),
        await tx.execute(
          sql`select ${sql.raw(ITEM_COLUMNS)} from items where owner_id = ${characterId} order by created_at, id`,
        ),
        await tx.execute(
          sql`select entry_id from codex_unlocks where character_id = ${characterId} order by unlocked_at, entry_id`,
        ),
        await tx.execute(
          sql`select quest_id, state, progress, target, offer from quest_progress where character_id = ${characterId} order by quest_id`,
        ),
      ];
      return {
        rev: character.rev,
        wallet: {
          pinecone: wallet.pinecones as string,
          merit: wallet.merit_points as string,
          token: wallet.tokens as string,
        },
        materials: Object.fromEntries(
          materials.rows.map((r) => [r.def_id as string, Number(r.qty)]),
        ),
        items: items.rows.map((r) => itemView(itemFromDb(r))),
        progression: progressionView(character, now, page),
        codex: codex.rows.map((r) => r.entry_id as string),
        quests: quests.rows.map((r) => questView(questFromDb(r))),
      } satisfies InventorySnapshot;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
