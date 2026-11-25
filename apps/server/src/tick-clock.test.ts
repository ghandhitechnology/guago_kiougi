import { TICK_MS } from "@guago/shared";
import { describe, expect, it } from "vitest";
import { MAX_CATCH_UP, TickClock } from "./tick-clock.ts";

describe("room tick clock", () => {
  it("keeps tick numbers on wall time across a stall, running only a few of the missed ticks", () => {
    const clock = new TickClock(0);
    let numbered = 0;
    let ran = 0;
    let t = 0;
    const until = (end: number, every: number) => {
      for (; t < end; t += every) {
        const { run, skip } = clock.advance(t);
        expect(run).toBeLessThanOrEqual(MAX_CATCH_UP);
        numbered += run + skip;
        ran += run;
      }
    };
    until(1000, 5);
    t = 1250; // the event loop was blocked for a quarter of a second
    until(3000, 5);
    expect(numbered).toBe(Math.floor((t - 5) / TICK_MS));
    expect(ran).toBeLessThan(numbered);
  });
});
