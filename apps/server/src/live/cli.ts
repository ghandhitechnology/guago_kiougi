/**
 * The living world's admin commands, sent to the running server on this machine
 * (`POST /admin/live`, loopback only). PORT picks the server (default 2567).
 *
 *   pnpm live state                     the Page as the server sees it
 *   pnpm live step <1w|3d|5h|90m>       moves the server clock forward
 *   pnpm live rate <n>                  the clock's rate (1456 plays 13 weeks in 90 minutes)
 *   pnpm live free <boss> [name]        frees a boss, as the raid system will, with the final hit
 *   pnpm live notebook                  the 0조 연구노트
 *   pnpm live flush                     writes every pending grant and quest progress now
 *   pnpm live restart                   the Page starts over (LIVE_TEST_EVENTS=1 only)
 *   pnpm live event <name> <args…>      a combat or navigation event (LIVE_TEST_EVENTS=1 only)
 */
import { config } from "../config.ts";

const [command, ...args] = process.argv.slice(2);
const parse = (a: string) => {
  try {
    return JSON.parse(a);
  } catch {
    return a;
  }
};

const body: Record<string, unknown> = { cmd: command };
if (command === "step") body.by = args[0];
if (command === "rate") body.rate = Number(args[0]);
if (command === "free") {
  body.boss = args[0];
  if (args[1]) body.record = { finalHit: { id: args[2] ?? "", name: args[1] } };
}
if (command === "event") {
  body.name = args[0];
  body.args = args.slice(1).map(parse);
  body.flush = true;
}

const res = await fetch(`http://127.0.0.1:${config.port}/admin/live`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
console.log(JSON.stringify(await res.json(), null, 2));
process.exitCode = res.ok ? 0 : 1;
