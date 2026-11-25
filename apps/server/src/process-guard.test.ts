import { describe, expect, it } from "vitest";
import { ANY_FAULT_LIMIT, faultPolicy, SAME_FAULT_LIMIT, WINDOW_MS } from "./process-guard.ts";

/** Errors thrown from one place each, so each has its own stack frame. */
const fromHere = () => new TypeError("l?.isOpen is not a function");
const elsewhere = (n: number) => new Error(`fault ${n}`);

describe("an uncaught fault", () => {
  it("keeps the server serving once, and stops it when the same fault keeps coming", () => {
    const t = 0;
    const decide = faultPolicy(() => t);
    for (let i = 1; i < SAME_FAULT_LIMIT; i++) expect(decide(fromHere())).toBe("serve");
    expect(decide(fromHere())).toBe("stop");
  });

  it("forgets faults older than the window", () => {
    let t = 0;
    const decide = faultPolicy(() => t);
    for (let i = 0; i < SAME_FAULT_LIMIT * 3; i++) {
      expect(decide(fromHere())).toBe("serve");
      t += WINDOW_MS / 2 + 1;
    }
  });

  it("stops on many different faults in the window", () => {
    const decide = faultPolicy(() => 0);
    for (let i = 1; i < ANY_FAULT_LIMIT; i++) expect(decide(elsewhere(i))).toBe("serve");
    expect(decide(elsewhere(ANY_FAULT_LIMIT))).toBe("stop");
  });
});
