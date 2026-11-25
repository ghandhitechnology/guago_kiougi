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

interface Check {
  at: string;
  ok: boolean;
  failed: string[];
  violations: { check: string; characterId: string | null; detail: string }[];
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
  // Items are counted one by one in the ledger; the source view is for currencies and stacks.
  const currencies = [...new Set(rows.map((r) => r.currency))]
    .filter((c) => !c.startsWith("item:"))
    .sort();

  const { check } = await get<{ check: Check }>("/economy/check");
  const audit = h(
    "div",
    { class: "row" },
    check.ok
      ? h("span", { class: "good strong" }, "Invariants hold")
      : h("span", { class: "bad strong" }, `Invariants broken: ${check.failed.join(", ")}`),
    h("span", { class: "muted" }, `checked ${when(check.at)}`),
    h(
      "button",
      {
        type: "button",
        class: "link",
        onclick: () => void get("/economy/check?fresh=1").then(() => ctx.reload()),
      },
      "Check now",
    ),
  );
  return h(
    "div",
    null,
    h("h1", null, "Economy"),
    audit,
    check.ok
      ? null
      : table(
          ["Check", "Character", "Detail"],
          check.violations.map((v) => [
            td(v.check),
            td(
              v.characterId
                ? h("a", { href: `#/character/${v.characterId}` }, v.characterId.slice(0, 8))
                : "",
            ),
            td(v.detail),
          ]),
        ),
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
  fromId: string;
  toId: string;
  from: string | null;
  to: string | null;
  itemIds: string[];
  defs: string[];
  tax: string;
  payload: unknown;
}

/** What moved, in a line: `ink ×2 · 950 each · 1,900` for a board sale, the defs otherwise. */
function moved(t: TradeRow): string {
  const p = t.payload as { def?: string; qty?: number; unitPrice?: string; total?: string } | null;
  if (t.kind === "board" && p?.def && p.total) {
    return `${p.def} ×${p.qty ?? 1} · ${amount(p.unitPrice ?? "0")} each · ${amount(p.total)}`;
  }
  return t.defs.join(", ");
}

export async function tradesScreen(ctx: Ctx): Promise<Node> {
  const p = ctx.params;
  const params = {
    character: p.get("character"),
    with: p.get("with"),
    def: p.get("def"),
    kind: p.get("kind"),
    from: p.get("from"),
    to: p.get("to"),
    before: p.get("before"),
  };
  const { trades } = await get<{ trades: TradeRow[] }>(`/trades${q(params)}`);
  const who = (id: string, name: string | null) =>
    h("a", { href: `#/character/${id}` }, name ?? id.slice(0, 8));
  return h(
    "div",
    null,
    h("h1", null, "Trades"),
    form(
      { class: "row" },
      [
        h("input", {
          name: "character",
          placeholder: "player",
          value: params.character ?? "",
          size: 14,
          "aria-label": "Player",
          "data-search": true,
          autofocus: true,
        }),
        h("input", {
          name: "with",
          placeholder: "with player",
          value: params.with ?? "",
          size: 14,
          "aria-label": "With player",
        }),
        h("input", {
          name: "def",
          placeholder: "item or pinecone",
          value: params.def ?? "",
          size: 16,
          "aria-label": "Item",
        }),
        select(
          "kind",
          [
            ["", "board and direct"],
            ["board", "board"],
            ["direct", "direct"],
          ],
          params.kind ?? "",
        ),
        h("button", { type: "submit" }, "Search"),
      ],
      async (d) => {
        const next: Record<string, string> = {};
        for (const k of ["character", "with", "def", "kind"]) {
          const v = String(d.get(k) ?? "").trim();
          if (v) next[k] = v;
        }
        go("trades", next);
      },
    ),
    table(
      ["Time", "Kind", "From", "To", "What", ["Tax", "num"]],
      trades.map((t) => [
        td(when(t.at), "when"),
        td(t.kind === "board" ? "게시판" : "직거래"),
        td(who(t.fromId, t.from)),
        td(who(t.toId, t.to)),
        td(moved(t)),
        td(amount(t.tax), "num"),
      ]),
      "No trades",
    ),
    trades.length >= 200
      ? h(
          "p",
          null,
          h(
            "a",
            { href: link("trades", { ...params, before: String(trades.at(-1)?.id) }) },
            "Older",
          ),
        )
      : null,
  );
}
