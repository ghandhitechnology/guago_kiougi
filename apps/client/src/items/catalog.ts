import { BOOKS, narrative, TOOLS, VENDING } from "@guago/content";
import { BOOK_BASE_DAMAGE, type BookGrade, bookDamage, type ItemView } from "@guago/shared";

/**
 * What the client knows about any item or material by its id: the name and bag line from the
 * narrative, the icon frame in the `ui` atlas, and for books the grade and the power a copy hits
 * with. Every panel that draws an item goes through here.
 */

const N = narrative.NARRATIVE;
const ko = (key: string | undefined) => (key ? (N.ko[key] ?? "") : "");
const descriptions = new Map(N.descriptions.map((d) => [d.id, d]));
const terms = new Map((N.terms ?? []).map((t) => [`${t.kind}:${t.id}`, t.name]));
const books = new Map(BOOKS.map((b) => [b.id, b]));
const tools = new Map(TOOLS.map((t) => [t.id, t]));
const snacks = new Map([...VENDING.fixed, ...VENDING.weekly].map((s) => [s.id, s]));

/** Grade frames of the `item` sprite, by `BookGrade`. */
export const GRADE_FRAMES = ["textbook", "reference", "advanced", "major", "original"] as const;
/** The grade's colour, for names drawn in it: 교과서 gray, 참고서 green, 심화서 blue, 전공서 purple, 원서 gold. */
export const GRADE_COLORS = ["stone.pale", "grass.pale", "sea.pale", "plum.pale", "gold.light"];
/** The same, dark enough to read on a notebook page. */
export const GRADE_INK = ["ink.mid", "grass.dark", "sea.dark", "plum.dark", "gold.deep"];

export type GoodKind = "book" | "tool" | "material" | "snack" | "currency";

export interface Good {
  readonly kind: GoodKind;
  readonly name: string;
  readonly desc: string;
  /** A frame of the `ui` atlas. */
  readonly icon: string;
}

export function gradeName(grade: number): string {
  return ko(terms.get(`grade:${grade}`));
}

export function termName(kind: string, id: string): string {
  return ko(terms.get(`${kind}:${id}`));
}

/** A book definition, as its plain copy or, once evolved, the evolution it became. */
export function bookGood(def: string, evolved = false): Good {
  const b = books.get(def);
  if (!b) return { kind: "book", name: def, desc: "", icon: "book/wangdo" };
  const shape = evolved ? b.evolution : b;
  return {
    kind: "book",
    name: ko(shape.name),
    desc: ko(shape.description),
    icon: shape.cues.icon,
  };
}

export function toolGood(def: string): Good {
  const t = tools.get(def);
  return {
    kind: "tool",
    name: t ? ko(t.name) : def,
    desc: t ? ko(t.description) : "",
    icon: t?.icon ?? "tool/compass",
  };
}

/** Bag icons of the materials and currencies. */
const MATERIAL_ICONS: Readonly<Record<string, string>> = {
  ink: "icon/ink",
  binding: "material/binding",
  pinecone: "icon/pinecone",
  merit: "icon/merit",
  token: "icon/token",
};

/** A material, consumable or currency by its bag id: `ink`, `sheet:wangdo`, `snack:water`. */
export function materialGood(id: string): Good {
  if (id.startsWith("sheet:")) {
    const book = bookGood(id.slice(6));
    const sheet = descriptions.get("sheet");
    return {
      kind: "material",
      name: `${book.name} ${ko(sheet?.name)}`,
      desc: ko(sheet?.desc),
      icon: "icon/page",
    };
  }
  if (id.startsWith("snack:")) {
    const sid = id.slice(6);
    const s = snacks.get(sid);
    const d = descriptions.get(s?.description ?? id);
    return { kind: "snack", name: ko(d?.name), desc: ko(d?.desc), icon: `snack/${sid}` };
  }
  const d = descriptions.get(id);
  const currency = id === "pinecone" || id === "merit" || id === "token";
  return {
    kind: currency ? "currency" : "material",
    name: ko(d?.name),
    desc: ko(d?.desc),
    icon: MATERIAL_ICONS[id] ?? "icon/page",
  };
}

/** An owned item as a good. */
export function itemGood(item: ItemView): Good {
  return item.kind === "book" ? bookGood(item.def, item.evolved) : toolGood(item.def);
}

/** A book's base hit at its level, grade and 필기: what one copy is worth against another. */
export function bookPower(item: Pick<ItemView, "level" | "grade" | "pilgi">): number {
  return Math.round(bookDamage(BOOK_BASE_DAMAGE, item.level, item.grade as BookGrade, item.pilgi));
}

/** The book an id names, for its subject, tool and evolution. */
export function bookDef(def: string) {
  return books.get(def);
}

export function toolDef(def: string) {
  return tools.get(def);
}

/** Numbers as the notebook writes them: 12,345 and, past a million, 123만 and 4.5억. */
export function amount(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return String(n);
  if (Math.abs(v) >= 1e8) return `${trim(v / 1e8)}억`;
  if (Math.abs(v) >= 1e6) return `${trim(v / 1e4)}만`;
  return Math.round(v).toLocaleString("en-US");
}

const trim = (v: number) => (v >= 100 ? Math.floor(v).toLocaleString("en-US") : v.toFixed(1));
