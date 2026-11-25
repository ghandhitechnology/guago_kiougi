/**
 * The hub's in-memory state against reads that land late (PLAN §26: what a regression costs
 * players). Each test holds one database read until a later change has committed, the
 * interleaving two players can cause at any time, and checks memory agrees with the database.
 */
import { CLUB_FEE, CLUB_FOUND_LEVEL, type PresenceEntry, type SocialEvent } from "@guago/shared";
import { type SQL, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clubTags } from "../club-tags.ts";
import { createDb, type Db } from "../db/index.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { MemoryWallet } from "./fees.ts";
import { type Peer, SocialHub, type SocialRoom } from "./hub.ts";
import { createSocial, type Social } from "./index.ts";

interface FakePeer extends Peer {
  inbox: { type: string; body: unknown }[];
}

let db: Db;
let social: Social;
let wallet: MemoryWallet;
let hub: SocialHub<FakePeer>;
const peers = new Map<string, FakePeer>();
let next = 0;
let n = 0;

const room: SocialRoom<FakePeer> = {
  online: (id) => peers.get(id),
  named: (name) => [...peers.values()].find((p) => p.entry.name === name),
  send: (p, type, body) => p.inbox.push({ type, body }),
  answer: (p, type, body) => p.inbox.push({ type, body }),
  limit: () => 0,
};

async function character(level = 1): Promise<PresenceEntry> {
  const k = ++next;
  const name = `허브${k}`;
  const { rows } = await db.execute(sql`
    with a as (
      insert into accounts (login_id, password_hash, age_confirmed, signup_ip_hash)
      values (${`hub${k}`}, 'x', true, 'ip') returning id)
    insert into characters (account_id, name, major, look, map_id, x, y, cohort, level)
    select id, ${name}, 'math', '{}'::jsonb, 'lawn', 0, 0, 1, ${level} from a returning id`);
  return { id: rows[0]?.id as string, name, major: "math", level, map: "" };
}

/** Signs a character in the way the WorldRoom does: load, then the seat, then join. */
async function online(level = 1): Promise<FakePeer> {
  const entry = await character(level);
  const loaded = await hub.load(entry.id);
  const peer: FakePeer = { characterId: entry.id, entry, inbox: [] };
  peers.set(entry.id, peer);
  hub.join(peer, loaded);
  return peer;
}

/** Runs one request to its answer. */
async function ask(peer: FakePeer, type: string, req: Record<string, unknown>) {
  const mine = ++n;
  await hub.handle(peer, type as never, { ...req, n: mine } as never);
  const answer = peer.inbox.find(
    (m) => (m.type === "done" || m.type === "refused") && (m.body as { n: number }).n === mine,
  );
  return (answer?.body as { code?: string } | undefined)?.code ?? "ok";
}

/** Everything the hub still has queued has run. On a hub without lanes there is nothing to wait for. */
const drained = () => (hub as { drained?: () => Promise<void> }).drained?.() ?? Promise.resolve();

const text = (query: SQL) =>
  query.queryChunks.map((c) => (c as { value?: string[] }).value?.join("") ?? "?").join("");

/**
 * Holds the results of reads matching `pattern`: each runs at once, so it sees the database as
 * it is now, but its answer waits until `release`.
 */
function hold(pattern: RegExp) {
  const original = db.execute.bind(db);
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => (open = resolve));
  let calls = 0;
  let first: () => void = () => {};
  const called = new Promise<void>((resolve) => (first = resolve));
  db.execute = ((query: SQL) => {
    const result = original(query);
    if (!pattern.test(text(query))) return result;
    calls++;
    first();
    return result.then(async (r) => {
      await gate;
      return r;
    });
  }) as typeof db.execute;
  return {
    called,
    get calls() {
      return calls;
    },
    release() {
      db.execute = original as typeof db.execute;
      open();
    },
  };
}

