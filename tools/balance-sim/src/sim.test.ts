import { expToNext } from "@guago/shared";
import { describe, expect, it } from "vitest";
import { newcomer, profiles } from "./profiles.ts";
import { simulate } from "./sim.ts";

// Guards the simulator's own bookkeeping, not the tuned outcome.
describe("balance simulator", () => {
  const casual = profiles()[0];
  if (!casual) throw new Error("no casual profile");

  it("replays the same run from the same seed", () => {
    expect(simulate(casual, 14, 5)).toEqual(simulate(casual, 14, 5));
  });

  it("books every 솔방울 it holds in the ledger", () => {
    const run = simulate({ ...casual, activeMinutes: 120 }, 21, 2);
    const booked = [...run.pinecones.values()].reduce((a, b) => a + b, 0);
    expect(booked).toBeCloseTo(run.purse.pinecone ?? 0, 3);
  });

  it("accounts for every point of EXP it awarded", () => {
    const run = simulate(newcomer(3), 21, 3);
    const awarded = [...run.expBySource.values()].reduce((a, b) => a + b, 0);
    const final = run.days.at(-1)?.level ?? 1;
    let held = run.exp;
    for (let l = 1; l < final; l++) held += expToNext(l);
    expect(held / awarded).toBeCloseTo(1, 9);
  });

  it("never loses a level and keeps books at or below their owner", () => {
    const run = simulate(casual, 28, 4);
    const levels = run.days.map((d) => d.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    for (const b of run.books) expect(b.level).toBeLessThanOrEqual(levels.at(-1) ?? 1);
  });
});
