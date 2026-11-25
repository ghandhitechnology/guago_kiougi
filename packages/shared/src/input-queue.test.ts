import { describe, expect, it } from "vitest";
import { INPUT_BURST, INPUT_QUEUE_MAX, InputQueue } from "./input-queue.ts";
import type { MoveInput } from "./movement.ts";

const input = (seq: number): MoveInput => ({ seq, mx: 127, my: 0 });

describe("input queue", () => {
  it("counts every input it costs, an overflow included", () => {
    const q = new InputQueue();
    for (let seq = 1; seq <= INPUT_QUEUE_MAX; seq++) expect(q.push(input(seq))).toBe(0);
    expect(q.push(input(INPUT_QUEUE_MAX + 1))).toBe(1); // pushes the oldest out
    expect(q.push(input(3))).toBe(1); // stale
    expect(q.dropped).toBe(2);
  });

  it("gives a client that stops and then floods no more than 5/4 speed, however it times it", () => {
    const q = new InputQueue();
    let seq = 0;
    const applied: number[] = [];
    for (let round = 0; round < 4; round++) {
      // Stand half a second to fill the bank, then send three inputs a tick for two seconds.
      for (let t = 0; t < 10; t++) applied.push(q.take().length);
      for (let t = 0; t < 40; t++) {
        for (let i = 0; i < 3; i++) q.push(input(++seq));
        applied.push(q.take().length);
      }
    }
    for (let i = 0; i + 8 <= applied.length; i++) {
      const window = applied.slice(i, i + 8).reduce((a, b) => a + b, 0);
      expect(window).toBeLessThanOrEqual(8 + 2);
    }
    // Over the whole run the flood bought no more than the bank: never ahead of the clock.
    expect(applied.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(applied.length + INPUT_BURST);
  });

  it("applies every input of an honest burst after a stall, in order, and drains the backlog", () => {
    const q = new InputQueue();
    const seqs: number[] = [];
    let seq = 0;
    let depthAfter = 0;
    for (let t = 0; t < 120; t++) {
      if (t === 20)
        for (let i = 0; i < 9; i++) q.push(input(++seq)); // nine ticks arrive at once
      else if (t > 20 || t < 11) q.push(input(++seq));
      seqs.push(...q.take().map((i) => i.seq));
      if (t === 119) depthAfter = q.length;
    }
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    expect(depthAfter).toBeLessThanOrEqual(1);
  });
});
