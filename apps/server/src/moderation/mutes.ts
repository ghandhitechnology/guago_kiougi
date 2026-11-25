/**
 * Who may not put text in front of other players right now (PLAN §12 moderation), without a
 * database round trip on the chat path.
 *
 * - Admin mutes, mirrored from the `mutes` table: set at once after a mute or unmute commits,
 *   then re-read from the table; reloaded whole every minute and at start, so a restart or a
 *   failed re-read heals itself. Every re-read and reload runs one at a time, in order, so an
 *   older read can never land after a newer one.
 * - The filter's own five-minute mutes (two hits within ten minutes), which the WorldRoom
 *   reports here.
 *
 * `mutedUntil` is the one check every path that carries a player's text to other players calls:
 * chat on every channel (WorldRoom) and the social requests in `MUTED_REQUESTS` (SocialHub).
 * Times are the wall clock, never the Page clock.
 */
import type { SocialType } from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Queryable } from "../economy/executor.ts";

/**
 * Social requests whose text other players see: 대자보 posts and the 층장 notice, club notices,
 * and a new club's name. Club settings carry only presets (join rule, jacket, emblem parts);
 * report notes go to admins only; emotes, 도움 notices and trades carry no free text.
 */
export const MUTED_REQUESTS: ReadonlySet<SocialType> = new Set<SocialType>([
  "board.post",
  "board.pin",
  "club.notice",
  "club.create",
]);

const SQL_END = sql`floor(extract(epoch from max(coalesce(ends_at, 'infinity'::timestamptz)))::float8 * 1000)`;

class Mutes {
  /** Character id to the end of its last admin mute in ms; `Infinity` until lifted. */
  private admin = new Map<string, number>();
  /** Character id to the end of its filter mute in ms. */
  private filter = new Map<string, number>();
  private reading: Promise<void> = Promise.resolve();

  /** When the admin mute ends, or 0 when none holds. */
  adminUntil(characterId: string, now = Date.now()): number {
    return this.live(this.admin, characterId, now);
  }

  /** The end of whichever mute ends later, admin or filter; 0 when neither holds. */
  mutedUntil(characterId: string, now = Date.now()): number {
    return Math.max(
      this.live(this.admin, characterId, now),
      this.live(this.filter, characterId, now),
    );
  }

  /** The WorldRoom's filter muted this character until `until`. */
  filtered(characterId: string, until: number): void {
    if (until > (this.filter.get(characterId) ?? 0)) this.filter.set(characterId, until);
  }

  /** After a mute commits: holds at once, before the re-read lands. */
  muted(characterId: string, until: number): void {
    if (until > (this.admin.get(characterId) ?? 0)) this.admin.set(characterId, until);
  }

  /** After an unmute commits (every admin mute on the character is lifted). */
  unmuted(characterId: string): void {
    this.admin.delete(characterId);
  }

  /** Re-reads one character's admin mutes, after every earlier read. */
  refresh(q: Queryable, characterId: string): Promise<void> {
    return this.queue(async () => {
      const { rows } = await q.execute(sql`
        select ${SQL_END} as end_ms from mutes
        where character_id = ${characterId} and lifted_at is null
          and (ends_at is null or ends_at > now())`);
      this.put(characterId, rows[0]?.end_ms);
    });
  }

  /** Reloads every admin mute in force, after every earlier read. At start and every minute. */
  load(q: Queryable): Promise<void> {
    return this.queue(async () => {
      const { rows } = await q.execute(sql`
        select character_id, ${SQL_END} as end_ms from mutes
        where lifted_at is null and (ends_at is null or ends_at > now())
        group by character_id`);
      this.admin.clear();
      for (const r of rows) this.put(r.character_id as string, r.end_ms);
    });
  }

  private queue(work: () => Promise<void>): Promise<void> {
    const next = this.reading.then(work, work);
    this.reading = next.catch(() => {});
    return next;
  }

  private live(map: Map<string, number>, characterId: string, now: number): number {
    const end = map.get(characterId);
    if (end === undefined) return 0;
    if (end <= now) {
      map.delete(characterId);
      return 0;
    }
    return end;
  }

  /** `endMs` is a float8 from SQL: `Infinity` for a mute until lifted, null for none. */
  private put(characterId: string, endMs: unknown): void {
    if (endMs === null || endMs === undefined) this.admin.delete(characterId);
    else this.admin.set(characterId, Number(endMs));
  }
}

export const mutes = new Mutes();

/** The one mute check: `mutes.mutedUntil`. */
export const mutedUntil = (characterId: string, now = Date.now()) =>
  mutes.mutedUntil(characterId, now);
