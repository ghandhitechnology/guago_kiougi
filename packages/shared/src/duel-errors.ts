/** Why a 콜로세움 request (duel.ts) was not carried out (besides `rate_limited`, `blocked`, `no_player`,
 * `target_offline`, `target_self`, `not_leader` and `server_error`). The client owns the copy. */
export const DUEL_ERRORS = [
  /** You are already queued, in a ready check, in a match, or have a challenge out. */
  "duel_busy",
  /** The other player is in a queue, a ready check or a match, or has five challenges waiting. */
  "duel_target_busy",
  /** Neither of you may duel from where you stand (between maps, in the 집). */
  "duel_not_here",
  /** That challenge or ready check is gone (answered, withdrawn or lapsed). */
  "duel_no_challenge",
  "duel_no_match",
  /** Nothing to leave or forfeit. */
  "duel_not_in",
  /** 3v3 takes a party of up to three, queued by its leader; 1v1 takes one player. */
  "duel_party_size",
  /** You let a found match lapse or refused it a moment ago; `retryMs` says how long. */
  "duel_queue_locked",
] as const;
export type DuelErrorCode = (typeof DUEL_ERRORS)[number];
