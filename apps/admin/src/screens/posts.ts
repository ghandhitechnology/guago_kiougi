import { get, post } from "../api.ts";
import { form, h, table, td, when } from "../dom.ts";
import type { Ctx } from "../nav.ts";

interface Author {
  authorId: string;
  author: string;
  account: string;
}
interface BoardPost extends Author {
  id: number;
  category: string;
  body: string;
  pinned: boolean;
  at: string;
  expiresAt: string;
}
interface ClubNotice extends Author {
  id: number;
  clubId: number;
  club: string;
  body: string;
  at: string;
}

const SECTION: Record<string, string> = {
  party: "파티 모집",
  trade: "거래",
  club: "동아리 홍보",
  chat: "잡담",
  notice: "층장 공지",
};

/** A take-down button that turns into its reason form in place. */
function removeCell(path: string, reload: () => void): HTMLElement {
  const cell = h("td", { class: "when" });
  const open = h("button", { class: "link", type: "button" }, "Take down");
  open.addEventListener("click", () => {
    const f = form(
      { class: "row" },
      [
        h("input", { name: "reason", placeholder: "reason", required: true, maxlength: 500 }),
        h("button", { type: "submit", class: "danger" }, "Take down"),
      ],
      async (d) => {
        await post(path, { reason: d.get("reason") });
        reload();
      },
    );
    cell.replaceChildren(f);
    f.querySelector("input")?.focus();
  });
  cell.append(open);
  return cell;
}

const author = (a: Author) => h("a", { href: `#/player/${a.account}` }, a.author);

/** 대자보 posts and club notices, the text players leave for each other outside chat. */
export async function postsScreen(ctx: Ctx): Promise<Node> {
  const { board, notices } = await get<{ board: BoardPost[]; notices: ClubNotice[] }>("/posts");
  return h(
    "div",
    null,
    h("h1", null, "Posts"),
    h("h2", null, `대자보 (${board.length})`),
    table(
      ["Posted", "Section", "By", "Text", "Ends", ""],
      board.map((p) => [
        td(when(p.at, true), "when"),
        td(SECTION[p.category] ?? p.category),
        td(author(p)),
        td(p.body),
        td(when(p.expiresAt, true), "when"),
        removeCell(`/posts/board/${p.id}/remove`, ctx.reload),
      ]),
      "No posts",
    ),
    h("h2", null, `Club notices (${notices.length})`),
    table(
      ["Posted", "Club", "By", "Text", ""],
      notices.map((n) => [
        td(when(n.at, true), "when"),
        td(n.club),
        td(author(n)),
        td(n.body),
        removeCell(`/posts/notice/${n.id}/remove`, ctx.reload),
      ]),
      "No notices",
    ),
  );
}
