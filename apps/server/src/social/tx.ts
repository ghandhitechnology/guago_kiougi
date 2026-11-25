/**
 * Transactions for the social stores: a refusal thrown inside one rolls it back and becomes the
 * answer, database constraint failures become the refusal they stand for, and lock-order
 * conflicts are retried.
 */
import type { RefusalCode } from "@guago/shared";
import { type Db, pgErrorCode } from "../db/index.ts";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A rule stopped the request: the transaction rolls back and the player gets `code`. */
export class Refuse extends Error {
  override name = "Refuse";
  readonly code: RefusalCode;
  readonly need: number | undefined;
  constructor(code: RefusalCode, need?: number) {
    super(code);
    this.code = code;
    this.need = need;
  }
}

/** Constraint names to the refusal each one means. Caps are enforced only by these. */
const CONSTRAINTS: Readonly<Record<string, RefusalCode>> = {
  friends_character_id_other_id_pk: "already_friends",
  social_counts_friends_check: "friends_full",
  social_counts_requests_out_check: "requests_full",
  social_counts_requests_in_check: "requests_full",
  social_counts_blocks_check: "blocks_full",
  social_counts_applied_check: "applications_full",
  social_counts_club_invites_check: "invites_full",
  clubs_name_key: "name_taken",
  club_members_pkey: "in_club",
  clubs_member_count_check: "club_full",
  clubs_application_count_check: "applications_full",
  clubs_invite_count_check: "invites_full",
  board_posts_author_key: "post_active",
  // A club disbanded under a join or an invite: the foreign key into `clubs` fails.
  club_members_club_id_clubs_id_fk: "no_club",
  club_applications_club_id_clubs_id_fk: "no_club",
  club_invites_club_id_clubs_id_fk: "no_club",
};

/** The refusal a database error stands for, if it is one of ours. */
export function refusalOf(error: unknown): RefusalCode | undefined {
  const { code, constraint } = pgErrorCode(error);
  if ((code === "23505" || code === "23514" || code === "23503") && constraint) {
    return CONSTRAINTS[constraint];
  }
  return undefined;
}

const RETRY = new Set(["40P01", "40001"]);

/**
 * Runs `work` in a transaction. A `Refuse` (thrown or from a known constraint) rolls back and is
 * returned; a deadlock or serialization failure runs `work` again, up to three times.
 */
export async function transact<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T | Refuse> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(work);
    } catch (error) {
      if (error instanceof Refuse) return error;
      const known = refusalOf(error);
      if (known) return new Refuse(known);
      if (attempt < 3 && RETRY.has(pgErrorCode(error).code ?? "")) continue;
      throw error;
    }
  }
}
