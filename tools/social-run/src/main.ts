/**
 * The scripted social run: the real game server in process on :2610 against its own database,
 * headless SDK clients holding real sessions through the client's own world link, and a
 * transcript of each flow (a friendship, a block, a party across two maps, a club from founding
 * to disband, an emote, a report, a 대자보 post expiring). Then 80 players online and idle, to
 * measure what the social systems add per client.
 *
 *   LOCAL_PG_PORT=54383 pnpm social:run [--out <dir>] [--idle <seconds>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { getMessageBytes, matchMaker, Protocol } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import { LAWN, type MapDef } from "@guago/content";
import {
  API,
  type ChatLine,
  CLUB_FEE,
  CLUB_FOUND_LEVEL,
  MAP_ROOM,
  partyExpMultiplier,
  type SocialEvent,
  type SocialRequests,
  type SocialType,
  WORLD_MESSAGES,
  WORLD_ROOM,
} from "@guago/shared";
import {
  connectWorld,
  newOpId,
  type RequestResult,
  type WorldEvent,
  type WorldLink,
} from "../../../apps/client/src/world-link.ts";
import { createGameServer } from "../../../apps/server/src/app.ts";
import { createAuthService } from "../../../apps/server/src/auth/service.ts";
import { ChatLog } from "../../../apps/server/src/chat/log.ts";
import { createDb, type Db, migrateDb } from "../../../apps/server/src/db/index.ts";
import { clubJackets, studentLooks } from "../../../apps/server/src/looks.ts";
import { MapRoom } from "../../../apps/server/src/map-room.ts";
import { parties } from "../../../apps/server/src/parties.ts";
import { evictAccount } from "../../../apps/server/src/seats.ts";
import { MemoryWallet } from "../../../apps/server/src/social/fees.ts";
import { createSocial } from "../../../apps/server/src/social/index.ts";
import { call, cookieHeader, type Jar, remember } from "../../../apps/server/src/test/http.ts";
import { worldRoom } from "../../../apps/server/src/world-room.ts";

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    out: { type: "string" },
    idle: { type: "string", default: "60" },
    port: { type: "string", default: "2610" },
  },
});
const PORT = Number(args.port);
const IDLE_SECONDS = Number(args.idle);
const OUT = args.out ?? path.resolve(import.meta.dirname, "../../../.local/social-run");
const PG = `postgres://guago:guago@127.0.0.1:${process.env.LOCAL_PG_PORT ?? 54383}`;
const DATABASE = "guago_social_run";
const BASE = `http://127.0.0.1:${PORT}`;
const EMBLEM = { shape: "shield", shapeColor: "navy", symbol: "atom", symbolColor: "gold" };

// Transcript ---------------------------------------------------------------------------------

const started = Date.now();
const lines: string[] = [];
function say(text: string): void {
  const line = `[${((Date.now() - started) / 1000).toFixed(2).padStart(6)}s] ${text}`;
  lines.push(line);
  console.log(line);
}
function section(title: string): void {
  lines.push("", `## ${title}`, "");
  console.log(`\n## ${title}\n`);
}
const short = (r: { ok: true; data: unknown } | { ok: false; code: string }) =>
  r.ok ? `ok${r.data === undefined ? "" : ` ${JSON.stringify(r.data)}`}` : `refused ${r.code}`;
function check(ok: boolean, what: string): void {
  say(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) process.exitCode = 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(test: () => boolean, what: string, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(15);
  }
}

// Server -------------------------------------------------------------------------------------

async function freshDatabase(): Promise<Db> {
  const admin = createDb(`${PG}/postgres`);
  const found = await admin.pool.query("select 1 from pg_database where datname = $1", [DATABASE]);
  if (found.rowCount === 0) await admin.pool.query(`create database ${DATABASE}`);
  await admin.pool.end();
  const db = createDb(`${PG}/${DATABASE}`);
  await db.pool.query("drop schema if exists drizzle cascade");
  await db.pool.query("drop schema public cascade");
  await db.pool.query("create schema public");
  await migrateDb(db);
  return db;
}

/** A second map, so a party can stand on two at once. */
const EAST: MapDef = { ...LAWN, id: "lawn-east" };
class EastRoom extends MapRoom {
  protected override mapDef(): MapDef {
    return EAST;
  }
}

