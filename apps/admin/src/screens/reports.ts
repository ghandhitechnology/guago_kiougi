import { get, post, q } from "../api.ts";
import { form, h, select, table, td, when } from "../dom.ts";
import type { Ctx } from "../nav.ts";
import { CHANNELS, type ChatLine, chatTable } from "./chat.ts";

interface ReportRow {
  id: number;
  at: string;
  category: string;
  state: string;
  note: string | null;
  targetId: string;
  targetAccount: string | null;
  reporter: string | null;
  target: string | null;
  lines: number;
  openOnTarget: number;
}

interface Report {
  id: number;
  at: string;
  category: string;
  state: string;
  note: string | null;
  reporterId: string;
  reporter: string | null;
  targetId: string;
  targetAccount: string | null;
  target: string | null;
  context: {
    lines: { ch: string; target: string | null; body: string; masked: boolean; at: string }[];
  };
  resolution: { action: string; note: string | null; at: string; by: string | null } | null;
  around: ChatLine[];
}

const STATES: [string, string][] = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["dismissed", "Dismissed"],
];
const CHANNEL = Object.fromEntries(CHANNELS);
/** For a mute or a ban; a kick or no action ignores it. */
const DURATIONS: [string, string][] = [
  ["60", "1 hour"],
  ["1440", "1 day"],
  ["10080", "7 days"],
  ["43200", "30 days"],
  ["", "until lifted"],
];

export async function reportsScreen(ctx: Ctx): Promise<Node> {
  const state = ctx.params.get("state") ?? "open";
  const { reports } = await get<{ reports: ReportRow[] }>(`/reports${q({ state })}`);
  const tabs = h(
    "div",
    { class: "row" },
    STATES.map(([s, label]) =>
      s === state
        ? h("span", { class: "strong" }, label)
        : h("a", { href: `#/reports?state=${s}` }, label),
    ),
  );
  const rows = reports.map((r) => [
    td(h("a", { href: `#/report/${r.id}` }, `#${r.id}`)),
    td(when(r.at, true), "when"),
    td(r.category),
    td(
      r.targetAccount
        ? h("a", { href: `#/player/${r.targetAccount}` }, r.target ?? "?")
        : (r.target ?? "?"),
    ),
    td(r.openOnTarget > 1 ? h("span", { class: "warn" }, r.openOnTarget) : r.openOnTarget, "num"),
    td(r.reporter ?? ""),
    td(r.lines, "num"),
    td(r.note ?? "", "muted"),
  ]);
  return h(
    "div",
    null,
    h("h1", null, "Reports"),
    tabs,
    table(
      [
        "",
        "Filed",
        "Category",
        "Reported",
        ["Open on them", "num"],
        "By",
        ["Lines", "num"],
        "Note",
      ],
      rows,
      state === "open" ? "Queue is empty" : "None",
    ),
  );
}

export async function reportScreen(ctx: Ctx, id: string): Promise<Node> {
  const { report: r } = await get<{ report: Report }>(`/reports/${id}`);
  const attached = table(
    ["Time", "Channel", "Text", "Filter"],
    r.context.lines.map((l) => [
      td(when(l.at), "when"),
      td(CHANNEL[l.ch] ?? l.ch),
      td(l.body),
      td(l.masked ? h("span", { class: "warn" }, "masked") : ""),
    ]),
    "No lines attached",
  );
  const resolve =
    r.state === "open"
      ? form(
          {},
          [
            h(
              "div",
              { class: "row" },
              select("state", [
                ["resolved", "Resolve"],
                ["dismissed", "Dismiss"],
              ]),
              select("action", [
                ["none", "no action"],
                ["mute", "mute"],
                ["kick", "kick"],
                ["ban", "ban"],
              ]),
              select("minutes", DURATIONS, "1440"),
              h("label", null, h("input", { type: "checkbox", name: "ip" }), "ban IPs"),
            ),
            h(
              "div",
              { class: "row" },
              h("input", {
                name: "told",
                class: "wide",
                placeholder: "reason, shown to the player",
                maxlength: 500,
              }),
              h("input", { name: "note", class: "wide", placeholder: "note", maxlength: 500 }),
              h("button", { type: "submit" }, "Close report"),
            ),
          ],
          async (d) => {
            const action = String(d.get("action"));
            const minutes = d.get("minutes") ? Number(d.get("minutes")) : null;
            await post(`/reports/${r.id}/resolve`, {
              state: d.get("state"),
              action,
              minutes,
              ip: d.get("ip") === "on",
              note: d.get("note") ?? "",
              told: d.get("told") ?? "",
            });
            ctx.reload();
            return "Closed";
          },
        )
      : null;
  return h(
    "div",
    null,
    h("h1", null, `Report #${r.id}`),
    h(
      "div",
      { class: "facts" },
      h("span", null, h("b", null, "filed"), when(r.at)),
      h("span", null, h("b", null, "category"), r.category),
      h(
        "span",
        null,
        h("b", null, "reported"),
        r.targetAccount
          ? h("a", { href: `#/player/${r.targetAccount}` }, r.target ?? "?")
          : (r.target ?? "?"),
      ),
      h(
        "span",
        null,
        h("b", null, "by"),
        h("a", { href: `#/character/${r.reporterId}` }, r.reporter ?? "?"),
      ),
      h(
        "span",
        null,
        h("b", null, "state"),
        r.state === "open" ? h("span", { class: "warn" }, "open") : r.state,
      ),
    ),
    r.note ? h("p", null, h("span", { class: "muted" }, "Note: "), r.note) : null,
    r.resolution
      ? h(
          "p",
          null,
          `${r.resolution.action === "none" ? "No action" : r.resolution.action} by ${r.resolution.by ?? "?"}, ${when(r.resolution.at, true)}`,
          r.resolution.note ? ` — ${r.resolution.note}` : "",
        )
      : null,
    resolve,
    h("h2", null, `Attached lines (${r.context.lines.length})`),
    attached,
    h("h2", null, "Chat around the report"),
    chatTable(r.around, { reload: ctx.reload, mark: r.targetId }),
  );
}
