/**
 * Admin accounts, from the server machine only (PLAN §22): there is no signup page.
 *
 *   pnpm admin create <login> <moderator|owner>    asks for the password twice
 *   pnpm admin password <login>                    sets a new one and ends the session
 *   pnpm admin disable <login> | enable <login>
 *   pnpm admin list
 *
 * The password is read from the terminal without echo; piped in, it is the first line of stdin
 * (asked once). It is never taken as an argument, so it
 * stays out of shell history and the process list.
 */
import { createInterface } from "node:readline";
import { config } from "../config.ts";
import { createDb } from "../db/index.ts";
import {
  ADMIN_LOGIN_ID,
  ADMIN_ROLES,
  type AdminRole,
  checkAdminPassword,
  createAdminAuth,
} from "./auth.ts";

const [command, login, role] = process.argv.slice(2);
const db = createDb(process.env.DATABASE_URL ?? config.databaseUrl);
const admins = createAdminAuth(db, config.serverSecret);

function askHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) {
    return new Promise((resolve) => {
      const rl = createInterface({ input });
      rl.once("line", (line) => {
        rl.close();
        resolve(line);
      });
      rl.once("close", () => resolve(""));
    });
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    input.on("data", onData);
  });
}

async function newPassword(): Promise<string | null> {
  const password = await askHidden("password: ");
  const problem = checkAdminPassword(password);
  if (problem) {
    console.error(`password must be ${problem}`);
    return null;
  }
  if (process.stdin.isTTY && (await askHidden("again: ")) !== password) {
    console.error("passwords differ");
    return null;
  }
  return password;
}

function loginId(): string | null {
  const id = (login ?? "").toLowerCase();
  if (!ADMIN_LOGIN_ID.test(id)) {
    console.error("login must be 3 to 32 of a-z, 0-9 and _");
    return null;
  }
  return id;
}

async function main(): Promise<number> {
  switch (command) {
    case "create": {
      const id = loginId();
      if (!id) return 2;
      if (!ADMIN_ROLES.includes(role as AdminRole)) {
        console.error(`role must be one of ${ADMIN_ROLES.join(", ")}`);
        return 2;
      }
      const password = await newPassword();
      if (!password) return 2;
      try {
        await admins.create(id, password, role as AdminRole);
      } catch (error) {
        if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
          console.error(`admin ${id} exists`);
          return 1;
        }
        throw error;
      }
      console.log(`created ${role} ${id}`);
      return 0;
    }
    case "password": {
      const id = loginId();
      if (!id) return 2;
      const password = await newPassword();
      if (!password) return 2;
      if (!(await admins.setPassword(id, password))) {
        console.error(`no admin ${id}`);
        return 1;
      }
      console.log(`password set for ${id}`);
      return 0;
    }
    case "disable":
    case "enable": {
      const id = loginId();
      if (!id) return 2;
      const done = await admins.setStatus(id, command === "disable" ? "disabled" : "active");
      if (!done) {
        console.error(`no admin ${id}`);
        return 1;
      }
      console.log(`${id} ${command}d`);
      return 0;
    }
    case "list":
      for (const a of await admins.list()) {
        console.log(
          `${a.loginId.padEnd(20)} ${a.role.padEnd(10)} ${a.status.padEnd(9)} ${a.lastLoginAt ?? "-"}`,
        );
      }
      return 0;
    default:
      console.error(
        "usage: admin create <login> <role> | password <login> | disable <login> | enable <login> | list",
      );
      return 2;
  }
}

try {
  process.exitCode = await main();
} finally {
  await db.pool.end();
}
