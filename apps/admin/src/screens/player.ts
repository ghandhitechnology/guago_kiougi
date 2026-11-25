import { get, post } from "../api.ts";
import { amount, form, h, select, table, td, when } from "../dom.ts";
import type { Ctx } from "../nav.ts";
import { type ChatLine, chatTable } from "./chat.ts";
import { type IpPreview, ipOptions, ipPreview, ipScopeOf } from "./ipban.ts";
import { MAJOR, type PlayerRow, statusCell } from "./players.ts";

interface Sanction {
  id: number;
  reason: string;
  startsAt: string;
  endsAt: string | null;
  admin: string;
  liftedAt: string | null;
  liftedBy: string | null;
  liftReason: string | null;
  ips?: number;
}

interface Player extends PlayerRow {
  ageConfirmed: boolean;
  demerits: number | null;
  merits: number | null;
  mapId: string | null;
  tier: number | null;
  ips: number;
  online: boolean;
  mutedUntil: number | "lifted" | null;
  bans: Sanction[];
  mutes: Sanction[];
  strikes: {
    id: number;
    at: string;
    lineAt: string;
    body: string;
    demerits: number;
    admin: string;
  }[];
  conduct: { id: number; at: string; kind: "demerit" | "merit"; amount: number; reason: string }[];
  reports: {
    id: number;
    at: string;
    category: string;
    state: string;
    note: string | null;
    side: "by" | "against";
    reporter: string | null;
    target: string | null;
  }[];
}

interface Partner {
  partner: string;
  name: string | null;
  trades: number;
  sent: string;
  received: string;
}

interface Item {
  id: string;
  def: string;
  kind: string;
  grade: number;
  level: number;
  pilgi: number;
  evolved: boolean;
  bound: boolean;
  slot: number | null;
}

interface Inventory {
  wallet: { pinecone: string; merit: string; token: string };
  materials: Record<string, number>;
  items: Item[];
  ledger: {
    id: number;
    at: string;
    operation: string;
    currency: string;
    sourceOrSink: string;
    amount: string;
  }[];
}

export const MUTE_FOR: [string, string][] = [
  ["10", "10 minutes"],
  ["60", "1 hour"],
  ["1440", "1 day"],
  ["10080", "7 days"],
  ["", "until lifted"],
];
export const BAN_FOR: [string, string][] = [
  ["1440", "1 day"],
  ["10080", "7 days"],
  ["43200", "30 days"],
  ["", "until lifted"],
];
const GRADES = ["교과서", "참고서", "문제집", "전공서", "원서"];
const CURRENCY: Record<string, string> = {
  pinecone: "솔방울",
  merit: "상점",
  token: "탐구 토큰",
  ink: "잉크",
  binding: "제본 재료",
};

const minutesOf = (v: FormDataEntryValue | null) => (v ? Number(v) : null);
/** Mute, kick and ban reasons reach the player in the 운영진's line (`moderation.*`). */
const TOLD = "reason, shown to the player";
const reasonInput = (placeholder = "reason") =>
  h("input", { name: "reason", class: "wide", placeholder, required: true, maxlength: 500 });

function activeBan(p: Player): Sanction | undefined {
  const now = Date.now();
  return p.bans.find((b) => !b.liftedAt && (!b.endsAt || new Date(b.endsAt).getTime() > now));
}

function sanctionsTable(p: Player): Node {
  const now = Date.now();
  const rows = [
    ...p.bans.map((b) => ({ kind: b.ips ? `ban + ${b.ips} IP` : "ban", ...b })),
    ...p.mutes.map((m) => ({ kind: "mute", ...m })),
  ]
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .map((s) => {
      const live = !s.liftedAt && (!s.endsAt || new Date(s.endsAt).getTime() > now);
      return [
        td(h("span", live ? { class: "bad" } : null, s.kind)),
        td(when(s.startsAt, true), "when"),
        td(s.endsAt ? when(s.endsAt, true) : "until lifted", "when"),
        td(s.reason),
        td(s.admin),
        td(
          s.liftedAt
            ? `lifted ${when(s.liftedAt, true)} by ${s.liftedBy ?? "?"}: ${s.liftReason ?? ""}`
            : live
              ? h("span", { class: "bad" }, "in force")
              : h("span", { class: "muted" }, "ended"),
        ),
      ];
    });
  return table(["", "From", "Until", "Reason", "By", ""], rows, "None");
}

