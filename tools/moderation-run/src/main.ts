/**
 * Moderation end to end against real processes: the game server (`apps/server/src/index.ts`)
 * on its own database, an admin made by the command-line script, two player bots on the
 * Colyseus SDK. The admin mutes a bot (its chat is refused), bans it (its socket closes with the
 * ban code; login, the old cookie, a second tab and the 30-second reconnection are all refused),
 * unbans it, and the audit log is printed.
 *
 *   LOCAL_PG_PORT=54344 pnpm moderation:run [--port 2574]
 */
import { parseArgs } from "node:util";
import type { Room } from "@colyseus/sdk";
import { API, CLOSE_BANNED, type Refusal, WORLD_MESSAGES, WORLD_ROOM } from "@guago/shared";
import { adminLogin, api, enterMap, freshDatabase, run, say, signUp, startServer } from "./lib.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { port: { type: "string", default: "2574" } },
});
const GAME = Number(values.port);
const PORTS = { game: GAME, metrics: GAME + 200, admin: GAME + 100 };
const BASE = `http://127.0.0.1:${PORTS.game}`;
const ADMIN = `http://127.0.0.1:${PORTS.admin}`;
const ADMIN_PASSWORD = "correct horse battery";

function check(ok: boolean, what: string): void {
  say(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) process.exitCode = 1;
}

const url = await freshDatabase("guago_modrun");
say(`database guago_modrun migrated`);
const server = await startServer(url, PORTS, ADMIN);
say(`game server on :${PORTS.game}, admin listener on 127.0.0.1:${PORTS.admin}`);

