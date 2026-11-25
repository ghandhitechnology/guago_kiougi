/**
 * Admin mutes in force, by character, mirrored from the `mutes` table so the WorldRoom's chat
 * path never waits on the database. Loaded at start and rewritten after every mute or unmute
 * commits, so they survive reconnects and restarts. The filter's own five-minute mutes live in
 * the WorldRoom; chat is refused while either holds, until the later of the two ends.
 */
import { sql } from "drizzle-orm";
import type { Queryable } from "../economy/executor.ts";

class AdminMutes {
  /** Character id to the end of its last mute in ms; `Infinity` until lifted. */
  private ends = new Map<string, number>();

  /** When the admin mute on this character ends, or 0 when none holds. */
  until(characterId: string, now = Date.now()): number {
    const end = this.ends.get(characterId);
    if (end === undefined) return 0;
    if (end <= now) {
      this.ends.delete(characterId);
      return 0;
    }
    return end;
  }

  /** Re-reads one character's mutes in force, after a commit that changed them. */
  async refresh(q: Queryable, characterId: string): Promise<void> {
    const { rows } = await q.execute(sql`
      select extract(epoch from max(coalesce(ends_at, 'infinity'::timestamptz)))::float8 * 1000 as end_ms
      from mutes
      where character_id = ${characterId} and lifted_at is null
        and (ends_at is null or ends_at > now())`);
    this.put(characterId, rows[0]?.end_ms);
  }

  /** Loads every mute in force. Called once at server start. */
  async load(q: Queryable): Promise<void> {
    const { rows } = await q.execute(sql`
      select character_id,
        extract(epoch from max(coalesce(ends_at, 'infinity'::timestamptz)))::float8 * 1000 as end_ms
      from mutes
      where lifted_at is null and (ends_at is null or ends_at > now())
      group by character_id`);
    this.ends.clear();
    for (const r of rows) this.put(r.character_id as string, r.end_ms);
  }

  /** `endMs` is a float8 from SQL: `Infinity` for a mute until lifted, null for none. */
  private put(characterId: string, endMs: unknown): void {
    if (endMs === null || endMs === undefined) this.ends.delete(characterId);
    else this.ends.set(characterId, Number(endMs));
  }
}

export const adminMutes = new AdminMutes();
