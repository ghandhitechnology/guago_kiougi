import { WEEK_MS } from "@guago/shared";
import { describe, expect, it } from "vitest";
import { milestonesBetween, pageProgress } from "./lifecycle.ts";
import { MEALS, mealOf } from "./live.ts";

const T0 = 1_800_000_000_000;
const at = (weeks: number) => T0 + weeks * WEEK_MS;

describe("Page 1 lifecycle (PLAN §10)", () => {
  it("opens the town and fields 1 and 2 at week 0, the rest at week 2", () => {
    const w0 = pageProgress(1, T0, {}, at(0));
    expect(w0.milestone).toBe("p1.open");
    expect(w0.maps).toEqual(["p1-agora", "p1-colonnade", "p1-olive-road"]);
    expect(w0.frontierLevel).toBe(50);
    expect(w0.nextAt).toBe(at(2));
    const w2 = pageProgress(1, T0, {}, at(2));
    expect(w2.milestone).toBe("p1.wide");
    expect(w2.maps).toContain("p1-shadow-cave");
    expect(w2.frontierLevel).toBe(100);
  });

  it("brings mid boss 1 at week 3 and then waits for it to be freed", () => {
    const w9 = pageProgress(1, T0, {}, at(9));
    expect(w9.milestone).toBe("p1.pythagoreans");
    expect(w9.bosses).toEqual({ pythagoreans: "open", zeno: "sealed", aristotle: "sealed" });
    expect(w9.nextAt).toBeNull();
  });

  it("brings mid boss 2 at week 6 only once mid boss 1 is down, or right when it falls later", () => {
    const early = pageProgress(1, T0, { pythagoreans: at(4) }, at(5));
    expect(early.milestone).toBe("p1.pythagoreans-freed");
    expect(early.nextAt).toBe(at(6));
    expect(pageProgress(1, T0, { pythagoreans: at(4) }, at(6)).milestone).toBe("p1.zeno");
    const late = pageProgress(1, T0, { pythagoreans: at(7) }, at(7));
    expect(late.milestone).toBe("p1.zeno");
  });

  it("brings the era boss at week 10 if both mid bosses are down, then 시대 전환 a week after", () => {
    const freed = { pythagoreans: at(4), zeno: at(8) };
    expect(pageProgress(1, T0, freed, at(9.9)).milestone).toBe("p1.zeno-freed");
    expect(pageProgress(1, T0, freed, at(10)).milestone).toBe("p1.aristotle");
    const down = { ...freed, aristotle: at(12) };
    const sealing = pageProgress(1, T0, down, at(12.5));
    expect(sealing.milestone).toBe("p1.aristotle-freed");
    expect(sealing.nextAt).toBe(at(13));
    const sealed = pageProgress(1, T0, down, at(13));
    expect(sealed.milestone).toBe("p1.era-change");
    expect(sealed.sealed).toBe(true);
  });

  it("never counts a boss freed before it appeared", () => {
    expect(pageProgress(1, T0, { zeno: at(1) }, at(5)).bosses.zeno).toBe("sealed");
  });

  it("lists every milestone passed in order", () => {
    expect(milestonesBetween("p1.open", "p1.pythagoreans")).toEqual(["p1.wide", "p1.pythagoreans"]);
    expect(milestonesBetween("p1.wide", "p1.wide")).toEqual([]);
  });
});

describe("급식 rotation", () => {
  it("serves 짜장면 on Wednesday, the day its broadcast names", () => {
    // 2026-11-25 is a Wednesday; noon KST.
    const wednesday = Date.UTC(2026, 10, 25, 3);
    expect(mealOf(wednesday)).toMatchObject({ id: "jjajang", announce: "menu-wednesday" });
    expect(MEALS.filter((m) => m.announce)).toHaveLength(1);
  });
});