/** The run's clock: real time plus whatever the run skips ahead. */
let skipped = 0;
const now = () => Date.now() + skipped;

const db = await freshDatabase();
const auth = createAuthService({
  db,
  onSessionsRevoked: evictAccount,
  limits: { signupsPerIpPerDay: 1000 },
});
const log = new ChatLog(db);
const wallet = new MemoryWallet(db);
const social = createSocial(db, { fees: wallet, jackets: clubJackets, log, now });
const server = createGameServer(
  auth,
  {
    clientOrigin: "http://localhost:5173",
    secureCookies: false,
    trustProxy: true,
    serverSecret: "run",
  },
  studentLooks,
  { log, social },
);
await server.listen(PORT);
matchMaker.defineRoomType("map-east", EastRoom);
await matchMaker.createRoom(WORLD_ROOM, {});

// Players ------------------------------------------------------------------------------------

const LOOK = {
  body: "fair",
  hair: "bob",
  hairColor: "black",
  face: "bright",
  uniform: "blazer",
  accessories: [],
};
let ips = 0;

interface Player {
  name: string;
  jar: Jar;
  link: WorldLink;
  events: WorldEvent[];
  map?: Room;
}

async function signUp(login: string, name: string, major = "math"): Promise<Jar> {
  const jar: Jar = {};
  const ip = `10.9.${Math.floor(ips / 250)}.${(ips++ % 250) + 1}`;
  const signed = remember(
    jar,
    await call(BASE, API.signup, {
      body: { loginId: login, password: "run password", ageConfirmed: true },
      ip,
    }),
  );
  if (signed.status !== 200) throw new Error(`signup ${login}: ${JSON.stringify(signed.body)}`);
  const made = await call(BASE, API.character, { jar, body: { name, major, look: LOOK }, ip });
  if (made.status !== 200) throw new Error(`character ${name}: ${JSON.stringify(made.body)}`);
  return jar;
}

async function online(name: string, jar: Jar): Promise<Player> {
  const link = connectWorld(BASE, { headers: { cookie: cookieHeader(jar) } });
  const events: WorldEvent[] = [];
  link.on((e) => events.push(e));
  await until(
    () =>
      link.status === "online" && events.some((e) => e.type === "social" && e.event.t === "all"),
    `${name} online`,
  );
  return { name, jar, link, events };
}

async function enterMap(p: Player, room: string): Promise<void> {
  await p.map?.leave();
  p.map = await new Client(BASE, { headers: { cookie: cookieHeader(p.jar) } }).joinOrCreate(room);
  p.map.onMessage("*", () => {});
  await until(
    () => p.link.presence.get(p.link.me ?? "")?.map === (room === MAP_ROOM ? "lawn" : "lawn-east"),
    `${p.name} on ${room}`,
  );
}

const socialEvents = (p: Player, t: SocialEvent["t"]) =>
  p.events.filter(
    (e): e is Extract<WorldEvent, { type: "social" }> => e.type === "social" && e.event.t === t,
  );
const chatLines = (p: Player) =>
  p.events
    .filter((e): e is Extract<WorldEvent, { type: "chat" }> => e.type === "chat")
    .map((e) => e.line);
const id = (p: Player) => p.link.me as string;

/** One request; past a rate limit the player waits as long as the refusal says, then asks again. */
async function ask<K extends SocialType>(
  p: Player,
  type: K,
  req: SocialRequests[K]["req"],
): Promise<RequestResult<K>> {
  for (;;) {
    const r = await p.link.request(type, req);
    if (r.ok || r.code !== "rate_limited") return r;
    say(
      `(${p.name}: ${type} refused rate_limited, waits ${((r.retryMs ?? 1000) / 1000).toFixed(1)} s)`,
    );
    await sleep(r.retryMs ?? 1000);
  }
}

// The flows ----------------------------------------------------------------------------------

