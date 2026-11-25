/**
 * Equipping books and tools (PLAN §7): slots per 전직 tier, the 전공 and the 부전공's two slots
 * per kind. Pure, like the item operations: the server loads what is worn, asks here, and writes
 * the answer back.
 */
import type { Major } from "./api.ts";
import type { Outcome } from "./ledger.ts";
import { hasUnlock, MINOR_SLOTS, type Tier } from "./progress.ts";

export const ITEM_KINDS = ["book", "tool"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Most slots of one kind any tier has (연구생, PLAN §7). */
export const MAX_SLOTS = 6;

export interface Wearable {
  readonly id: string;
  readonly def: string;
  readonly kind: ItemKind;
  /** A book's subject; for a tool, the subject of the book it is linked to. */
  readonly subject: Major;
}

export interface Worn extends Wearable {
  readonly slot: number;
}

export interface Wearer {
  readonly tier: Tier;
  readonly major: Major;
  readonly minor: Major | null;
}

export function slotCount(tier: Tier, kind: ItemKind): number {
  return kind === "book" ? tier.books : tier.tools;
}

const fail = (error: string) => ({ ok: false, error }) as const;

/**
 * Puts `item` into `slot`. The slot must exist at the wearer's tier; the item must belong to the
 * 전공, or to the 부전공 once the tier unlocks it, within its two slots per kind; one definition
 * is worn once. Whatever sat in the slot goes back to the bag, and an item worn elsewhere moves.
 */
export function equip(
  worn: readonly Worn[],
  item: Wearable,
  slot: number,
  wearer: Wearer,
): Outcome<readonly Worn[]> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount(wearer.tier, item.kind)) {
    return fail("equip_slot");
  }
  const minor =
    wearer.minor !== null && hasUnlock(wearer.tier, "minor") && item.subject === wearer.minor;
  if (item.subject !== wearer.major && !minor) return fail("equip_subject");
  const others = worn.filter((w) => w.id !== item.id && !(w.kind === item.kind && w.slot === slot));
  const sameKind = others.filter((w) => w.kind === item.kind);
  if (sameKind.some((w) => w.def === item.def)) return fail("equip_duplicate");
  const minorCap = item.kind === "book" ? MINOR_SLOTS.books : MINOR_SLOTS.tools;
  if (minor && sameKind.filter((w) => w.subject === wearer.minor).length >= minorCap) {
    return fail("equip_minor_slots");
  }
  return { ok: true, state: [...others, { ...item, slot }], ledger: [] };
}

export function unequip(worn: readonly Worn[], id: string): Outcome<readonly Worn[]> {
  if (!worn.some((w) => w.id === id)) return fail("equip_not_worn");
  return { ok: true, state: worn.filter((w) => w.id !== id), ledger: [] };
}

/** Copies an operation eats (제련's spares, a merged tool) must come from the bag, not a slot. */
export function allInBag(worn: readonly Worn[], ids: readonly string[]): boolean {
  return !ids.some((id) => worn.some((w) => w.id === id));
}