function actions(ctx: Ctx, p: Player, preview: IpPreview): Node {
  const id = p.accountId;
  const done = (what: string) => async () => {
    ctx.reload();
    return what;
  };
  const ban = activeBan(p);
  const mute =
    p.mutedUntil === null
      ? form(
          { class: "row" },
          [
            select("minutes", MUTE_FOR, "60"),
            reasonInput(TOLD),
            h("button", { type: "submit", class: "danger" }, "Mute"),
          ],
          async (d) => {
            await post(`/players/${id}/mute`, {
              reason: d.get("reason"),
              minutes: minutesOf(d.get("minutes")),
            });
            return done("Muted")();
          },
        )
      : form(
          { class: "row" },
          [
            h(
              "span",
              { class: "bad" },
              p.mutedUntil === "lifted"
                ? "muted until lifted"
                : `muted until ${when(p.mutedUntil, true)}`,
            ),
            reasonInput(),
            h("button", { type: "submit" }, "Unmute"),
          ],
          async (d) => {
            await post(`/players/${id}/unmute`, { reason: d.get("reason") });
            return done("Unmuted")();
          },
        );
  const kick = form(
    { class: "row" },
    [reasonInput(TOLD), h("button", { type: "submit", class: "danger" }, "Kick")],
    async (d) => {
      await post(`/players/${id}/kick`, { reason: d.get("reason") });
      return done("Session closed")();
    },
  );
  const banForm = ban
    ? form(
        { class: "row" },
        [
          h(
            "span",
            { class: "bad" },
            ban.endsAt ? `banned until ${when(ban.endsAt, true)}` : "banned until lifted",
          ),
          reasonInput(),
          h("button", { type: "submit" }, "Unban"),
        ],
        async (d) => {
          await post(`/players/${id}/unban`, { reason: d.get("reason") });
          return done("Unbanned")();
        },
      )
    : form(
        { class: "row" },
        [
          select("minutes", BAN_FOR, "10080"),
          ...ipOptions(preview),
          reasonInput(TOLD),
          h("button", { type: "submit", class: "danger" }, "Ban"),
        ],
        async (d) => {
          await post(`/players/${id}/ban`, {
            reason: d.get("reason"),
            minutes: minutesOf(d.get("minutes")),
            ip: ipScopeOf(d),
          });
          return done("Banned")();
        },
      );
  const grid: Node[] = [
    h("span", null, "Mute"),
    mute,
    h("span", null, "Kick"),
    kick,
    h("span", null, ban ? "Banned" : "Ban"),
    banForm,
  ];
  if (ctx.admin.role === "owner" && p.characterId) {
    const opId = crypto.randomUUID();
    grid.push(
      h("span", null, "Grant"),
      form(
        { class: "row" },
        [
          h("input", {
            name: "currency",
            list: "currencies",
            size: 12,
            value: "pinecone",
            "aria-label": "Currency",
          }),
          h("input", {
            name: "amount",
            type: "number",
            step: 1,
            size: 10,
            "aria-label": "Amount",
            placeholder: "± amount",
          }),
          h("input", {
            name: "items",
            size: 18,
            "aria-label": "Items",
            placeholder: "items to add",
          }),
          reasonInput(),
          h("button", { type: "submit" }, "Apply"),
          h(
            "datalist",
            { id: "currencies" },
            Object.keys(CURRENCY).map((c) => h("option", { value: c }, CURRENCY[c])),
          ),
        ],
        async (d) => {
          const currency = String(d.get("currency") ?? "").trim();
          const n = Number(d.get("amount") || 0);
          const add = String(d.get("items") ?? "")
            .split(/[\s,]+/)
            .filter(Boolean);
          const out = await post<{ replayed: boolean }>(`/players/${id}/grant`, {
            opId,
            reason: d.get("reason"),
            amounts: currency && n ? { [currency]: n } : {},
            add,
            remove: [],
          });
          ctx.reload();
          return out.replayed ? "Already applied" : "Applied";
        },
      ),
    );
  }
  return h("div", { class: "actions" }, grid);
}