async function until(test: () => Promise<boolean> | boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await test())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const exists = async (query: SQL) => (await db.execute(query)).rows.length > 0;
const events = (p: FakePeer) =>
  p.inbox.filter((m) => m.type === "social").map((m) => m.body as SocialEvent);

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  await db.pool.query("truncate accounts, clubs, reports cascade");
  wallet = new MemoryWallet(db);
  social = createSocial(db, { fees: wallet, jackets: () => ["navy"] });
  hub = new SocialHub(social, room);
});

afterAll(async () => {
  hub.dispose();
  await db.pool.end();
});

describe("club membership in memory", () => {
  it("stays out for a kicked member even when an older view of the club lands after the kick", async () => {
    const [leader, vice, kicked] = [await online(CLUB_FOUND_LEVEL), await online(), await online()];
    wallet.credit(leader.characterId, CLUB_FEE);
    const emblem = { shape: "shield", shapeColor: "navy", symbol: "atom", symbolColor: "gold" };
    expect(
      await ask(leader, "club.create", {
        op: "hub-club-01",
        name: "늦은부",
        joinRule: "open",
        jacket: "navy",
        emblem,
      }),
    ).toBe("ok");
    const club = (events(leader).findLast((e) => e.t === "club") as { club: { id: number } }).club;
    expect(await ask(vice, "club.join", { id: club.id })).toBe("ok");
    expect(await ask(kicked, "club.join", { id: club.id })).toBe("ok");
    expect(await ask(leader, "club.rank", { id: vice.characterId, rank: "vice" })).toBe("ok");
    expect(hub.clubChannel(kicked.characterId)).toBeDefined();

    // The 부짱's notice reads the roster, kicked member included; its answer is held.
    const roster = hold(/from club_members m\s+join characters/);
    const notice = ask(vice, "club.notice", { text: "모임은 금요일" });
    await roster.called;
    const kick = ask(leader, "club.kick", { id: kicked.characterId });
    await until(
      async () =>
        !(await exists(sql`select 1 from club_members where character_id = ${kicked.characterId}`)),
    );
    roster.release();
    expect(await notice).toBe("ok");
    expect(await kick).toBe("ok");
    await drained();

    expect(hub.clubChannel(kicked.characterId)).toBeUndefined();
    expect(clubTags.get(kicked.characterId)).toBeUndefined();
    const last = events(kicked).findLast((e) => e.t === "club");
    expect(last).toEqual({ t: "club", club: null });
  });
});

describe("a reconnect", () => {
  it("keeps a block that landed while the snapshot was being sent", async () => {
    const [me, pest] = [await online(), await online()];
    const reads = hold(/from blocks b join characters/);
    const resent = hub.resend(me);
    const block = ask(me, "block.add", { name: pest.entry.name });
    await until(() =>
      exists(sql`
        select 1 from blocks where character_id = ${me.characterId} and other_id = ${pest.characterId}`),
    );
    reads.release();
    await resent;
    expect(await block).toBe("ok");
    await drained();
    expect(hub.hasBlocked(me.characterId, pest.characterId)).toBe(true);
  });
});

describe("friend lists in memory", () => {
  it("never tell a player who was just blocked where the blocker stands", async () => {
    const [blocker, other] = [await online(), await online()];
    expect(await ask(blocker, "friend.request", { name: other.entry.name })).toBe("ok");
    // The other player accepts; reading who the new friends are, its answer is held past the
    // blocker's block, which lands at once.
    const reads = hold(/from characters where id =|from friends f/);
    const accept = ask(other, "friend.accept", { id: blocker.characterId });
    await reads.called;
    const block = ask(blocker, "block.add", { name: other.entry.name });
    await until(() =>
      exists(sql`
        select 1 from blocks where character_id = ${blocker.characterId} and other_id = ${other.characterId}`),
    );
    reads.release();
    expect(await accept).toBe("ok");
    expect(await block).toBe("ok");
    await drained();

    other.inbox.length = 0;
    hub.moved(blocker.characterId);
    await drained();
    expect(events(other).filter((e) => e.t === "friend")).toEqual([]);
  });
});
