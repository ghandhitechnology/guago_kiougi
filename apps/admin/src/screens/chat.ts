import { get, post, q } from "../api.ts";
import { form, h, select, table, td, when } from "../dom.ts";
import { type Ctx, go, link } from "../nav.ts";

export interface ChatLine {
  id: number;
  at: string;
  channel: string;
  senderId: string | null;
  sender: string | null;
  target: string | null;
  targetName: string | null;
  body: string;
  masked: boolean;
  struck: boolean;
}

export const CHANNELS: [string, string][] = [
  ["world", "전체"],
  ["near", "주변"],
  ["whisper", "귓속말"],
  ["party", "파티"],
  ["club", "동아리"],
  ["system", "시스템"],
];
const CHANNEL = Object.fromEntries(CHANNELS);

function where(l: ChatLine): string {
  if (l.channel === "whisper" || l.channel === "system")
    return l.targetName ? `→ ${l.targetName}` : "";
  if (l.channel === "near") return l.target ?? "";
  return "";
}

/**
 * A line's text. System lines are logged as their key and params (the client words them), so
 * they read as `muted · until 2026-11-26 15:42`.
 */
function text(l: ChatLine): string {
  if (l.channel !== "system" || !l.body.startsWith("{")) return l.body;
  try {
    const { key, params } = JSON.parse(l.body) as { key: string; params?: Record<string, unknown> };
    const parts = Object.entries(params ?? {}).map(([k, v]) =>
      k === "until" && typeof v === "number" ? `until ${when(v, true)}` : `${k} ${String(v)}`,
    );
    return [key, ...parts].join(" · ");
  } catch {
    return l.body;
  }
}

/** A strike button that turns into its reason form in place. */
function strikeCell(l: ChatLine, done: () => void): HTMLElement {
  const cell = h("td", { class: "when" });
  if (l.struck) {
    cell.append(h("span", { class: "bad" }, "struck"));
    return cell;
  }
  if (!l.senderId) return cell;
  const open = h("button", { class: "link", type: "button" }, "Strike");
  open.addEventListener("click", () => {
    const f = form(
      { class: "row" },
      [
        h("input", { name: "reason", placeholder: "reason", required: true, maxlength: 500 }),
        h("button", { type: "submit", class: "danger" }, "Strike +3"),
      ],
      async (data) => {
        await post("/chat/strike", { id: l.id, at: l.at, reason: data.get("reason") });
        done();
      },
    );
    cell.replaceChildren(f);
    f.querySelector("input")?.focus();
  });
  cell.append(open);
  return cell;
}

/** Chat lines, newest first unless `order` says otherwise. `mark` bolds one speaker's lines. */
export function chatTable(
  lines: ChatLine[],
  opts: { reload: () => void; mark?: string; strike?: boolean },
) {
  const rows = lines.map((l) => {
    const sender = l.senderId
      ? h("a", { href: `#/character/${l.senderId}` }, l.sender ?? l.senderId.slice(0, 8))
      : h("span", { class: "muted" }, "system");
    const body = h(
      "td",
      opts.mark && l.senderId === opts.mark ? { class: "strong" } : null,
      text(l),
    );
    return [
      td(when(l.at), "when"),
      td(CHANNEL[l.channel] ?? l.channel),
      td(sender),
      td(where(l), "muted"),
      body,
      td(l.masked ? h("span", { class: "warn" }, "masked") : ""),
      opts.strike === false ? null : strikeCell(l, opts.reload),
    ];
  });
  return table(["Time", "Channel", "From", "To", "Text", "Filter", ""], rows, "No lines");
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export async function chatScreen(ctx: Ctx): Promise<Node> {
  const p = ctx.params;
  const params = {
    character: p.get("character"),
    channel: p.get("channel"),
    from: p.get("from"),
    to: p.get("to"),
    before: p.get("before"),
  };
  const searched = Object.values(params).some(Boolean);
  const lines = searched ? (await get<{ lines: ChatLine[] }>(`/chat${q(params)}`)).lines : [];
  const filters = form(
    { class: "row" },
    [
      h("input", {
        name: "character",
        placeholder: "character name or id",
        value: params.character ?? "",
        "data-search": true,
        autofocus: true,
      }),
      select("channel", [["", "all channels"], ...CHANNELS], params.channel ?? ""),
      h("label", null, "from"),
      h("input", { name: "from", type: "datetime-local", value: toLocalInput(params.from) }),
      h("label", null, "to"),
      h("input", { name: "to", type: "datetime-local", value: toLocalInput(params.to) }),
      h("button", { type: "submit" }, "Read"),
    ],
    async (data) => {
      const iso = (k: string) => {
        const v = String(data.get(k) ?? "");
        return v ? new Date(v).toISOString() : "";
      };
      const next: Record<string, string> = {};
      const character = String(data.get("character") ?? "").trim();
      const channel = String(data.get("channel") ?? "");
      if (character) next.character = character;
      if (channel) next.channel = channel;
      if (iso("from")) next.from = iso("from");
      if (iso("to")) next.to = iso("to");
      go("chat", next);
    },
  );
  return h(
    "div",
    null,
    h("h1", null, "Chat"),
    filters,
    searched ? chatTable(lines, { reload: ctx.reload }) : null,
    lines.length >= 300
      ? h(
          "p",
          null,
          h(
            "a",
            { href: link("chat", { ...params, before: lines.at(-1)?.at ?? undefined }) },
            "Older",
          ),
        )
      : null,
  );
}
