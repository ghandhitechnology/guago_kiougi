import { describe, expect, it } from "vitest";
import { ChatFilter, skeleton } from "./filter.ts";

const filter = ChatFilter.fromFile();
const masked = (text: string) => filter.check(text).text;
const caught = (text: string) => filter.check(text).masked;

describe("skeleton", () => {
  const letters = (text: string) =>
    skeleton(text)
      .syms.map((s) => s.alts[0])
      .join("");

  it("splits syllables, doubled consonants and compound vowels into single jamo", () => {
    expect(letters("씨발")).toBe("ㅅㅅㅣㅂㅏㄹ");
    expect(letters("ㅆㅣ발")).toBe("ㅅㅅㅣㅂㅏㄹ");
    expect(letters("봤")).toBe("ㅂㅗㅏㅅㅅ");
  });

  it("drops spacing and punctuation, lower-cases and unfolds full-width and accents", () => {
    expect(letters("Ｆ.ü c-K")).toBe("fuck");
  });

  it("reads conjoining jamo the same as composed syllables", () => {
    expect(letters("시발")).toBe(letters("시발"));
  });

  it("marks only syllable-initial jamo as match starts", () => {
    const starts = skeleton("깃발").syms.map((s) => s.first);
    expect(starts).toEqual([true, false, false, true, false, false]);
  });

  it("marks a drawn-out vowel syllable as skippable", () => {
    expect(skeleton("시이이발").syms.map((s) => s.opt)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(skeleton("시아발").syms.some((s) => s.opt)).toBe(false);
  });
});

describe("chat filter", () => {
  it("masks plain hits one star per character and keeps the rest", () => {
    expect(masked("아 시발 진짜")).toBe("아 ** 진짜");
    expect(masked("what the fuck")).toBe("what the ****");
    expect(filter.check("그냥 안녕")).toEqual({ text: "그냥 안녕", masked: false, hits: [] });
  });

  it.each([
    ["spaces between syllables", "시 발", "* *"],
    ["symbols between letters", "f.u.c.k", "*******"],
    ["repeated letters", "fuuuuck", "*******"],
    ["drawn-out vowels", "시이이발", "****"],
    ["tense consonants", "씨발", "**"],
    ["doubled consonants", "씨빨놈", "**놈"],
    ["jamo typed one by one", "ㅅㅣㅂㅏㄹ", "*****"],
    ["mixed syllables and jamo", "시ㅂㅏㄹ", "****"],
    ["a digit for a vowel", "ㅅ1발", "***"],
    ["a digit as noise", "시0발", "***"],
    ["digits for letters", "sh1t", "****"],
    ["symbols for letters", "a$$", "***"],
    ["full-width letters", "ｆｕｃｋ", "****"],
    ["Cyrillic look-alikes", "fuсk", "****"],
    ["English keyboard Korean", "tlqkf", "*****"],
    ["one syllable per word", "존 나 웃겨", "* * 웃겨"],
    ["a particle after a spaced word", "병 신아", "* *아"],
    ["jamo abbreviations", "ㅅㅂ 뭐야", "** 뭐야"],
    ["a compound jamo", "ㅄ아", "*아"],
    ["a word entry with a suffix", "you asses", "you ***es"],
  ])("catches %s", (_, text, out) => {
    expect(masked(text)).toBe(out);
  });

  it.each([
    ["깃발", "a final ㅅ followed by 발"],
    ["시바견 귀여워", "시바 is a dog, only 씨바 is listed"],
    ["시바라기", "시발 must end on a syllable"],
    ["어제 시발점에서 만나", "allowed compound"],
    ["보존 나무", "a spaced match must start a word"],
    ["질병 신고", "a spaced match must start a word"],
    ["그 병 신고했어", "a spaced match must end a word or a particle"],
    ["질병신고 했어", "allowed compound"],
    ["새끼손가락", "only 개새끼 is listed"],
    ["미친 듯이 좋아", "only 미친놈 and friends are listed"],
    ["옷밥 ㅋㅋ", "ㅅㅂ split out of syllables is not the abbreviation"],
    ["class assess pass bass", "ass is a word entry"],
    ["cockpit peacock", "cock is a word entry"],
    ["Scunthorpe", "allowed"],
    ["shiitake", "allowed"],
    ["Dickens", "dick is a word entry"],
    ["Fukushima", "fuk is a word entry"],
  ])("leaves %s alone (%s)", (text) => {
    expect(caught(text)).toBe(false);
  });

  it("swaps the list in place", () => {
    const own = new ChatFilter({ part: ["바보"] });
    expect(own.check("바보야").text).toBe("**야");
    own.replace({ part: ["멍청이"] });
    expect(own.check("바보야").masked).toBe(false);
  });

  it("stays fast on long hostile input", () => {
    const start = performance.now();
    filter.check("ㅅ1ㅣ1ㅣ1ㅣ1".repeat(60));
    filter.check("시이".repeat(60));
    expect(performance.now() - start).toBeLessThan(200);
  });
});
