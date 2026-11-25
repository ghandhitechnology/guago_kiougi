import { get, q } from "../api.ts";
import { form, h, table, td, when } from "../dom.ts";
import { type Ctx, go } from "../nav.ts";

export interface PlayerRow {
  accountId: string;
  loginId: string;
  status: string;
  characterId: string | null;
  name: string | null;
  level: number | null;
  major: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export const MAJOR: Record<string, string> = {
  math: "수학",
  physics: "물리",
  chemistry: "화학",
  biology: "생명",
  earth: "지구",
};

export const statusCell = (status: string) =>
  status === "banned"
    ? h("span", { class: "bad" }, "banned")
    : h("span", { class: "muted" }, status);

export async function playersScreen(ctx: Ctx): Promise<Node> {
  const query = ctx.params.get("q") ?? "";
  const { players } = await get<{ players: PlayerRow[] }>(`/players${q({ q: query })}`);
  const search = form(
    { class: "row" },
    [
      h("input", {
        name: "q",
        class: "wide",
        value: query,
        placeholder: "character name, login or id",
        "aria-label": "Search",
        "data-search": true,
        autofocus: true,
      }),
      h("button", { type: "submit" }, "Search"),
    ],
    async (data) => {
      const next = String(data.get("q") ?? "").trim();
      go("players", next ? { q: next } : {});
    },
  );
  const rows = players.map((p) => [
    td(
      h(
        "a",
        { href: `#/player/${p.accountId}` },
        p.name ?? h("span", { class: "muted" }, "no character"),
      ),
    ),
    td(p.loginId),
    td(p.level ?? "", "num"),
    td(p.major ? MAJOR[p.major] : ""),
    td(statusCell(p.status)),
    td(when(p.lastLoginAt, true), "when"),
    td(when(p.createdAt, true), "when"),
    td(p.accountId.slice(0, 8), "id"),
  ]);
  return h(
    "div",
    null,
    h("h1", null, query ? `Players matching “${query}”` : "Players"),
    search,
    table(
      ["Character", "Login", ["Lv", "num"], "Major", "Status", "Last login", "Joined", "Account"],
      rows,
      "No players",
    ),
  );
}
