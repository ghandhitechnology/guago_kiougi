/**
 * The chat word list at run time (PLAN §12 "edit the filter list"). `chat/words.json` is the
 * shipped list; `filter_overrides` adds entries to it or takes entries out of it. Every edit
 * commits with its audit row, then the live `ChatFilter` swaps to the new list at once.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { type ChatFilter, skeleton, WORDS_FILE, type WordList } from "../chat/filter.ts";
import type { Db } from "../db/index.ts";
import type { Queryable } from "../economy/executor.ts";
import { record } from "./audit.ts";

export const FILTER_MODES = ["part", "word", "jamo", "allow"] as const;
export type FilterMode = (typeof FILTER_MODES)[number];

export interface FilterEntry {
  mode: FilterMode;
  text: string;
  /** `file`: shipped in words.json. `added`: added at run time. */
  source: "file" | "added";
}

export interface FilterListView {
  entries: FilterEntry[];
  /** Shipped entries taken out at run time. */
  removed: { mode: FilterMode; text: string }[];
}

const MAX_ENTRY = 40;

/** What is wrong with an entry, or null. It must reduce to at least one letter. */
export function checkEntry(mode: unknown, text: unknown): string | null {
  if (!FILTER_MODES.includes(mode as FilterMode)) return "mode";
  if (typeof text !== "string") return "text";
  const t = text.trim().normalize("NFC");
  if (t.length === 0 || t.length > MAX_ENTRY || t !== text) return "text";
  if (skeleton(t).syms.every((s) => s.opt)) return "text";
  return null;
}

export function readShippedList(file = WORDS_FILE): WordList {
  return JSON.parse(readFileSync(file, "utf8")) as WordList;
}

interface Override {
  mode: FilterMode;
  text: string;
  present: boolean;
}

async function overrides(q: Queryable): Promise<Override[]> {
  const { rows } = await q.execute(
    sql`select mode, text, present from filter_overrides order by mode, text`,
  );
  return rows.map((r) => ({
    mode: r.mode as FilterMode,
    text: r.text as string,
    present: Boolean(r.present),
  }));
}

function merge(shipped: WordList, edits: readonly Override[]): FilterListView {
  const key = (mode: string, text: string) => `${mode}\u0000${text}`;
  const edit = new Map(edits.map((e) => [key(e.mode, e.text), e.present]));
  const entries: FilterEntry[] = [];
  const removed: FilterListView["removed"] = [];
  const seen = new Set<string>();
  for (const mode of FILTER_MODES) {
    for (const text of shipped[mode] ?? []) {
      const k = key(mode, text);
      seen.add(k);
      if (edit.get(k) === false) removed.push({ mode, text });
      else entries.push({ mode, text, source: "file" });
    }
  }
  for (const e of edits) {
    if (e.present && !seen.has(key(e.mode, e.text))) {
      entries.push({ mode: e.mode, text: e.text, source: "added" });
    }
  }
  return { entries, removed };
}

const toWordList = (view: FilterListView): WordList => {
  const list: Required<WordList> = { part: [], word: [], jamo: [], allow: [] };
  for (const e of view.entries) list[e.mode].push(e.text);
  return list;
};

export function createFilterList(db: Db, filter: ChatFilter, shipped = readShippedList()) {
  async function view(q: Queryable = db): Promise<FilterListView> {
    return merge(shipped, await overrides(q));
  }

  let applying: Promise<void> = Promise.resolve();
  /**
   * Builds the live list from the file and the table. Called at start and after each edit; runs
   * one at a time, so a slow read can never swap in a list older than one already applied.
   */
  function apply(): Promise<void> {
    const run = async () => filter.replace(toWordList(await view()));
    applying = applying.then(run, run);
    return applying;
  }

  async function edit(
    adminId: string,
    mode: FilterMode,
    text: string,
    present: boolean,
    reason: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into filter_overrides (mode, text, present, admin_id)
        values (${mode}, ${text}, ${present}, ${adminId})
        on conflict (mode, text) do update
          set present = excluded.present, admin_id = excluded.admin_id, at = now()`);
      await record(tx, {
        adminId,
        action: present ? "filter.add" : "filter.remove",
        target: "filter",
        reason,
        detail: { mode, text },
      });
    });
    await apply();
  }

  return {
    filter,
    view,
    apply,
    add: (adminId: string, mode: FilterMode, text: string, reason: string) =>
      edit(adminId, mode, text, true, reason),
    remove: (adminId: string, mode: FilterMode, text: string, reason: string) =>
      edit(adminId, mode, text, false, reason),
    /** The live filter's reading of a phrase: what it masks and which entries matched. */
    test(text: string) {
      return filter.check(text);
    },
  };
}

export type FilterList = ReturnType<typeof createFilterList>;
