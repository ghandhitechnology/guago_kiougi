/**
 * Hunting field pacing (PLAN §6, §10). A field runs in cycles: a surge that refills the horde,
 * then 쉬는 시간, a lull with no spawns where the survivors are mopped up and pages collected.
 *
 * Refill follows clear speed. During a surge every kill queues one respawn `respawnDelay` later,
 * so a field that is cleared fast churns fast, and a weak player still faces a full horde. The
 * churn is bounded twice: never more than `population` alive (PLAN §6, at most 150) and never
 * more than `refillCap` spawns per second for the field, which grows with the players present.
 * A character strong enough to outpace the cap gets more out of hunting higher regions.
 */
export const FIELD_PACING = {
  surgeSeconds: 50,
  lullSeconds: 12,
  /** Monsters dropped at once in a ring around each player group when a surge starts. */
  surgeOpening: 12,
  /** Alive target: 45 + 15 per player, held between 60 and 150. */
  populationBase: 45,
  populationPerPlayer: 15,
  populationMin: 60,
  populationMax: 150,
  /** A killed monster comes back this many seconds later, during a surge. */
  respawnDelay: 1.5,
  /** Spawns per second the field may add at most: 3 + 2 per player, 19 for eight players. */
  refillBase: 3,
  refillPerPlayer: 2,
  /** Spawns land off every player's screen but close enough to arrive within seconds. */
  spawnMinDistance: 280,
  spawnMaxDistance: 480,
  /**
   * Each field is cut into regions of this many levels, shallow near the entrance and deeper
   * toward the far edge. A region's monsters spawn within its levels, whoever is there, so a
   * player chooses how far above their level to hunt by where they walk.
   */
  regionLevels: 5,
  /** Monsters this far from every player for this long are recycled. */
  despawnDistance: 800,
  despawnSeconds: 20,
  bellCue: "sfx.field.bell",
  surgeCue: "sfx.field.surge",
} as const;

export type WavePhase = "surge" | "lull";

export function wavePhase(secondsInField: number): WavePhase {
  const cycle = FIELD_PACING.surgeSeconds + FIELD_PACING.lullSeconds;
  return secondsInField % cycle < FIELD_PACING.surgeSeconds ? "surge" : "lull";
}

/** Share of a cycle spent in a surge. */
export function surgeShare(): number {
  return FIELD_PACING.surgeSeconds / (FIELD_PACING.surgeSeconds + FIELD_PACING.lullSeconds);
}

export function fieldPopulation(players: number): number {
  const p = FIELD_PACING;
  return Math.min(
    p.populationMax,
    Math.max(p.populationMin, p.populationBase + p.populationPerPlayer * players),
  );
}

/** The most monsters per second a field may add, whatever its players kill. */
export function refillCap(players: number, phase: WavePhase): number {
  if (phase === "lull" || players <= 0) return 0;
  return FIELD_PACING.refillBase + FIELD_PACING.refillPerPlayer * players;
}

/** Spawns per second: one for each kill, up to the cap. */
export function refill(players: number, phase: WavePhase, killsPerSecond: number): number {
  return Math.min(Math.max(0, killsPerSecond), refillCap(players, phase));
}

export interface FieldRosterEntry {
  readonly monster: string;
  /** Relative chance per spawn event; a 군집형 event brings a whole pack. */
  readonly weight: number;
  /** Spawns only at or above this monster level. */
  readonly from?: number;
  /** At most this many alive in the field. */
  readonly maxAlive?: number;
}

export interface FieldDef {
  /** Also the id of its place description in the narrative (name and blurb). */
  readonly id: string;
  readonly page: number;
  readonly levels: { readonly min: number; readonly max: number };
  readonly roster: readonly FieldRosterEntry[];
  /** At most this many alive, whoever is present; absent for the usual 60 to 150. */
  readonly populationMax?: number;
}

export function regionCount(field: FieldDef): number {
  return Math.ceil((field.levels.max - field.levels.min + 1) / FIELD_PACING.regionLevels);
}

/** Levels of region `region` (0 at the entrance). */
export function regionLevels(field: FieldDef, region: number): { min: number; max: number } {
  const r = Math.min(regionCount(field) - 1, Math.max(0, Math.floor(region)));
  const min = field.levels.min + r * FIELD_PACING.regionLevels;
  return { min, max: Math.min(field.levels.max, min + FIELD_PACING.regionLevels - 1) };
}

/** A spawn's level in its region; `roll` from the server's generator. */
export function spawnLevel(field: FieldDef, region: number, roll: number): number {
  const { min, max } = regionLevels(field, region);
  return min + Math.min(max - min, Math.floor(roll * (max - min + 1)));
}

const TORTOISE: FieldRosterEntry = { monster: "tortoise", weight: 0.05, maxAlive: 1 };

/** Page 1's four hunting fields, 운동장 균열 out toward the 아고라, 25 levels each. */
export const PAGE1_FIELDS: readonly FieldDef[] = [
  {
    id: "p1-colonnade",
    page: 1,
    levels: { min: 1, max: 25 },
    roster: [
      { monster: "odap", weight: 6 },
      { monster: "odap-pencil", weight: 2 },
      { monster: "rational", weight: 2, from: 8 },
      { monster: "element-fire", weight: 1, from: 15 },
      TORTOISE,
    ],
  },
  {
    id: "p1-olive-road",
    page: 1,
    levels: { min: 26, max: 50 },
    roster: [
      { monster: "odap", weight: 3 },
      { monster: "odap-pencil", weight: 2 },
      { monster: "rational", weight: 2 },
      { monster: "element-fire", weight: 2 },
      { monster: "element-water", weight: 1.5 },
      TORTOISE,
    ],
  },
  {
    id: "p1-cave-mouth",
    page: 1,
    levels: { min: 51, max: 75 },
    roster: [
      { monster: "odap", weight: 2 },
      { monster: "rational", weight: 2 },
      { monster: "element-air", weight: 2 },
      { monster: "element-earth", weight: 2 },
      { monster: "cave-shadow", weight: 3 },
      { monster: "element-water", weight: 1 },
      TORTOISE,
    ],
  },
  {
    id: "p1-agora-edge",
    page: 1,
    levels: { min: 76, max: 100 },
    roster: [
      { monster: "odap", weight: 2 },
      { monster: "odap-pencil", weight: 2 },
      { monster: "rational", weight: 2 },
      { monster: "element-fire", weight: 1.5 },
      { monster: "element-water", weight: 1.5 },
      { monster: "element-air", weight: 1.5 },
      { monster: "element-earth", weight: 1.5 },
      { monster: "cave-shadow", weight: 2 },
      TORTOISE,
    ],
  },
];

/**
 * 생태공원, the campus tutorial ground (PLAN §4 opening): 오답 and pencil 오답 at the first
 * levels, about 60 at full count like the 운동장. Page 0: it belongs to the campus, not to an era.
 */
export const ECO_PARK_FIELD: FieldDef = {
  id: "eco-park",
  page: 0,
  levels: { min: 1, max: 5 },
  roster: [
    { monster: "odap", weight: 6 },
    { monster: "odap-pencil", weight: 2 },
  ],
  populationMax: 60,
};

/** Every hunting ground a map can run, by its map id. */
export const FIELDS: readonly FieldDef[] = [ECO_PARK_FIELD, ...PAGE1_FIELDS];
