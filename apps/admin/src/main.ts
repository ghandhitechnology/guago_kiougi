import "./style.css";
import { type AdminView, login, logout, me, whenSignedOut } from "./api.ts";
import { form, h } from "./dom.ts";
import { type Ctx, go } from "./nav.ts";
import { adminsScreen } from "./screens/admins.ts";
import { auditScreen, noticeScreen } from "./screens/audit.ts";
import { chatScreen } from "./screens/chat.ts";
import { economyScreen, tradesScreen } from "./screens/economy.ts";
import { filterScreen } from "./screens/filter.ts";
import { characterRedirect, playerScreen } from "./screens/player.ts";
import { playersScreen } from "./screens/players.ts";
import { postsScreen } from "./screens/posts.ts";
import { reportScreen, reportsScreen } from "./screens/reports.ts";

type Screen = (ctx: Ctx, arg: string) => Promise<Node>;

/** Hash routes: `#/players`, `#/player/<account>`, `#/report/<id>`. */
const ROUTES: [RegExp, Screen, string][] = [
  [/^players$/, playersScreen, "players"],
  [/^player\/([^/]+)$/, playerScreen, "players"],
  [/^character\/([^/]+)$/, characterRedirect, "players"],
  [/^chat$/, chatScreen, "chat"],
  [/^reports$/, reportsScreen, "reports"],
  [/^report\/(\d+)$/, reportScreen, "reports"],
  [/^posts$/, postsScreen, "posts"],
  [/^filter$/, filterScreen, "filter"],
  [/^economy$/, economyScreen, "economy"],
  [/^trades$/, tradesScreen, "trades"],
  [/^audit$/, auditScreen, "audit"],
  [/^notice$/, noticeScreen, "notice"],
  [/^admins$/, adminsScreen, "admins"],
];

/** Nav entries with the key that opens each after `g`. */
const NAV: [string, string, string][] = [
  ["players", "Players", "p"],
  ["chat", "Chat", "c"],
  ["reports", "Reports", "r"],
  ["posts", "Posts", "o"],
  ["filter", "Filter", "f"],
  ["economy", "Economy", "e"],
  ["trades", "Trades", "t"],
  ["audit", "Audit", "a"],
  ["notice", "Notice", "n"],
  ["admins", "Admins", "m"],
];

const app = document.getElementById("app") as HTMLElement;
let current: AdminView | null = null;
let rendering = 0;

function parse(): { path: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  return { path: path || "players", params: new URLSearchParams(query) };
}

function shell(admin: AdminView, section: string, content: Node): Node {
  const nav = NAV.filter(([id]) => id !== "admins" || admin.role === "owner").map(
    ([id, label, key]) =>
      h(
        "a",
        { href: `#/${id}`, class: id === section ? "here" : undefined, title: `g ${key}` },
        label,
      ),
  );
  return h(
    "div",
    null,
    h(
      "header",
      null,
      h("span", { class: "name" }, "과고키우기"),
      h("nav", null, nav),
      h(
        "span",
        { class: "who" },
        `${admin.loginId} · ${admin.role}`,
        h(
          "button",
          {
            class: "link",
            type: "button",
            onclick: () => {
              void logout().then(() => {
                current = null;
                showLogin();
              });
            },
          },
          "Log out",
        ),
      ),
    ),
    h("main", null, content),
  );
}

async function render(): Promise<void> {
  if (!current) return;
  const admin = current;
  const { path, params } = parse();
  const found = ROUTES.find(([re]) => re.test(path));
  const ticket = ++rendering;
  let content: Node;
  let section = "players";
  if (!found) {
    content = h("h1", null, "Not found");
  } else {
    const [re, screen, s] = found;
    section = s;
    const arg = re.exec(path)?.[1] ?? "";
    try {
      content = await screen(
        { admin, params, reload: () => void render() },
        decodeURIComponent(arg),
      );
    } catch (error) {
      content = h("p", { class: "error" }, error instanceof Error ? error.message : String(error));
    }
  }
  if (ticket !== rendering) return;
  const y = window.scrollY;
  app.replaceChildren(shell(admin, section, content));
  window.scrollTo(0, y);
  if (!document.activeElement || document.activeElement === document.body) {
    (app.querySelector("[autofocus]") as HTMLElement | null)?.focus();
  }
}

function showLogin(message = ""): void {
  const error = message ? h("p", { class: "error" }, message) : null;
  app.replaceChildren(
    h(
      "div",
      { class: "login" },
      h("h1", null, "과고키우기 admin"),
      error,
      form(
        {},
        [
          h(
            "div",
            { class: "row" },
            h("input", {
              name: "loginId",
              autocomplete: "username",
              "aria-label": "Login",
              placeholder: "login",
              autofocus: true,
              required: true,
            }),
          ),
          h(
            "div",
            { class: "row" },
            h("input", {
              name: "password",
              type: "password",
              autocomplete: "current-password",
              "aria-label": "Password",
              placeholder: "password",
              required: true,
            }),
          ),
          h("button", { type: "submit" }, "Log in"),
        ],
        async (data) => {
          current = await login(String(data.get("loginId")), String(data.get("password")));
          await render();
        },
      ),
    ),
  );
  (app.querySelector("[autofocus]") as HTMLElement | null)?.focus();
}

// `/` focuses the search on screens that have one; `g` then a letter opens a screen.
let pendingG = 0;
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey || !current)
    return;
  if (e.key === "/") {
    const search = app.querySelector<HTMLInputElement>("input[data-search]");
    if (search) {
      e.preventDefault();
      search.focus();
      search.select();
    }
    return;
  }
  if (e.key === "g") {
    pendingG = Date.now();
    return;
  }
  if (Date.now() - pendingG < 1200) {
    const hit = NAV.find(([, , key]) => key === e.key);
    pendingG = 0;
    if (hit) go(hit[0]);
  }
});

window.addEventListener("hashchange", () => void render());
whenSignedOut(() => {
  current = null;
  showLogin("Signed out.");
});

current = await me();
if (current) await render();
else showLogin();
