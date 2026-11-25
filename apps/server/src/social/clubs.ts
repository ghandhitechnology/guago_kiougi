/**
 * 동아리 in the database (PLAN §12, §20). Every change to a club locks its row first, so changes
 * to one club take turns: a kick and a leave, a hand-over and a promotion, a disband and a join
 * each run one after the other, and the second sees what the first did. What no lock order can
 * promise, the schema does: one club per character (the key of `club_members`), the 짱 always a
 * member (a deferred foreign key), every capped list behind a counter CHECK, and a join into a
 * disbanded club fails its foreign key.
 */
import { checkEmblem } from "@guago/content";
import {
  type Applicant,
  CLUB_FOUND_LEVEL,
  CLUB_INVITE_DAYS,
  CLUB_INVITES_IN_CAP,
  CLUB_INVITES_OUT_CAP,
  CLUB_NOTICES_CAP,
  CLUB_PAGE,
  type ClubAction,
  type ClubApplication,
  type ClubInvite,
  type ClubMember,
  type ClubRank,
  type ClubSummary,
  type ClubView,
  checkClubName,
  clubLevel,
  clubMay,
  type Emblem,
  type JoinRule,
  type Major,
  normalizeClubName,
  type RefusalCode,
} from "@guago/shared";
import { type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import type { FeePath } from "./fees.ts";
import { Refuse, refusalOf, type Tx, transact } from "./tx.ts";

type Q = Pick<Db, "execute">;

interface ClubRow {
  id: number;
  name: string;
  leaderId: string;
  joinRule: JoinRule;
  level: number;
  exp: number;
  jacket: string;
  emblem: Emblem;
  memberCount: number;
  inviteCount: number;
}

const clubRow = (r: Record<string, unknown>): ClubRow => ({
  id: Number(r.id),
  name: r.name as string,
  leaderId: r.leader_id as string,
  joinRule: r.join_rule as JoinRule,
  level: Number(r.level),
  exp: Number(r.exp),
  jacket: r.jacket_color as string,
  emblem: r.emblem as Emblem,
  memberCount: Number(r.member_count),
  inviteCount: Number(r.invite_count),
});

const time = (v: unknown) => new Date(v as string).getTime();

/** Locks a live club, or answers `no_club`. */
async function lockClub(tx: Tx, clubId: number): Promise<ClubRow> {
  const { rows } = await tx.execute(sql`
    select * from clubs where id = ${clubId} and disbanded_at is null for update`);
  if (!rows[0]) throw new Refuse("no_club");
  return clubRow(rows[0]);
}

const rankOf = (club: ClubRow, characterId: string, stored: string): ClubRank =>
  club.leaderId === characterId ? "leader" : (stored as ClubRank);

/** Locks the club `me` belongs to and reads `me`'s rank under that lock. */
async function lockMine(tx: Tx, me: string): Promise<{ club: ClubRow; rank: ClubRank }> {
  const found = await tx.execute(sql`select club_id from club_members where character_id = ${me}`);
  if (!found.rows[0]) throw new Refuse("no_club");
  const club = await lockClub(tx, Number(found.rows[0].club_id));
  // A kick or a leave may have run while this waited for the lock.
  const still = await tx.execute(sql`
    select rank from club_members where character_id = ${me} and club_id = ${club.id}`);
  if (!still.rows[0]) throw new Refuse("no_club");
  return { club, rank: rankOf(club, me, still.rows[0].rank as string) };
}

async function rankIn(tx: Tx, club: ClubRow, characterId: string): Promise<ClubRank> {
  const { rows } = await tx.execute(sql`
    select rank from club_members where character_id = ${characterId} and club_id = ${club.id}`);
  if (!rows[0]) throw new Refuse("not_member");
  return rankOf(club, characterId, rows[0].rank as string);
}

function must(rank: ClubRank, action: ClubAction, target?: ClubRank): void {
  if (!clubMay(rank, action, target)) throw new Refuse("rank");
}

async function addMember(tx: Tx, clubId: number, characterId: string): Promise<void> {
  await tx.execute(sql`
    insert into club_members (club_id, character_id) values (${clubId}, ${characterId})`);
}

/** Who a change reached, so the hub knows whom to tell. */
export interface ClubChange {
  club: number;
  /** Characters whose own membership changed (joined, left, kicked). */
  moved?: string[];
  /** The club was disbanded. */
  gone?: boolean;
}

export interface FoundRequest {
  op: string;
  name: string;
  joinRule: JoinRule;
  jacket: string;
  emblem: Emblem;
}

export interface ClubOptions {
  /** Names the banned list or the chat filter would refuse. */
  nameBanned: (name: string) => boolean;
  /** `jacket` swap slot options of the art. */
  jackets: () => readonly string[];
  /** Cleans and filters a notice, or says why it cannot go up. */
  notice: (raw: string) => { ok: true; text: string } | { ok: false; code: RefusalCode };
  now?: () => number;
}

export function createClubStore(db: Db, fees: FeePath, options: ClubOptions) {
  const now = options.now ?? Date.now;

  function checkLook(jacket: string | undefined, emblem: Emblem | undefined, level: number) {
    if (jacket !== undefined && !options.jackets().includes(jacket)) {
      throw new Refuse("jacket_invalid");
    }
    const bad = emblem === undefined ? null : checkEmblem(emblem, level);
    if (bad) throw new Refuse(bad);
  }

  /**
   * Applications and invites elsewhere are moot once `who` is in a club. Each club's rows go in
   * a transaction of their own under that club's lock, so no transaction holds two clubs.
   */
  async function dropApplications(who: string, except?: number): Promise<void> {
    const { rows } = await db.execute(sql`
      select club_id from club_applications where character_id = ${who}
      union select club_id from club_invites where character_id = ${who}`);
    for (const club of rows.map((r) => Number(r.club_id)).filter((id) => id !== except)) {
      await transact(db, async (tx) => {
        await tx.execute(sql`select 1 from clubs where id = ${club} for update`);
        await tx.execute(sql`
          delete from club_applications where club_id = ${club} and character_id = ${who}`);
        await tx.execute(sql`
          delete from club_invites where club_id = ${club} and character_id = ${who}`);
      });
    }
  }

  async function run<T>(work: (tx: Tx) => Promise<T>): Promise<T | Refuse> {
    return transact(db, work);
  }

  return {
    /**
     * Founds a club and pays the fee in one transaction, under the request's operation id: a
     * retry finds the club the first attempt made and pays nothing.
     */
    async found(me: string, level: number, req: FoundRequest): Promise<ClubChange | Refuse> {
      if (level < CLUB_FOUND_LEVEL) return new Refuse("level", CLUB_FOUND_LEVEL);
      const name = normalizeClubName(req.name);
      const invalid = checkClubName(name);
      if (invalid) return new Refuse(invalid);
      if (options.nameBanned(name)) return new Refuse("name_banned");
      try {
        checkLook(req.jacket, req.emblem, 1);
        const replay = async (tx: Tx) => {
          const before = await tx.execute(sql`
            select id from clubs where founded_by = ${me} and founded_op = ${req.op}`);
          return before.rows[0] ? Number(before.rows[0].id) : undefined;
        };
        const paid = await fees.withFee(
          me,
          req.op,
          async (tx) => {
            // A copy of this request that waited on the fee's lock finds the first one's club.
            const raced = await replay(tx);
            if (raced !== undefined) return raced;
            const inClub = await tx.execute(sql`
              select 1 from club_members where character_id = ${me}`);
            if (inClub.rows[0]) throw new Refuse("in_club");
            const made = await tx.execute(sql`
              insert into clubs (name, leader_id, join_rule, jacket_color, emblem, founded_by, founded_op)
              values (${name}, ${me}, ${req.joinRule}, ${req.jacket}, ${JSON.stringify(req.emblem)}::jsonb,
                      ${me}, ${req.op})
              returning id`);
            const id = Number(made.rows[0]?.id);
            await addMember(tx, id, me);
            return id;
          },
          replay,
        );
        if (!paid.ok) return new Refuse(paid.error);
        await dropApplications(me);
        return { club: paid.value, moved: [me] };
      } catch (error) {
        if (error instanceof Refuse) return error;
        const known = refusalOf(error);
        if (known) return new Refuse(known);
        throw error;
      }
    },

    /** Joins an open club, or applies to one that reviews applications. */
    async join(me: string, clubId: number): Promise<(ClubChange & { joined: boolean }) | Refuse> {
      const done = await run(async (tx) => {
        const club = await lockClub(tx, clubId);
        const inClub = await tx.execute(sql`select 1 from club_members where character_id = ${me}`);
        if (inClub.rows[0]) throw new Refuse("in_club");
        if (club.joinRule === "invite") throw new Refuse("invite_only");
        if (club.joinRule === "open") {
          await addMember(tx, club.id, me);
          await tx.execute(sql`
            delete from club_invites where club_id = ${club.id} and character_id = ${me}`);
          await tx.execute(sql`
            delete from club_applications where club_id = ${club.id} and character_id = ${me}`);
          return { club: club.id, moved: [me], joined: true };
        }
        await tx.execute(sql`
          insert into club_applications (club_id, character_id) values (${club.id}, ${me})
          on conflict do nothing`);
        return { club: club.id, joined: false };
      });
      if (!(done instanceof Refuse) && done.joined) await dropApplications(me, clubId);
      return done;
    },

    async withdraw(me: string, clubId: number): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        await tx.execute(sql`select 1 from clubs where id = ${clubId} for update`);
        const gone = await tx.execute(sql`
          delete from club_applications where club_id = ${clubId} and character_id = ${me}
          returning 1`);
        if (!gone.rows[0]) throw new Refuse("no_request");
        return { club: clubId };
      });
    },

    /**
     * Invites `target`. When `silent` (the target blocked the inviter) nothing is stored and
     * the answer is the same.
     */
    async invite(me: string, target: string, silent: boolean): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "invite");
        if (target === me) throw new Refuse("target_self");
        const member = await tx.execute(sql`
          select club_id from club_members where character_id = ${target}`);
        if (member.rows[0]) {
          throw new Refuse(
            Number(member.rows[0].club_id) === club.id ? "in_club" : "target_in_club",
          );
        }
        if (silent) {
          // Nothing is stored, but the caps a stored invite would meet answer the same way,
          // so a full club or a full inbox never tells the inviter they are blocked.
          const held = await tx.execute(sql`
            select club_invites as n from social_counts where character_id = ${target}`);
          if (
            club.inviteCount >= CLUB_INVITES_OUT_CAP ||
            Number(held.rows[0]?.n ?? 0) >= CLUB_INVITES_IN_CAP
          ) {
            throw new Refuse("invites_full");
          }
          return { club: club.id };
        }
        const expires = new Date(now() + CLUB_INVITE_DAYS * 24 * 3600 * 1000);
        await tx.execute(sql`
          insert into club_invites (club_id, character_id, invited_by, expires_at)
          values (${club.id}, ${target}, ${me}, ${expires})
          on conflict (club_id, character_id)
          do update set invited_by = excluded.invited_by, expires_at = excluded.expires_at`);
        return { club: club.id };
      });
    },

    /** Takes an invite. Two accepts of one invite: the second finds it gone. */
    async accept(me: string, clubId: number): Promise<ClubChange | Refuse> {
      const done = await run(async (tx) => {
        const club = await lockClub(tx, clubId);
        const used = await tx.execute(sql`
          delete from club_invites
          where club_id = ${club.id} and character_id = ${me} and expires_at > ${new Date(now())}
          returning 1`);
        if (!used.rows[0]) throw new Refuse("no_invite");
        await addMember(tx, club.id, me);
        await tx.execute(sql`
          delete from club_applications where club_id = ${club.id} and character_id = ${me}`);
        return { club: club.id, moved: [me] };
      });
      if (!(done instanceof Refuse)) await dropApplications(me, clubId);
      return done;
    },

    async decline(me: string, clubId: number): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        await tx.execute(sql`select 1 from clubs where id = ${clubId} for update`);
        const gone = await tx.execute(sql`
          delete from club_invites where club_id = ${clubId} and character_id = ${me} returning 1`);
        if (!gone.rows[0]) throw new Refuse("no_invite");
        return { club: clubId };
      });
    },

    /** 짱 or 부짱 takes or turns down an application. */
    async review(me: string, applicant: string, take: boolean): Promise<ClubChange | Refuse> {
      const done = await run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "review");
        const gone = await tx.execute(sql`
          delete from club_applications where club_id = ${club.id} and character_id = ${applicant}
          returning 1`);
        if (!gone.rows[0]) throw new Refuse("no_request");
        if (!take) return { club: club.id };
        const elsewhere = await tx.execute(sql`
          select 1 from club_members where character_id = ${applicant}`);
        // The application is spent either way: someone already in a club cannot be taken.
        if (elsewhere.rows[0]) return { club: club.id, taken: false };
        await addMember(tx, club.id, applicant);
        await tx.execute(sql`
          delete from club_invites where club_id = ${club.id} and character_id = ${applicant}`);
        return { club: club.id, moved: [applicant] };
      });
      if (done instanceof Refuse) return done;
      if ("taken" in done) return new Refuse("target_in_club");
      if (take) await dropApplications(applicant, done.club);
      return done;
    },

    /** Leaves. The 짱 hands over first, unless alone, when leaving disbands the club. */
    async leave(me: string): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        if (rank === "leader") {
          if (club.memberCount > 1) throw new Refuse("leader_stays");
          return disbandLocked(tx, club);
        }
        await tx.execute(sql`
          delete from club_members where character_id = ${me} and club_id = ${club.id}`);
        return { club: club.id, moved: [me] };
      });
    },

    async kick(me: string, target: string): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "kick", await rankIn(tx, club, target));
        await tx.execute(sql`
          delete from club_members where character_id = ${target} and club_id = ${club.id}`);
        return { club: club.id, moved: [target] };
      });
    },

    /** Promotes to 부짱 or steps down to 부원; only the 짱. */
    async setRank(
      me: string,
      target: string,
      next: "vice" | "member",
    ): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "rank", await rankIn(tx, club, target));
        await tx.execute(sql`
          update club_members set rank = ${next} where character_id = ${target}`);
        return { club: club.id };
      });
    },

    /** The 짱 passes the club on and becomes 부짱. */
    async handover(me: string, target: string): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "handover", await rankIn(tx, club, target));
        await tx.execute(sql`update clubs set leader_id = ${target} where id = ${club.id}`);
        await tx.execute(sql`update club_members set rank = 'vice' where character_id = ${me}`);
        return { club: club.id };
      });
    },

    /** Only the 짱, naming the club exactly. Every member leaves; the row stays, disbanded. */
    async disband(me: string, name: string): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "disband");
        if (normalizeClubName(name) !== club.name) throw new Refuse("name_mismatch");
        return disbandLocked(tx, club);
      });
    },

    async settings(
      me: string,
      change: { joinRule?: JoinRule; jacket?: string; emblem?: Emblem },
    ): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "settings");
        checkLook(change.jacket, change.emblem, club.level);
        await tx.execute(sql`
          update clubs set
            join_rule = ${change.joinRule ?? club.joinRule},
            jacket_color = ${change.jacket ?? club.jacket},
            emblem = ${JSON.stringify(change.emblem ?? club.emblem)}::jsonb
          where id = ${club.id}`);
        return { club: club.id };
      });
    },

    /** Posts a notice; past the cap the oldest one comes down. */
    async notice(me: string, raw: string): Promise<ClubChange | Refuse> {
      const cleaned = options.notice(raw);
      if (!cleaned.ok) return new Refuse(cleaned.code);
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "notice");
        await tx.execute(sql`
          delete from club_notices where id in (
            select id from club_notices where club_id = ${club.id}
            order by created_at desc, id desc offset ${CLUB_NOTICES_CAP - 1})`);
        await tx.execute(sql`
          insert into club_notices (club_id, author_id, body, created_at)
          values (${club.id}, ${me}, ${cleaned.text}, ${new Date(now())})`);
        return { club: club.id };
      });
    },

    async unnotice(me: string, id: number): Promise<ClubChange | Refuse> {
      return run(async (tx) => {
        const { club, rank } = await lockMine(tx, me);
        must(rank, "notice");
        const gone = await tx.execute(sql`
          delete from club_notices where id = ${id} and club_id = ${club.id} returning 1`);
        if (!gone.rows[0]) throw new Refuse("no_post");
        return { club: club.id };
      });
    },

    /** Credits club EXP from member activity; returns the new level and EXP. */
    async addExp(clubId: number, exp: number): Promise<{ level: number; exp: number } | null> {
      if (!(exp > 0) || !Number.isFinite(exp)) return null;
      return db.transaction(async (tx) => {
        const { rows } = await tx.execute(sql`
          update clubs set exp = exp + ${exp} where id = ${clubId} and disbanded_at is null
          returning exp, level`);
        if (!rows[0]) return null;
        const total = Number(rows[0].exp);
        const level = clubLevel(total);
        if (level !== Number(rows[0].level)) {
          await tx.execute(sql`update clubs set level = ${level} where id = ${clubId}`);
        }
        return { level, exp: total };
      });
    },

    // Reads ---------------------------------------------------------------------------------

    async membership(q: Q, me: string): Promise<{ club: number; rank: ClubRank } | undefined> {
      const { rows } = await q.execute(sql`
        select m.club_id, m.rank, c.leader_id from club_members m
        join clubs c on c.id = m.club_id where m.character_id = ${me}`);
      const r = rows[0];
      if (!r) return undefined;
      return {
        club: Number(r.club_id),
        rank: r.leader_id === me ? "leader" : (r.rank as ClubRank),
      };
    },

    async view(clubId: number): Promise<ClubView | null> {
      const [club, members, notices] = await Promise.all([
        db.execute(sql`select * from clubs where id = ${clubId} and disbanded_at is null`),
        db.execute(sql`
          select c.id, c.name, c.major, c.level, m.rank, m.joined_at from club_members m
          join characters c on c.id = m.character_id
          where m.club_id = ${clubId} order by m.joined_at, c.id`),
        db.execute(sql`
          select n.id, n.body, n.created_at, c.id as author_id, c.name as author_name
          from club_notices n join characters c on c.id = n.author_id
          where n.club_id = ${clubId} order by n.created_at desc, n.id desc`),
      ]);
      if (!club.rows[0]) return null;
      const row = clubRow(club.rows[0]);
      return {
        id: row.id,
        name: row.name,
        joinRule: row.joinRule,
        level: row.level,
        exp: row.exp,
        jacket: row.jacket,
        emblem: row.emblem,
        leader: row.leaderId,
        members: members.rows.map(
          (m): ClubMember => ({
            id: m.id as string,
            name: m.name as string,
            major: m.major as Major,
            level: Number(m.level),
            rank: rankOf(row, m.id as string, m.rank as string),
            joinedAt: time(m.joined_at),
          }),
        ),
        notices: notices.rows.map((n) => ({
          id: Number(n.id),
          author: { id: n.author_id as string, name: n.author_name as string },
          text: n.body as string,
          at: time(n.created_at),
        })),
      };
    },

    async members(clubId: number): Promise<string[]> {
      const { rows } = await db.execute(sql`
        select character_id from club_members where club_id = ${clubId}`);
      return rows.map((r) => r.character_id as string);
    },

    /** The public face of clubs: by name prefix, in name order, `CLUB_PAGE` at a time. */
    async search(q: string | undefined, after: string | undefined) {
      const prefix = (q ?? "")
        .normalize("NFC")
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, "\\$&");
      const { rows } = await db.execute(sql`
        select c.*, l.name as leader_name from clubs c join characters l on l.id = c.leader_id
        where c.disbanded_at is null
          and lower(c.name) like ${`${prefix}%`}
          and lower(c.name) > ${(after ?? "").toLowerCase()}
        order by lower(c.name) limit ${CLUB_PAGE + 1}`);
      return {
        clubs: rows.slice(0, CLUB_PAGE).map(summary),
        more: rows.length > CLUB_PAGE,
      };
    },

    async summary(clubId: number): Promise<ClubSummary | null> {
      const { rows } = await db.execute(sql`
        select c.*, l.name as leader_name from clubs c join characters l on l.id = c.leader_id
        where c.id = ${clubId} and c.disbanded_at is null`);
      return rows[0] ? summary(rows[0]) : null;
    },

    /** Live invites, leaving out those from inviters `me` blocked. */
    async invitesOf(me: string): Promise<ClubInvite[]> {
      const { rows } = await db.execute(sql`
        select c.id, c.name, i.expires_at, f.id as from_id, f.name as from_name
        from club_invites i
        join clubs c on c.id = i.club_id and c.disbanded_at is null
        join characters f on f.id = i.invited_by
        where i.character_id = ${me} and i.expires_at > ${new Date(now())}
          and not exists (
            select 1 from blocks b where b.character_id = ${me} and b.other_id = i.invited_by)
        order by i.created_at`);
      return rows.map((r) => ({
        club: { id: Number(r.id), name: r.name as string },
        from: { id: r.from_id as string, name: r.from_name as string },
        expiresAt: time(r.expires_at),
      }));
    },

    async applicationsOf(me: string): Promise<ClubApplication[]> {
      const { rows } = await db.execute(sql`
        select c.id, c.name, a.created_at from club_applications a
        join clubs c on c.id = a.club_id and c.disbanded_at is null
        where a.character_id = ${me} order by a.created_at`);
      return rows.map((r) => ({
        club: { id: Number(r.id), name: r.name as string },
        at: time(r.created_at),
      }));
    },

    async applicantsOf(clubId: number): Promise<Applicant[]> {
      const { rows } = await db.execute(sql`
        select c.id, c.name, c.major, c.level, a.created_at from club_applications a
        join characters c on c.id = a.character_id
        where a.club_id = ${clubId} order by a.created_at`);
      return rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        major: r.major as Major,
        level: Number(r.level),
        at: time(r.created_at),
      }));
    },

    /** Drops lapsed invites, one club lock at a time. */
    async sweep(): Promise<void> {
      const { rows } = await db.execute(sql`
        select distinct club_id from club_invites where expires_at <= ${new Date(now())}`);
      for (const r of rows) {
        await transact(db, async (tx) => {
          await tx.execute(sql`select 1 from clubs where id = ${Number(r.club_id)} for update`);
          await tx.execute(sql`
            delete from club_invites
            where club_id = ${Number(r.club_id)} and expires_at <= ${new Date(now())}`);
        });
      }
    },
  };
}

function summary(r: Record<string, unknown>): ClubSummary {
  const row = clubRow(r);
  return {
    id: row.id,
    name: row.name,
    joinRule: row.joinRule,
    level: row.level,
    members: row.memberCount,
    jacket: row.jacket,
    emblem: row.emblem,
    leader: { id: row.leaderId, name: r.leader_name as string },
  };
}

/** On a locked club: every member out, no leader, the row kept as disbanded. */
async function disbandLocked(tx: Tx, club: ClubRow): Promise<ClubChange> {
  const { rows } = await tx.execute(sql`
    select character_id from club_members where club_id = ${club.id}`);
  const steps: SQL[] = [
    sql`update clubs set leader_id = null, disbanded_at = now() where id = ${club.id}`,
    sql`delete from club_members where club_id = ${club.id}`,
    sql`delete from club_applications where club_id = ${club.id}`,
    sql`delete from club_invites where club_id = ${club.id}`,
    sql`delete from club_notices where club_id = ${club.id}`,
  ];
  for (const step of steps) await tx.execute(step);
  return { club: club.id, moved: rows.map((r) => r.character_id as string), gone: true };
}

export type ClubStore = ReturnType<typeof createClubStore>;
