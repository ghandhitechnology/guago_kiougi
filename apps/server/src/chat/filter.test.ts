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
    expect(letters("\u1109\u1175\u1107\u1161\u11af")).toBe(letters("시발"));
  });

  it("marks only syllable-initial jamo as match starts", () => {
    const starts = skeleton("깃발").syms.map((s) => s.first);
    expect(starts).toEqual([true, false, false, true, false, false]);
  });

  it("reads a drawn-out vowel syllable as its vowel again", () => {
    expect(letters("시이이발")).toBe("ㅅㅣㅣㅣㅂㅏㄹ");
    expect(letters("시아발")).toBe("ㅅㅣㅇㅏㅂㅏㄹ");
  });
});

describe("chat filter", () => {
  it("masks plain hits one star per character and keeps the rest", () => {
    expect(masked("아 시발 진짜")).toBe("아 ** 진짜");
    expect(masked("what the fuck")).toBe("what the ****");
    expect(filter.check("그냥 안녕")).toEqual({
      text: "그냥 안녕",
      masked: false,
      hits: [],
      unreadable: false,
    });
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

  it.each([
    ["a Hangul filler inside the word", "시\u3164발", "***"],
    ["a half-width filler inside the word", "시\uffa0발", "***"],
    ["a zero-width space inside the word", "아시\u200b발", "아***"],
    ["a soft hyphen inside the word", "xfu\u00adck", "x*****"],
    ["a word joiner inside the word", "fu\u2060ck", "*****"],
  ])("does not let %s split it", (_, text, out) => {
    expect(masked(text)).toBe(out);
  });

  // Each of these once took from tens of milliseconds to over a second, or ran the step budget
  // out before reaching the word and let it through unmasked.
  const hostile: [string, string][] = [
    ["a run of conjoining jamo", `${"\u1109".repeat(160)}${"\u1107".repeat(319)}\u1175`],
    ["dollar padding", `${"$".repeat(85)} 시발`],
    ["digit padding", `${"1".repeat(85)} 시발`],
    ["mixed leet padding", `${"$1!|".repeat(110)} fuck`],
    ["a run of one jamo", `${"ㅅ".repeat(400)} 시발`],
    ["alternating jamo", `${"ㅅ1ㅣ1ㅣ1ㅣ1".repeat(60)}`],
    ["drawn-out vowels", `${"시이".repeat(200)}`],
  ];

  it.each(hostile)("reads %s within a few milliseconds", (_, text) => {
    // Best of five, so a busy test machine does not count against the filter.
    let best = Infinity;
    let result = filter.check(text);
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      result = filter.check(text);
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(10);
    expect(result.unreadable).toBe(false);
  });

  it.each(hostile.filter(([, text]) => text.endsWith("시발") || text.endsWith("fuck")))(
    "still masks a listed word after %s",
    (_, text) => {
      const result = filter.check(text);
      expect(result.masked).toBe(true);
      expect(result.text.endsWith(" **") || result.text.endsWith(" ****")).toBe(true);
    },
  );

  it("fails closed when the step budget runs out", () => {
    const starved = new ChatFilter({ part: ["시발"] }, 3);
    const result = starved.check("아 시발");
    expect(result).toMatchObject({ unreadable: true, masked: false });
  });
});
