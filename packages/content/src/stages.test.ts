import { describe, expect, it } from "vitest";
import { buildAllMaps } from "./maps/index.ts";
import { NARRATIVE } from "./narrative/index.ts";
import {
  OPENING_SCENES,
  playCondition,
  playSteps,
  resumeIndex,
  SCENES,
  sceneById,
  sceneLength,
  settle,
  stageMapOf,
  stagingOf,
} from "./stages.ts";

const scene = (id: string) => {
  const s = sceneById(id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};
const text = (key: string) => NARRATIVE.ko[key] ?? "";

describe("scene interpreter", () => {
  it("resumes after the last play met, never further back", () => {
    const stairs = scene("opening-b4");
    const plays = playSteps(stairs);
    expect(plays.length).toBe(7);
    expect(resumeIndex(stairs, 0)).toBe(0);
    expect(resumeIndex(stairs, 1)).toBe((plays[0] as number) + 1);
    expect(resumeIndex(stairs, 7)).toBe((plays[6] as number) + 1);
    // More met than there are is the end, not an error.
    expect(resumeIndex(stairs, 99)).toBe((plays[6] as number) + 1);
    expect(playCondition(stairs, 0)?.until).toBe("clear:landing-4f-first");
    expect(playCondition(stairs, 6)?.until).toBe("near:front-door");
    expect(playCondition(stairs, 7)).toBeUndefined();
  });

  it("settles a stage to how it stands at a step: lights, lasting effects, marks, offers", () => {
    const hum = scene("opening-b2");
    const end = settle(hum, hum.steps.length);
    expect(end.music).toBeNull();
    expect(end.fx.map((f) => f.fx)).toEqual(["lights-out", "rift-column", "columns-rise"]);
    expect(end.camera).toBe("window");
    expect(end.facing.player).toBe("up");

    const study = scene("opening-b1");
    // The 졸방대 talk is open until the first play is met, gone after.
    const offered = settle(study, playSteps(study)[0] as number);
    expect(offered.offers.map((o) => o.at)).toEqual(["standing-desk"]);
    expect(settle(study, (playSteps(study)[0] as number) + 1).offers).toEqual([]);
    expect(offered.music).toBe("night-study");

    const whistle = scene("opening-b6");
    expect(settle(whistle, whistle.steps.length)).toMatchObject({
      dark: true,
      at: { sagam: "field-center", player: "dorm", entropy: "rift" },
    });
  });

  it("times a shared scene by its waits, moves and lines", () => {
    const freed = scene("p1-zeno-freed");
    const ms = sceneLength(freed, text);
    expect(ms).toBeGreaterThan(20_000);
    expect(ms).toBeLessThan(120_000);
  });
});

describe("staging", () => {
  const maps = buildAllMaps().map((r) => r.map);

  it("puts every opening beat, cutscene and the 집 on a built map with their marks", () => {
    for (const id of [...OPENING_SCENES, ...NARRATIVE.cutscenes.map((c) => c.id)]) {
      const s = scene(id);
      const map = stageMapOf(maps, s.map);
      expect(map, id).toBeDefined();
      const staging = stagingOf(id);
      const cuts = Object.entries(staging.cuts ?? {}).flatMap(([at, spots]) => [
        at,
        ...Object.values(spots).map((p) => p.at),
      ]);
      const entered = Object.values(staging.enter).map((e) => (typeof e === "string" ? e : e.at));
      for (const mark of [staging.start, ...entered, ...cuts]) {
        if (mark && mark !== "@player") expect(map?.marks[mark], `${id} ${mark}`).toBeDefined();
      }
    }
  });

  it("plays the opening in private copies and the boss scenes for everyone present", () => {
    expect(OPENING_SCENES.every((id) => stagingOf(id).instance && !stagingOf(id).shared)).toBe(
      true,
    );
    for (const c of NARRATIVE.cutscenes.filter((c) => c.id !== "expel-home")) {
      expect(stagingOf(c.id).shared).toBe(true);
    }
    expect(stagingOf("expel-home")).toMatchObject({ instance: true, shared: false, skip: false });
    expect(SCENES.length).toBeGreaterThan(OPENING_SCENES.length + NARRATIVE.cutscenes.length);
  });
});
