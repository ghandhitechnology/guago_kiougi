/**
 * Friends, friend requests and blocks in the database (PLAN §12, §20). Every change that touches
 * two characters locks both counter rows first, in id order, so two changes on one pair take
 * turns and never deadlock; the caps themselves are the counters' CHECK constraints.
 *
 * Blocking hides without telling: a request from someone the receiver blocked is stored like any
 * other (the sender sees it waiting) but never listed for the receiver, and the rows a block
 * removes disappear for the other side exactly as a decline or an unfriend would.
 */
import {
  FRIEND_REQUEST_DAYS,
  type FriendEntry,
  type FriendRequest,
  type Major,
  type Person,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { Refuse, type Tx, transact } from "./tx.ts";

export interface CharacterCard extends Person {
  major: Major;
  level: number;
}

type Q = Pick<Db, "execute">;

const card = (r: Record<string, unknown>): CharacterCard => ({
  id: r.id as string,
  name: r.name as string,
  major: r.major as Major,
  level: Number(r.level),
});

/** By name without case, through `characters_name_key`. */
export async function characterByName(q: Q, name: string): Promise<CharacterCard | undefined> {
  const { rows } = await q.execute(sql`
    select id, name, major, level from characters where lower(name) = lower(${name})`);
  return rows[0] ? card(rows[0]) : undefined;
}

export async function characterById(q: Q, id: string): Promise<CharacterCard | undefined> {
  const { rows } = await q.execute(sql`
    select id, name, major, level from characters where id = ${id}`);
  return rows[0] ? card(rows[0]) : undefined;
}

/** Makes both counter rows if missing and locks them in id order. */
async function lockPair(tx: Tx, a: string, b: string): Promise<void> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  await tx.execute(sql`
    insert into social_counts (character_id) values (${lo}), (${hi}) on conflict do nothing`);
  await tx.execute(sql`
    select 1 from social_counts where character_id in (${lo}, ${hi})
    order by character_id for update`);
}

async function exists(tx: Tx, query: ReturnType<typeof sql>): Promise<boolean> {
  return (await tx.execute(query)).rows.length > 0;
}

const isFriend = (tx: Tx, a: string, b: string) =>
  exists(tx, sql`select 1 from friends where character_id = ${a} and other_id = ${b}`);
const hasBlocked = (tx: Tx, owner: string, other: string) =>
  exists(tx, sql`select 1 from blocks where character_id = ${owner} and other_id = ${other}`);

/** Friendship rows, smaller id first, so both counters are touched in lock order. */
async function befriend(tx: Tx, a: string, b: string): Promise<void> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const full = await tx.execute(sql`
    select character_id, friends from social_counts where character_id in (${a}, ${b})`);
  for (const row of full.rows) {
    if (Number(row.friends) >= 100) {
      throw new Refuse(row.character_id === a ? "friends_full" : "their_friends_full");
    }
  }
  await tx.execute(sql`
    insert into friends (character_id, other_id) values (${lo}, ${hi}), (${hi}, ${lo})`);
}

