/**
 * A project-local PostgreSQL cluster in `.local/pg`, run with `initdb` and `pg_ctl` from the PATH.
 * No system service is touched. `start` creates the cluster and the dev and test databases on
 * first use; `reset` drops and remigrates the dev database.
 *
 *   node apps/server/src/db/local.ts start | stop | reset
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { createDb, migrateDb } from "./index.ts";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const HOME = path.join(ROOT, ".local/pg");
const DATA = path.join(HOME, "data");
const LOG = path.join(HOME, "postgres.log");
const PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
const USER = "guago";
const PASSWORD = "guago";
const DATABASES = ["guago_dev", "guago_test"];

// macOS postgres refuses to start with an unset or invalid locale ("postmaster became multithreaded").
const ENV = { ...process.env, LC_ALL: "C" };

const url = (db: string) => `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${db}`;

function running(): boolean {
  return spawnSync("pg_ctl", ["status", "-D", DATA], { stdio: "ignore", env: ENV }).status === 0;
}

async function start(): Promise<void> {
  mkdirSync(HOME, { recursive: true });
  if (!existsSync(path.join(DATA, "PG_VERSION"))) {
    const pwfile = path.join(HOME, "pwfile");
    writeFileSync(pwfile, PASSWORD, { mode: 0o600 });
    try {
      execFileSync(
        "initdb",
        [
          "-D",
          DATA,
          "-U",
          USER,
          `--pwfile=${pwfile}`,
          "--auth=scram-sha-256",
          "-E",
          "UTF8",
          "--locale=C",
        ],
        { stdio: ["ignore", "ignore", "inherit"], env: ENV },
      );
    } finally {
      rmSync(pwfile);
    }
    console.log(`created cluster in ${path.relative(ROOT, DATA)}`);
  }
  if (!running()) {
    // TCP on localhost only; no Unix socket, so the long worktree path never matters.
    const options = `-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=`;
    const result = spawnSync("pg_ctl", ["start", "-w", "-D", DATA, "-l", LOG, "-o", options], {
      stdio: "ignore",
      env: ENV,
    });
    if (result.status !== 0) {
      const tail = existsSync(LOG)
        ? readFileSync(LOG, "utf8").split("\n").slice(-8).join("\n")
        : "";
      throw new Error(`pg_ctl start failed (is port ${PORT} taken?)\n${tail}`);
    }
  }
  const admin = new pg.Client({ connectionString: url("postgres") });
  await admin.connect();
  try {
    for (const name of DATABASES) {
      const found = await admin.query("select 1 from pg_database where datname = $1", [name]);
      if (found.rowCount === 0) await admin.query(`create database ${name}`);
    }
  } finally {
    await admin.end();
  }
  const db = createDb(url("guago_dev"));
  try {
    await migrateDb(db);
  } finally {
    await db.pool.end();
  }
  console.log(`postgres on 127.0.0.1:${PORT} (${DATABASES.join(", ")})`);
}

function stop(): void {
  if (!running()) {
    console.log("postgres is not running");
    return;
  }
  execFileSync("pg_ctl", ["stop", "-w", "-D", DATA, "-m", "fast"], { stdio: "ignore", env: ENV });
  console.log("postgres stopped");
}

async function reset(): Promise<void> {
  if (!running()) await start();
  const admin = new pg.Client({ connectionString: url("postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists guago_dev with (force)");
    await admin.query("create database guago_dev");
  } finally {
    await admin.end();
  }
  const db = createDb(url("guago_dev"));
  try {
    await migrateDb(db);
  } finally {
    await db.pool.end();
  }
  console.log("guago_dev reset and migrated");
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") stop();
else if (command === "reset") await reset();
else {
  console.error("usage: local.ts start | stop | reset");
  process.exitCode = 1;
}