try {
  // The admin exists only because the command line on this machine made it.
  const created = await run(
    "node",
    ["apps/server/src/admin/cli.ts", "create", "andy", "owner"],
    { DATABASE_URL: url },
    `${ADMIN_PASSWORD}\n`,
  );
  say(`pnpm admin create andy owner → ${created}`);

  const bot = await signUp(BASE, "modbot", "도배왕");
  const friend = await signUp(BASE, "modfriend", "착한친구");
  say(`players signed up: ${bot.name} (${bot.loginId}), ${friend.name} (${friend.loginId})`);
  const world: Room = await bot.sdk().joinOrCreate(WORLD_ROOM);
  const friendWorld: Room = await friend.sdk().joinOrCreate(WORLD_ROOM);
  let n = 0;
  const whisper = (text: string) =>
    new Promise<{ ok: true } | Refusal>((resolve) => {
      const mine = ++n;
      const off: (() => void)[] = [];
      const done = (v: { ok: true } | Refusal) => {
        for (const f of off) f();
        resolve(v);
      };
      off.push(
        world.onMessage(
          WORLD_MESSAGES.chat,
          (m: { n?: number }) => m.n === mine && done({ ok: true }),
        ),
      );
      off.push(world.onMessage(WORLD_MESSAGES.refused, (r: Refusal) => r.n === mine && done(r)));
      world.send(WORLD_MESSAGES.chat, { ch: "whisper", to: friend.name, text, n: mine });
    });
  const heard: string[] = [];
  friendWorld.onMessage(WORLD_MESSAGES.chat, (m: { text: string }) => heard.push(m.text));
  friendWorld.onMessage(WORLD_MESSAGES.system, () => {});
  world.onMessage(WORLD_MESSAGES.system, (m: { key: string; params?: unknown }) =>
    say(`bot got system line ${JSON.stringify(m)}`),
  );
  for (const t of [WORLD_MESSAGES.presence, "social", "live", "change"]) {
    world.onMessage(t, () => {});
    friendWorld.onMessage(t, () => {});
  }

  check("ok" in (await whisper("안녕 테스트 중")), "bot whispers before the mute: delivered");

  const admin = await adminLogin(ADMIN, "andy", ADMIN_PASSWORD);
  say("admin andy logged into the admin API");
  const found = await admin(`/players?q=${encodeURIComponent(bot.name)}`);
  const account = (found.body.players as { accountId: string }[])[0]?.accountId as string;
  say(`admin found ${bot.name}: account ${account}`);

  const muted = await admin(`/players/${account}/mute`, { reason: "귓속말 도배", minutes: 10 });
  check(muted.status === 200, "admin mutes the bot for 10 minutes");
  const refused = await whisper("이것도 보내지나");
  check(
    !("ok" in refused) && refused.code === "muted" && typeof refused.until === "number",
    `bot's next whisper is refused: ${JSON.stringify(refused)}`,
  );

  // The bot stands on its map (a live socket), and its world link drops: the server holds that
  // seat for the 30-second reconnection.
  const map: Room = await enterMap(BASE, bot.jar);
  map.reconnection.enabled = false;
  const mapClosed = new Promise<number>((resolve) => map.onLeave((code) => resolve(code)));
  say(`bot joined its map room ${map.roomId}`);
  world.reconnection.enabled = false;
  const token = world.reconnectionToken;
  (world.connection.transport as unknown as { ws: WebSocket }).ws.close(4000, "link drop");
  say(`bot's link dropped (close 4000); reconnection token held`);
  await new Promise((r) => setTimeout(r, 300));
  say("admin sends the ban");

  const banned = await admin(`/players/${account}/ban`, {
    reason: "반복적인 욕설과 도배",
    minutes: null,
    ip: "signup",
  });
  check(
    banned.status === 200,
    `admin bans the bot until lifted, refusing new signups from its address: ${banned.status} ${JSON.stringify(banned.body)}`,
  );
  // A run that fails must end, not wait for a close that never comes.
  const code = await Promise.race([
    mapClosed,
    new Promise<number>((resolve) => setTimeout(() => resolve(-1), 5000)),
  ]);
  check(code === CLOSE_BANNED, `bot's live map socket closed with code ${code} (CLOSE_BANNED)`);

  const reconnect = await bot
    .sdk()
    .reconnect(token)
    .then(
      () => "joined",
      (e: Error) => `refused (${e.message})`,
    );
  check(reconnect.startsWith("refused"), `reconnection inside the window: ${reconnect}`);
  const second = await bot
    .sdk()
    .joinOrCreate(WORLD_ROOM)
    .then(
      () => "joined",
      (e: { code?: number; message?: string }) => `refused (${e.code} ${e.message})`,
    );
  check(second.startsWith("refused"), `a second tab with the old cookie: ${second}`);
  const me = await api(BASE, API.me, bot.jar);
  check(me.status === 401, `old cookie on /api/me: ${me.status} ${JSON.stringify(me.body)}`);
  const login = await api(BASE, API.login, new Map(), {
    loginId: bot.loginId,
    password: bot.password,
  });
  check(
    login.body.error === "account_banned",
    `login: ${login.status} ${JSON.stringify(login.body)}`,
  );
  const signup = await api(BASE, API.signup, new Map(), {
    loginId: "modbot2",
    password: "another pass 1234",
    ageConfirmed: true,
  });
  check(
    signup.body.error === "account_banned",
    `new signup from the banned IP: ${JSON.stringify(signup.body)}`,
  );

  const unbanned = await admin(`/players/${account}/unban`, { reason: "소명 확인, 1회 경고" });
  check(unbanned.status === 200, "admin lifts the ban");
  const back = await api(BASE, API.login, bot.jar, {
    loginId: bot.loginId,
    password: bot.password,
  });
  check(back.status === 200, `login after the unban: ${back.status}`);
  const again = await bot
    .sdk()
    .joinOrCreate(WORLD_ROOM)
    .then(
      (r) => {
        void r.leave();
        return "joined";
      },
      (e: Error) => `refused (${e.message})`,
    );
  check(again === "joined", `world room after the unban: ${again}`);

  const gameAdmin = await fetch(`${BASE}/admin/api/audit`);
  check(gameAdmin.status === 404, `the admin API on the game port: ${gameAdmin.status}`);

  await friendWorld.leave();
  const audit = await admin("/audit");
  console.log("\naudit log, newest first");
  for (const r of audit.body.rows as {
    at: string;
    admin: string;
    action: string;
    target: string;
    reason: string | null;
    detail: Record<string, unknown>;
  }[]) {
    console.log(
      `  ${r.at}  ${r.admin.padEnd(5)} ${r.action.padEnd(15)} ${r.target.padEnd(46)} ${(r.reason ?? "").padEnd(16)} ${JSON.stringify(r.detail)}`,
    );
  }
} finally {
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  say("server stopped");
}
