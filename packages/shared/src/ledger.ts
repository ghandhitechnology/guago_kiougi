/**
 * Currencies and the economy ledger (PLAN §13, §20 `economy_ledger`). Every operation that moves
 * a currency is a pure function from (state, request, random roll) to (new state, ledger
 * entries); the server runs it inside one transaction under the request's operation id and books
 * each entry under its `key`. A positive amount is a faucet, a negative one a sink.
 */
export type Currency =
  | "pinecone"
  | "merit"
  | "token"
  | "ink"
  | "binding"
  | `sheet:${string}`
  /** Consumables held in the bag (자판기 goods), counted like materials. */
  | `snack:${string}`;

/** What one character holds of each currency. Missing means zero. */
export type Purse = Readonly<Partial<Record<Currency, number>>>;

export interface LedgerEntry {
  readonly currency: Currency;
  readonly amount: number;
  /** `source_or_sink`: `drop.normal.odap.p1-colonnade`, `sink.pilgi`, `pool`, `quest.daily`. */
  readonly key: string;
}

export type Outcome<S> =
  | { readonly ok: true; readonly state: S; readonly ledger: readonly LedgerEntry[] }
  | { readonly ok: false; readonly error: string };

export type Amounts = Partial<Record<Currency, number>>;

export const sheet = (book: string): Currency => `sheet:${book}`;

/**
 * The Korean calendar day (UTC+9) of a moment, `YYYY-MM-DD`: the ledger's `day`, by the server's
 * clock (PLAN §13 daily totals).
 */
export function koreanDay(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

export function balance(purse: Purse, currency: Currency): number {
  return purse[currency] ?? 0;
}

export function canAfford(purse: Purse, cost: Amounts): boolean {
  return Object.entries(cost).every(([c, n]) => balance(purse, c as Currency) >= (n ?? 0));
}

/** Takes `cost` from the purse, or `null` when it falls short. */
export function pay(
  purse: Purse,
  cost: Amounts,
  key: string,
): { purse: Purse; ledger: LedgerEntry[] } | null {
  if (!canAfford(purse, cost)) return null;
  const next: Partial<Record<Currency, number>> = { ...purse };
  const ledger: LedgerEntry[] = [];
  for (const [c, n] of Object.entries(cost) as [Currency, number][]) {
    if (!n) continue;
    next[c] = balance(purse, c) - n;
    ledger.push({ currency: c, amount: -n, key });
  }
  return { purse: next, ledger };
}

export function earn(
  purse: Purse,
  gain: Amounts,
  key: string,
): { purse: Purse; ledger: LedgerEntry[] } {
  const next: Partial<Record<Currency, number>> = { ...purse };
  const ledger: LedgerEntry[] = [];
  for (const [c, n] of Object.entries(gain) as [Currency, number][]) {
    if (!n) continue;
    next[c] = balance(purse, c) + n;
    ledger.push({ currency: c, amount: n, key });
  }
  return { purse: next, ledger };
}
