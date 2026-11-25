import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Development only: the fight stage (`?fight=<map>&bots=<n>`) asks the dev server for fighting
 * bots, and this starts the load test's bots against the game server the dev server proxies to.
 * One set at a time; asking again replaces them, `n=0` stops them, closing the dev server too.
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
        const n = Math.max(
          0,
          Math.min(120, Number(new URL(req.url ?? "", "http://x").searchParams.get("n")) || 0),
        );
        stop();
        if (n > 0) {
          const root = path.resolve(import.meta.dirname, "../..");
          const ws = gameServer.replace(/^http/, "ws");
          child = spawn(
            process.execPath,
            [
              "tools/loadtest/src/main.ts",
              ...["--bots", String(n), "--seconds", "3600", "--warmup", "0"],
              ...["--url", ws, "--accounts", "stagebot"],
            ],
            { cwd: root, stdio: "ignore" },
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
