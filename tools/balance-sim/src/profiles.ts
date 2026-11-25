import type { ClassId } from "@guago/content";
import type { Profile } from "./sim.ts";

/**
 * PLAN §9 profiles. Every profile logs out in the 자습실, the best free choice (35% for 10
 * hours), and plays 반자동. Field players are how many share the field at the profile's hours:
 * evenings are busy, a sealed Page is quiet (a third of that).
 */
export function profiles(cls: ClassId = "math"): Profile[] {
  const common = {
    cls,
    logout: "study-hall",
    mode: "semi",
    deathsPerHour: 0.3,
    weeklies: true,
  } as const;
  return [
    { ...common, id: "casual", activeMinutes: 20, fieldPlayers: 8, repeatables: 0, frontier: 1 },
    { ...common, id: "regular", activeMinutes: 60, fieldPlayers: 8, repeatables: 2, frontier: 1 },
    { ...common, id: "hardcore", activeMinutes: 180, fieldPlayers: 6, repeatables: 5, frontier: 1 },
  ];
}

/** A newcomer on 20 minutes plus the pool, starting while `frontier` is the live Page. */
export function newcomer(frontier: number, cls: ClassId = "math"): Profile {
  return {
    id: `newcomer-p${frontier}`,
    cls,
    logout: "study-hall",
    mode: "semi",
    deathsPerHour: 0.3,
    weeklies: true,
    activeMinutes: 20,
    fieldPlayers: 6,
    repeatables: 0,
    frontier,
  };
}

/** PLAN §9 pacing targets: weeks to the top of the live band, and level when the Page ends. */
export const TARGETS = {
  casual: { weeks: [9, 11], endLevel: 100 },
  regular: { weeks: [5, 6], endLevel: 125 },
  hardcore: { weeks: [3, 3], endLevel: 150 },
} as const;

/** A sealed Page every 1 to 2 weeks for a newcomer. */
export const NEWCOMER_WEEKS_PER_PAGE = [1, 2] as const;
