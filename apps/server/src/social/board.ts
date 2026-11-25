/**
 * The 대자보 (PLAN §12): four sections, posts live 48 hours, one live post per player and section
 * (the unique key `board_posts_author_key`), and one pinned notice per 층장. Expiry is read from
 * `expires_at` on every listing, so a post is gone the moment it lapses; a sweep deletes the
 * rows later.
 */
import {
  BOARD_PAGE,
  type BoardCategory,
  type BoardPost,
  type BoardSection,
  boardExpiry,
  type RefusalCode,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { Refuse, transact } from "./tx.ts";

/** Pinned notices shown at the top of every section's first page. */
const PINNED_SHOWN = 5;

export interface BoardOptions {
  /** Cleans and filters post text, or says why it cannot go up. */
  text: (raw: string) => { ok: true; text: string } | { ok: false; code: RefusalCode };
  /**
   * Whether the character serves as 층장 this week. The 벌점 and 상점 work decides it; until
   * then nobody may pin.
   */
  mayPin?: (characterId: string) => Promise<boolean>;
  now?: () => number;
}

const post = (r: Record<string, unknown>): BoardPost => ({
  id: Number(r.id),
  section: r.category as BoardSection,
  author: { id: r.author_id as string, name: r.author_name as string },
  text: r.body as string,
  at: new Date(r.created_at as string).getTime(),
  expiresAt: new Date(r.expires_at as string).getTime(),
});

export function createBoard(db: Db, options: BoardOptions) {
  const now = options.now ?? Date.now;
  const mayPin = options.mayPin ?? (async () => false);

  async function write(
    me: string,
    section: BoardSection,
    raw: string,
  ): Promise<BoardPost | Refuse> {
    const cleaned = options.text(raw);
    if (!cleaned.ok) return new Refuse(cleaned.code);
    const at = now();
    return transact(db, async (tx) => {
      // The author's own lapsed post in this section makes way; a live one refuses.
      await tx.execute(sql`
        delete from board_posts
        where author_id = ${me} and category = ${section} and expires_at <= ${new Date(at)}`);
      const { rows } = await tx.execute(sql`
        insert into board_posts (author_id, category, body, pinned, created_at, expires_at)
        values (${me}, ${section}, ${cleaned.text}, ${section === "notice"}, ${new Date(at)},
                ${new Date(boardExpiry(at, section))})
        returning id, author_id, category, body, created_at, expires_at,
          (select name from characters where id = ${me}) as author_name`);
      return post(rows[0] as Record<string, unknown>);
    });
  }

  return {
    /** Newest first, leaving out authors the viewer blocked. */
    async list(viewer: string, cat: BoardCategory, before?: number) {
      const at = new Date(now());
      const hidden = sql`not exists (
        select 1 from blocks b where b.character_id = ${viewer} and b.other_id = p.author_id)`;
      const [posts, pinned] = await Promise.all([
        db.execute(sql`
          select p.*, c.name as author_name from board_posts p
          join characters c on c.id = p.author_id
          where p.category = ${cat} and p.expires_at > ${at} and ${hidden}
            and (${before ?? null}::bigint is null or p.id < ${before ?? null}::bigint)
          order by p.id desc limit ${BOARD_PAGE + 1}`),
        before === undefined
          ? db.execute(sql`
              select p.*, c.name as author_name from board_posts p
              join characters c on c.id = p.author_id
              where p.category = 'notice' and p.expires_at > ${at} and ${hidden}
              order by p.id desc limit ${PINNED_SHOWN}`)
          : Promise.resolve({ rows: [] }),
      ]);
      return {
        posts: posts.rows.slice(0, BOARD_PAGE).map(post),
        pinned: pinned.rows.map(post),
        more: posts.rows.length > BOARD_PAGE,
      };
    },

    post: (me: string, cat: BoardCategory, raw: string) => write(me, cat, raw),

    async pin(me: string, raw: string): Promise<BoardPost | Refuse> {
      if (!(await mayPin(me))) return new Refuse("not_allowed");
      return write(me, "notice", raw);
    },

    /** Authors take their own posts down. */
    async remove(me: string, id: number): Promise<true | Refuse> {
      const { rows } = await db.execute(sql`
        delete from board_posts where id = ${id} and author_id = ${me} returning 1`);
      return rows[0] ? true : new Refuse("no_post");
    },

    async sweep(): Promise<number> {
      const { rowCount } = await db.execute(sql`
        delete from board_posts where expires_at <= ${new Date(now())}`);
      return rowCount ?? 0;
    },
  };
}

export type Board = ReturnType<typeof createBoard>;