section("Setup");
const [hana, duri, sechan, neo] = await Promise.all([
  signUp("runhana", "하나", "physics"),
  signUp("runduri", "두리", "chemistry"),
  signUp("runsechan", "세찬", "biology"),
  signUp("runneo", "네오", "earth"),
]);
await db.pool.query("update characters set level = $1 where name in ('하나', '세찬')", [
  CLUB_FOUND_LEVEL + 2,
]);
const A = await online("하나", hana);
const B = await online("두리", duri);
const C = await online("세찬", sechan);
const D = await online("네오", neo);
say(
  `server :${PORT}, database ${DATABASE}; 하나 and 세찬 (Lv ${CLUB_FOUND_LEVEL + 2}), 두리 and 네오 (Lv 1) signed in with real session cookies`,
);
await enterMap(A, MAP_ROOM);
await enterMap(B, "map-east");
say(`하나 stands on lawn, 두리 on lawn-east`);

section("Friendship");
say(`하나 → friend.request 두리: ${short(await ask(A, "friend.request", { name: "두리" }))}`);
await until(() => B.link.social.requests.in.some((r) => r.name === "하나"), "request reaches 두리");
say(`두리 sees incoming requests: ${B.link.social.requests.in.map((r) => r.name).join(", ")}`);
say(`두리 → friend.accept 하나: ${short(await ask(B, "friend.accept", { id: id(A) }))}`);
await until(() => A.link.social.friends.has(id(B)), "friendship reaches 하나");
const seenB = A.link.friends().find((f) => f.id === id(B));
say(
  `하나's friend list: ${JSON.stringify(A.link.friends().map((f) => ({ name: f.name, online: f.online, map: f.map, channel: f.room })))}`,
);
check(
  seenB?.online === true && seenB.map === "lawn-east" && seenB.room === B.map?.roomId,
  "하나 sees 두리 online on lawn-east in 두리's channel",
);
say(`하나 → friend.request 두리 again: ${short(await ask(A, "friend.request", { name: "두리" }))}`);
say(
  `하나 → friend.request 없는사람: ${short(await ask(A, "friend.request", { name: "없는사람" }))}`,
);

section("Block");
say(`세찬 → block.add 하나: ${short(await ask(C, "block.add", { name: "하나" }))}`);
await until(() => C.link.isBlocked(id(A)), "block list reaches 세찬");
say(`세찬's block list: ${[...C.link.social.blocks.values()].map((b) => b.name).join(", ")}`);
const cBefore = C.events.length;
const whisper = await A.link.send("whisper", "세찬아 들려?", "세찬");
say(
  `하나 → whisper 세찬 "세찬아 들려?": ${whisper.ok ? "delivered (own copy back)" : whisper.code}`,
);
say(`하나 → friend.request 세찬: ${short(await ask(A, "friend.request", { name: "세찬" }))}`);
say(`하나 → party.invite 세찬: ${short(await ask(A, "party.invite", { name: "세찬" }))}`);
await sleep(400);
const cGot = C.events.slice(cBefore);
check(
  !cGot.some((e) => e.type === "chat") &&
    !cGot.some((e) => e.type === "social" && e.event.t === "partyInvites") &&
    C.link.social.requests.in.length === 0,
  "세찬 received no whisper, no friend request and no party invite from 하나",
);
check(
  A.link.social.requests.out.some((r) => r.name === "세찬"),
  "하나 sees the request to 세찬 waiting, as for anyone who has not answered",
);
say(
  `세찬 → whisper 하나: ${(await C.link.send("whisper", "왜", "하나")).ok ? "sent" : "refused blocked"}`,
);
// The lapsed invite to 세찬 would hold a party slot for a minute; 하나 leaves that party.
say(`하나 → party.leave (drops the unanswered invite): ${short(await ask(A, "party.leave", {}))}`);

