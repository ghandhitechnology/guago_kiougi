import { type ControlMode, MODE_BONUS } from "@guago/shared";
import type { TextKey } from "./narrative/schema.ts";
import { termKey } from "./narrative/study.ts";

export interface ModeDef {
  readonly id: ControlMode;
  readonly name: TextKey;
  /** What the server drives for the player in this mode. */
  readonly auto: { readonly move: boolean; readonly books: boolean; readonly skills: boolean };
  readonly bonus: number;
  readonly icon: string;
}

/** The four control modes, cycled with one button and stored per character (PLAN §6). */
export const MODES: readonly ModeDef[] = [
  {
    id: "auto",
    name: termKey("mode", "auto"),
    auto: { move: true, books: true, skills: true },
    bonus: MODE_BONUS.auto,
    icon: "mode/auto",
  },
  {
    id: "semi",
    name: termKey("mode", "semi"),
    auto: { move: false, books: true, skills: true },
    bonus: MODE_BONUS.semi,
    icon: "mode/semi",
  },
  {
    id: "skill",
    name: termKey("mode", "skill"),
    auto: { move: true, books: true, skills: false },
    bonus: MODE_BONUS.skill,
    icon: "mode/skill",
  },
  {
    id: "manual",
    name: termKey("mode", "manual"),
    auto: { move: false, books: false, skills: false },
    bonus: MODE_BONUS.manual,
    icon: "mode/manual",
  },
];

export const DEFAULT_MODE: ControlMode = "semi";

/**
 * How the server plays the automated parts. Movement: kite to keep the nearest monster at
 * `keepDistance`, back off below `retreatHp`, drift toward the densest nearby cell when idle.
 * Books: cast when ready at the best target in `targetRange`; an aimed target from the player
 * wins in 반자동. Skills: dodge when a telegraph or charge would land within `dodgeLead` and the
 * roll is ready; never dodge into a wall.
 */
export const AUTO_PLAY = {
  keepDistance: 64,
  retreatHp: 0.3,
  targetRange: 160,
  dodgeLead: 0.2,
} as const;

/** Lower is better. 치유형 count as closer; 그림자 beyond their range cannot be chosen. */
export function autoTargetScore(
  distance: number,
  aimPriority = 1,
  autoAimRange = Number.POSITIVE_INFINITY,
): number {
  if (distance > Math.min(AUTO_PLAY.targetRange, autoAimRange)) return Number.POSITIVE_INFINITY;
  return distance / aimPriority;
}
