import { describe, expect, it } from "vitest";
import { CHAT_MAX_LENGTH, cleanChatText } from "./chat.ts";

const clean = (raw: string) => {
  const r = cleanChatText(raw);
  return r.ok ? r.text : r.code;
};

describe("cleanChatText", () => {
  it("trims, collapses spaces and turns line breaks into spaces", () => {
    expect(clean("  안녕\n\t하세요   여러분 ")).toBe("안녕 하세요 여러분");
    expect(clean(" ⠀ ")).toBe("empty");
  });

  it("composes conjoining jamo and shows stray ones as typed letters", () => {
    expect(clean("\u1100\u1161\u11a8")).toBe("각");
    expect(clean("\u1109\u1107\u1175")).toBe("ㅅ비");
  });

  it("counts a run of conjoining jamo letter by letter, not as one character", () => {
    expect(clean(`${"\u1109".repeat(160)}${"\u1107".repeat(319)}\u1175`)).toBe("too_long");
    expect(clean("\u1109".repeat(CHAT_MAX_LENGTH))).toBe("ㅅ".repeat(CHAT_MAX_LENGTH));
  });

  it("drops invisible characters that would hide a word from the filter", () => {
    expect(clean("시\u3164발")).toBe("시발");
    expect(clean("시\uffa0발")).toBe("시발");
    expect(clean("아시\u200b발")).toBe("아시발");
    expect(clean("x\u200cfu\u00adck\u2060")).toBe("xfuck");
    expect(clean("\u202e안녕\u2066")).toBe("안녕");
  });

  it("keeps what emoji need", () => {
    for (const emoji of ["👩\u200d💻", "❤\ufe0f", "👍🏽", "🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}", "👨\u200d👩\u200d👧\u200d👦"])
      expect(clean(`좋아 ${emoji}`)).toBe(`좋아 ${emoji}`);
  });

  it("refuses one character piled with marks", () => {
    expect(clean(`a${"\u0301".repeat(30)}`)).toBe("too_long");
  });
});
