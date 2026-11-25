import { get, post, q } from "../api.ts";
import { form, h, select, table, td, when } from "../dom.ts";
import { type Ctx, go, link } from "../nav.ts";

interface AuditRow {
  id: number;
  at: string;
  admin: string;
  action: string;
  target: string;
  reason: string | null;
  detail: Record<string, unknown>;
}

const ACTIONS = [
  "ban",
  "unban",
  "mute",
  "unmute",
  "kick",
  "strike",
  "grant",
  "report.resolve",
  "filter.add",
  "filter.remove",
  "broadcast",
  "chat.read",
  "inventory.read",
  "admin.edit",
  "login",
  "logout",
];

function targetCell(t: string): Node | string {
  const [kind, id] = t.split(":");
  if (!id) return t;
  if (kind === "account") return h("a", { href: `#/player/${id}` }, `account ${id.slice(0, 8)}`);
  if (kind === "character")
    return h("a", { href: `#/character/${id}` }, `character ${id.slice(0, 8)}`);
  if (kind === "report") return h("a", { href: `#/report/${id}` }, `report #${id}`);
  return `${kind} ${id.slice(0, 8)}`;
}

/** Detail as `key value` pairs, one line. */
function detailText(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function auditTable(rows: AuditRow[]): Node {
  return table(
    ["Time", "Admin", "Action", "Target", "Reason", "Detail"],
    rows.map((r) => [
      td(when(r.at), "when"),
      td(r.admin),
      td(r.action),
      td(targetCell(r.target), "when"),
      td(r.reason ?? ""),
      td(detailText(r.detail), "muted"),
    ]),
    "No entries",
  );
}

export async function auditScreen(ctx: Ctx): Promise<Node> {
  const p = ctx.params;
  const params = {
    admin: p.get("admin"),
    action: p.get("action"),
    target: p.get("target"),
    before: p.get("before"),
  };
  const { rows } = await get<{ rows: AuditRow[] }>(`/audit${q(params)}`);
  return h(
    "div",
    null,
    h("h1", null, "Audit log"),
    form(
      { class: "row" },
      [
        h("input", {
          name: "admin",
          placeholder: "admin",
          value: params.admin ?? "",
          size: 12,
          "aria-label": "Admin",
        }),
        select(
          "action",
          [["", "all actions"], ...ACTIONS.map((a): [string, string] => [a, a])],
          params.action ?? "",
        ),
        h("input", {
          name: "target",
          placeholder: "account:<id>",
          value: params.target ?? "",
          size: 28,
          "aria-label": "Target",
          "data-search": true,
        }),
        h("button", { type: "submit" }, "Filter"),
      ],
      async (d) => {
        const next: Record<string, string> = {};
        for (const k of ["admin", "action", "target"]) {
          const v = String(d.get(k) ?? "").trim();
          if (v) next[k] = v;
        }
        go("audit", next);
      },
    ),
    auditTable(rows),
    rows.length >= 200
      ? h(
          "p",
          null,
          h("a", { href: link("audit", { ...params, before: String(rows.at(-1)?.id) }) }, "Older"),
        )
      : null,
  );
}

export async function noticeScreen(ctx: Ctx): Promise<Node> {
  const { rows } = await get<{ rows: AuditRow[] }>(`/audit${q({ action: "broadcast" })}`);
  const send = form(
    {},
    [
      h(
        "div",
        { class: "row" },
        h("textarea", {
          name: "text",
          rows: 2,
          maxlength: 200,
          required: true,
          autofocus: true,
          "aria-label": "Notice",
        }),
      ),
      h("button", { type: "submit" }, "Send to everyone"),
    ],
    async (d, f) => {
      await post("/broadcast", { text: d.get("text") });
      f.reset();
      ctx.reload();
      return "Sent";
    },
  );
  return h(
    "div",
    null,
    h("h1", null, "Notice"),
    send,
    h("h2", null, "Sent"),
    table(
      ["Time", "By", "Text"],
      rows.map((r) => [td(when(r.at), "when"), td(r.admin), td(String(r.detail.text ?? ""))]),
      "None yet",
    ),
  );
}
