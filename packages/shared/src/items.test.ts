import { describe, expect, it } from "vitest";
import {
  addBookExp,
  type BookItem,
  bind,
  canEvolve,
  copiesForGrade,
  feedSheets,
  forge,
  forgeFee,
  mergeTools,
  pilgi,
  pilgiBaseChance,
  pilgiChance,
  pilgiCost,
  pilgiExpectedAttempts,
} from "./items.ts";
import { BookGrade, bookExpToNext } from "./numbers.ts";

const book = (over: Partial<BookItem> = {}): BookItem => ({
  id: "b1",
  def: "wangdo",
  grade: BookGrade.Textbook,
  level: 1,
  exp: 0,
  pilgi: 0,
  pilgiFails: 0,
  ...over,
});

describe("필기", () => {
  it("follows the PLAN §8 table", () => {
    expect([0, 4].map(pilgiBaseChance)).toEqual([1, 1]);
    expect([5, 6, 7, 8, 9].map(pilgiBaseChance)).toEqual([0.9, 0.8, 0.7, 0.6, 0.5]);
    expect([10, 14].map(pilgiBaseChance)).toEqual([0.45, 0.25]);
    expect(pilgiBaseChance(15)).toBe(0.2);
    expect(pilgiBaseChance(40)).toBe(0.2);
  });

  it("guarantees the ninth attempt at the 20% floor", () => {
    expect(pilgiChance(20, 7)).toBeCloseTo(0.9, 12);
    expect(pilgiChance(20, 8)).toBe(1);
  });

  it("costs 10 × 1.15ⁿ 잉크 and 100 × 1.15ⁿ × grade 솔방울, rounded up", () => {
    expect(pilgiCost(0, BookGrade.Textbook)).toEqual({ ink: 10, pinecone: 100 });
    expect(pilgiCost(10, BookGrade.Advanced)).toEqual({
      ink: Math.ceil(10 * 1.15 ** 10),
      pinecone: Math.ceil(100 * 1.15 ** 10 * 2.2),
    });
  });

  it("raises pity on failure and resets it on success, never downgrading", () => {
    const purse = { ink: 1000, pinecone: 100_000 };
    const fail = pilgi({ item: book({ pilgi: 10 }), purse }, 0.99);
    if (!fail.ok) throw new Error(fail.error);
    expect(fail.state.success).toBe(false);
    expect(fail.state.item.pilgi).toBe(10);
    expect(fail.state.item.pilgiFails).toBe(1);
    const cost = pilgiCost(10, BookGrade.Textbook);
    expect(fail.ledger).toEqual([
      { currency: "ink", amount: -cost.ink, key: "sink.pilgi" },
      { currency: "pinecone", amount: -cost.pinecone, key: "sink.pilgi" },
    ]);
    const win = pilgi({ item: fail.state.item, purse: fail.state.purse }, 0.5);
    if (!win.ok) throw new Error(win.error);
    expect(win.state.item.pilgi).toBe(11);
    expect(win.state.item.pilgiFails).toBe(0);
  });

  it("refuses an attempt it cannot pay for", () => {
    expect(pilgi({ item: book(), purse: { ink: 9, pinecone: 100 } }, 0)).toEqual({
      ok: false,
      error: "pilgi_cost",
    });
  });

  it("expects one try per guaranteed step and fewer than nine at the floor", () => {
    expect(pilgiExpectedAttempts(0, 5)).toBeCloseTo(5, 9);
    const floor = pilgiExpectedAttempts(20, 21);
    expect(floor).toBeGreaterThan(2);
    expect(floor).toBeLessThan(9);
  });
});

