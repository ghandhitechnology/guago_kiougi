import { BOOK_BASE_DAMAGE, EVOLUTION } from "@guago/shared";
import type { Attack, LevelStep } from "./attacks.ts";
import type { ClassId } from "./classes.ts";
import type { TextKey } from "./narrative/schema.ts";
import { studyText } from "./narrative/study.ts";

/** Ids the client resolves against the art atlases and the audio bank. */
export interface BookCues {
  /** Slot and bag icon, a frame of the `book` sprite. */
  readonly icon: string;
  /** The moving part: orbit body, beam segment, projectile, minion, crack. */
  readonly body: string;
  readonly hit: string;
  /** Pool, telegraph mark or other lingering area, when the attack leaves one. */
  readonly area?: string;
  readonly cast: string;
  readonly impact: string;
}

/**
 * 증명 노트's effect on the 수학 signature: more stacks before Q.E.D. (`proofCap` added to the
 * cap), an extra burst worth `qedDamage` × the note's own book damage on every Q.E.D., and with
 * `qedChain` the burst also lands on that many targets touching the proven one.
 */
export interface SignatureTuning {
  readonly proofCap: number;
  readonly qedDamage: number;
  readonly qedChain: number;
}

/** What a book becomes (PLAN §8). Grade, level and 필기 carry over; only the attack changes. */
export interface Evolution<A extends Attack = Attack> {
  readonly id: string;
  readonly name: TextKey;
  readonly description: TextKey;
  readonly requires: typeof EVOLUTION;
  readonly attack: A | null;
  readonly levels: readonly LevelStep<A>[];
  readonly signature?: SignatureTuning;
  readonly cues: BookCues;
}

export interface BookDef<A extends Attack = Attack> {
  readonly id: string;
  readonly name: TextKey;
  readonly description: TextKey;
  readonly subject: ClassId;
  /** The Page whose fields drop its 낱장. Launch books are Page 1's. */
  readonly page: number;
  /** Linked tool id. */
  readonly tool: string;
  readonly base: number;
  /** `null` for a book with no shape of its own (증명 노트). */
  readonly attack: A | null;
  readonly levels: readonly LevelStep<A>[];
  readonly signature?: SignatureTuning;
  readonly cues: BookCues;
  readonly evolution: Evolution;
}

type BookInput<A extends Attack> = Omit<
  BookDef<A>,
  "name" | "description" | "base" | "page" | "cues" | "evolution"
> & {
  readonly cues: Omit<BookCues, "icon" | "cast" | "impact"> & {
    readonly cast?: string;
    readonly impact?: string;
  };
  readonly evolution: Omit<Evolution, "name" | "description" | "requires" | "cues"> & {
    readonly cues?: Partial<BookCues>;
  };
};

/** Fills in text keys, the base damage, Page 1 and the cue ids that follow from the id. */
export function book<A extends Attack>(input: BookInput<A>): BookDef<A> {
  const text = studyText(`book:${input.id}`);
  const evolved = studyText(`evolved:${input.evolution.id}`);
  const cues: BookCues = {
    icon: `book/${input.id}`,
    cast: `sfx.book.${input.id}.cast`,
    impact: `sfx.book.${input.id}.hit`,
    ...input.cues,
  };
  const { cues: evolvedCues, ...evolution } = input.evolution;
  return {
    ...input,
    name: text.name,
    description: text.desc,
    base: BOOK_BASE_DAMAGE,
    page: 1,
    cues,
    evolution: {
      ...evolution,
      name: evolved.name,
      description: evolved.desc,
      requires: EVOLUTION,
      cues: { ...cues, icon: `book/${input.evolution.id}`, ...evolvedCues },
    },
  };
}
