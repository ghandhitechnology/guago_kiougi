import { STARTER_BOOKS } from "@guago/content";
import {
  type Character,
  type InventorySnapshot,
  NO_STATS,
  type PlayerBuild,
  type Stats,
} from "@guago/shared";

/**
 * What a character fights with: its equipped books and tools by slot, its stats, level and EXP
 * (PLAN §7, §8, §9), read from the inventory the item operations keep. A fight builds the kit
 * from it on join and again whenever an operation lands that touches it.
 */
export interface Loadout {
  readonly level: number;
  readonly exp: number;
  readonly stats: Stats;
  readonly minor: string | null;
  readonly books: PlayerBuild["books"];
  readonly tools: PlayerBuild["tools"];
}

export interface Loadouts {
  read(character: Character): Promise<Loadout>;
}

/** The build at a level: books keep their own levels, capped by the character's (PLAN §8). */
export function buildOf(character: Character, l: Loadout, level: number): PlayerBuild {
  return {
    major: character.major,
    minor: l.minor,
    level,
    stats: l.stats,
    books: l.books.map((b) => ({ ...b, level: Math.min(b.level, level) })),
    tools: l.tools,
  };
}

/** A loadout from an inventory snapshot: what sits in a slot, in slot order. */
export function loadoutOf(snapshot: InventorySnapshot, minor: string | null): Loadout {
  const worn = snapshot.items
    .filter((i) => i.slot !== null)
    .sort((a, b) => (a.slot as number) - (b.slot as number));
  return {
    level: snapshot.progression.level,
    exp: snapshot.progression.exp,
    stats: snapshot.progression.stats,
    minor,
    books: worn
      .filter((i) => i.kind === "book")
      .map((i) => ({
        def: i.def,
        level: i.level,
        grade: i.grade,
        pilgi: i.pilgi,
        evolved: i.evolved,
      })),
    tools: worn.filter((i) => i.kind === "tool").map((i) => ({ def: i.def, level: i.level })),
  };
}

/** For a server run without the inventory (tests, tools): the class's two books at its level. */
export const starterLoadouts: Loadouts = {
  async read(character) {
    const books = STARTER_BOOKS[character.major] ?? [];
    return {
      level: character.level,
      exp: 0,
      stats: NO_STATS,
      minor: null,
      books: books.map((def) => ({
        def,
        level: character.level,
        grade: 0,
        pilgi: 0,
        evolved: false,
      })),
      tools: [],
    };
  },
};

/** The inventory's loadout, through the op handler's login read (which gives the kit first). */
export function inventoryLoadouts(
  snapshot: (characterId: string) => Promise<InventorySnapshot | null>,
): Loadouts {
  return {
    async read(character) {
      const s = await snapshot(character.id);
      return s ? loadoutOf(s, null) : starterLoadouts.read(character);
    },
  };
}
