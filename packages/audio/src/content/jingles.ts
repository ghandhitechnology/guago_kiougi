import type { Bank } from "../sfx/format.ts";
import type { SongSource } from "../tracker/format.ts";
import { wakeup } from "./music/wakeup.ts";

/**
 * Short pieces that play over the music, like effects: rendered once to a stereo buffer, they
 * duck the music by `duck` dB while they sound.
 */
export interface JingleSource {
  readonly song: SongSource;
  readonly bank: Bank;
  readonly duck: number;
}

export const JINGLES: Readonly<Record<string, JingleSource>> = {
  /** The opening's 기상송 is the wake-up song itself, played over the assembly's first bars. */
  "jingle.wake-song": { song: wakeup, bank: "page1", duck: -18 },
};
