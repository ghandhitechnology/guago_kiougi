/** A few DOM helpers: the page is plain elements, no framework. Text is always set as text. */

export type Child = Node | string | number | null | undefined | false | Child[];
type Attr = string | number | boolean | undefined | ((e: Event) => void);
export type Attrs = Record<string, Attr>;

function append(el: Element | DocumentFragment, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(el, c);
    return;
  }
  el.append(child instanceof Node ? child : String(child));
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (k === "value" && "value" in el) (el as HTMLInputElement).value = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) append(el, c);
  return el;
}

export const frag = (...children: Child[]): DocumentFragment => {
  const f = document.createDocumentFragment();
  for (const c of children) append(f, c);
  return f;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Local time, `2026-11-25 14:03:22`; `short` drops the seconds. */
export function when(iso: string | number | null | undefined, short = false): string {
  if (iso === null || iso === undefined) return "";
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return short ? `${day} ${time}` : `${day} ${time}:${pad(d.getSeconds())}`;
}

/** A whole number as a decimal string, grouped: `1,234,567`. Signed when asked. */
export function amount(value: string | number, signed = false): string {
  const s = String(value);
  const neg = s.startsWith("-");
  const digits = neg ? s.slice(1) : s;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : signed && digits !== "0" ? "+" : ""}${grouped}`;
}

export function table(head: (string | [string, string])[], rows: Child[][], empty = "None"): Node {
  if (rows.length === 0) return h("div", { class: "empty" }, empty);
  return h(
    "table",
    null,
    h(
      "thead",
      null,
      h(
        "tr",
        null,
        head.map((c) => (Array.isArray(c) ? h("th", { class: c[1] }, c[0]) : h("th", null, c))),
      ),
    ),
    h(
      "tbody",
      null,
      rows.map((r) => h("tr", null, r)),
    ),
  );
}

export const td = (content: Child, cls?: string) => h("td", cls ? { class: cls } : null, content);

/** A form whose submit runs `run` with its fields; errors show under it, nothing pops up. */
export function form(
  attrs: Attrs,
  fields: Child[],
  run: (data: FormData, form: HTMLFormElement) => Promise<unknown>,
): HTMLFormElement {
  const status = h("div");
  const el = h("form", attrs, fields, status);
  el.addEventListener("submit", (e) => {
    e.preventDefault();
    // Read before the buttons are disabled: disabled controls leave the form data. The
    // submitter rides along, so a form with two buttons knows which one was pressed.
    const data = new FormData(el, (e as SubmitEvent).submitter);
    const buttons = [...el.querySelectorAll("button")];
    for (const b of buttons) b.disabled = true;
    status.className = "";
    status.textContent = "";
    run(data, el)
      .then((message) => {
        if (typeof message === "string" && message) {
          status.className = "done";
          status.textContent = message;
        }
      })
      .catch((error: unknown) => {
        status.className = "error";
        status.textContent = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        for (const b of buttons) b.disabled = false;
      });
  });
  return el;
}

export function select(name: string, options: [string, string][], value?: string) {
  return h(
    "select",
    { name },
    options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)),
  );
}