section("Party across two maps");
say(`하나 → party.invite 두리: ${short(await ask(A, "party.invite", { name: "두리" }))}`);
await until(() => B.link.social.partyInvites.length > 0, "invite reaches 두리");
const invite = B.link.social.partyInvites[0];
say(`두리 holds an invite from ${invite?.from.name} (party ${invite?.id}, ${invite?.size} member)`);
say(`두리 → party.accept: ${short(await ask(B, "party.accept", { id: invite?.id ?? 0 }))}`);
await until(() => (A.link.social.party?.members.length ?? 0) === 2, "party of two");
say(
  `party as 하나 sees it: ${JSON.stringify(A.link.social.party?.members.map((m) => ({ name: m.name, map: m.map, online: m.online })))}`,
);
check(
  A.link.social.party?.members.find((m) => m.name === "두리")?.map === "lawn-east",
  "the party spans lawn and lawn-east",
);
const partyLine = await B.link.send("party", "나 동쪽 잔디밭이야");
await until(() => chatLines(A).some((l) => l.ch === "party"), "party chat");
say(
  `두리 → party chat "나 동쪽 잔디밭이야": ${partyLine.ok ? "ok" : partyLine.code}; 하나 received it across maps`,
);
say(
  `kill sharing while apart: sharers(하나) = ${JSON.stringify(parties.sharers(id(A)).map((x) => (x === id(A) ? "하나" : "두리")))}`,
);
await enterMap(B, MAP_ROOM);
await until(
  () => A.link.social.party?.members.find((m) => m.name === "두리")?.map === "lawn",
  "두리 moved",
);
const sharing = parties.sharers(id(A));
say(
  `두리 walks to lawn; party view updates; sharers(하나) = ${JSON.stringify(sharing.map((x) => (x === id(A) ? "하나" : "두리")))}, EXP ×${partyExpMultiplier(sharing.length)}`,
);
check(
  sharing.length === 2 && partyExpMultiplier(2) === 1.1,
  "both share kills within 20 tiles with +10% EXP",
);
parties.report(id(B), { hp: 37, maxHp: 120, mode: "semi" });
await until(() => socialEvents(A, "vitals").length > 0, "vitals");
say(
  `combat feed: parties.report(두리, 37/120 HP, semi) → 하나 receives ${JSON.stringify(socialEvents(A, "vitals").at(-1)?.event)}; 하나's party frame for 두리: ${JSON.stringify(
    A.link.social.party?.members.find((m) => m.name === "두리"),
    ["name", "hp", "mode"],
  )}`,
);
// A dropped connection: the server sees the socket die, the SDK brings the same seat back.
await sleep(5200);
const snapshots = socialEvents(B, "all").length;
const bSocket = worldRoom()?.clients.find((c) => c.auth?.characterId === id(B));
if (!bSocket) throw new Error("두리 has no world seat");
(bSocket.ref as unknown as { terminate(): void }).terminate();
await until(() => B.link.status === "reconnecting", "두리 drops");
say(`두리's world socket dies (network loss); status ${B.link.status}`);
await until(() => B.link.status === "online", "두리 reconnects", 15000);
await until(() => socialEvents(B, "all").length > snapshots, "snapshot after the reconnect");
check(
  B.link.social.party?.members.length === 2,
  `두리 is back on the same seat, sent the snapshot again, still in the party`,
);
await B.link.close();
await B.map?.leave();
await until(
  () => A.link.social.party?.members.find((m) => m.name === "두리")?.online === false,
  "두리 offline",
);
say(
  `두리 logs out: the party keeps 두리 for 180 s, shown offline: ${JSON.stringify(A.link.social.party?.members.map((m) => ({ name: m.name, online: m.online })))}`,
);
const B2 = await online("두리", duri);
await until(
  () => A.link.social.party?.members.find((m) => m.name === "두리")?.online === true,
  "두리 back",
);
say(`두리 signs in again within the grace: back in party ${B2.link.social.party?.id}, online`);
Object.assign(B, B2);
await enterMap(B, MAP_ROOM);
say(
  `하나 → party.lead 두리: ${short(await ask(A, "party.lead", { id: id(B) }))}; leader is now ${A.link.social.party?.leader === id(B) ? "두리" : "하나"}`,
);
say(
  `하나 → party.kick 두리 (not the leader any more): ${short(await ask(A, "party.kick", { id: id(B) }))}`,
);
say(`하나 → party.leave: ${short(await ask(A, "party.leave", {}))}`);
await until(() => B.link.social.party === null, "party dissolved");
check(
  A.link.social.party === null && B.link.social.party === null,
  "one member left: the party dissolved",
);