function inventoryView(ctx: Ctx, p: Player, inv: Inventory): Node {
  const owner = ctx.admin.role === "owner";
  const wallet = h(
    "div",
    { class: "facts" },
    (Object.keys(inv.wallet) as (keyof Inventory["wallet"])[]).map((k) =>
      h("span", null, h("b", null, CURRENCY[k]), amount(inv.wallet[k])),
    ),
    Object.entries(inv.materials).map(([k, v]) =>
      h("span", null, h("b", null, CURRENCY[k] ?? k), amount(v)),
    ),
  );
  const itemRows = inv.items.map((it) => [
    owner
      ? td(h("input", { type: "checkbox", name: "item", value: it.id, "aria-label": it.def }))
      : null,
    td(it.def),
    td(it.kind === "book" ? (GRADES[it.grade] ?? it.grade) : "도구"),
    td(it.level, "num"),
    td(it.kind === "book" ? it.pilgi : "", "num"),
    td(it.slot === null ? "" : `slot ${it.slot}`),
    td([it.evolved ? "evolved " : "", it.bound ? "bound" : ""], "muted"),
    td(it.id.slice(0, 8), "id"),
  ]);
  const items = table(
    [...(owner ? [""] : []), "Item", "Grade", ["Lv", "num"], ["필기", "num"], "Worn", "", "Id"],
    itemRows,
    "No items",
  );
  const take = owner
    ? form(
        {},
        [
          items,
          inv.items.length > 0
            ? h(
                "div",
                { class: "row" },
                reasonInput(),
                h("button", { type: "submit", class: "danger" }, "Take selected"),
              )
            : null,
        ],
        async (d) => {
          const remove = d.getAll("item").map(String);
          if (remove.length === 0) throw new Error("Select the items to take.");
          await post(`/players/${p.accountId}/grant`, {
            opId: crypto.randomUUID(),
            reason: d.get("reason"),
            amounts: {},
            add: [],
            remove,
          });
          ctx.reload();
          return "Taken";
        },
      )
    : items;
  const ledger = table(
    ["Time", "Currency", "Source or sink", ["Amount", "num"], "Operation"],
    inv.ledger.map((l) => [
      td(when(l.at), "when"),
      td(CURRENCY[l.currency] ?? l.currency),
      td(l.sourceOrSink),
      td(amount(l.amount, true), "num"),
      td(l.operation.length > 24 ? `${l.operation.slice(0, 24)}…` : l.operation, "id"),
    ]),
    "No entries",
  );
  return h(
    "div",
    null,
    h("h2", null, "Wallet"),
    wallet,
    h("h2", null, "Items"),
    take,
    h(
      "h2",
      null,
      "Ledger",
      h("span", { class: "muted" }, "  per operation for 90 days, then one row per day, same sums"),
    ),
    ledger,
  );
}

