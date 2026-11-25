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
  "proof",
  "shield",
  "invulnerable",
] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export const DOT_INTERVAL = 0.5;

export interface StatusDef {
  readonly id: StatusId;
  readonly name: string;
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
  /** Icon the client draws over the target. */
  readonly icon: string;
}

const defs: readonly StatusDef[] = [
  {
    id: "flammable",
    name: "가연",
    on: "monster",
    duration: 6,
    maxStacks: 1,
    icon: "status/flammable",
  },
  {
    id: "burn",
    name: "불",
    on: "monster",
    duration: 3,
    maxStacks: 1,
    dot: 0.25,
    icon: "status/burn",
  },
  {
    id: "acid",
    name: "산",
    on: "monster",
    duration: 4,
    maxStacks: 5,
    dot: 0.06,
    icon: "status/acid",
  },
  {
    id: "base",
    name: "염기",
    on: "monster",
    duration: 6,
    maxStacks: 1,
    slow: 0.1,
    icon: "status/base",
  },
  { id: "metal", name: "금속", on: "monster", duration: 6, maxStacks: 1, icon: "status/metal" },
  {
    id: "wet",
    name: "수분",
    on: "monster",
    duration: 6,
    maxStacks: 1,
    slow: 0.1,
    icon: "status/wet",
  },
  { id: "sodium", name: "나트륨", on: "monster", duration: 6, maxStacks: 1, icon: "status/sodium" },
  {
    id: "bleed",
    name: "출혈",
    on: "monster",
    duration: 4,
    maxStacks: 10,
    dot: 0.05,
    icon: "status/bleed",
  },
  {
    id: "slow",
    name: "둔화",
    on: "monster",
    duration: 2,
    maxStacks: 1,
    slow: 0.3,
    icon: "status/slow",
  },
  {
    id: "armorBreak",
    name: "방어 감소",
    on: "monster",
    duration: 6,
    maxStacks: 4,
    damageTaken: 0.05,
    armorLoss: 0.1,
    icon: "status/armor-break",
  },
  {
    id: "infection",
    name: "감염",
    on: "monster",
    duration: 8,
    maxStacks: 1,
    dot: 0.08,
    icon: "status/infection",
  },
  /** 증명 스택: counted per attacker, see `PROOF`. Its duration is the gap allowed between hits. */
  { id: "proof", name: "증명", on: "monster", duration: 2, maxStacks: 10, icon: "status/proof" },
  { id: "shield", name: "보호막", on: "player", duration: 5, maxStacks: 1, icon: "status/shield" },
  {
    id: "invulnerable",
    name: "무적",
    on: "player",
    duration: 2,
    maxStacks: 1,
    icon: "status/invulnerable",
  },
];

export const STATUSES = Object.fromEntries(defs.map((d) => [d.id, d])) as Readonly<
  Record<StatusId, StatusDef>
>;

/** How much of a slow reaches an elite or a boss. */
export const SLOW_RESIST = { normal: 1, elite: 0.5, boss: 0.25 } as const;
