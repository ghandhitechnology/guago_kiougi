/**
 * What the server does on its way down (PLAN §19: announce the restart, flush all state, exit).
 * Colyseus turns SIGTERM and SIGINT into `gracefullyShutdown`: it runs `beforeShutdown` steps,
 * closes every room (each leaving player's place is saved and their grants flushed by the
 * seats), then runs `onShutdown` steps, then exits. Any module registers its own step here.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { describeError } from "./db/index.ts";

type Run = () => unknown;
interface Step {
  name: string;
  run: Run;
}

/** No step may hold the exit longer than this. */
export const SHUTDOWN_STEP_MS = 10_000;

const before: Step[] = [];
const after: Step[] = [];

function register(list: Step[], name: string, run: Run): () => void {
  const step = { name, run };
  list.push(step);
  return () => {
    const i = list.indexOf(step);
    if (i >= 0) list.splice(i, 1);
  };
}

/** Runs while players are still connected (the restart announcement). Returns the unregister. */
export function beforeShutdown(name: string, run: Run): () => void {
  return register(before, name, run);
}

/** Runs after every room has closed, in the order registered. Returns the unregister. */
export function onShutdown(name: string, run: Run): () => void {
  return register(after, name, run);
}

async function runAll(list: Step[]): Promise<void> {
  for (const step of list.splice(0)) {
    try {
      await Promise.race([
        Promise.resolve().then(step.run),
        sleep(SHUTDOWN_STEP_MS).then(() => {
          throw new Error(`took over ${SHUTDOWN_STEP_MS} ms`);
        }),
      ]);
    } catch (error) {
      console.error(`shutdown step ${step.name} failed: ${describeError(error)}`);
    }
  }
}

/** Each list runs once; a failing or slow step does not stop the ones after it. */
export const runBeforeShutdown = (): Promise<void> => runAll(before);
export const runShutdown = (): Promise<void> => runAll(after);

/** Hooks both lists into a Colyseus server's graceful shutdown. */
export function installShutdown(server: {
  onBeforeShutdown(callback: () => Promise<void>): void;
  onShutdown(callback: () => Promise<void>): void;
}): void {
  server.onBeforeShutdown(runBeforeShutdown);
  server.onShutdown(runShutdown);
}
