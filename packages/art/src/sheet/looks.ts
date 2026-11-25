/**
 * Looks for the wardrobe review, shared by the static sheet and the page: random looks from the
 * whole set, and a small club. Pure, so both the build and the browser run it.
 */

export interface Crest {
  readonly bg: string;
  readonly symbol: string;
}

export interface WornLook {
  readonly parts: Readonly<Record<string, string>>;
  readonly slots: Readonly<Record<string, string>>;
  readonly crest?: Crest;
}

export interface Wardrobe {
  /** Part names per layer. */
  readonly parts: Readonly<Record<string, readonly string[]>>;
  /** Option names per swap slot. */
  readonly slots: Readonly<Record<string, readonly string[]>>;
  readonly crests: { readonly bg: readonly string[]; readonly symbol: readonly string[] };
}

/** A small deterministic generator, so the looks are the same on every build. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` looks with every layer and slot picked at random, a 과잠 on about a third of them. */
export function randomLooks(w: Wardrobe, n = 20, seed = 2026): WornLook[] {
  const rand = seeded(seed);
  const any = <T>(xs: readonly T[] | undefined): T => {
    const list = xs ?? [];
    return list[Math.floor(rand() * list.length)] as T;
  };
  return Array.from({ length: n }, () => {
    const parts: Record<string, string> = {
      shadow: "blob",
      body: "base",
      uniform: any(w.parts.uniform),
      face: any(w.parts.face),
      hair: any(w.parts.hair),
      book: "textbook",
    };
    if (rand() < 0.45) parts.jacket = rand() < 0.7 ? "varsity" : any(w.parts.jacket);
    if (rand() < 0.55) parts.accessory = any(w.parts.accessory);
    const slots = Object.fromEntries(Object.entries(w.slots).map(([s, o]) => [s, any(o)]));
    return {
      parts,
      slots,
      ...(parts.jacket === "varsity"
        ? { crest: { bg: any(w.crests.bg), symbol: any(w.crests.symbol) } }
        : {}),
    };
  });
}

const BASE = { shadow: "blob", body: "base", uniform: "blazer", book: "textbook" } as const;

/** Five members of one club, each crest different, for the club row. */
export const CLUB: readonly WornLook[] = [
  {
    parts: { ...BASE, jacket: "varsity", hair: "bun", face: "bright" },
    slots: { skin: "fair", hair: "black", jacket: "navy", emblem: "ivory" },
    crest: { bg: "shield", symbol: "setsquare" },
  },
  {
    parts: { ...BASE, uniform: "gym", jacket: "varsity", hair: "buzz", face: "sharp" },
    slots: { skin: "warm", hair: "brown", jacket: "crimson", emblem: "mustard", cohort: "gold" },
    crest: { bg: "circle", symbol: "atom" },
  },
  {
    parts: { ...BASE, uniform: "shirt", jacket: "varsity", hair: "braids", face: "shy" },
    slots: { skin: "fair", hair: "pink", jacket: "forest", emblem: "ivory" },
    crest: { bg: "hexagon", symbol: "flask" },
  },
  {
    parts: { ...BASE, uniform: "cardigan", jacket: "varsity", hair: "undercut", face: "cool" },
    slots: { skin: "deep", hair: "silver", jacket: "violet", emblem: "rose" },
    crest: { bg: "banner", symbol: "cat" },
  },
  {
    parts: { ...BASE, jacket: "varsity", hair: "spiky", face: "goofy", accessory: "headphones" },
    slots: { skin: "warm", hair: "chestnut", jacket: "teal", emblem: "orange" },
    crest: { bg: "pennant", symbol: "star" },
  },
];