section("동아리 from founding to disband");
wallet.credit(id(A), CLUB_FEE * 2);
wallet.credit(id(C), CLUB_FEE);
const op = newOpId();
const create = {
  op,
  name: "물리탐구부",
  joinRule: "apply" as const,
  jacket: "navy",
  emblem: EMBLEM,
};
say(`하나 holds ${wallet.balance(id(A))} 솔방울; the fee is ${CLUB_FEE}`);
say(
  `두리 → club.create (Lv 1): ${short(await ask(B, "club.create", { ...create, op: newOpId() }))}`,
);
const founded = await ask(A, "club.create", create);
say(`하나 → club.create 물리탐구부 (op ${op.slice(0, 8)}…): ${short(founded)}`);
say(
  `하나 → club.create again with the same op (a retry after a timeout): ${short(await ask(A, "club.create", create))}`,
);
check(
  wallet.balance(id(A)) === CLUB_FEE,
  `the fee was taken once: 하나 holds ${wallet.balance(id(A))}`,
);
const clubId = founded.ok ? founded.data.club : 0;
say(
  `세찬 → club.create 물리탐구부 (taken): ${short(await ask(C, "club.create", { ...create, op: newOpId() }))}`,
);
say(`두리 → club.search "물리": ${short(await ask(B, "club.search", { q: "물리" }))}`);
say(`두리 → club.join (apply rule): ${short(await ask(B, "club.join", { id: clubId }))}`);
await until(() => A.link.social.applicants.some((a) => a.name === "두리"), "applicant");
say(`하나 (짱) sees applicants: ${A.link.social.applicants.map((a) => a.name).join(", ")}`);
say(
  `하나 → club.review 두리 accept: ${short(await ask(A, "club.review", { id: id(B), accept: true }))}`,
);
say(`하나 → club.invite 네오: ${short(await ask(A, "club.invite", { name: "네오" }))}`);
await until(() => D.link.social.clubInvites.length > 0, "invite reaches 네오");
say(`네오 → club.accept: ${short(await ask(D, "club.accept", { id: clubId }))}`);
say(
  `하나 → club.rank 두리 vice (promote): ${short(await ask(A, "club.rank", { id: id(B), rank: "vice" }))}`,
);
say(`네오 → club.invite 세찬 (부원): ${short(await ask(D, "club.invite", { name: "세찬" }))}`);
say(`두리 → club.kick 네오 (부짱 kicks 부원): ${short(await ask(B, "club.kick", { id: id(D) }))}`);
await until(() => D.link.social.club === null, "네오 out");
say(`두리 → club.invite 네오: ${short(await ask(B, "club.invite", { name: "네오" }))}`);
say(`네오 → club.accept: ${short(await ask(D, "club.accept", { id: clubId }))}`);
say(
  `두리 → club.notice: ${short(await ask(B, "club.notice", { text: "금요일 7시 2층 물리실 모임" }))}`,
);
await until(() => (D.link.social.club?.notices.length ?? 0) > 0, "notice");
const clubLine = await A.link.send("club", "다들 금요일에 봐요");
await until(() => chatLines(D).some((l) => l.ch === "club"), "club chat");
say(`하나 → club chat: ${clubLine.ok ? "ok" : clubLine.code}; 네오 received it`);
say(
  `두리 → club.settings jacket crimson (부짱): ${short(await ask(B, "club.settings", { jacket: "crimson" }))}`,
);
say(
  `하나 → club.settings jacket crimson: ${short(await ask(A, "club.settings", { jacket: "crimson" }))}`,
);
await enterMap(D, MAP_ROOM);
await sleep(300);
const bodies = [
  ...((D.map?.state as { players?: Map<string, Record<string, unknown>> })?.players?.values() ??
    []),
];
const hanaBody = bodies.find((p) => p.name === "하나");
say(
  `what 네오's map room syncs for 하나: club "${hanaBody?.club}", id ${hanaBody?.clubId}, jacket ${hanaBody?.jacket}, emblem ${hanaBody?.emblem}`,
);
check(
  hanaBody?.club === "물리탐구부" && hanaBody.jacket === "crimson",
  "the club name and 과잠 show under 하나 in the map room",
);
say(`roster: ${JSON.stringify(A.link.social.club?.members.map((m) => `${m.name}:${m.rank}`))}`);
say(`두리 → club.disband (부짱): ${short(await ask(B, "club.disband", { name: "물리탐구부" }))}`);
say(`하나 → club.leave (짱 with members): ${short(await ask(A, "club.leave", {}))}`);
say(`하나 → club.handover 두리: ${short(await ask(A, "club.handover", { id: id(B) }))}`);
await until(() => B.link.social.club?.leader === id(B), "handover");
say(
  `두리 → club.rank 하나 member (demote the old 짱): ${short(await ask(B, "club.rank", { id: id(A), rank: "member" }))}`,
);
say(`roster: ${JSON.stringify(B.link.social.club?.members.map((m) => `${m.name}:${m.rank}`))}`);
say(`네오 → club.leave: ${short(await ask(D, "club.leave", {}))}`);
say(`두리 → club.disband "물리부": ${short(await ask(B, "club.disband", { name: "물리부" }))}`);
say(
  `두리 → club.disband "물리탐구부": ${short(await ask(B, "club.disband", { name: "물리탐구부" }))}`,
);
await until(() => A.link.social.club === null && B.link.social.club === null, "disbanded");
await sleep(200);
const after = [
  ...((D.map?.state as { players?: Map<string, Record<string, unknown>> })?.players?.values() ??
    []),
].find((p) => p.name === "하나");
check(
  after?.club === "" && after.clubId === 0,
  "disbanded: every member's club is gone, and the tag left the map room",
);

