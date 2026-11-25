/**
 * Two bots trade end to end against a running game server: they sign in through the HTTP API,
 * are raised to level 30 and funded through the economy CLI (the item executor, on the server's
 * database), join the WorldRoom and the lawn, then complete one direct trade (request, accept,
 * both offers, both confirms) and one 매점 게시판 sale (list, browse, buy, the seller's change
 * notice). Every message each bot sends and receives is printed in order.
 *
 *   NODE_ENV=development PORT=2571 SIGNUPS_PER_IP_PER_DAY=50 DATABASE_URL=… pnpm --filter @guago/server start
 *   DATABASE_URL=… pnpm trade:run --url http://localhost:2571
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import { expToNext, MAP_ROOM, MapState, WORLD_ROOM } from "@guago/shared";
import { signIn } from "../../loadtest/src/account.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { url: { type: "string", default: "http://localhost:2571" } },
});
const HTTP = values.url as string;
const ROOT = path.resolve(import.meta.dirname, "../../..");

const started = Date.now();
const say = (text: string) =>
  console.log(`[${((Date.now() - started) / 1000).toFixed(2).padStart(6)}s] ${text}`);
const show = (body: unknown) => {
  const text = JSON.stringify(body);
  return text.length > 260 ? `${text.slice(0, 257)}...` : text;
};

interface Bot {
  name: string;
  id: string;
  world: Room;
  map: Room;
  inbox: { type: string; body: unknown }[];
  n: number;
}

/** Credit through the executor, as combat does: `pnpm economy grant <name> …`. */
function grant(name: string, ...amounts: string[]): void {
  execFileSync("node", ["apps/server/src/economy/cli.ts", "grant", name, ...amounts], {
    cwd: ROOT,
    stdio: "ignore",
  });
}

async function bot(index: number): Promise<Bot> {
  const cookie = await signIn(HTTP, "tb", index);
  const me = await fetch(`${HTTP}/api/me`, { headers: { cookie } }).then((r) => r.json());
  const character = (me as { character: { id: string; name: string; level: number } }).character;
  // To 1학년 (level 30), with 솔방울, 잉크 and what one 제본 of 수열 노트 takes.
  let exp = 0;
  for (let l = character.level; l < 30; l++) exp += expToNext(l);
  if (exp > 0) grant(character.name, `exp=${exp}`);
  grant(character.name, "coin=20000", "ink=20", "binding=2", "sheet:sequence=20");
  const client = new Client(HTTP.replace(/^http/, "ws"), { headers: { cookie } });
  const world = await client.join(WORLD_ROOM, {});
  const map = await client.joinOrCreate(MAP_ROOM, {}, MapState);
  const b: Bot = { name: character.name, id: character.id, world, map, inbox: [], n: 0 };
  world.onMessage("*", (type, body) => {
    if (type === "presence" || type === "social" || type === "system") return;
    b.inbox.push({ type: String(type), body });
    say(`${b.name} <- ${String(type)} ${show(body)}`);
  });
  say(`${b.name} signed in, level 30, joined the WorldRoom and the lawn`);
  return b;
}

function send(b: Bot, type: string, body: Record<string, unknown>): void {
  say(`${b.name} -> ${type} ${show(body)}`);
  b.world.send(type, body);
}

/** A trade or board request: `{ n, ... }`, answered by one `done` or `refused`. */
function request(b: Bot, type: string, body: Record<string, unknown>): Promise<unknown> {
  const n = ++b.n;
  send(b, type, { n, ...body });
  return wait(
    b,
    (m) => (m.type === "done" || m.type === "refused") && (m.body as { n?: number }).n === n,
  ).then((m) => {
    if (m.type === "refused") throw new Error(`${type} refused: ${show(m.body)}`);
    return (m.body as { data?: unknown }).data;
  });
}

/** An item operation: `{ id, req }`, answered by one `result`. */
async function op(b: Bot, type: string, req: Record<string, unknown>) {
  const id = randomUUID();
  send(b, type, { id, req });
  const m = await wait(b, (x) => x.type === "result" && (x.body as { id: string }).id === id);
  const r = m.body as { ok: boolean; outcome?: Record<string, unknown>; error?: string };
  if (!r.ok) throw new Error(`${type} refused: ${r.error}`);
  return r.outcome ?? {};
}

async function wait(b: Bot, match: (m: { type: string; body: unknown }) => boolean, ms = 5000) {
  const end = Date.now() + ms;
  let seen = 0;
  for (;;) {
    for (; seen < b.inbox.length; seen++) {
      const m = b.inbox[seen] as { type: string; body: unknown };
      if (match(m)) {
        b.inbox.splice(seen, 1);
        return m;
      }
    }
    if (Date.now() > end) throw new Error(`${b.name} waited in vain`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const trade = (b: Bot, t: string) =>
  wait(b, (m) => m.type === "trade" && (m.body as { t: string }).t === t).then(
    (m) => m.body as Record<string, unknown>,
  );

const [seller, buyer] = [await bot(1), await bot(2)];

console.log("\n## Direct trade\n");
const crafted = await op(seller, "craft", { def: "sequence" });
const book = crafted.item as string;
const { session } = (await request(seller, "trade.request", { to: buyer.id })) as {
  session: string;
};
await trade(buyer, "invite");
await request(buyer, "trade.accept", { session });
await Promise.all([trade(seller, "open"), trade(buyer, "open")]);
await request(seller, "trade.offer", { session, items: [book], stacks: {}, pinecone: "0" });
await request(buyer, "trade.offer", { session, items: [], stacks: {}, pinecone: "1000" });
// One `offer` push per offer change; the second carries the version both confirm.
await trade(seller, "offer");
const version = Number((await trade(seller, "offer")).version);
await request(seller, "trade.confirm", { session, version });
await request(buyer, "trade.confirm", { session, version });
const [a, b] = await Promise.all([trade(seller, "done"), trade(buyer, "done")]);
say(`trade done: seller paid tax ${a.tax}, buyer paid tax ${b.tax}`);

console.log("\n## 매점 게시판 sale\n");
const listed = await op(seller, "listing.create", { stack: "ink", qty: 5, unitPrice: "40" });
const page = (await request(buyer, "listing.browse", { def: "ink", sort: "price" })) as {
  listings: { id: string; unitPrice: string; seller: { name: string } }[];
};
const mine = page.listings.find((l) => l.id === listed.listing);
if (!mine) throw new Error("the listing is not on the board");
await op(buyer, "listing.buy", { listing: mine.id, qty: 3, unitPrice: mine.unitPrice });
await wait(seller, (m) => m.type === "change");
await request(seller, "listing.mine", {});
await request(buyer, "listing.history", { def: "ink" });

console.log("\n## Ledger\n");
console.log(
  execFileSync("node", ["apps/server/src/economy/cli.ts", "check"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim(),
);
for (const x of [seller, buyer]) {
  await x.map.leave();
  await x.world.leave();
}
process.exit(0);
