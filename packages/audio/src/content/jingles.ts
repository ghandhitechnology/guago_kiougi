import type { Bank } from "../sfx/format.ts";
import type { SongSource } from "../tracker/format.ts";
import { jeonjik, levelUp, liberation, rareDrop } from "./music/jingles.ts";
import { wakeup } from "./music/wakeup.ts";

/**
 * Short pieces that play over the music, like effects. They stream from the worker on a deck of
 * their own and duck the music by `duck` dB while they sound. `bank` is kept for tools.
 */
export interface JingleSource {
  readonly song: SongSource;
  readonly bank: Bank;
  readonly duck: number;
}

export const JINGLES: Readonly<Record<string, JingleSource>> = {
  "jingle.level-up": { song: levelUp, bank: "combat", duck: -10 },
  "jingle.rare-drop": { song: rareDrop, bank: "combat", duck: -8 },
  /** 전직: the class change. */
  "jingle.jeonjik": { song: jeonjik, bank: "page1", duck: -16 },
  /** A scientist freed: plays as the cutscene's music cuts out. */
  "jingle.liberation": { song: liberation, bank: "page1", duck: -24 },
  /** The opening's 기상송 is the wake-up song itself, played over the assembly's first bars. */
  "jingle.wake-song": { song: wakeup, bank: "page1", duck: -18 },
};
