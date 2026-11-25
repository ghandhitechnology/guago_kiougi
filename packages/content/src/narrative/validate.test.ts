import { describe, expect, it } from "vitest";
import { NARRATIVE } from "./index.ts";
import type { Narrative, Speaker } from "./schema.ts";
import { validateNarrative } from "./validate.ts";

const speaker = (id: string, register: Speaker["register"]): Speaker => ({
  id,
  name: `name.${id}`,
  register,
  faces: ["neutral"],
  role: "",
  habits: [],
  never: [],
  samples: [`sample.${id}.1`, `sample.${id}.2`, `sample.${id}.3`],
  donkatsu: `donkatsu.${id}`,
});

const baseKo: Record<string, string> = {
  "name.sagam": "권 사감",
  "name.cat": "엔트로피",
  "name.player": "{player}",
  "frame.heading": "상장",
  "frame.signature": "해솔과학고등학교장",
};
for (const id of ["sagam", "cat", "player"]) {
  for (const n of [1, 2, 3]) baseKo[`sample.${id}.${n}`] = id === "cat" ? "피해." : "확인했습니다.";
  baseKo[`donkatsu.${id}`] = id === "cat" ? "늦게 왔네." : "소진되었습니다.";
}

/** A narrative with one bark per text, so each case changes exactly one thing. */
function world(
  barks: Record<string, [speaker: string, text: string]>,
  ko: Record<string, string> = {},
): Narrative {
  const texts: Record<string, string> = { ...baseKo, ...ko };
  for (const [key, [, text]] of Object.entries(barks)) texts[key] = text;
  return {
    speakers: [speaker("sagam", "hapsyo"), speaker("cat", "banmal"), speaker("player", "haeyo")],
    opening: [],
    cutscenes: [],
    story: [],
    bosses: [],
    codex: [],
    barks: Object.entries(barks).map(([key, [who]]) => ({
      speaker: who,
      text: key,
      from: "p1.open",
    })),
    descriptions: [],
    quests: [],
    system: [],
    announcements: [],
    awards: [],
    awardFrame: { heading: "frame.heading", signature: "frame.signature" },
    eggs: [],
    ko: texts,
  };
}

const messages = (n: Narrative) => validateNarrative(n).map((p) => p.message);

describe("validateNarrative", () => {
  it("passes everything the hub and Page 1 ship", () => {
    expect(validateNarrative(NARRATIVE)).toEqual([]);
  });

  it("passes a clean fixture", () => {
    expect(
      messages(
        world({
          a: ["sagam", "점호 시간입니다. 복귀하십시오."],
          b: ["cat", "이해한 만큼 아프다."],
        }),
      ),
    ).toEqual([]);
  });

  it("fails on an unknown speaker", () => {
    expect(messages(world({ a: ["nobody", "안녕."] }))).toContain("unknown speaker nobody");
  });

  it("fails on a key with no text and on text no key points at", () => {
    const n = world({ a: ["sagam", "확인했습니다."] });
    const missing = {
      ...n,
      barks: [...n.barks, { speaker: "sagam", text: "gone", from: "p1.open" as const }],
    };
    expect(messages(missing)).toContain("missing text for key gone");
    expect(messages(world({}, { stray: "아무도 안 씀." }))).toContain("no data refers to this key");
  });

  it("fails on a line longer than the dialogue box", () => {
    const long = "가나다라마바사아자차카타파하 ".repeat(8);
    expect(
      messages(world({ a: ["cat", long] })).some((m) => m.includes("the dialogue box holds 3")),
    ).toBe(true);
  });

  it("fails when a 존댓말 speaker slips into 반말 and the other way round", () => {
    expect(
      messages(world({ a: ["sagam", "점호 시간이야."] })).some((m) =>
        m.includes("breaks the hapsyo register"),
      ),
    ).toBe(true);
    expect(
      messages(world({ a: ["cat", "피하세요."] })).some((m) =>
        m.includes("breaks the banmal register"),
      ),
    ).toBe(true);
  });

  it("reads -니까 as 반말 and -습니까 as 존댓말", () => {
    expect(messages(world({ a: ["cat", "멈출 까닭이 없으니까."] }))).toEqual([]);
    expect(
      messages(world({ a: ["cat", "점호 대상입니까?"] })).some((m) =>
        m.includes("breaks the banmal register"),
      ),
    ).toBe(true);
  });

  it("fails on characters the font lacks or the style bans", () => {
    expect(messages(world({ a: ["cat", "피해 — 지금."] })).some((m) => m.includes("refuse"))).toBe(
      true,
    );
  });
});
