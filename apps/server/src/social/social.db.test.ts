/**
 * Friends and clubs against a real Postgres (PLAN §26): the races two clients can start at
 * once, the caps the database holds, permissions by rank, and the founding fee charged once.
 */
import { CLUB_FEE, CLUB_FOUND_LEVEL, CLUB_SIZE, FRIEND_CAP } from "@guago/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db, pgErrorCode } from "../db/index.ts";
import { checkInvariants } from "../economy/audit.ts";
import { createEconomy } from "../economy/index.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { executorFees, MemoryWallet } from "./fees.ts";
import { createSocial, type Social } from "./index.ts";
import { Refuse } from "./tx.ts";

let db: Db;
let wallet: MemoryWallet;
let social: Social;
let next = 0;

const EMBLEM = { shape: "shield", shapeColor: "navy", symbol: "atom", symbolColor: "gold" };

/** A character straight in the database; names are unique per run. */
async function character(level = 1): Promise<string> {
  const n = ++next;
  const { rows } = await db.execute(sql`
    with a as (
      insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
      values (${`social${n}`}, 'x', true, 'ip') returning id)
    insert into characters (account_id, name, major, look, map_id, x, y, cohort, level)
    select id, ${`soc${n}`}, 'math', '{}'::jsonb, 'lawn', 0, 0, 1, ${level} from a
    returning id`);
  return rows[0]?.id as string;
}

const codeOf = (r: unknown) => (r instanceof Refuse ? r.code : "ok");

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const { rows } = await db.execute(query);
  return Number(rows[0]?.n);
}

async function club(leader: string, joinRule: "open" | "apply" | "invite" = "open") {
  wallet.credit(leader, CLUB_FEE);
  const made = await social.clubs.found(leader, CLUB_FOUND_LEVEL, {
    op: `op-${leader}`,
    name: `동아리${++next}`,
    joinRule,
    jacket: "navy",
    emblem: EMBLEM,
  });
  if (made instanceof Refuse) throw made;
  return made.club;
}

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  await db.pool.query("truncate accounts, clubs, reports cascade");
  wallet = new MemoryWallet(db);
  social = createSocial(db, { fees: wallet, jackets: () => ["navy", "crimson"] });
});

afterAll(async () => {
  await db.pool.end();
});

describe("friends", () => {
  it("are mutual, and two accepts of one request make one friendship", async () => {
    const [a, b] = [await character(), await character()];
    expect(await social.friends.request(a, b)).toBe("requested");
    const both = await Promise.all([social.friends.accept(b, a), social.friends.accept(b, a)]);
    expect(both.map(codeOf).sort()).toEqual(["no_request", "ok"]);
    expect(
      await count(sql`select count(*) as n from friends where ${a} in (character_id, other_id)`),
    ).toBe(2);
    expect(await social.friends.request(a, b)).toSatisfy((r) => codeOf(r) === "already_friends");
  });

  it("asking each other at once ends in one friendship, not a deadlock", async () => {
    const [a, b] = [await character(), await character()];
    const results = await Promise.all([social.friends.request(a, b), social.friends.request(b, a)]);
    expect(results.sort()).toEqual(["friends", "requested"]);
    expect(await count(sql`select count(*) as n from friends where character_id = ${a}`)).toBe(1);
    expect(
      await count(sql`select count(*) as n from friend_requests where ${a} in (from_id, to_id)`),
    ).toBe(0);
  });

  it("stop at the cap, held by the database", async () => {
    const me = await character();
    const others = await Promise.all(Array.from({ length: FRIEND_CAP + 1 }, () => character()));
    for (const other of others.slice(0, FRIEND_CAP)) {
      await social.friends.request(other, me);
      expect(codeOf(await social.friends.accept(me, other))).toBe("ok");
    }
    const last = others[FRIEND_CAP] as string;
    await social.friends.request(last, me);
    expect(codeOf(await social.friends.accept(me, last))).toBe("friends_full");
    expect(codeOf(await social.friends.request(me, last))).toBe("friends_full");
    // Past the code, a raw insert still cannot make friend 101.
    const raw = await db
      .execute(sql`insert into friends (character_id, other_id) values (${me}, ${last})`)
      .catch((e: unknown) => e);
    expect(pgErrorCode(raw).constraint).toBe("social_counts_friends_check");
  });
});