section("Emote");
await enterMap(C, MAP_ROOM);
const marks = { b: B.events.length, c: C.events.length };
say(`하나 → emote wave: ${short(await ask(A, "emote", { e: "wave" }))}`);
say(`하나 → emote moonwalk: ${short(await ask(A, "emote", { e: "moonwalk" }))}`);
await sleep(300);
const bEmote = B.events.slice(marks.b).find((e) => e.type === "social" && e.event.t === "emote");
check(
  bEmote !== undefined,
  `두리 (nearby) received ${JSON.stringify(bEmote?.type === "social" ? bEmote.event : null)}`,
);
check(
  !C.events.slice(marks.c).some((e) => e.type === "social" && e.event.t === "emote"),
  "세찬 (nearby, blocked 하나) received nothing",
);

section("Report");
for (const text of ["안녕 다들", "세찬 진짜 못하네", "ㅋㅋㅋ"]) await A.link.send("near", text);
await until(
  () => chatLines(D).filter((l) => l.from.id === id(A) && l.ch === "near").length === 3,
  "lines reach 네오",
);
check(
  !chatLines(C).some((l) => l.from.id === id(A)),
  "세찬, who blocked 하나, saw none of the three lines",
);
const reported = chatLines(D).at(-2) as ChatLine;
say(
  `하나 said three lines nearby; 네오 reports 하나 from "${reported.text}" (line ${reported.id})`,
);
say(
  `네오 → report 하나 abuse: ${short(await ask(D, "report", { id: id(A), cat: "abuse", note: "계속 시비 걸어요", line: reported.id }))}`,
);
say(
  `네오 → report 하나 abuse again: ${short(await ask(D, "report", { id: id(A), cat: "abuse" }))}`,
);
say(
  `네오 → report a made-up id: ${short(await ask(D, "report", { id: "00000000-0000-4000-8000-000000000000", cat: "spam" }))}`,
);
const { rows: reports } = await db.pool.query(
  "select reporter_id, target_id, category, note, context, state from reports",
);
check(reports.length === 1, `one open report stored (the second was the same report)`);
say(
  `stored: ${JSON.stringify({ category: reports[0]?.category, note: reports[0]?.note, state: reports[0]?.state, lines: reports[0]?.context.lines.map((l: { ch: string; body: string }) => `${l.ch}: ${l.body}`) })}`,
);

