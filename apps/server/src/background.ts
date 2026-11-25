/**
 * Work nobody awaits (a reload after an equip, a door, a reply, a timer): a failure is logged and
 * ends there. An unhandled rejection would reach Colyseus's process handler, which shuts the whole
 * server down for one database hiccup.
 */

import { describeError } from "./db/index.ts";

export function background(what: string, work: Promise<unknown> | undefined): void {
  work?.catch((error: unknown) => console.error(`${what} failed: ${describeError(error)}`));
}