/** Ids from the address bar go into API paths only when they are ids. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function playerScreen(ctx: Ctx, accountId: string): Promise<Node> {
  if (!UUID.test(accountId)) return h("p", { class: "error" }, "Not found.");
  const [{ player: p }, preview] = await Promise.all([
    get<{ player: Player }>(`/players/${accountId}`),
    ipPreview(accountId),
  ]);
  const [chat, inv, partners] = p.characterId
    ? await Promise.all([
        get<{ lines: ChatLine[] }>(`/players/${accountId}/chat`),
        get<{ inventory: Inventory }>(`/players/${accountId}/inventory`),
        get<{ partners: Partner[] }>(`/players/${accountId}/partners`),
      ])
    : [null, null, null];
  const facts = h(
    "div",
    { class: "facts" },
    h("span", null, h("b", null, "login"), p.loginId),
    h("span", null, statusCell(p.status)),
    h(
      "span",
      null,
      p.online ? h("span", { class: "good" }, "online") : h("span", { class: "muted" }, "offline"),
    ),
    p.level !== null ? h("span", null, h("b", null, "Lv"), p.level) : null,
    p.major ? h("span", null, MAJOR[p.major]) : null,
    p.mapId ? h("span", null, h("b", null, "map"), p.mapId) : null,
    p.demerits !== null ? h("span", null, h("b", null, "벌점"), p.demerits) : null,
    p.merits !== null ? h("span", null, h("b", null, "상점"), p.merits) : null,
    h("span", null, h("b", null, "IPs"), p.ips),
    h("span", null, h("b", null, "joined"), when(p.createdAt, true)),
    h("span", null, h("b", null, "last login"), when(p.lastLoginAt, true)),
    h("span", { class: "mono muted" }, p.accountId),
  );
  const against = p.reports.filter((r) => r.side === "against");
  const by = p.reports.filter((r) => r.side === "by");
  const reportRows = (list: Player["reports"], other: "reporter" | "target") =>
    list.map((r) => [
      td(h("a", { href: `#/report/${r.id}` }, `#${r.id}`)),
      td(when(r.at, true), "when"),
      td(r.category),
      td(r[other] ?? ""),
      td(r.state === "open" ? h("span", { class: "warn" }, "open") : r.state),
      td(r.note ?? "", "muted"),
    ]);
  return h(
    "div",
    null,
    h("h1", null, p.name ?? p.loginId),
    facts,
    actions(ctx, p, preview),
    h("h2", null, "Bans and mutes"),
    sanctionsTable(p),
    h(
      "div",
      { class: "split" },
      h(
        "div",
        null,
        h("h2", null, `Reports against (${against.length})`),
        table(
          ["", "Time", "Category", "By", "State", "Note"],
          reportRows(against, "reporter"),
          "None",
        ),
      ),
      h(
        "div",
        null,
        h("h2", null, `Reports by (${by.length})`),
        table(
          ["", "Time", "Category", "Against", "State", "Note"],
          reportRows(by, "target"),
          "None",
        ),
      ),
    ),
    h(
      "div",
      { class: "split" },
      h(
        "div",
        null,
        h("h2", null, "Strikes"),
        table(
          ["Time", "Line", "By"],
          p.strikes.map((s) => [td(when(s.at, true), "when"), td(s.body), td(s.admin)]),
          "None",
        ),
      ),
      h(
        "div",
        null,
        h("h2", null, "벌점 and 상점"),
        table(
          ["Time", "", ["", "num"], "Reason"],
          p.conduct.map((c) => [
            td(when(c.at, true), "when"),
            td(c.kind === "demerit" ? "벌점" : "상점"),
            td(amount(c.amount, true), "num"),
            td(c.reason),
          ]),
          "None",
        ),
      ),
    ),
    chat
      ? h(
          "div",
          null,
          h("h2", null, h("a", { href: `#/chat?character=${p.characterId}` }, "Recent chat")),
          chatTable(chat.lines, { reload: ctx.reload, mark: p.characterId ?? "" }),
        )
      : null,
    partners
      ? h(
          "div",
          null,
          h(
            "h2",
            null,
            h("a", { href: `#/trades?character=${p.characterId}` }, "Trade partners"),
            h("span", { class: "muted" }, "  last 365 days, past 90 days from daily totals"),
          ),
          table(
            ["Partner", ["Trades", "num"], ["솔방울 sent", "num"], ["솔방울 received", "num"], ""],
            partners.partners.map((t) => [
              td(h("a", { href: `#/character/${t.partner}` }, t.name ?? t.partner.slice(0, 8))),
              td(t.trades, "num"),
              td(amount(t.sent), "num"),
              td(amount(t.received), "num"),
              td(
                h("a", { href: `#/trades?character=${p.characterId}&with=${t.partner}` }, "trades"),
              ),
            ]),
            "No trades",
          ),
        )
      : null,
    inv ? inventoryView(ctx, p, inv.inventory) : null,
  );
}

/** `#/character/<id>`: finds the account and opens its player page. */
export async function characterRedirect(_ctx: Ctx, characterId: string): Promise<Node> {
  if (!UUID.test(characterId)) return h("p", { class: "error" }, "Not found.");
  const { players } = await get<{ players: PlayerRow[] }>(
    `/players?q=${encodeURIComponent(characterId)}`,
  );
  const found = players.find((p) => p.characterId === characterId);
  // Replaces this entry, so Back skips the redirect.
  if (found) location.replace(`#/player/${found.accountId}`);
  return h("p", { class: "muted" }, found ? "" : "Not found.");
}
