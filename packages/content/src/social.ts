/**
 * Ids for the social systems (PLAN §12): the emote wheel and the 과잠 emblem parts. Animations,
 * icons and part drawings belong to the art; the client words every id. Lists are append-only:
 * stored clubs and saved wheels refer to these ids.
 */
import type { Emblem } from "@guago/shared";

export interface EmoteDef {
  readonly id: string;
  /** In the launch wheel of eight; later emotes unlock from events and the 학생회 상점. */
  readonly wheel: boolean;
}

/** 인사, 박수, ㅋㅋ, 졸림, 화이팅, 절, 춤, 멘붕, in wheel order. */
export const EMOTES: readonly EmoteDef[] = [
  { id: "wave", wheel: true },
  { id: "clap", wheel: true },
  { id: "lol", wheel: true },
  { id: "sleepy", wheel: true },
  { id: "fighting", wheel: true },
  { id: "bow", wheel: true },
  { id: "dance", wheel: true },
  { id: "meltdown", wheel: true },
];

/** Emotes every character has. Unlockable ones join when their sources exist. */
export function emoteAllowed(id: string): boolean {
  return EMOTES.some((e) => e.id === id && e.wheel);
}

/**
 * Accessories every new student may pick in the creator (PLAN §16: glasses and five more). The
 * art draws more (the 코스튬 진열장's stock, Page rewards); those are worn only once owned.
 */
export const LAUNCH_ACCESSORIES: readonly string[] = [
  "glasses",
  "goggles",
  "headphones",
  "hairclip",
  "mask",
  "lanyard",
];

/** Coats every new student may pick in the creator; the 과잠 comes only with a club. */
export const LAUNCH_JACKETS: readonly string[] = ["labcoat", "raincoat"];

export interface EmblemPart {
  readonly id: string;
  /** Club level that unlocks the part (PLAN §12: a larger roster of emblem parts). */
  readonly level: number;
}

/** Back emblem outlines. */
export const EMBLEM_SHAPES: readonly EmblemPart[] = [
  { id: "shield", level: 1 },
  { id: "circle", level: 1 },
  { id: "diamond", level: 1 },
  { id: "banner", level: 1 },
  { id: "hexagon", level: 3 },
  { id: "star", level: 5 },
  { id: "laurel", level: 7 },
  { id: "crown", level: 10 },
];

/** Symbols drawn on the shape, one for each subject and a few for school life. */
export const EMBLEM_SYMBOLS: readonly EmblemPart[] = [
  { id: "pi", level: 1 },
  { id: "atom", level: 1 },
  { id: "flask", level: 1 },
  { id: "leaf", level: 1 },
  { id: "planet", level: 1 },
  { id: "pencil", level: 1 },
  { id: "book", level: 2 },
  { id: "gear", level: 2 },
  { id: "dna", level: 3 },
  { id: "magnet", level: 4 },
  { id: "comet", level: 5 },
  { id: "pinecone", level: 6 },
  { id: "infinity", level: 8 },
  { id: "lightning", level: 9 },
];

/** Emblem colours: 해솔 64 ramp names, each drawn from its ramp's light and dark steps. */
export const EMBLEM_COLORS: readonly EmblemPart[] = [
  { id: "ink", level: 1 },
  { id: "stone", level: 1 },
  { id: "red", level: 1 },
  { id: "gold", level: 1 },
  { id: "grass", level: 1 },
  { id: "navy", level: 1 },
  { id: "plum", level: 1 },
  { id: "rose", level: 2 },
  { id: "sea", level: 2 },
  { id: "wood", level: 3 },
  { id: "clay", level: 3 },
  { id: "board", level: 4 },
  { id: "olive", level: 4 },
];

/** `emblem_invalid` for an unknown part, `emblem_locked` for one the level has not unlocked. */
export function checkEmblem(
  emblem: Emblem,
  clubLevel: number,
): "emblem_invalid" | "emblem_locked" | null {
  const parts: [readonly EmblemPart[], string][] = [
    [EMBLEM_SHAPES, emblem.shape],
    [EMBLEM_COLORS, emblem.shapeColor],
    [EMBLEM_SYMBOLS, emblem.symbol],
    [EMBLEM_COLORS, emblem.symbolColor],
  ];
  let locked = false;
  for (const [list, id] of parts) {
    const part = list.find((p) => p.id === id);
    if (!part) return "emblem_invalid";
    if (part.level > clubLevel) locked = true;
  }
  return locked ? "emblem_locked" : null;
}
