import { type LedgerEntry, monsterCoin, type Random, sheet } from "@guago/shared";
import type { ToolDef } from "./attacks.ts";
import type { BookDef } from "./books.ts";
import type { ClassId } from "./classes.ts";

export type RankName = "normal" | "elite" | "boss";

/**
 * Kill drops. Every credited player rolls their own (PLAN §6); drops are theirs alone, so no one
 * races for them. 솔방울 always drops, worth `monsterCoin`. 낱장 land on one book of the Page,
 * the spotlight subject weighted up. 잉크 and 제본 재료 feed 필기 and 제본 (PLAN §13); tools come
 * only from elites and bosses, so a tool is an event.
 */
export const DROPS = {
  pageChance: { normal: 0.02, elite: 1, boss: 1 },
  pageCount: { normal: [1, 1], elite: [1, 2], boss: [3, 5] },
  /** Per-monster chance overrides: the tortoise is a treasure. */
  pageChanceFor: { tortoise: 0.25 } as Readonly<Record<string, number>>,
  inkChance: { normal: 0.03, elite: 1, boss: 1 },
  inkCount: { normal: [1, 2], elite: [5, 10], boss: [20, 30] },
  bindingChance: { normal: 0.002, elite: 0.2, boss: 1 },
  toolChance: { normal: 0, elite: 0.08, boss: 1 },
  spotlightWeight: 1.5,
  /** A coin drop splits into this many 솔방울 pickups for the burst. */
  coinPickups: [1, 3],
  despawnSeconds: 60,
  coinSprite: "pickup-cone",
  pageSprite: "pickup-page",
  inkSprite: "pickup-ink",
  bindingSprite: "pickup-binding",
  toolSprite: "pickup-tool",
  pickupCue: {
    coin: "sfx.pickup.cone",
    page: "sfx.pickup.page",
    material: "sfx.pickup.material",
    tool: "sfx.pickup.tool",
  },
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
  | { readonly kind: "page"; readonly book: string; readonly qty: number }
  | { readonly kind: "ink"; readonly qty: number }
  | { readonly kind: "binding"; readonly qty: number }
  | { readonly kind: "tool"; readonly tool: string };

export interface Drop {
  readonly item: DropItem;
  readonly source: DropSource;
}

/** The ledger entry a picked-up drop books; tools are items, not currency, and book nothing. */
export function dropLedger(drop: Drop): LedgerEntry | null {
  const key = ledgerKey(drop.source);
  const { item } = drop;
  switch (item.kind) {
    case "coin":
      return { currency: "pinecone", amount: item.amount, key };
    case "page":
      return { currency: sheet(item.book), amount: item.qty, key };
    case "ink":
      return { currency: "ink", amount: item.qty, key };
    case "binding":
      return { currency: "binding", amount: item.qty, key };
    case "tool":
      return null;
  }
}

export interface DropRoll {
  readonly source: DropSource;
  readonly level: number;
  /** Numeric rank for the growth formulas. */
  readonly rank: number;
  /** The monster's own coin multiplier. */
  readonly coin: number;
  /** From 운 (`statEffects`) and 원소 카드. */
  readonly dropMult: number;
  readonly coinMult: number;
  /** Books whose 낱장 this Page drops, and its tools. */
  readonly books: readonly BookDef[];
  readonly tools: readonly ToolDef[];
  readonly spotlight: ClassId;
}

export function rollDrops(random: Random, roll: DropRoll): Drop[] {
  const { source } = roll;
  const rank = source.rank;
  const drops: Drop[] = [];
  const between = ([min, max]: readonly [number, number] | readonly number[]) =>
    (min ?? 1) + random.int((max ?? 1) - (min ?? 1) + 1);
  const amount = Math.max(
    1,
    Math.round(monsterCoin(roll.level, roll.rank) * roll.coin * roll.coinMult),
  );
  drops.push({ item: { kind: "coin", amount }, source });

  const pageChance =
    (DROPS.pageChanceFor[source.monsterId] ?? DROPS.pageChance[rank]) * roll.dropMult;
  if (roll.books.length > 0 && random.chance(pageChance)) {
    const book = random.weighted(roll.books, (b) =>
      b.subject === roll.spotlight ? DROPS.spotlightWeight : 1,
    );
    drops.push({
      item: { kind: "page", book: book.id, qty: between(DROPS.pageCount[rank]) },
      source,
    });
  }
  if (random.chance(DROPS.inkChance[rank] * roll.dropMult))
    drops.push({ item: { kind: "ink", qty: between(DROPS.inkCount[rank]) }, source });
  if (random.chance(DROPS.bindingChance[rank] * roll.dropMult))
    drops.push({ item: { kind: "binding", qty: 1 }, source });
  if (roll.tools.length > 0 && random.chance(DROPS.toolChance[rank]))
    drops.push({ item: { kind: "tool", tool: random.pick(roll.tools).id }, source });
  return drops;
}
