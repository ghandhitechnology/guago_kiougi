/**
 * A server with a few days of real moderation history, for looking at the admin page: players
 * who chat (the filter catching some lines), report each other and buy from the 자판기, and
 * admins who mute, strike, grant, ban, resolve and post a notice, all through the real paths.
 * The ledger's days are then spread over two weeks so the economy screen has a trend to show.
 * The server keeps running until this process is stopped.
 *
 *   LOCAL_PG_PORT=54344 pnpm --filter @guago/moderation-run seed [--port 2574] [--page http://127.0.0.1:5208]
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import type { Room } from "@colyseus/sdk";
import { API, MAP_ROOM, WORLD_MESSAGES, WORLD_ROOM } from "@guago/shared";
import pg from "pg";
import { adminLogin, api, freshDatabase, run, say, signUp, startServer } from "./lib.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    port: { type: "string", default: "2574" },
    page: { type: "string", default: "http://127.0.0.1:5208" },
  },
});
const GAME = Number(values.port);
const PORTS = { game: GAME, metrics: GAME + 200, admin: GAME + 100 };
const BASE = `http://127.0.0.1:${PORTS.game}`;
const ORIGIN = values.page as string;

const url = await freshDatabase("guago_modseed");
const server = await startServer(url, PORTS, ORIGIN);
// The server goes down with this process, however it ends.
process.on("exit", () => server.kill("SIGTERM"));
process.on("SIGINT", () => server.kill("SIGTERM"));
process.on("SIGTERM", () => server.kill("SIGTERM"));
say(`server on :${PORTS.game}, admin on :${PORTS.admin} for the page at ${ORIGIN}`);

for (const [login, role, password] of [
  ["andy", "owner", "correct horse battery"],
  ["jiwoo", "moderator", "jiwoo moderator pass"],
  ["minseo", "moderator", "minseo moderator pass"],
] as const) {
  await run(
    "node",
    ["apps/server/src/admin/cli.ts", "create", login, role],
    { DATABASE_URL: url },
    `${password}\n`,
  );
}

const PLAYERS: [string, string, string][] = [
  ["starboy", "별빛소년", "physics"],
  ["mathgod", "수학천재", "math"],
  ["physnerd", "물리덕후", "physics"],
  ["chemkid", "화학쟁이", "chemistry"],
  ["biolab", "생명실험", "biology"],
  ["earthy", "지구인", "earth"],
  ["spamking", "도배왕", "math"],
  ["nicefriend", "착한친구", "biology"],
  ["allnighter", "밤샘공부", "chemistry"],
  ["lunchboss", "급식대장", "earth"],
  ["examfail", "시험망함", "math"],
  ["kgsking", "과고짱", "physics"],
];
const bots: Awaited<ReturnType<typeof signUp>>[] = [];
for (const [login, name, major] of PLAYERS) bots.push(await signUp(BASE, login, name, major));
say(`${bots.length} players`);

// Levels and coin through the executor, as combat would credit them.
for (const [i, b] of bots.entries()) {
  await run(
    "node",
    [
      "apps/server/src/economy/cli.ts",
      "grant",
      b.name,
      `exp=${6_500_000 + i * 400_000}`,
      `coin=${3_000 + i * 750}`,
      "ink=10",
    ],
    { DATABASE_URL: url },
  );
}
say("combat grants landed");

const byName = new Map(bots.map((b) => [b.name, b]));
const rooms = new Map<string, Room>();
for (const b of bots) {
  const world = await b.sdk().joinOrCreate(WORLD_ROOM);
  for (const t of [
    WORLD_MESSAGES.presence,
    WORLD_MESSAGES.chat,
    WORLD_MESSAGES.system,
    WORLD_MESSAGES.refused,
    "social",
    "live",
    "change",
    "result",
  ]) {
    world.onMessage(t, () => {});
  }
  rooms.set(b.name, world);
  const map = await b.sdk().joinOrCreate(MAP_ROOM);
  map.onMessage("*", () => {});
}
let n = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function speak(name: string, ch: string, text: string, to?: string) {
  rooms.get(name)?.send(WORLD_MESSAGES.chat, { ch, text, n: ++n, ...(to ? { to } : {}) });
  await sleep(1100);
}

const LINES: [string, string, string, string?][] = [
  ["별빛소년", "world", "아고라 가는 파티 구해요 2/4"],
  ["수학천재", "world", "피타고라스 2페이즈 패턴 아시는 분"],
  ["물리덕후", "near", "여기 몹 리젠 왜 이렇게 빨라"],
  ["도배왕", "world", "시발 렉 진짜 심하네"],
  ["착한친구", "world", "렉 저만 그런 거 아니죠?"],
  ["도배왕", "world", "ㅅㅂ 또 죽음 ㅋㅋ"],
  ["화학쟁이", "whisper", "아까 고마웠어요", "착한친구"],
  ["도배왕", "world", "골드 팝니다 골드 팝니다 골드 팝니다"],
  ["급식대장", "world", "오늘 급식 버프 뭐임"],
  ["밤샘공부", "near", "졸방대 어디 있었지"],
  ["도배왕", "world", "병신들 템 왜 안 팜"],
  ["과고짱", "world", "말 좀 예쁘게 합시다"],
  ["도배왕", "whisper", "너 신고하면 죽는다", "과고짱"],
  ["시험망함", "world", "필기 3연속 실패 실화냐"],
  ["생명실험", "world", "올리브 숲길 엘리트 잡을 사람"],
  ["지구인", "near", "ㅎㅇㅎㅇ"],
];
for (const [name, ch, text, to] of LINES) await speak(name, ch, text, to);
say("chat sent");

// Reports, from the players' own clients.
const report = (from: string, about: string, cat: string, note?: string) =>
  rooms.get(from)?.send("report", {
    n: ++n,
    id: byName.get(about)?.characterId,
    cat,
    ...(note ? { note } : {}),
  });
report("과고짱", "도배왕", "abuse", "귓으로 협박해요");
report("착한친구", "도배왕", "abuse");
report("급식대장", "도배왕", "spam", "골드 판매 도배");
report("수학천재", "시험망함", "other", "닉네임이 좀...");
report("밤샘공부", "물리덕후", "cheat", "이동속도가 이상함");
await sleep(1500);

// The 자판기: sinks, through the player's own operation endpoint.
for (const [i, b] of bots.entries()) {
  await api(BASE, API.op, b.jar, {
    id: randomUUID(),
    op: "shop.buy",
    req: { item: "banana-milk", qty: 1 + (i % 3) },
  });
  if (i % 2 === 0)
    await api(BASE, API.op, b.jar, {
      id: randomUUID(),
      op: "shop.buy",
      req: { item: "water", qty: 3 },
    });
}
say("자판기 purchases");

// The 매점 게시판: ink listed and bought, through the same operation endpoint. 도배왕 sells to one
// buyer again and again, the pattern the trade partners table is for.
const op = (b: (typeof bots)[number], name: string, req: unknown) =>
  api(BASE, API.op, b.jar, { id: randomUUID(), op: name, req });
const sales: [string, string, number, string][] = [
  ["도배왕", "밤샘공부", 2, "900"],
  ["도배왕", "밤샘공부", 3, "850"],
  ["도배왕", "밤샘공부", 2, "950"],
  ["수학천재", "별빛소년", 1, "400"],
  ["화학쟁이", "생명실험", 2, "350"],
  ["급식대장", "착한친구", 1, "500"],
];
for (const [seller, buyer, qty, price] of sales) {
  const made = await op(byName.get(seller) as (typeof bots)[number], "listing.create", {
    stack: "ink",
    qty,
    unitPrice: price,
  });
  const listing = (made.body.outcome as { listing?: string } | undefined)?.listing;
  if (!listing) {
    say(`listing by ${seller} refused: ${JSON.stringify(made.body)}`);
    continue;
  }
  const bought = await op(byName.get(buyer) as (typeof bots)[number], "listing.buy", {
    listing,
    qty,
    unitPrice: price,
  });
  if (bought.body.ok !== true) say(`purchase by ${buyer} refused: ${JSON.stringify(bought.body)}`);
  await sleep(2100);
}
say("매점 게시판 trades");

// The admins at work.
const andy = await adminLogin(
  `http://127.0.0.1:${PORTS.admin}`,
  "andy",
  "correct horse battery",
  ORIGIN,
);
const jiwoo = await adminLogin(
  `http://127.0.0.1:${PORTS.admin}`,
  "jiwoo",
  "jiwoo moderator pass",
  ORIGIN,
);
const account = async (name: string) => {
  const out = await andy(`/players?q=${encodeURIComponent(name)}`);
  return (out.body.players as { accountId: string; name: string }[]).find((p) => p.name === name)
    ?.accountId as string;
};
const spam = await account("도배왕");
await jiwoo(`/players/${spam}/chat`);
const lines = (await jiwoo(`/chat?character=${byName.get("도배왕")?.characterId}`)).body.lines as {
  id: number;
  at: string;
  masked: boolean;
}[];
for (const l of lines.filter((l) => l.masked).slice(0, 2)) {
  await jiwoo("/chat/strike", { id: l.id, at: l.at, reason: "전체 채팅 욕설" });
}
await jiwoo(`/players/${spam}/mute`, { reason: "골드 판매 도배", minutes: 1440 });
const reports = (await jiwoo("/reports?state=open")).body.reports as {
  id: number;
  target: string;
}[];
const onSpam = reports.filter((r) => r.target === "도배왕");
if (onSpam[0]) {
  await jiwoo(`/reports/${onSpam[0].id}`);
  await jiwoo(`/reports/${onSpam[0].id}/resolve`, {
    state: "resolved",
    action: "none",
    minutes: null,
    note: "이미 1일 채금 처리",
  });
}
const name = reports.find((r) => r.target === "시험망함");
if (name)
  await andy(`/reports/${name.id}/resolve`, {
    state: "dismissed",
    action: "none",
    minutes: null,
    note: "닉네임 문제 없음",
  });
const kgs = await account("과고짱");
await andy(`/players/${kgs}/grant`, {
  opId: randomUUID(),
  reason: "버그 제보 보상",
  amounts: { pinecone: 50_000, token: 20 },
  add: ["compass"],
  remove: [],
});
const fail = await account("시험망함");
await andy(`/players/${fail}/grant`, {
  opId: randomUUID(),
  reason: "필기 서버 오류 복구",
  amounts: { ink: 12 },
  add: [],
  remove: [],
});
await andy("/filter/add", { mode: "part", text: "골드팝니다", reason: "골드 판매 도배 증가" });
await andy("/filter/add", { mode: "allow", text: "시발점", reason: "수학 용어" });
await andy("/broadcast", { text: "오늘 23시에 서버 점검이 있습니다. 10분 정도 걸려요." });
const nerd = await account("물리덕후");
await andy(`/players/${nerd}/ban`, { reason: "이동 속도 조작 확인", minutes: 10_080, ip: false });
await andy(`/players/${nerd}/inventory`);
await andy(`/admins`);
const minseo = ((await andy("/admins")).body.admins as { id: string; loginId: string }[]).find(
  (a) => a.loginId === "minseo",
);
if (minseo) await andy(`/admins/${minseo.id}`, { status: "disabled", reason: "인턴 기간 종료" });
say("admin actions done");

// Spread the ledger over two weeks of Korean days, each operation kept whole on one day, so the
// daily totals show a trend.
const db = new pg.Client({ connectionString: url });
await db.connect();
await db.query(`
  update economy_ledger set
    at = at - make_interval(days => (abs(hashtext(operation_id)) % 14)::int),
    day = ((at - make_interval(days => (abs(hashtext(operation_id)) % 14)::int)) at time zone 'Asia/Seoul')::date`);
await db.end();
say("ledger spread over 14 days; server stays up (Ctrl-C to stop)");
