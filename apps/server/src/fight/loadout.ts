import type { Character } from "@guago/shared";
import { NO_STATS, type PlayerBuild } from "@guago/shared";

/**
 * What a character fights with. The persistent inventory (item operations) will read the
 * equipped books and tools and the allocated stats; until it is wired, every character carries
 * its class's two 신입생 books (PLAN §7 basic kit, M2's two books per class) at its own level.
 */
export interface Loadouts {
  buildFor(character: Character, level: number): PlayerBuild;
}

/** M2's basic kit, the same pairs the item operations' starter kit grants. */
const STARTER_BOOKS: Readonly<Record<string, readonly [string, string]>> = {
  math: ["wangdo", "graph-note"],
  physics: ["holiday-physics", "em-lab"],
  chemistry: ["zoomin-chem", "lab-report"],
  biology: ["camping-bio", "dissection"],
  earth: ["round-earth", "rock-box"],
};

export const starterLoadouts: Loadouts = {
  buildFor(character, level) {
    const books = STARTER_BOOKS[character.major] ?? STARTER_BOOKS.math;
    return {
      major: character.major,
      minor: null,
      level,
      stats: NO_STATS,
      books: (books ?? []).map((def) => ({ def, level, grade: 0, pilgi: 0, evolved: false })),
      tools: [],
    };
  },
};