describe("blocks", () => {
  it("end a friendship and hide new requests without telling the sender", async () => {
    const [a, b] = [await character(), await character()];
    await social.friends.request(a, b);
    await social.friends.accept(b, a);
    expect(await social.friends.block(b, a)).toEqual({ wereFriends: true });
    expect(await social.friends.friendsOf(a)).toEqual([]);
    // A asks again: it looks sent from A's side and never reaches B.
    expect(await social.friends.request(a, b)).toBe("requested");
    expect((await social.friends.requestsOf(a)).out.map((r) => r.id)).toEqual([b]);
    expect((await social.friends.requestsOf(b)).in).toEqual([]);
    expect(codeOf(await social.friends.accept(b, a))).toBe("no_request");
    // B cannot reach out to someone B blocked.
    expect(codeOf(await social.friends.request(b, a))).toBe("blocked");
  });
});

describe("clubs", () => {
  it("charge the founding fee once, however the request is retried", async () => {
    const me = await character(CLUB_FOUND_LEVEL);
    wallet.credit(me, CLUB_FEE * 3);
    const req = {
      op: "found-once-1",
      name: "재시도부",
      joinRule: "open",
      jacket: "navy",
      emblem: EMBLEM,
    } as const;
    const first = await Promise.all([
      social.clubs.found(me, CLUB_FOUND_LEVEL, req),
      social.clubs.found(me, CLUB_FOUND_LEVEL, req),
    ]);
    const again = await social.clubs.found(me, CLUB_FOUND_LEVEL, req);
    const ids = [...first, again].map((r) => (r instanceof Refuse ? r.code : r.club));
    expect(new Set(ids).size).toBe(1);
    expect(wallet.balance(me)).toBe(CLUB_FEE * 2);
    expect(wallet.ledger.filter((e) => e.characterId === me)).toHaveLength(1);
    expect(await count(sql`select count(*) as n from clubs where founded_by = ${me}`)).toBe(1);
  });

  it("refuse a founder who cannot pay, and take nothing", async () => {
    const me = await character(CLUB_FOUND_LEVEL);
    wallet.credit(me, CLUB_FEE - 1);
    const r = await social.clubs.found(me, CLUB_FOUND_LEVEL, {
      op: "found-broke-1",
      name: "가난부",
      joinRule: "open",
      jacket: "navy",
      emblem: EMBLEM,
    });
    expect(codeOf(r)).toBe("insufficient");
    expect(wallet.balance(me)).toBe(CLUB_FEE - 1);
    expect(
      codeOf(
        await social.clubs.found(me, CLUB_FOUND_LEVEL - 1, {
          ...{
            op: "x".repeat(8),
            name: "레벨부",
            joinRule: "open",
            jacket: "navy",
            emblem: EMBLEM,
          },
        }),
      ),
    ).toBe("level");
  });

  it("let one of two last-seat joins in and hold the cap in the database", async () => {
    const leader = await character(CLUB_FOUND_LEVEL);
    const id = await club(leader);
    for (let i = 0; i < CLUB_SIZE - 2; i++) {
      expect(codeOf(await social.clubs.join(await character(), id))).toBe("ok");
    }
    const [x, y] = [await character(), await character()];
    const both = await Promise.all([social.clubs.join(x, id), social.clubs.join(y, id)]);
    expect(both.map(codeOf).sort()).toEqual(["club_full", "ok"]);
    expect(await count(sql`select member_count as n from clubs where id = ${id}`)).toBe(CLUB_SIZE);
    const raw = await db
      .execute(
        sql`insert into club_members (club_id, character_id) values (${id}, ${await character()})`,
      )
      .catch((e: unknown) => e);
    expect(pgErrorCode(raw).constraint).toBe("clubs_member_count_check");
  });

  it("spend an invite once when it is accepted twice at once", async () => {
    const leader = await character(CLUB_FOUND_LEVEL);
    const id = await club(leader, "invite");
    const guest = await character();
    expect(codeOf(await social.clubs.invite(leader, guest, false))).toBe("ok");
    const both = await Promise.all([
      social.clubs.accept(guest, id),
      social.clubs.accept(guest, id),
    ]);
    expect(both.map(codeOf).sort()).toEqual(["no_invite", "ok"]);
    expect(await count(sql`select member_count as n from clubs where id = ${id}`)).toBe(2);
  });

  it("keep one club per character when two clubs take them at once", async () => {
    const [l1, l2] = [await character(CLUB_FOUND_LEVEL), await character(CLUB_FOUND_LEVEL)];
    const [c1, c2] = [await club(l1), await club(l2)];
    const me = await character();
    const both = await Promise.all([social.clubs.join(me, c1), social.clubs.join(me, c2)]);
    expect(both.map(codeOf).sort()).toEqual(["in_club", "ok"]);
  });

  it("let a kick and a leave of one member settle on one outcome", async () => {
    const leader = await character(CLUB_FOUND_LEVEL);
    const id = await club(leader);
    const member = await character();
    await social.clubs.join(member, id);
    const both = await Promise.all([social.clubs.kick(leader, member), social.clubs.leave(member)]);
    expect(both.map(codeOf).filter((c) => c === "ok")).toHaveLength(1);
    expect(await count(sql`select member_count as n from clubs where id = ${id}`)).toBe(1);
  });

  it("keep exactly one 짱, a member, when a hand-over races a promotion", async () => {
    const leader = await character(CLUB_FOUND_LEVEL);
    const id = await club(leader);
    const [heir, other] = [await character(), await character()];
    await social.clubs.join(heir, id);
    await social.clubs.join(other, id);
    const [handed, promoted] = await Promise.all([
      social.clubs.handover(leader, heir),
      social.clubs.setRank(leader, other, "vice"),
    ]);
    expect(codeOf(handed)).toBe("ok");
    const view = await social.clubs.view(id);
    expect(view?.leader).toBe(heir);
    expect(view?.members.filter((m) => m.rank === "leader").map((m) => m.id)).toEqual([heir]);
    expect(view?.members.find((m) => m.id === leader)?.rank).toBe("vice");
    // The promotion ran first, or found its 짱 already a 부짱.
    expect(["ok", "rank"]).toContain(codeOf(promoted));
    // The 짱 cannot walk out on members.
    expect(codeOf(await social.clubs.leave(heir))).toBe("leader_stays");
  });

  it("leave no member in a club disbanded under a join", async () => {
    const leader = await character(CLUB_FOUND_LEVEL);
    const id = await club(leader);
    const view = await social.clubs.view(id);
    const joiner = await character();
    const [joined, disbanded] = await Promise.all([
      social.clubs.join(joiner, id),
      social.clubs.disband(leader, view?.name ?? ""),
    ]);
    expect(codeOf(disbanded)).toBe("ok");
    expect(["ok", "no_club"]).toContain(codeOf(joined));
    expect(await count(sql`select count(*) as n from club_members where club_id = ${id}`)).toBe(0);
    expect(
      await count(
        sql`select count(*) as n from clubs where id = ${id} and disbanded_at is not null`,
      ),
    ).toBe(1);
    expect(await social.clubs.view(id)).toBeNull();
  });

  it("give each rank its own powers", async () => {
    const leader = await character(CLUB_FOUND_LEVEL);
    const id = await club(leader, "apply");
    const [vice, vice2, member, applicant] = await Promise.all([
      character(),
      character(),
      character(),
      character(),
    ]);
    for (const who of [vice, vice2, member]) {
      await social.clubs.invite(leader, who, false);
      await social.clubs.accept(who, id);
    }
    await social.clubs.setRank(leader, vice, "vice");
    await social.clubs.setRank(leader, vice2, "vice");
    expect(codeOf(await social.clubs.join(applicant, id))).toBe("ok");
    // 부원: nothing.
    expect(codeOf(await social.clubs.review(member, applicant, true))).toBe("rank");
    expect(codeOf(await social.clubs.notice(member, "공지"))).toBe("rank");
    // 부짱: reviews, posts, kicks 부원 but not another 부짱, never disbands or restyles.
    expect(codeOf(await social.clubs.review(vice, applicant, true))).toBe("ok");
    expect(codeOf(await social.clubs.notice(vice, "모임은 금요일"))).toBe("ok");
    expect(codeOf(await social.clubs.kick(vice, vice2))).toBe("rank");
    expect(codeOf(await social.clubs.setRank(vice, member, "vice"))).toBe("rank");
    expect(codeOf(await social.clubs.settings(vice, { joinRule: "open" }))).toBe("rank");
    expect(codeOf(await social.clubs.disband(vice, "x"))).toBe("rank");
    expect(codeOf(await social.clubs.kick(vice, applicant))).toBe("ok");
    // 짱: a disband must name the club.
    expect(codeOf(await social.clubs.disband(leader, "아무거나"))).toBe("name_mismatch");
    expect(
      codeOf(await social.clubs.settings(leader, { emblem: { ...EMBLEM, shape: "crown" } })),
    ).toBe("emblem_locked");
  });

  it("cap applications per player in the database", async () => {
    const me = await character();
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await club(await character(CLUB_FOUND_LEVEL), "apply"));
    const results = [];
    for (const id of ids) results.push(codeOf(await social.clubs.join(me, id)));
    expect(results).toEqual(["ok", "ok", "ok", "applications_full"]);
    // Joining one club drops the rest.
    const accepted = await social.clubs.view(ids[0] as number);
    const leader = accepted?.leader as string;
    expect(codeOf(await social.clubs.review(leader, me, true))).toBe("ok");
    expect(await social.clubs.applicationsOf(me)).toEqual([]);
  });
});