describe("제본 and 제련", () => {
  it("binds 20 sheets into a level 1 교과서", () => {
    const r = bind(
      { "sheet:wangdo": 25, binding: 1, pinecone: 500 },
      {
        id: "n",
        def: "wangdo",
        page: 1,
      },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.state.item).toMatchObject({ grade: BookGrade.Textbook, level: 1, pilgi: 0 });
    expect(r.state.purse).toEqual({ "sheet:wangdo": 5, binding: 0, pinecone: 300 });
  });

  it("forges three copies into the next grade, keeping the best level and 필기", () => {
    const copies = [
      book({ id: "a", level: 40, exp: 5 }),
      book({ id: "b", level: 12, pilgi: 9, pilgiFails: 2 }),
      book({ id: "c", level: 40, exp: 9 }),
    ];
    const r = forge({ pinecone: 10_000 }, copies, 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.item).toMatchObject({
      id: "c",
      grade: BookGrade.Reference,
      level: 40,
      exp: 9,
      pilgi: 9,
      pilgiFails: 2,
    });
    expect(r.state.consumed).toEqual(["a", "b"]);
    expect(r.ledger).toEqual([{ currency: "pinecone", amount: -1000, key: "sink.forge" }]);
  });

  it("refuses mixed or incomplete sets and the top grade", () => {
    const purse = { pinecone: 1e9 };
    expect(forge(purse, [book({ id: "a" }), book({ id: "b" })], 1).ok).toBe(false);
    expect(forge(purse, [book({ id: "a" }), book({ id: "a" }), book({ id: "c" })], 1).ok).toBe(
      false,
    );
    const mixed = [book({ id: "a" }), book({ id: "b" }), book({ id: "c", def: "graph-note" })];
    expect(forge(purse, mixed, 1).ok).toBe(false);
    const top = ["a", "b", "c"].map((id) => book({ id, grade: BookGrade.Original }));
    expect(forge(purse, top, 1).ok).toBe(false);
  });

  it("scales the fee with grade and Page", () => {
    expect(forgeFee(BookGrade.Textbook, 1)).toBe(1000);
    expect(forgeFee(BookGrade.Major, 1)).toBe(27_000);
    expect(forgeFee(BookGrade.Textbook, 3)).toBe(100_000);
    expect(copiesForGrade(BookGrade.Advanced)).toBe(9);
  });
});

describe("book levels", () => {
  it("levels with EXP but never past its owner", () => {
    const need = bookExpToNext(1) + bookExpToNext(2);
    expect(addBookExp(book(), need, 10).level).toBe(3);
    const capped = addBookExp(book({ level: 5 }), 1e12, 5);
    expect(capped.level).toBe(5);
    expect(capped.exp).toBe(bookExpToNext(5));
    expect(addBookExp(capped, 0, 6).level).toBe(6);
  });

  it("turns twenty fed sheets into about one level", () => {
    const r = feedSheets({ item: book({ level: 30 }), purse: { "sheet:wangdo": 20 } }, 20, 50);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.item.level).toBe(31);
    expect(r.ledger).toEqual([{ currency: "sheet:wangdo", amount: -20, key: "sink.feed" }]);
  });
});

describe("tools and evolution", () => {
  it("merges duplicates up to level 5", () => {
    const r = mergeTools(
      { id: "t1", def: "compass", level: 3 },
      { id: "t2", def: "compass", level: 4 },
    );
    expect(r.ok && r.state.level).toBe(5);
    expect(
      mergeTools({ id: "t1", def: "compass", level: 5 }, { id: "t2", def: "compass", level: 1 }).ok,
    ).toBe(false);
    expect(
      mergeTools({ id: "t1", def: "compass", level: 1 }, { id: "t2", def: "battery", level: 1 }).ok,
    ).toBe(false);
  });

  it("evolves at 심화서, level 100 and the linked tool at 5 after 3학년", () => {
    const ready = book({ grade: BookGrade.Advanced, level: 100 });
    const tool = { id: "t", def: "compass", level: 5 };
    expect(canEvolve(ready, tool, "compass", true)).toBe(true);
    expect(canEvolve(ready, tool, "compass", false)).toBe(false);
    expect(canEvolve({ ...ready, grade: BookGrade.Reference }, tool, "compass", true)).toBe(false);
    expect(canEvolve({ ...ready, level: 99 }, tool, "compass", true)).toBe(false);
    expect(canEvolve(ready, { ...tool, level: 4 }, "compass", true)).toBe(false);
    expect(canEvolve(ready, { ...tool, def: "battery" }, "compass", true)).toBe(false);
  });
});
