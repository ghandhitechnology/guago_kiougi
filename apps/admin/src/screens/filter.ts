import { get, post } from "../api.ts";
import { form, h, select, table, td } from "../dom.ts";
import type { Ctx } from "../nav.ts";

type Mode = "part" | "word" | "jamo" | "allow";
interface Entry {
  mode: Mode;
  text: string;
  source: "file" | "added";
}
interface List {
  entries: Entry[];
  removed: { mode: Mode; text: string }[];
}
interface Tested {
  text: string;
  masked: boolean;
  hits: string[];
  unreadable: boolean;
}

const MODES: [Mode, string][] = [
  ["part", "part"],
  ["word", "word"],
  ["jamo", "jamo"],
  ["allow", "allow"],
];

export async function filterScreen(ctx: Ctx): Promise<Node> {
  const { list } = await get<{ list: List }>("/filter");
  const result = h("div");
  const test = form(
    { class: "row" },
    [
      h("input", {
        name: "text",
        class: "wide",
        placeholder: "phrase",
        "aria-label": "Phrase",
        autofocus: true,
        required: true,
        maxlength: 500,
      }),
      h("button", { type: "submit" }, "Test"),
    ],
    async (d) => {
      const { result: r } = await post<{ result: Tested }>("/filter/test", { text: d.get("text") });
      result.replaceChildren(
        h(
          "div",
          { class: "facts" },
          h("span", null, h("b", null, "shown as"), r.text),
          h("span", null, h("b", null, "hits"), r.hits.length ? r.hits.join(", ") : "none"),
          r.unreadable ? h("span", { class: "bad" }, "unreadable: refused") : null,
        ),
      );
    },
  );

  const editor = form(
    { class: "row" },
    [
      select("mode", MODES, "part"),
      h("input", {
        name: "text",
        size: 18,
        placeholder: "entry",
        "aria-label": "Entry",
        required: true,
        maxlength: 40,
      }),
      h("input", {
        name: "reason",
        class: "wide",
        placeholder: "reason",
        required: true,
        maxlength: 500,
      }),
      h("button", { type: "submit", name: "verb", value: "add" }, "Add"),
      h("button", { type: "submit", name: "verb", value: "remove", class: "danger" }, "Remove"),
    ],
    async (d, f) => {
      const verb = d.get("verb") === "remove" ? "remove" : "add";
      await post(`/filter/${verb}`, {
        mode: d.get("mode"),
        text: d.get("text"),
        reason: d.get("reason"),
      });
      f.reset();
      ctx.reload();
      return verb === "add" ? "Added" : "Removed";
    },
  );
  const fill = (e: { mode: Mode; text: string }) => () => {
    (editor.querySelector("select[name=mode]") as HTMLSelectElement).value = e.mode;
    (editor.querySelector("input[name=text]") as HTMLInputElement).value = e.text;
    (editor.querySelector("input[name=reason]") as HTMLInputElement).focus();
  };

  const find = h("input", {
    placeholder: "find",
    "aria-label": "Find",
    "data-search": true,
    size: 18,
  });
  const body = h("tbody");
  const draw = () => {
    const needle = find.value.trim().toLowerCase();
    const shown = list.entries.filter((e) => !needle || e.text.toLowerCase().includes(needle));
    body.replaceChildren(
      ...shown.map((e) =>
        h(
          "tr",
          null,
          td(e.mode),
          td(e.text),
          td(
            e.source === "added"
              ? h("span", { class: "good" }, "added")
              : h("span", { class: "muted" }, "shipped"),
          ),
          td(h("button", { class: "link", type: "button", onclick: fill(e) }, "edit")),
        ),
      ),
    );
  };
  find.addEventListener("input", draw);
  draw();
  const counts = MODES.map(([m]) => `${m} ${list.entries.filter((e) => e.mode === m).length}`).join(
    " · ",
  );

  return h(
    "div",
    null,
    h("h1", null, "Filter"),
    test,
    result,
    h("h2", null, "Edit"),
    editor,
    h("h2", null, `Entries`, h("span", { class: "muted" }, `  ${counts}`)),
    h("div", { class: "row" }, find),
    h(
      "table",
      null,
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "Mode"),
          h("th", null, "Entry"),
          h("th", null, "Source"),
          h("th"),
        ),
      ),
      body,
    ),
    list.removed.length
      ? h(
          "div",
          null,
          h("h2", null, "Removed from the shipped list"),
          table(
            ["Mode", "Entry", ""],
            list.removed.map((e) => [
              td(e.mode),
              td(e.text),
              td(h("button", { class: "link", type: "button", onclick: fill(e) }, "edit")),
            ]),
          ),
        )
      : null,
  );
}
