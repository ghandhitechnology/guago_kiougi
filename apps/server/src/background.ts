/**
 * Work the server runs on its own: promises nobody awaits (`background`) and the callbacks of
 * timers and listeners (`guarded`). Colyseus turns any uncaught exception into a shutdown of the
 * whole process, so one bug in one room's timer would end every player's session. Here a failure
 * is logged with what failed and where, counted by name for `/metrics`, and ends there: the next
 * tick runs again.
 */

import { describeError, pgErrorCode } from "./db/index.ts";

/** Failures by name since start, for `/metrics`: a callback that keeps failing shows here. */
const counts = new Map<string, number>();
/** Per name: when it was last logged and how many failures since were not. */
const logged = new Map<string, { at: number; quiet: number }>();
/** A name that keeps failing (a tick, 20 times a second) is logged at most this often. */
const LOG_EVERY_MS = 10_000;

/**
 * What the log line carries: the stack for a bug in our code, the safe summary for a database
 * error (its message can hold the query's parameters, password hashes included).
 */
function describe(error: unknown): string {
  if (error instanceof Error && !pgErrorCode(error).code && !("params" in error) && error.stack) {
    return error.stack;
  }
  return describeError(error);
}

/** Records one failure of `what`, logs it unless the same name just was. */
export function fault(what: string, error: unknown): void {
  counts.set(what, (counts.get(what) ?? 0) + 1);
  const now = Date.now();
  const last = logged.get(what);
  if (last && now - last.at < LOG_EVERY_MS) {
    last.quiet++;
    return;
  }
  const more = last?.quiet ? ` (${last.quiet} more since the last report)` : "";
  logged.set(what, { at: now, quiet: 0 });
  console.error(`${what} failed${more}: ${describe(error)}`);
}

/** Failures by name since start. */
export function faults(): Record<string, number> {
  return Object.fromEntries(counts);
}

export function background(what: string, work: Promise<unknown> | undefined): void {
  work?.catch((error: unknown) => fault(what, error));
}

/**
 * A timer or listener callback that cannot take the process down: a throw is a `fault`, and a
 * promise it returns runs in the `background`. Wrap it where it is registered:
 * `this.clock.setInterval(guarded("doors", () => this.refreshDoors()), DOORS_EVERY_MS)`.
 */
export function guarded<A extends unknown[]>(
  what: string,
  callback: (...args: A) => unknown,
): (...args: A) => void {
  return (...args: A) => {
    try {
      const out = callback(...args);
      if (out instanceof Promise) background(what, out);
    } catch (error) {
      fault(what, error);
    }
  };
}
