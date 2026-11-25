/**
 * The opening's two tutorial fights as data (PLAN §4 beats 4 and 5): the waves that pour up the
 * 가설관 stairs and the seniors who hold each landing, and the 오답노트 골렘 on the field. The
 * server runs them in the opening's private copies (`apps/server/src/opening/`); each `until` is
 * a `play` condition of `narrative/opening.ts`, met when the fight is over.
 */

import type { TileRect } from "@guago/shared";
import type { ClassId } from "./classes.ts";

/** A senior holding a landing with their class's two starter books. */
export interface OpeningSenior {
  /** Their cast id; they stand at their spot in the map's `npcs`. */
  readonly speaker: string;
  readonly major: ClassId;
  /** A mark the scene walks them to, when they fight from there instead. */
  readonly post?: string;
}

export interface OpeningWave {
  /** The `play` condition this wave meets once its last 오답 is down. */
  readonly until: string;
  /** The landing it is fought on: it starts once the player is within `OPENING_STAIRS.reach`. */
  readonly landing: string;
  /** Where the 오답 come up from, in tiles: the flight below, or the front door. */
  readonly from: TileRect;
  readonly monster: string;
  readonly count: number;
  /** A few at a time, `every` seconds apart, so they pour in rather than appear. */
  readonly pour: { readonly count: number; readonly every: number };
  readonly seniors: readonly OpeningSenior[];
}

export interface OpeningStairs {
  readonly map: string;
  /** Tiles from a landing's mark the player stands within for its wave to start. */
  readonly reach: number;
  /** The 오답's level: a new character's first fight. */
  readonly level: number;
  /** The seniors' level and their share of a book's damage: they hold, the player clears. */
  readonly seniorLevel: number;
  readonly seniorDamage: number;
  readonly waves: readonly OpeningWave[];
}

export interface OpeningGolem {
  readonly map: string;
  /** The mark it rises at. */
  readonly mark: string;
  /** Seconds it takes to come up out of the ground, harmless and still. */
  readonly rise: number;
  /**
   * Until the player has dodged a slam once it never falls below this share of its health: the
   * beat teaches the dodge, so the fight waits for it.
   */
  readonly holdHp: number;
  /** The `play` conditions of beat 5, in the order the fight meets them. */
  readonly signals: {
    readonly telegraph: string;
    readonly dodged: string;
    readonly defeat: string;
    readonly pickup: string;
  };
}

export const OPENING_STAIRS: OpeningStairs = {
  map: "gaseolgwan-stairs",
  reach: 8,
  level: 1,
  seniorLevel: 3,
  seniorDamage: 0.25,
  waves: [
    {
      until: "clear:landing-4f-first",
      landing: "landing-4f",
      from: { x: 11, y: 11, w: 4, h: 2 },
      monster: "odap",
      count: 5,
      pour: { count: 1, every: 0.8 },
      seniors: [],
    },
    {
      until: "clear:landing-4f",
      landing: "landing-4f",
      from: { x: 11, y: 11, w: 4, h: 2 },
      monster: "odap",
      count: 10,
      pour: { count: 2, every: 1.2 },
      seniors: [{ speaker: "senior-earth", major: "earth", post: "landing-4f" }],
    },
    {
      until: "clear:landing-3f",
      landing: "landing-3f",
      from: { x: 11, y: 21, w: 4, h: 2 },
      monster: "odap",
      count: 12,
      pour: { count: 2, every: 1.1 },
      seniors: [{ speaker: "senior-physics", major: "physics" }],
    },
    {
      until: "clear:landing-2f",
      landing: "landing-2f",
      from: { x: 11, y: 31, w: 4, h: 2 },
      monster: "odap",
      count: 14,
      pour: { count: 2, every: 1 },
      seniors: [{ speaker: "senior-chem", major: "chemistry" }],
    },
    {
      until: "clear:lobby-1f",
      landing: "lobby-1f",
      from: { x: 10, y: 45, w: 6, h: 2 },
      monster: "odap",
      count: 16,
      pour: { count: 3, every: 1.2 },
      seniors: [
        { speaker: "senior-math", major: "math" },
        { speaker: "senior-bio", major: "biology" },
      ],
    },
  ],
};

export const OPENING_GOLEM: OpeningGolem = {
  map: "campus-field",
  mark: "golem-rise",
  rise: 1.6,
  holdHp: 0.25,
  signals: {
    telegraph: "golem-telegraph",
    dodged: "dodged:odap-golem",
    defeat: "defeat:odap-golem",
    pickup: "pickup:first-drop",
  },
};
