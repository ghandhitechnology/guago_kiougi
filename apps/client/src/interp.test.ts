import { TICK_MS } from "@guago/shared";
import { describe, expect, it } from "vitest";
import { ServerClock } from "./interp.ts";

/**
 * Patches every tick over a link with up to 20 ms of jitter whose delay grows by 100 ms for good
 * at ten seconds, as when the server loses time or the route changes. Returns how long, after
 * the change, other players are drawn past the newest patch and so stand frozen.
 */
function heldAfterShift(): { before: number; after: number } {
  const clock = new ServerClock();
  let jitter = 7;
  const arrivals: { at: number; tick: number }[] = [];
  for (let tick = 0; tick < 600; tick++) {
    jitter = (jitter * 1103515245 + 12345) % 2147483648;
    const delay = 80 + (jitter % 20) + (tick * TICK_MS >= 10_000 ? 100 : 0);
    arrivals.push({ at: tick * TICK_MS + delay, tick });
  }
  let next = 0;
  let newest = -1;
  let before = 0;
  let after = 0;
  for (let now = 0; now < 30_000; now += 1000 / 60) {
    while (next < arrivals.length && (arrivals[next] as { at: number }).at <= now) {
      const a = arrivals[next++] as { at: number; tick: number };
      clock.observe(a.tick, a.at);
      newest = Math.max(newest, a.tick);
    }
    if (newest < 0) continue;
    const t = clock.renderTime(now);
    if (now < 3000) continue;
    if (t > newest * TICK_MS) {
      if (now < 10_000) before += 1000 / 60;
      else after += 1000 / 60;
    }
  }
  return { before, after };
}

describe("render clock", () => {
  it("costs a lasting slowdown of the link about the slowdown, not seconds of frozen players", () => {
    const { before, after } = heldAfterShift();
    expect(before).toBe(0);
    expect(after).toBeLessThan(700);
  });
});
