/**
 * The living world for integration tests: the real service, never a bare object cast to its
 * type. Map rooms, the 집 and the entry route call `live()` from their own timers at any moment,
 * so whatever `provideLive` holds must answer every method, or one of those timers throws and
 * Colyseus shuts the test's server down.
 */

import type { Db } from "../db/index.ts";
import { createEconomy } from "../economy/index.ts";
import { LiveClock } from "../live/clock.ts";
import { live, provideLive } from "../live/current.ts";
import { createLive, type Live } from "../live/index.ts";
import { PageClock } from "../live/page.ts";

/** A living world on the wall clock, not ticking on its own: tests drive it. */
export async function testLive(db: Db): Promise<Live> {
  const clock = new LiveClock({ realMs: Date.now(), gameMs: Date.now(), rate: 1 });
  const page = new PageClock(db, clock);
  await page.load(1);
  let made: Live | undefined;
  const economy = createEconomy(db, {
    now: () => clock.date(),
    page: page.live,
    onApplied: (id, name, r) => made?.onApplied(id, name, r),
  });
  made = createLive(db, { clock, page, economy, world: () => undefined, log: () => {} });
  return made;
}

/**
 * Runs `work` with the provided living world's events partly replaced, then puts the real one
 * back. Everything else the world answers is still the real service's.
 */
export async function withLiveEvents<T>(
  events: Partial<Live["events"]>,
  work: () => Promise<T>,
): Promise<T> {
  const real = live();
  if (!real) throw new Error("provide a real living world before replacing its events");
  provideLive({ ...real, events: { ...real.events, ...events } });
  try {
    return await work();
  } finally {
    provideLive(real);
  }
}
