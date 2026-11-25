import { describe, expect, it } from "vitest";
import { classImpact, HIT_RULES, type HitEvent, HitMixer } from "./hits.ts";

const KNOWN = new Set([
  "hit.math.light",
  "hit.math.heavy",
  "hit.math.crit",
  "hit.physics.light",
  "hit.physics.heavy",
  "sfx.book.wangdo.hit",
  "sfx.monster.odap.hit",
  "sfx.monster.odap.die",
]);
const mixer = () => new HitMixer((id) => KNOWN.has(id));
const own: HitEvent = { cls: "math", own: true, impact: "sfx.book.wangdo.hit" };

describe("hit mixer", () => {
  it("plays the first of a burst at once and voices the rest as one heavier hit", () => {
    const m = mixer();
    const first = m.hit(own, 0);
    expect(first.map((p) => p.id)).toEqual(["sfx.book.wangdo.hit"]);
    for (let i = 1; i < 5; i++) expect(m.hit(own, i * 0.008)).toEqual([]);
    expect(m.nextFlush()).toBeCloseTo(HIT_RULES.mergeOwn);
    expect(m.flush(0.02)).toEqual([]);
    const merged = m.flush(0.05);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("hit.math.heavy");
    expect(merged[0]?.gain).toBeGreaterThan(first[0]?.gain ?? 0);
    expect(m.stats.merged).toBe(4);
  });

  it("keeps a lone repeat light and stops when the burst ends", () => {
    const m = mixer();
    m.hit(own, 0);
    m.hit(own, 0.01);
    expect(m.flush(0.05)[0]?.id).toBe("sfx.book.wangdo.hit");
    expect(m.flush(0.2)).toEqual([]);
    expect(m.nextFlush()).toBe(Number.POSITIVE_INFINITY);
  });

  it("ranks own crits and kills above own hits, and own hits above anyone else's", () => {
    const m = mixer();
    expect(m.hit({ ...own, crit: true }, 0)[0]?.priority).toBe(2);
    expect(m.hit({ ...own, kill: true, death: "sfx.monster.odap.die" }, 0)[0]?.priority).toBe(2);
    expect(m.hit({ cls: "physics", own: true }, 0)[0]?.priority).toBe(1);
    expect(m.hit({ cls: "physics", own: false, dx: 10 }, 0)[0]?.priority).toBe(0);
  });

  it("fades, pans and finally drops other players' hits by distance", () => {
    const m = mixer();
    const near = m.hit({ cls: "physics", own: false, dx: HIT_RULES.falloff }, 0)[0];
    expect(near?.gain).toBeCloseTo(0.5);
    expect(near?.pan).toBeGreaterThan(0);
    expect(m.hit({ cls: "math", own: false, dx: -(HIT_RULES.hearing + 1) }, 1)).toEqual([]);
    expect(m.stats.culled).toBe(1);
  });

  it("caps how many other players' hits are heard each second", () => {
    const m = mixer();
    let heard = 0;
    for (let i = 0; i < 200; i++) {
      const cls = i % 2 ? "math" : "physics";
      heard += m.hit({ cls, own: false, heavy: i % 3 === 0, dx: 20 }, i / 200).length;
      heard += m.flush(i / 200).length;
    }
    expect(heard).toBeLessThanOrEqual(HIT_RULES.otherRate + HIT_RULES.otherRate / 4 + 1);
    expect(m.stats.limited + m.stats.merged).toBeGreaterThan(150);
  });

  it("adds the target's material to own hits, spaced out", () => {
    const m = mixer();
    const ids = m.hit({ ...own, material: "sfx.monster.odap.hit" }, 0).map((p) => p.id);
    expect(ids).toContain("sfx.monster.odap.hit");
    const again = m.hit({ cls: "physics", own: true, material: "sfx.monster.odap.hit" }, 0.03);
    expect(again.map((p) => p.id)).not.toContain("sfx.monster.odap.hit");
    expect(m.hit({ cls: "math", own: false, material: "sfx.monster.odap.hit" }, 1).length).toBe(1);
  });

  it("plays the death instead of the impact on a kill, falling back to the heavy impact", () => {
    const m = mixer();
    expect(m.hit({ ...own, kill: true, death: "sfx.monster.odap.die" }, 0)[0]?.id).toBe(
      "sfx.monster.odap.die",
    );
    expect(m.hit({ ...own, kill: true, death: "sfx.monster.unknown.die" }, 0.5)[0]?.id).toBe(
      classImpact("math", "heavy"),
    );
  });

  it("falls back to the class impact when a book cue does not exist yet", () => {
    const m = mixer();
    expect(m.hit({ cls: "physics", own: true, impact: "sfx.book.new.hit" }, 0)[0]?.id).toBe(
      "hit.physics.light",
    );
  });
});