section("대자보");
say(
  `하나 → board.post party: ${short(await ask(A, "board.post", { cat: "party", text: "물리 필드 같이 도실 분 Lv30+" }))}`,
);
say(
  `하나 → board.post party again: ${short(await ask(A, "board.post", { cat: "party", text: "한 번 더" }))}`,
);
say(
  `하나 → board.post trade: ${short(await ask(A, "board.post", { cat: "trade", text: "교과서 팝니다" }))}`,
);
say(`하나 → board.pin (not 층장): ${short(await ask(A, "board.pin", { text: "공지" }))}`);
const listed = await ask(B, "board.list", { cat: "party" });
say(
  `두리 → board.list party: ${listed.ok ? listed.data.posts.map((p) => `${p.author.name}: ${p.text}`).join(" | ") : listed.code}`,
);
const hidden = await ask(C, "board.list", { cat: "party" });
check(
  hidden.ok && hidden.data.posts.length === 0,
  "세찬, who blocked 하나, does not see 하나's post",
);
skipped += 48 * 3600 * 1000 + 1000;
say(`the run's clock skips 48 h 1 s`);
const expired = await ask(B, "board.list", { cat: "party" });
check(expired.ok && expired.data.posts.length === 0, "the post lapsed: the party section is empty");
say(
  `하나 → board.post party: ${short(await ask(A, "board.post", { cat: "party", text: "다시 구해요" }))}`,
);
const swept = await social.board.sweep();
say(
  `sweep deleted ${swept} lapsed row (the trade post); live rows left: ${(await db.pool.query("select count(*)::int as n from board_posts")).rows[0].n}`,
);
skipped = 0;

for (const p of [A, B, C, D]) {
  await p.map?.leave();
  await p.link.close();
}
parties.reset();

// 80 players idle --------------------------------------------------------------------------

