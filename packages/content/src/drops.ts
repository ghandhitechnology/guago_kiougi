import { monsterCoin, type Random } from "@guago/shared";
import type { BookDef } from "./books.ts";
import type { ClassId } from "./classes.ts";

export type RankName = "normal" | "elite" | "boss";

/**
 * Kill drops. Every credited player rolls their own (PLAN §6); drops are theirs alone, so no one
 * races for them. 솔방울 always drops, worth `monsterCoin`. 낱장 roll by rank and land on one book
 * of the Page, the spotlight subject weighted up.
 */
export const DROPS = {
  pageChance: { normal: 0.02, elite: 1, boss: 1 },
  pageCount: { normal: [1, 1], elite: [1, 2], boss: [3, 5] },
  /** Per-monster chance overrides: the tortoise is a treasure. */
  pageChanceFor: { tortoise: 0.25 } as Readonly<Record<string, number>>,
  spotlightWeight: 1.5,
  /** A coin drop splits into this many 솔방울 pickups for the burst. */
  coinPickups: [1, 3],
  despawnSeconds: 60,
  coinSprite: "pickup-cone",
  pageSprite: "pickup-page",
  pickupCue: { coin: "sfx.pickup.cone", page: "sfx.pickup.page" },
} as const;

/** Where a unit came from, so the economy ledger can attribute it (PLAN §13). */
export interface DropSource {
  readonly kind: "monster";
  readonly fieldId: string;
  readonly monsterId: string;
  readonly rank: RankName;
}

/** The `source_or_sink` key a drop is booked under in `economy_ledger`. */
export function ledgerKey(source: DropSource): string {
  return `drop.${source.rank}.${source.monsterId}.${source.fieldId}`;
}

export type DropItem =
  | { readonly kind: "coin"; readonly amount: number }
  | { readonly kind: "page"; readonly book: string; readonly qty: number };

export interface Drop {
  readonly item: DropItem;
  readonly source: DropSource;
}

export interface DropRoll {
  readonly source: DropSource;
  readonly level: number;
  /** Numeric rank for the growth formulas. */
  readonly rank: number;
  /** The monster's own coin multiplier. */
  readonly coin: number;
  /** From 운 (`statEffects`). */
  readonly dropMult: number;
  readonly coinMult: number;
  /** Books whose 낱장 this Page drops. */
  readonly books: readonly BookDef[];
  readonly spotlight: ClassId;
}

export function rollDrops(random: Random, roll: DropRoll): Drop[] {
  const { source } = roll;
  const drops: Drop[] = [];
  const amount = Math.max(
    1,
    Math.round(monsterCoin(roll.level, roll.rank) * roll.coin * roll.coinMult),
  );
  drops.push({ item: { kind: "coin", amount }, source });

  const chance =
    (DROPS.pageChanceFor[source.monsterId] ?? DROPS.pageChance[source.rank]) * roll.dropMult;
  if (roll.books.length > 0 && random.chance(chance)) {
    const [min, max] = DROPS.pageCount[source.rank];
    const qty = min + random.int(max - min + 1);
    const book = random.weighted(roll.books, (b) =>
      b.subject === roll.spotlight ? DROPS.spotlightWeight : 1,
    );
    drops.push({ item: { kind: "page", book: book.id, qty }, source });
  }
  return drops;
}
