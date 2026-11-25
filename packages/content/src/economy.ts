import {
  type Currency,
  earn,
  type Outcome,
  type Purse,
  pageScale,
  pay,
  Random,
} from "@guago/shared";
import type { DropSource } from "./drops.ts";

/**
 * Materials and the 자판기 (PLAN §13). Names and bag text are the narrative's item descriptions,
 * referenced by `description` id.
 */
export interface MaterialDef {
  readonly currency: Currency | "sheet";
  readonly description: string;
  /** Where it comes from, for the economy report. */
  readonly sources: readonly ("drop" | "pool" | "quest" | "shop" | "rules")[];
  /** What spends it. */
  readonly sinks: readonly string[];
}

export const MATERIALS: readonly MaterialDef[] = [
  {
    currency: "pinecone",
    description: "pinecone",
    sources: ["drop", "pool", "quest"],
    sinks: [
      "sink.pilgi",
      "sink.bind",
      "sink.forge",
      "sink.shop",
      "sink.stat-reset",
      "sink.club",
      "sink.trade-tax",
      "sink.board-fee",
      "sink.board-tax",
    ],
  },
  {
    currency: "sheet",
    description: "sheet",
    sources: ["drop", "pool", "quest"],
    sinks: ["sink.bind", "sink.feed"],
  },
  { currency: "ink", description: "ink", sources: ["drop", "quest"], sinks: ["sink.pilgi"] },
  { currency: "binding", description: "binding", sources: ["drop", "quest"], sinks: ["sink.bind"] },
  { currency: "merit", description: "merit", sources: ["rules"], sinks: ["sink.council-shop"] },
  { currency: "token", description: "token", sources: ["rules"], sinks: ["sink.research-shop"] },
];

export type ShopEffect =
  | { readonly kind: "heal"; readonly share: number }
  | {
      readonly kind: "buff";
      readonly stat: "exp" | "pinecone" | "damage" | "moveSpeed" | "regen";
      readonly amount: number;
      readonly seconds: number;
    }
  | { readonly kind: "clearDrowsy" };

export interface ShopItem {
  readonly id: string;
  /** Narrative description id: `snack:water`, or the hub's `energy-drink`. */
  readonly description: string;
  /** 솔방울 on Page 1; each later Page's stock costs ×10 (`pageScale`). */
  readonly price: number;
  readonly effect: ShopEffect;
  readonly icon: string;
}

const snack = (
  id: string,
  price: number,
  effect: ShopEffect,
  description = `snack:${id}`,
): ShopItem => ({
  id,
  description,
  price,
  effect,
  icon: `snack/${id}`,
});

/**
 * Fixed stock and fixed prices; no random boxes (PLAN §13). Once a week one special from
 * `weekly` takes the last slot. A potion costs about half a minute of same-level hunting coin
 * at the middle of the Page.
 */
export const VENDING = {
  fixed: [
    snack("water", 30, { kind: "heal", share: 0.15 }),
    snack("banana-milk", 80, { kind: "heal", share: 0.35 }),
    snack("energy-drink", 150, { kind: "clearDrowsy" }, "energy-drink"),
    snack("kimbap", 120, { kind: "buff", stat: "regen", amount: 0.01, seconds: 300 }),
    snack("choco-bar", 200, { kind: "buff", stat: "damage", amount: 0.05, seconds: 600 }),
  ],
  weekly: [
    snack("cup-ramen", 600, { kind: "buff", stat: "exp", amount: 0.1, seconds: 900 }),
    snack("pudding", 600, { kind: "buff", stat: "pinecone", amount: 0.1, seconds: 900 }),
    snack("ice-pop", 400, { kind: "buff", stat: "moveSpeed", amount: 0.1, seconds: 900 }),
  ],
} as const;

/**
 * The 자판기's week, counted from Monday 05:00 KST like the weekly board (PLAN §15). 1970-01-01
 * was a Thursday, so three days shift the count onto Mondays.
 */
export function vendingWeek(ms: number): number {
  const day = Math.floor((ms + (9 - 5) * 3600_000) / 86_400_000);
  return Math.floor((day + 3) / 7);
}

/** This week's stock: the fixed five and one special, drawn by the week number. */
export function vendingStock(week: number): readonly ShopItem[] {
  return [...VENDING.fixed, new Random(week).pick(VENDING.weekly)];
}

export function shopPrice(item: ShopItem, page: number): number {
  return item.price * pageScale(page);
}

/**
 * Buying from the 자판기: the price leaves the economy as `sink.shop` and the goods land in the
 * bag as `snack:<id>`, booked as `shop.vending`.
 */
export function buy(
  purse: Purse,
  item: ShopItem,
  qty: number,
  page: number,
): Outcome<{ purse: Purse; item: string; qty: number }> {
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: "buy_qty" };
  const paid = pay(purse, { pinecone: shopPrice(item, page) * qty }, "sink.shop");
  if (!paid) return { ok: false, error: "buy_cost" };
  const goods = earn(paid.purse, { [goodsOf(item.id)]: qty }, "shop.vending");
  const ledger = [...paid.ledger, ...goods.ledger];
  return { ok: true, state: { purse: goods.purse, item: item.id, qty }, ledger };
}

/** The bag currency a 자판기 item is held as. */
export const goodsOf = (id: string): Currency => `snack:${id}`;

/**
 * Where an item is made (PLAN §13 "Bound items"). A bound item never leaves its first owner:
 * era boss drops, quest rewards and what 상점 or 탐구 토큰 buy. The 신입생 kit is bound too, so
 * throwaway characters cannot mint books to pass on. Bought or received items are not bound;
 * they wait out `TRADE.retradeHours` instead.
 */
export type ItemOrigin =
  | "kit"
  | "craft"
  | "drop"
  | "era-drop"
  | "quest"
  | "council-shop"
  | "research-shop"
  | "mentor-shop";

const BOUND_ORIGINS: ReadonlySet<ItemOrigin> = new Set([
  "kit",
  "era-drop",
  "quest",
  "council-shop",
  "research-shop",
]);

export const bindsOn = (origin: ItemOrigin): boolean => BOUND_ORIGINS.has(origin);

/** A monster drop is bound when an era boss dropped it. */
export const dropOrigin = (source: DropSource): ItemOrigin => (source.era ? "era-drop" : "drop");
