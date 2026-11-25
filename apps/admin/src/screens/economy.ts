import { get, q } from "../api.ts";
import { amount, form, h, select, table, td, when } from "../dom.ts";
import { type Ctx, go, link } from "../nav.ts";

interface DailyTotal {
  day: string;
  currency: string;
  sourceOrSink: string;
  amount: string;
  entries: number;
}

const WALLET: [string, string][] = [
  ["pinecone", "솔방울"],
  ["merit", "상점"],
  ["token", "탐구 토큰"],
];

const big = (s: string) => BigInt(s);

/** Faucets, sinks and net per Korean calendar day for each wallet currency (PLAN §13). */
export async function economyScreen(ctx: Ctx): Promise<Node> {
  const days = Number(ctx.params.get("days") ?? 14);
  const focus = ctx.params.get("currency") ?? "pinecone";
  const { from, to, rows } = await get<{ from: string; to: string; rows: DailyTotal[] }>(
    `/economy${q({ days })}`,
  );
  const byDay = new Map<string, Map<string, { in: bigint; out: bigint }>>();
  for (const r of rows) {
    const day = byDay.get(r.day) ?? new Map();
    byDay.set(r.day, day);
    const t = day.get(r.currency) ?? { in: 0n, out: 0n };
    if (big(r.amount) > 0n) t.in += big(r.amount);
    else t.out += big(r.amount);
    day.set(r.currency, t);
  }
  const dayRows = [...byDay.keys()]
    .sort()
    .reverse()
    .map((day) => {
      const cells = WALLET.flatMap(([c]) => {
        const t = byDay.get(day)?.get(c) ?? { in: 0n, out: 0n };
        const net = t.in + t.out;
        return [
          td(amount(t.in.toString()), "num"),
          td(amount(t.out.toString()), "num"),
          td(h("span", net > 0n ? { class: "warn" } : null, amount(net.toString(), true)), "num"),
        ];
      });
      return [td(day, "when"), ...cells];
    });
  const head: (string | [string, string])[] = [
    "Day",
    ...WALLET.flatMap(([, label]): [string, string][] => [
      [`${label} in`, "num"],
      ["out", "num"],
      ["net", "num"],
    ]),
  ];

  const keys = new Map<string, { total: bigint; entries: number }>();
  for (const r of rows.filter((r) => r.currency === focus)) {
    const k = keys.get(r.sourceOrSink) ?? { total: 0n, entries: 0 };
    k.total += big(r.amount);
    k.entries += r.entries;
    keys.set(r.sourceOrSink, k);
  }
  const keyRows = [...keys]
    .sort((a, b) => (b[1].total > a[1].total ? 1 : b[1].total < a[1].total ? -1 : 0))
    .map(([key, k]) => [
      td(key),
      td(amount(k.total.toString(), true), "num"),
      td(amount(k.entries), "num"),
    ]);
  const currencies = [...new Set(rows.map((r) => r.currency))].sort();

  return h(
    "div",
    null,
    h("h1", null, "Economy"),
    form(
      { class: "row" },
      [
        select(
          "days",
          [
            ["7", "7 days"],
            ["14", "14 days"],
            ["30", "30 days"],
            ["90", "90 days"],
          ],
          String(days),
        ),
        h("button", { type: "submit" }, "Show"),
        h("span", { class: "muted" }, `${from} – ${to}, KST days`),
      ],
      async (d) => go("economy", { days: String(d.get("days")), currency: focus }),
    ),
    table(head, dayRows, "Nothing moved"),
    h("h2", null, "By source and sink"),
    h(
      "div",
      { class: "row" },
      (currencies.length ? currencies : [focus]).map((c) =>
        c === focus
          ? h("span", { class: "strong" }, c)
          : h("a", { href: link("economy", { days: String(days), currency: c }) }, c),
      ),
    ),
    table(["Source or sink", ["Total", "num"], ["Entries", "num"]], keyRows, "Nothing moved"),
  );
}

interface TradeRow {
  id: number;
  at: string;
  kind: "board" | "direct";
  from: string;
  to: string;
  payload: unknown;
  tax: string;
}

export async function tradesScreen(ctx: Ctx): Promise<Node> {
  const p = ctx.params;
  const params = { character: p.get("character"), from: p.get("from"), to: p.get("to") };
  const out = await get<{ available: boolean; rows: TradeRow[] }>(`/trades${q(params)}`);
  return h(
    "div",
    null,
    h("h1", null, "Trades"),
    form(
      { class: "row" },
      [
        h("input", {
          name: "character",
          placeholder: "character name or id",
          value: params.character ?? "",
          "data-search": true,
          autofocus: true,
        }),
        h("button", { type: "submit", disabled: !out.available }, "Search"),
      ],
      async (d) => {
        const c = String(d.get("character") ?? "").trim();
        go("trades", c ? { character: c } : {});
      },
    ),
    out.available
      ? table(
          ["Time", "Kind", "From", "To", "What", ["Tax", "num"]],
          out.rows.map((t) => [
            td(when(t.at), "when"),
            td(t.kind),
            td(h("a", { href: `#/character/${t.from}` }, t.from.slice(0, 8))),
            td(h("a", { href: `#/character/${t.to}` }, t.to.slice(0, 8))),
            td(h("pre", null, JSON.stringify(t.payload))),
            td(amount(t.tax), "num"),
          ]),
          "No trades",
        )
      : h("div", { class: "empty" }, "No trade log yet."),
  );
}