describe("the founding fee through the item executor", () => {
  it("is charged once under a retried request, refused when short, and keeps the books whole", async () => {
    const economy = createEconomy(db);
    const real = createSocial(db, {
      fees: executorFees(db, economy.executor),
      jackets: () => ["navy"],
    });
    const earn = async (id: string, amount: number) => {
      const r = await economy.executor.execute(id, `earn-${id}`, "grant", {
        exp: 0,
        drops: [
          {
            item: { kind: "coin", amount },
            source: { kind: "monster", fieldId: "p1-colonnade", monsterId: "odap", rank: "elite" },
          },
        ],
      });
      expect(r.ok).toBe(true);
    };
    const wallet = async (id: string) =>
      count(
        sql`select coalesce((select pinecones from wallets where character_id = ${id}), 0) as n`,
      );

    const me = await character(CLUB_FOUND_LEVEL);
    await earn(me, CLUB_FEE + 7);
    const req = {
      op: "real-fee-01",
      name: "장부부",
      joinRule: "open",
      jacket: "navy",
      emblem: EMBLEM,
    } as const;
    const raced = await Promise.all([
      real.clubs.found(me, CLUB_FOUND_LEVEL, req),
      real.clubs.found(me, CLUB_FOUND_LEVEL, req),
    ]);
    const again = await real.clubs.found(me, CLUB_FOUND_LEVEL, req);
    const ids = [...raced, again].map((r) => (r instanceof Refuse ? r.code : r.club));
    expect(new Set(ids).size).toBe(1);
    expect(await wallet(me)).toBe(7);
    expect(
      await count(sql`
        select count(*) as n from economy_ledger
        where character_id = ${me} and source_or_sink = 'sink.club' and amount = ${-CLUB_FEE}`),
    ).toBe(1);

    const broke = await character(CLUB_FOUND_LEVEL);
    await earn(broke, CLUB_FEE - 1);
    const refused = await real.clubs.found(broke, CLUB_FOUND_LEVEL, {
      ...req,
      op: "real-fee-02",
      name: "빈지갑부",
    });
    expect(codeOf(refused)).toBe("insufficient");
    expect(await wallet(broke)).toBe(CLUB_FEE - 1);
    expect(await count(sql`select count(*) as n from clubs where founded_by = ${broke}`)).toBe(0);

    const audit = await checkInvariants(db);
    expect(audit.violations).toEqual([]);
  });
});
