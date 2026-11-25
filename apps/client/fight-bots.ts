import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Development only: the fight stage (`?fight=<map>&bots=<n>`) asks the dev server for a crowd of
 * fighting bots around its student, and this starts them (`tools/loadtest/src/crowd.ts`) against
 * the game server the dev server proxies to. One crowd at a time; asking again replaces it, `n=0`
 * stops it, and so does closing the dev server.
 */
export function fightBots(gameServer: string): Plugin {
  let child: ChildProcess | null = null;
  const stop = () => {
    child?.kill();
    child = null;
  };
  return {
    name: "guago-fight-bots",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__fight/bots", (req, res) => {
        const q = new URL(req.url ?? "", "http://x").searchParams;
        const n = Math.max(0, Math.min(120, Number(q.get("n")) || 0));
        const follow = q.get("follow") ?? "";
        stop();
        if (n > 0) {
          const root = path.resolve(import.meta.dirname, "../..");
          mkdirSync(path.join(root, ".local"), { recursive: true });
          const log = openSync(path.join(root, ".local/crowd.log"), "w");
          const ws = gameServer.replace(/^http/, "ws");
          child = spawn(
            process.execPath,
            [
              "tools/loadtest/src/crowd.ts",
              ...["--bots", String(n), "--url", ws, "--follow", follow],
            ],
            { cwd: root, stdio: ["ignore", log, log] },
          );
          child.on("exit", () => {
            child = null;
          });
        }
        res.end(String(n));
      });
      server.httpServer?.on("close", stop);
    },
  };
}
