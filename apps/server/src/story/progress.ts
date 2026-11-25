/**
 * Each character's story, as the database keeps it (PLAN §4, §15): where it is in the opening and
 * which scenes it has played through. Read once a session and written on every change, so a
 * reload, a reconnection or a restart resumes the opening at the last `play` met.
 */
import { OPENING_SCENES } from "@guago/content";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";

export interface StoryProgress {
  /** Opening beat, an index into `OPENING_SCENES`; past the last when the opening is over. */
  beat: number;
  /** `play` steps of that beat met. */
  play: number;
  readonly seen: Set<string>;
}

export const OPENING_DONE = OPENING_SCENES.length;

export class StoryStore {
  private readonly db: Db;
  private readonly cache = new Map<string, StoryProgress>();

  constructor(db: Db) {
    this.db = db;
  }

  async get(characterId: string): Promise<StoryProgress> {
    const known = this.cache.get(characterId);
    if (known) return known;
    const { rows } = await this.db.execute(sql`
      select opening_beat, opening_play, story_seen from characters where id = ${characterId}`);
    const r = rows[0];
    const p: StoryProgress = r
      ? {
          beat: Number(r.opening_beat),
          play: Number(r.opening_play),
          seen: new Set((r.story_seen as string[] | null) ?? []),
        }
      : { beat: OPENING_DONE, play: 0, seen: new Set() };
    this.cache.set(characterId, p);
    return p;
  }

  async setOpening(characterId: string, beat: number, play: number): Promise<void> {
    const p = await this.get(characterId);
    p.beat = beat;
    p.play = play;
    await this.db.execute(sql`
      update characters set opening_beat = ${beat}, opening_play = ${play}
      where id = ${characterId}`);
  }

  async markSeen(characterId: string, id: string): Promise<boolean> {
    const p = await this.get(characterId);
    if (p.seen.has(id)) return false;
    p.seen.add(id);
    await this.db.execute(sql`
      update characters set story_seen = array_append(story_seen, ${id})
      where id = ${characterId} and not (${id} = any(story_seen))`);
    return true;
  }

  /** Drops what is held for a character that left; the next read is fresh. */
  forget(characterId: string): void {
    this.cache.delete(characterId);
  }
}