export function createFriendStore(db: Db, now: () => number = Date.now) {
  const cutoff = () => new Date(now() - FRIEND_REQUEST_DAYS * 24 * 3600 * 1000);

  return {
    /**
     * `me` asks `other`. A request the other way already waiting makes them friends at once.
     * Asking someone who blocked you stores the request as usual; they never see it.
     */
    async request(me: string, other: string): Promise<"requested" | "friends" | Refuse> {
      if (me === other) return new Refuse("target_self");
      return transact(db, async (tx) => {
        await lockPair(tx, me, other);
        if (await isFriend(tx, me, other)) throw new Refuse("already_friends");
        if (await hasBlocked(tx, me, other)) throw new Refuse("blocked");
        const theirs = await tx.execute(sql`
          delete from friend_requests
          where from_id = ${other} and to_id = ${me} and created_at > ${cutoff()}
          returning 1`);
        if (theirs.rows.length > 0) {
          await befriend(tx, me, other);
          return "friends";
        }
        await tx.execute(sql`
          insert into friend_requests (from_id, to_id) values (${me}, ${other})
          on conflict (from_id, to_id) do update set created_at = now()`);
        return "requested";
      });
    },

    /** Accepts a waiting request from `other`. Requests from someone `me` blocked are not there. */
    async accept(me: string, other: string): Promise<true | Refuse> {
      return transact(db, async (tx) => {
        await lockPair(tx, me, other);
        if (await hasBlocked(tx, me, other)) throw new Refuse("no_request");
        const gone = await tx.execute(sql`
          delete from friend_requests
          where from_id = ${other} and to_id = ${me} and created_at > ${cutoff()}
          returning 1`);
        if (gone.rows.length === 0) throw new Refuse("no_request");
        await tx.execute(sql`
          delete from friend_requests where from_id = ${me} and to_id = ${other}`);
        if (await isFriend(tx, me, other)) throw new Refuse("already_friends");
        await befriend(tx, me, other);
        return true as const;
      });
    },

    async decline(me: string, other: string): Promise<true | Refuse> {
      return transact(db, async (tx) => {
        if (await hasBlocked(tx, me, other)) throw new Refuse("no_request");
        const gone = await tx.execute(sql`
          delete from friend_requests where from_id = ${other} and to_id = ${me} returning 1`);
        if (gone.rows.length === 0) throw new Refuse("no_request");
        return true as const;
      });
    },

    async cancel(me: string, other: string): Promise<true | Refuse> {
      const gone = await db.execute(sql`
        delete from friend_requests where from_id = ${me} and to_id = ${other} returning 1`);
      return gone.rows.length > 0 ? true : new Refuse("no_request");
    },

    async remove(me: string, other: string): Promise<true | Refuse> {
      return transact(db, async (tx) => {
        await lockPair(tx, me, other);
        const gone = await tx.execute(sql`
          delete from friends
          where (character_id = ${me} and other_id = ${other})
             or (character_id = ${other} and other_id = ${me})
          returning 1`);
        if (gone.rows.length === 0) throw new Refuse("not_friends");
        return true as const;
      });
    },

    /**
     * Blocks `other`: ends a friendship and drops requests both ways, which the other side sees
     * as an unfriend and a decline. Returns whether they had been friends.
     */
    async block(me: string, other: string): Promise<{ wereFriends: boolean } | Refuse> {
      if (me === other) return new Refuse("target_self");
      return transact(db, async (tx) => {
        await lockPair(tx, me, other);
        await tx.execute(sql`
          insert into blocks (character_id, other_id) values (${me}, ${other})
          on conflict do nothing`);
        const ended = await tx.execute(sql`
          delete from friends
          where (character_id = ${me} and other_id = ${other})
             or (character_id = ${other} and other_id = ${me})
          returning 1`);
        await tx.execute(sql`
          delete from friend_requests
          where (from_id = ${me} and to_id = ${other}) or (from_id = ${other} and to_id = ${me})`);
        return { wereFriends: ended.rows.length > 0 };
      });
    },

    async unblock(me: string, other: string): Promise<true> {
      await db.execute(sql`
        delete from blocks where character_id = ${me} and other_id = ${other}`);
      return true;
    },

    async friendsOf(me: string): Promise<Omit<FriendEntry, "room">[]> {
      const { rows } = await db.execute(sql`
        select c.id, c.name, c.major, c.level from friends f
        join characters c on c.id = f.other_id
        where f.character_id = ${me} order by c.name`);
      return rows.map(card);
    },

    /** Waiting requests; incoming ones from players `me` blocked are left out. */
    async requestsOf(me: string): Promise<{ in: FriendRequest[]; out: FriendRequest[] }> {
      const { rows } = await db.execute(sql`
        select r.from_id = ${me} as mine, c.id, c.name, r.created_at from friend_requests r
        join characters c on c.id = case when r.from_id = ${me} then r.to_id else r.from_id end
        where (r.from_id = ${me} or r.to_id = ${me}) and r.created_at > ${cutoff()}
          and not (r.to_id = ${me} and exists (
            select 1 from blocks b where b.character_id = ${me} and b.other_id = r.from_id))
        order by r.created_at`);
      const out: FriendRequest[] = [];
      const incoming: FriendRequest[] = [];
      for (const r of rows) {
        const entry = {
          id: r.id as string,
          name: r.name as string,
          at: new Date(r.created_at as string).getTime(),
        };
        (r.mine ? out : incoming).push(entry);
      }
      return { in: incoming, out };
    },

    async blocksOf(me: string): Promise<Person[]> {
      const { rows } = await db.execute(sql`
        select c.id, c.name from blocks b join characters c on c.id = b.other_id
        where b.character_id = ${me} order by b.created_at`);
      return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
    },

    /** Drops requests past `FRIEND_REQUEST_DAYS`. */
    async sweep(): Promise<void> {
      await db.execute(sql`delete from friend_requests where created_at <= ${cutoff()}`);
    },
  };
}

export type FriendStore = ReturnType<typeof createFriendStore>;
