import type { TextKey } from "./narrative/schema.ts";
import { termKey } from "./narrative/study.ts";

/**
 * Status effects. Every status stacks the same way: an application adds stacks up to
 * `maxStacks` and refreshes the duration of all of them. A damage-over-time status remembers the
 * strongest hit that applied it (its power) and deals `dot` × power per stack per second, in
 * ticks every `DOT_INTERVAL` seconds. Innate statuses on a monster never expire and are never
 * consumed by a reaction.
 */
export const STATUS_IDS = [
  "flammable",
  "burn",
  "acid",
  "base",
  "metal",
  "wet",
  "sodium",
  "bleed",
  "slow",
  "armorBreak",
  "infection",
  "mark",
  "proof",
  "shield",
  "invulnerable",
] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export const DOT_INTERVAL = 0.5;

export interface StatusDef {
  readonly id: StatusId;
  readonly name: TextKey;
  /** Who it can sit on. */
  readonly on: "monster" | "player";
  readonly duration: number;
  readonly maxStacks: number;
  /** Damage per stack per second, as a multiple of the applying hit. */
  readonly dot?: number;
  /** Movement speed lost, 0 to 1. Elites feel half, bosses a quarter. */
  readonly slow?: number;
  /** Extra damage taken per stack, and armour removed per stack. */
  readonly damageTaken?: number;
  readonly armorLoss?: number;
  /** A shield's size as a share of the owner's max HP. */
  readonly shield?: number;
  /** Icon the client draws over the target, a frame of the `status` sprite. */
  readonly icon: string;
}

type Def = Omit<StatusDef, "name" | "icon">;

const defs: readonly Def[] = [
  { id: "flammable", on: "monster", duration: 6, maxStacks: 1 },
  { id: "burn", on: "monster", duration: 3, maxStacks: 1, dot: 0.25 },
  { id: "acid", on: "monster", duration: 4, maxStacks: 5, dot: 0.06 },
  { id: "base", on: "monster", duration: 6, maxStacks: 1, slow: 0.1 },
  { id: "metal", on: "monster", duration: 6, maxStacks: 1 },
  { id: "wet", on: "monster", duration: 6, maxStacks: 1, slow: 0.1 },
  { id: "sodium", on: "monster", duration: 6, maxStacks: 1 },
  { id: "bleed", on: "monster", duration: 4, maxStacks: 10, dot: 0.05 },
  { id: "slow", on: "monster", duration: 2, maxStacks: 1, slow: 0.3 },
  { id: "armorBreak", on: "monster", duration: 6, maxStacks: 4, damageTaken: 0.05, armorLoss: 0.1 },
  { id: "infection", on: "monster", duration: 8, maxStacks: 1, dot: 0.08 },
  /** 유전 가계도: passed on at death by the book's `spread` special. */
  { id: "mark", on: "monster", duration: 6, maxStacks: 3, dot: 0.1 },
  /** 증명 스택: counted per attacker, see `PROOF`. Its duration is the gap allowed between hits. */
  { id: "proof", on: "monster", duration: 2, maxStacks: 10 },
  { id: "shield", on: "player", duration: 5, maxStacks: 1, shield: 0.05 },
  { id: "invulnerable", on: "player", duration: 2, maxStacks: 1 },
];

const icon = (id: string) => `status/${id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export const STATUSES = Object.fromEntries(
  defs.map((d) => [d.id, { ...d, name: termKey("status", d.id), icon: icon(d.id) }]),
) as Readonly<Record<StatusId, StatusDef>>;

/** How much of a slow reaches an elite or a boss. */
export const SLOW_RESIST = { normal: 1, elite: 0.5, boss: 0.25 } as const;
