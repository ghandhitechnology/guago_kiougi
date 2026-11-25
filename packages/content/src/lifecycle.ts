/**
 * The Page lifecycle (PLAN §10): which milestone the server has reached, from the week of the
 * Page and the bosses freed so far. Time-driven steps follow the server clock; boss-gated steps
 * wait for the raid system's "freed" event. The state is derived, never stepped, so a restart
 * mid-Page lands exactly where it was.
 */
import { WEEK_MS } from "@guago/shared";
import { MILESTONES, type Milestone } from "./narrative/schema.ts";

export type { Milestone };

export interface LifecycleStep {
  readonly milestone: Milestone;
  /** Earliest week of the Page this step may come (week 0 is the day the rift opens). */
  readonly week?: number;
  /** Bosses that must be freed first. */
  readonly needs?: readonly string[];
  /** Weeks after the last of `needs` was freed. */
  readonly weeksAfter?: number;
  /** A freed step: reached only by the raid system freeing this boss. */
  readonly freed?: string;
  /** Maps that open at this step; they stay open. */
  readonly maps?: readonly string[];
  /** Boss that appears at this step. */
  readonly boss?: string;
  /** Highest monster level the open fields reach. */
  readonly frontierLevel?: number;
}

export interface PageLifecycle {
  readonly page: number;
  readonly town: string;
  readonly fields: readonly string[];
  readonly danger: string;
  /** Mid bosses in order, then the era boss. */
  readonly bosses: readonly string[];
  readonly steps: readonly LifecycleStep[];
}

export const LIFECYCLES: readonly PageLifecycle[] = [
  {
    page: 1,
    town: "p1-agora",
    fields: ["p1-colonnade", "p1-olive-road", "p1-cave-mouth", "p1-agora-edge"],
    danger: "p1-shadow-cave",
    bosses: ["pythagoreans", "zeno", "aristotle"],
    steps: [
      {
        milestone: "p1.open",
        week: 0,
        maps: ["p1-agora", "p1-colonnade", "p1-olive-road"],
        frontierLevel: 50,
      },
      {
        milestone: "p1.wide",
        week: 2,
        maps: ["p1-cave-mouth", "p1-agora-edge", "p1-shadow-cave"],
        frontierLevel: 100,
      },
      {
        milestone: "p1.pythagoreans",
        week: 3,
        maps: ["p1-croton-school"],
        boss: "pythagoreans",
      },
      { milestone: "p1.pythagoreans-freed", freed: "pythagoreans" },
      {
        milestone: "p1.zeno",
        week: 6,
        needs: ["pythagoreans"],
        maps: ["p1-elea-track"],
        boss: "zeno",
      },
      { milestone: "p1.zeno-freed", freed: "zeno" },
      {
        milestone: "p1.aristotle",
        week: 10,
        needs: ["pythagoreans", "zeno"],
        maps: ["p1-lyceum"],
        boss: "aristotle",
      },
      { milestone: "p1.aristotle-freed", freed: "aristotle" },
      { milestone: "p1.era-change", needs: ["aristotle"], weeksAfter: 1 },
    ],
  },
];

export function lifecycleOf(page: number): PageLifecycle | undefined {
  return LIFECYCLES.find((l) => l.page === page);
}

export type BossState = "sealed" | "open" | "freed";

export interface PageProgress {
  readonly page: number;
  /** Index into the Page's steps; -1 before the rift opens. */
  readonly step: number;
  readonly milestone: Milestone;
  /** Whole weeks since the rift opened. */
  readonly week: number;
  readonly maps: readonly string[];
  readonly bosses: Readonly<Record<string, BossState>>;
  readonly frontierLevel: number;
  /** When the next time-driven step comes, if nothing but time stands in its way. */
  readonly nextAt: number | null;
  /** 시대 전환 reached: the Page is sealed. */
  readonly sealed: boolean;
}

/** When `step` can come, or null while a boss it waits for is still up. */
function dueAt(
  s: LifecycleStep,
  openedAt: number,
  freed: Readonly<Record<string, number>>,
): number | null {
  if (s.freed !== undefined) return freed[s.freed] ?? null;
  let at = openedAt + (s.week ?? 0) * WEEK_MS;
  for (const boss of s.needs ?? []) {
    const f = freed[boss];
    if (f === undefined) return null;
    at = Math.max(at, f + (s.weeksAfter ?? 0) * WEEK_MS);
  }
  return at;
}

/**
 * Where a Page stands at `now`. Steps come in order: one waiting for a boss holds back every
 * step after it, so a boss freed out of order (a test, an admin) is only counted once its own
 * appearance has come.
 */
export function pageProgress(
  page: number,
  openedAt: number,
  freed: Readonly<Record<string, number>>,
  now: number,
): PageProgress {
  const life = lifecycleOf(page);
  if (!life) throw new Error(`page ${page} has no lifecycle`);
  let step = -1;
  let nextAt: number | null = null;
  for (const [i, s] of life.steps.entries()) {
    const at = dueAt(s, openedAt, freed);
    if (at === null || at > now) {
      nextAt = s.freed === undefined ? at : null;
      break;
    }
    step = i;
  }
  const reached = life.steps.slice(0, step + 1);
  const bosses: Record<string, BossState> = {};
  for (const b of life.bosses) bosses[b] = "sealed";
  let frontierLevel = 0;
  for (const s of reached) {
    if (s.boss) bosses[s.boss] = "open";
    if (s.freed) bosses[s.freed] = "freed";
    if (s.frontierLevel !== undefined) frontierLevel = s.frontierLevel;
  }
  return {
    page,
    step,
    milestone: reached.at(-1)?.milestone ?? "opening",
    week: Math.max(0, Math.floor((now - openedAt) / WEEK_MS)),
    maps: reached.flatMap((s) => s.maps ?? []),
    bosses,
    frontierLevel,
    nextAt,
    sealed: reached.at(-1)?.milestone === life.steps.at(-1)?.milestone,
  };
}

/** Milestones passed going from `from` to `to`, in order, `to` included. */
export function milestonesBetween(from: Milestone, to: Milestone): Milestone[] {
  const a = MILESTONES.indexOf(from);
  const b = MILESTONES.indexOf(to);
  return b > a ? MILESTONES.slice(a + 1, b + 1) : [];
}

export function milestoneReached(reached: Milestone, m: Milestone): boolean {
  return MILESTONES.indexOf(m) <= MILESTONES.indexOf(reached);
}
