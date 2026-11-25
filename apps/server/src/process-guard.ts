/**
 * What the game process does with an exception nobody caught (DECISIONS.md). Colyseus's own
 * handler shuts down and exits on the first one; it is turned off (`app.ts`) and this one is
 * installed by `index.ts` instead, with the signals Colyseus used to handle.
 *
 * Players' unsaved progress lives in this process, and most faults are one bad callback, not a
 * broken process: so a fault is logged and counted (`background.ts`), what can be saved is saved
 * at once, and the server keeps serving. A fault that keeps coming back (the same error from the
 * same place three times in a minute, or ten faults of any kind in a minute) means the process
 * is not recovering: it shuts down the graceful way (rooms save places, `shutdown.ts` steps run)
 * and exits 1 for the supervisor to restart it.
 *
 * Tests never install this: Vitest reports any uncaught error and fails the run.
 */
import { fault } from "./background.ts";

/** The same fault this many times within `WINDOW_MS` ends the process. */
export const SAME_FAULT_LIMIT = 3;
/** Any faults this many times within `WINDOW_MS` end the process. */
export const ANY_FAULT_LIMIT = 10;
export const WINDOW_MS = 60_000;

const SIGNALS = ["SIGINT", "SIGTERM", "SIGUSR2"] as const;

/** One fault's identity: its kind, message and the first frame of its stack. */
function signature(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 200);
  const frame = error.stack?.split("\n").find((l) => l.trim().startsWith("at ")) ?? "";
  return `${error.name}: ${error.message}\n${frame.trim()}`;
}

export interface ProcessGuardOptions {
  /** Shuts the game server down gracefully, then exits (Colyseus `gracefullyShutdown`). */
  shutdown(error?: Error): Promise<void>;
  /** Saves what can be saved without stopping anything: grants, quest progress, the chat log. */
  flush(): Promise<void>;
  now?: () => number;
}

/** Decides, per fault, whether the process keeps serving. Exposed for its unit test. */
export function faultPolicy(now: () => number = Date.now) {
  const recent: { key: string; at: number }[] = [];
  return (error: unknown): "serve" | "stop" => {
    const at = now();
    while (recent.length > 0 && at - (recent[0]?.at ?? at) > WINDOW_MS) recent.shift();
    const key = signature(error);
    recent.push({ key, at });
    const same = recent.filter((r) => r.key === key).length;
    return same >= SAME_FAULT_LIMIT || recent.length >= ANY_FAULT_LIMIT ? "stop" : "serve";
  };
}

export function installProcessGuard(o: ProcessGuardOptions): void {
  let stopping = false;
  const stop = (error?: Error) => {
    if (stopping) return;
    stopping = true;
    void o.shutdown(error);
  };
  for (const signal of SIGNALS) process.once(signal, () => stop());

  const decide = faultPolicy(o.now);
  // An unhandled rejection reaches here too: Node raises it as an uncaught exception.
  process.on("uncaughtException", (error, origin) => {
    fault(`uncaught ${origin === "unhandledRejection" ? "rejection" : "exception"}`, error);
    if (decide(error) === "stop") {
      console.error("the same fault keeps coming back: shutting down to be restarted");
      stop(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    o.flush().catch((e: unknown) => fault("flush after a fault", e));
  });
}
