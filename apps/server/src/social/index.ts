/**
 * The social systems' services (PLAN §12): the database stores for friends, blocks, clubs, the
 * 대자보 and reports, with the text rules they share with chat. The WorldRoom runs them through
 * `SocialHub`; what lives only in memory (parties, online state) is in the hub and `parties`.
 */
import { BOARD_POST_LENGTH, CLUB_NOTICE_LENGTH, cleanText, type RefusalCode } from "@guago/shared";
import { isBannedName } from "../auth/names.ts";
import { ChatFilter } from "../chat/filter.ts";
import type { ChatSink } from "../chat/log.ts";
import type { Db } from "../db/index.ts";
import { describeError } from "../db/index.ts";
import { createBoard } from "./board.ts";
import { createClubStore } from "./clubs.ts";
import type { FeePath } from "./fees.ts";
import { createFriendStore } from "./friends.ts";
import { createReports } from "./reports.ts";

export type Cleaned = { ok: true; text: string } | { ok: false; code: RefusalCode };

export interface SocialOptions {
  /** The founding fee's path through the item executor (see fees.ts). */
  fees: FeePath;
  /** `jacket` swap slot options of the art. */
  jackets: () => readonly string[];
  filter?: ChatFilter;
  /** The chat log, flushed before a report reads it. */
  log?: ChatSink;
  /** 층장 this week (the 벌점 and 상점 work). Until it exists nobody may pin. */
  mayPin?: (characterId: string) => Promise<boolean>;
  now?: () => number;
}

export function createSocial(db: Db, options: SocialOptions) {
  const filter = options.filter ?? ChatFilter.fromFile();
  const now = options.now ?? Date.now;

  /** Player text as chat treats it: cleaned, length-checked, then masked by the filter. */
  function clean(raw: string, maxLength: number): Cleaned {
    const cleaned = cleanText(raw, maxLength);
    if (!cleaned.ok) return cleaned;
    const checked = filter.check(cleaned.text);
    if (checked.unreadable) return { ok: false, code: "unreadable" };
    return { ok: true, text: checked.text };
  }

  const friends = createFriendStore(db, now);
  const clubs = createClubStore(db, options.fees, {
    nameBanned: (name) => {
      if (isBannedName(name)) return true;
      const checked = filter.check(name);
      return checked.masked || checked.unreadable;
    },
    jackets: options.jackets,
    notice: (raw) => clean(raw, CLUB_NOTICE_LENGTH),
    now,
  });
  const board = createBoard(db, {
    text: (raw) => clean(raw, BOARD_POST_LENGTH),
    ...(options.mayPin ? { mayPin: options.mayPin } : {}),
    now,
  });
  const reports = createReports(db, options.log, now);

  return {
    db,
    friends,
    clubs,
    board,
    reports,
    clean,
    now,

    /** Drops lapsed friend requests, club invites and 대자보 posts. */
    async sweep(): Promise<void> {
      try {
        await friends.sweep();
        await clubs.sweep();
        await board.sweep();
      } catch (error) {
        console.error(`social sweep failed: ${describeError(error)}`);
      }
    },
  };
}

export type Social = ReturnType<typeof createSocial>;
