import {
  type Cadence,
  type HelpTemplate,
  type QuestReward,
  questReward,
  type Random,
} from "@guago/shared";
import type { FieldDef } from "./fields.ts";
import { NARRATIVE } from "./narrative/index.ts";
import { MILESTONES, type Milestone, type QuestTemplate, type Slot } from "./narrative/schema.ts";

/**
 * The 수행평가 board (PLAN §15): the narrative's notice templates filled from Page data. A slot
 * holds an id the client turns into a name (a monster term, a place or item description); `count`
 * is a number. Rewards come from `questReward` in shared, scaled to the player's level.
 */
export const QUEST_TARGETS: Readonly<
  Record<QuestTemplate["kind"], Readonly<Record<Cadence, number>>>
> = {
  hunt: { daily: 40, weekly: 400, repeat: 25 },
  collect: { daily: 8, weekly: 60, repeat: 5 },
  escort: { daily: 1, weekly: 5, repeat: 1 },
  nohit: { daily: 1, weekly: 5, repeat: 1 },
  deliver: { daily: 1, weekly: 5, repeat: 1 },
  help: { daily: 1, weekly: 3, repeat: 1 },
};

/** What a collect notice can ask for: narrative item descriptions that drop in the field. */
export const COLLECT_ITEMS = ["sheet", "ink", "binding"] as const;
/** Assistants an escort notice can name: narrative NPC descriptions. */
export const ESCORT_NPCS = ["pythagorean-junior", "lyceum-scribe", "survey-helper"] as const;
/** Monsters a hunt notice never names. */
const NOT_HUNTED = new Set(["tortoise", "element-earth-pebble"]);

export interface QuestOffer {
  readonly template: string;
  readonly kind: QuestTemplate["kind"];
  readonly cadence: Cadence;
  readonly slots: Readonly<Partial<Record<Slot, string | number>>>;
  readonly count: number;
  readonly reward: QuestReward;
}

export interface BoardDraw {
  readonly cadence: Cadence;
  /** Notices wanted; never more than the eligible templates. */
  readonly count: number;
  readonly level: number;
  /** The field the player hunts in; it supplies monsters and the place. */
  readonly field: FieldDef;
  readonly milestone: Milestone;
  /** Repeatables already finished today, for the step-down. */
  readonly completedToday?: number;
  /** The player's catch-up (`catchUp(level, frontier)`); 1 at or above the live band. */
  readonly catchUpMult?: number;
}

function eligible(t: QuestTemplate, cadence: Cadence, milestone: Milestone): boolean {
  if (t.cadence !== cadence) return false;
  return !t.from || MILESTONES.indexOf(t.from) <= MILESTONES.indexOf(milestone);
}

/** Draws distinct notices for one player, deterministically from the server's generator. */
export function drawNotices(random: Random, draw: BoardDraw): QuestOffer[] {
  const pool = NARRATIVE.quests.filter((t) => eligible(t, draw.cadence, draw.milestone));
  const picked: QuestTemplate[] = [];
  const left = [...pool];
  while (picked.length < draw.count && left.length > 0) {
    picked.push(left.splice(random.int(left.length), 1)[0] as QuestTemplate);
  }
  const hunted = draw.field.roster.filter(
    (r) => !NOT_HUNTED.has(r.monster) && (r.from ?? 0) <= draw.level,
  );
  const { min, max } = draw.field.levels;
  const fieldLevel = Math.min(max, Math.max(min, draw.level));
  return picked.map((t, i) => {
    const count = QUEST_TARGETS[t.kind][draw.cadence];
    const slots: Partial<Record<Slot, string | number>> = {};
    for (const slot of t.slots) {
      if (slot === "count") slots.count = count;
      if (slot === "place") slots.place = draw.field.id;
      if (slot === "monster") slots.monster = random.weighted(hunted, (r) => r.weight).monster;
      if (slot === "item") slots.item = random.pick(COLLECT_ITEMS);
      if (slot === "npc") slots.npc = random.pick(ESCORT_NPCS);
    }
    return {
      template: t.id,
      kind: t.kind,
      cadence: draw.cadence,
      slots,
      count,
      reward: questReward(
        draw.cadence,
        fieldLevel,
        (draw.completedToday ?? 0) + i,
        draw.level,
        draw.catchUpMult ?? 1,
      ),
    };
  });
}

// 도움 notices ---------------------------------------------------------------------------------

/** How many of a thing a 도움 notice asks for; only a hunt counts more than one. */
export const HELP_TARGET: Readonly<Record<HelpTemplate, number>> = {
  "help-hunt": QUEST_TARGETS.hunt.repeat,
  "help-walk": 1,
  "help-finish": 1,
  "help-revive": 1,
};

export interface HelpDraw {
  readonly template: HelpTemplate;
  /** The field the poster hunts in: its place and its monsters. */
  readonly field: FieldDef;
  readonly level: number;
  readonly posterName: string;
  /** `help-finish`: the template of the poster's quest, which the client names. */
  readonly questTemplate?: string;
}

/** Fills a 도움 notice's slots, deterministically from the server's generator. */
export function drawHelp(
  random: Random,
  d: HelpDraw,
): { slots: Partial<Record<Slot, string | number>>; count: number } {
  const t = NARRATIVE.quests.find((q) => q.id === d.template);
  if (!t) throw new Error(`no help template ${d.template}`);
  const count = HELP_TARGET[d.template];
  const hunted = d.field.roster.filter(
    (r) => !NOT_HUNTED.has(r.monster) && (r.from ?? 0) <= d.level,
  );
  const slots: Partial<Record<Slot, string | number>> = {};
  for (const slot of t.slots) {
    if (slot === "player") slots.player = d.posterName;
    if (slot === "place") slots.place = d.field.id;
    if (slot === "count") slots.count = count;
    if (slot === "monster") slots.monster = random.weighted(hunted, (r) => r.weight).monster;
    if (slot === "quest" && d.questTemplate) slots.quest = d.questTemplate;
  }
  return { slots, count };
}
