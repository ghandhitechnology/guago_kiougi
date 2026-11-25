/**
 * Hunting field pacing (PLAN §6, §10). A field runs in cycles: a surge that refills the horde,
 * then 쉬는 시간, a lull with no spawns where the survivors are mopped up and pages collected.
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
  /** Refill per second during a surge: 1 + 0.5 per player. Solo, about 73 kills a minute at most. */
  spawnBase: 1,
  spawnPerPlayer: 0.5,
  /** Spawns land off every player's screen but close enough to arrive within seconds. */
  spawnMinDistance: 280,
  spawnMaxDistance: 480,
  /** A spawn's level is within this many levels of the nearby players' average. */
  levelSpread: 2,
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

export function fieldPopulation(players: number): number {
  const p = FIELD_PACING;
  return Math.min(
    p.populationMax,
    Math.max(p.populationMin, p.populationBase + p.populationPerPlayer * players),
  );
}

/** Monsters per second the field may add while under its population target. */
export function spawnRate(players: number, phase: WavePhase): number {
  if (phase === "lull" || players <= 0) return 0;
  return FIELD_PACING.spawnBase + FIELD_PACING.spawnPerPlayer * players;
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
  readonly id: string;
  readonly name: string;
  readonly page: number;
  readonly levels: { readonly min: number; readonly max: number };
  readonly roster: readonly FieldRosterEntry[];
}

export function spawnLevel(field: FieldDef, nearbyAverage: number, roll: number): number {
  const spread = FIELD_PACING.levelSpread;
  const level = Math.round(nearbyAverage) - spread + Math.floor(roll * (2 * spread + 1));
  return Math.min(field.levels.max, Math.max(field.levels.min, level));
}

const TORTOISE: FieldRosterEntry = { monster: "tortoise", weight: 0.05, maxAlive: 1 };

/** Page 1's four hunting fields, 운동장 균열 out toward the 아고라, 25 levels each. */
export const PAGE1_FIELDS: readonly FieldDef[] = [
  {
    id: "p1-colonnade",
    name: "무너진 열주",
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
    name: "올리브 숲길",
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
    name: "동굴 입구",
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
    name: "아고라 외곽",
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