section(`Bytes with 80 online, idle for ${IDLE_SECONDS} s`);
const BOTS = 80;
const jars: Jar[] = [];
for (let i = 0; i < BOTS; i += 4) {
  jars.push(
    ...(await Promise.all(
      Array.from({ length: 4 }, (_, k) => signUp(`runbot${i + k}`, `봇${i + k}`)),
    )),
  );
}
const { rows: bots } = await db.pool.query<{ id: string; name: string }>(
  "select id, name from characters where name like '봇%' order by created_at, name",
);
const botId = new Map(bots.map((b) => [b.name, b.id]));
const ids = Array.from({ length: BOTS }, (_, i) => botId.get(`봇${i}`) as string);
// Ten friends each (a ring), two clubs of 30, and 20 parties of four once online.
for (let i = 0; i < BOTS; i++) {
  for (let k = 1; k <= 5; k++) {
    const a = ids[i] as string;
    const b = ids[(i + k) % BOTS] as string;
    await social.friends.request(a, b);
    await social.friends.accept(b, a);
  }
}
await db.pool.query("update characters set level = $1 where name in ('봇0', '봇30')", [
  CLUB_FOUND_LEVEL,
]);
for (const [leader, from] of [
  [0, 1],
  [30, 31],
] as const) {
  wallet.credit(ids[leader] as string, CLUB_FEE);
  const made = await social.clubs.found(ids[leader] as string, CLUB_FOUND_LEVEL, {
    op: `bots-${leader}-club`,
    name: `봇동아리${leader}`,
    joinRule: "open",
    jacket: "navy",
    emblem: EMBLEM,
  });
  if (!("club" in made)) throw new Error("bot club");
  for (let i = from; i < from + 29; i++) await social.clubs.join(ids[i] as string, made.club);
}
const crowd: Player[] = [];
for (let i = 0; i < BOTS; i += 10) {
  crowd.push(
    ...(await Promise.all(jars.slice(i, i + 10).map((jar, k) => online(`봇${i + k}`, jar)))),
  );
}
for (let p = 0; p < BOTS; p += 4) {
  const leader = crowd[p] as Player;
  for (let k = 1; k < 4; k++) {
    const member = crowd[p + k] as Player;
    await ask(leader, "party.invite", { name: member.name });
    await until(() => member.link.social.partyInvites.length > 0, "bot invite");
    await ask(member, "party.accept", { id: member.link.social.partyInvites[0]?.id ?? 0 });
  }
}
await sleep(500);
const snapshotSizes = crowd.map((p) => {
  const all = socialEvents(p, "all").at(-1)?.event;
  return all ? getMessageBytes.raw(Protocol.ROOM_DATA, WORLD_MESSAGES.social, all).length : 0;
});
const room = worldRoom();
const counted = new Map<string, number>();
for (const c of room?.clients ?? []) {
  const raw = c.raw.bind(c);
  counted.set(c.sessionId, 0);
  c.raw = (data, options, cb) => {
    counted.set(c.sessionId, (counted.get(c.sessionId) ?? 0) + data.byteLength);
    raw(data, options, cb);
  };
}
say(`80 bots online: 5 friends each way (10 per bot), 2 clubs of 30, 20 parties of 4`);
await sleep(IDLE_SECONDS * 1000);
const idleBytes = [...counted.values()];
const idleTotal = idleBytes.reduce((a, b) => a + b, 0);
say(
  `idle ${IDLE_SECONDS} s: ${idleTotal} bytes to all 80 world clients together, ${(idleTotal / BOTS / IDLE_SECONDS).toFixed(2)} B/s per client`,
);
check(idleTotal === 0, "an idle world sends nothing for the social systems");
// One second of the worst party traffic: every member's HP changing on every combat tick.
for (const k of counted.keys()) counted.set(k, 0);
const busyEnd = Date.now() + 5000;
let hp = 100;
while (Date.now() < busyEnd) {
  hp = hp === 100 ? 50 : 100;
  for (const b of ids) parties.report(b, { hp, maxHp: 100, mode: "semi" });
  await sleep(50);
}
await sleep(300);
const busyTotal = [...counted.values()].reduce((a, b) => a + b, 0);
say(
  `busy parties (every member's HP changing each 50 ms tick, sent at most every 250 ms): ${(busyTotal / BOTS / 5).toFixed(0)} B/s per client`,
);
const events = {
  vitals: getMessageBytes.raw(Protocol.ROOM_DATA, WORLD_MESSAGES.social, {
    t: "vitals",
    v: [1, 37, 1, 2, 80, 1, 3, 100, 0],
  }).length,
  friend: getMessageBytes.raw(Protocol.ROOM_DATA, WORLD_MESSAGES.social, {
    t: "friend",
    f: crowd[0]?.link.social.friends.values().next().value,
  }).length,
  party: getMessageBytes.raw(Protocol.ROOM_DATA, WORLD_MESSAGES.social, {
    t: "party",
    party: crowd[0]?.link.social.party,
  }).length,
  club: getMessageBytes.raw(Protocol.ROOM_DATA, WORLD_MESSAGES.social, {
    t: "club",
    club: crowd[1]?.link.social.club,
  }).length,
  emote: getMessageBytes.raw(Protocol.ROOM_DATA, WORLD_MESSAGES.social, {
    t: "emote",
    id: ids[0],
    sid: "abcdefghi",
    e: "wave",
  }).length,
};
const sorted = [...snapshotSizes].sort((a, b) => a - b);
const summary = {
  online: BOTS,
  idleSeconds: IDLE_SECONDS,
  idleBytesPerClientPerSecond: idleTotal / BOTS / IDLE_SECONDS,
  busyPartyBytesPerClientPerSecond: Math.round(busyTotal / BOTS / 5),
  loginSnapshotBytes: {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted.at(-1),
  },
  eventBytes: events,
  mapRoomClubTag:
    "4 fields on the player body (clubId, club, jacket, emblem), sent once when a body is handed out or the club changes; nothing per tick",
};
say(`login snapshot per client: ${JSON.stringify(summary.loginSnapshotBytes)} bytes, once`);
say(`event sizes in bytes: ${JSON.stringify(events)}`);

for (const p of crowd) await p.link.close();
await server.gracefullyShutdown(false).catch(() => {});
await log.close();
await db.pool.end();

mkdirSync(OUT, { recursive: true });
writeFileSync(
  path.join(OUT, "transcript.md"),
  `# Social scripted run\n\n${new Date(started).toISOString()}, game server in process on :${PORT}, database ${DATABASE}.\n${lines.join("\n")}\n`,
);
writeFileSync(path.join(OUT, "bytes.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nwrote ${path.join(OUT, "transcript.md")} and bytes.json`);
process.exit(process.exitCode ?? 0);
