/**
 * Data the living world runs on (PLAN §11, §15): 도감 sets and their small bonuses, the 급식
 * menu, what counts as 단정한 복장, the story chapters a player plays personally, and the field
 * a player's board is drawn from.
 */
import { type BuffStat, boardDay, type Modifiers } from "@guago/shared";
import { type FieldDef, PAGE1_FIELDS } from "./fields.ts";
import { NARRATIVE } from "./narrative/index.ts";
import type { Milestone } from "./narrative/schema.ts";

// ── 도감 sets ───────────────────────────────────────────────────────────────

export interface CodexSet {
  readonly id: string;
  readonly entries: readonly string[];
  /** Added to the matching modifier for good once every entry is unlocked. Kept small. */
  readonly bonus: { readonly stat: Exclude<keyof Modifiers, "regen">; readonly amount: number };
}

const section = (s: string, ids?: readonly string[]) =>
  NARRATIVE.codex.filter((e) => e.section === s && (!ids || ids.includes(e.id))).map((e) => e.id);

/** Page 1's sets: each section of its 도감 is one set. */
export const CODEX_SETS: readonly CodexSet[] = [
  { id: "p1-scientists", entries: section("scientist"), bonus: { stat: "exp", amount: 0.02 } },
  {
    id: "p1-misconceptions",
    entries: section("misconception"),
    bonus: { stat: "damage", amount: 0.02 },
  },
  { id: "launch-books", entries: section("book"), bonus: { stat: "drop", amount: 0.02 } },
  { id: "campus", entries: section("school"), bonus: { stat: "hp", amount: 0.02 } },
];

export function completedSets(unlocked: ReadonlySet<string>): CodexSet[] {
  return CODEX_SETS.filter((s) => s.entries.every((e) => unlocked.has(e)));
}

/** The shares completed sets add to each modifier. */
export function codexBonus(
  unlocked: ReadonlySet<string>,
): Partial<Record<keyof Modifiers, number>> {
  const out: Partial<Record<keyof Modifiers, number>> = {};
  for (const s of completedSets(unlocked)) {
    out[s.bonus.stat] = (out[s.bonus.stat] ?? 0) + s.bonus.amount;
  }
  return out;
}

/** 도감 entries a kill count unlocks: monster id to the entries that count it, with the total. */
export function killEntries(): { id: string; monsters: readonly string[]; count: number }[] {
  return NARRATIVE.codex.flatMap((e) =>
    e.unlock.when === "kills"
      ? [{ id: e.id, monsters: e.unlock.monsters, count: e.unlock.count }]
      : [],
  );
}

export function visitEntries(place: string): string[] {
  return NARRATIVE.codex
    .filter((e) => e.unlock.when === "visited" && e.unlock.place === place)
    .map((e) => e.id);
}

export function metEntries(speaker: string): string[] {
  return NARRATIVE.codex
    .filter((e) => e.unlock.when === "met" && e.unlock.speaker === speaker)
    .map((e) => e.id);
}

export function freedEntries(boss: string): string[] {
  return NARRATIVE.codex
    .filter((e) => e.unlock.when === "freed" && e.unlock.boss === boss)
    .map((e) => e.id);
}

// ── 급식 (PLAN §11) ─────────────────────────────────────────────────────────

export interface Meal {
  /** Narrative description id `meal:<id>`. */
  readonly id: string;
  readonly stat: BuffStat;
  readonly amount: number;
}

/** One menu a board day, in this order; the 30-minute buff follows the menu. */
export const MEALS: readonly Meal[] = [
  { id: "donkatsu", stat: "damage", amount: 0.05 },
  { id: "bibimbap", stat: "regen", amount: 0.01 },
  { id: "kimchi-stew", stat: "exp", amount: 0.05 },
  { id: "curry", stat: "pinecone", amount: 0.05 },
  { id: "bulgogi", stat: "damage", amount: 0.05 },
  { id: "seaweed-soup", stat: "regen", amount: 0.01 },
  { id: "jjajang", stat: "exp", amount: 0.05 },
];

export function mealOf(ms: number): Meal {
  return MEALS[boardDay(ms) % MEALS.length] as Meal;
}

export function mealById(id: string): Meal | undefined {
  return MEALS.find((m) => m.id === id);
}

// ── 단정한 복장 ─────────────────────────────────────────────────────────────

/** The school uniform is the blazer, worn without a 과잠 over it. */
export const NEAT = { uniforms: ["blazer"], jacketLayer: "jacket" } as const;

// ── Story chapters (PLAN §15) ───────────────────────────────────────────────

export interface StoryChapter {
  /** The story beat's id. */
  readonly id: string;
  readonly after: Milestone;
  /** Set when the chapter is a boss being freed: its personal version is a 복습 fight. */
  readonly boss?: string;
}

export const STORY_CHAPTERS: readonly StoryChapter[] = NARRATIVE.story.map((beat) => {
  const boss = NARRATIVE.bosses.find((b) => b.freed === beat.cutscene)?.boss;
  return { id: beat.id, after: beat.after, ...(boss ? { boss } : {}) };
});

// ── Where a board is drawn ──────────────────────────────────────────────────

const ALL_FIELDS: readonly FieldDef[] = PAGE1_FIELDS;

export function fieldById(id: string): FieldDef | undefined {
  return ALL_FIELDS.find((f) => f.id === id);
}

/**
 * The open field whose levels hold the player's, else the nearest open one. Undefined while the
 * Page has no field open.
 */
export function boardField(level: number, openMaps: readonly string[]): FieldDef | undefined {
  const open = ALL_FIELDS.filter((f) => openMaps.includes(f.id));
  return (
    open.find((f) => level >= f.levels.min && level <= f.levels.max) ??
    (level < (open[0]?.levels.min ?? 0) ? open[0] : open.at(-1))
  );
}
