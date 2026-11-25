import { describe, expect, it } from "vitest";
import {
  BOARD_PIN_DAYS,
  BOARD_POST_HOURS,
  boardExpiry,
  CLUB_FEE,
  CLUB_MAX_LEVEL,
  CLUB_RANKS,
  type ClubAction,
  checkClubName,
  clubFee,
  clubLevel,
  clubLevelExp,
  clubMay,
  decodeEmblem,
  encodeEmblem,
  isBoardLive,
  payClubFee,
  socialSchema,
} from "./social.ts";

describe("club permissions", () => {
  const actions: ClubAction[] = ["invite", "review", "notice", "settings", "disband"];

  it("gives 짱 everything, 부짱 the officer work and 부원 nothing", () => {
    for (const action of actions) expect(clubMay("leader", action)).toBe(true);
    expect(actions.filter((a) => clubMay("vice", a))).toEqual(["invite", "review", "notice"]);
    expect(actions.filter((a) => clubMay("member", a))).toEqual([]);
  });

  it("acts on another member only from a higher rank", () => {
    const table = CLUB_RANKS.map((actor) =>
      CLUB_RANKS.map((target) => [
        clubMay(actor, "kick", target),
        clubMay(actor, "rank", target),
        clubMay(actor, "handover", target),
      ]),
    );
    expect(table).toEqual([
      // leader on leader, vice, member
      [
        [false, false, false],
        [true, true, true],
        [true, true, true],
      ],
      // vice: kicks 부원 only, never ranks or hands over
      [
        [false, false, false],
        [false, false, false],
        [true, false, false],
      ],
      // member
      [
        [false, false, false],
        [false, false, false],
        [false, false, false],
      ],
    ]);
  });

  it("needs a target for kick, rank and handover", () => {
    expect(clubMay("leader", "kick")).toBe(false);
    expect(clubMay("leader", "rank")).toBe(false);
    expect(clubMay("leader", "handover")).toBe(false);
  });
});

describe("club level", () => {
  it("climbs on the square curve and stops at the cap", () => {
    expect(clubLevel(0)).toBe(1);
    expect(clubLevel(clubLevelExp(2) - 1)).toBe(1);
    expect(clubLevel(clubLevelExp(2))).toBe(2);
    expect(clubLevel(clubLevelExp(5) + 1)).toBe(5);
    expect(clubLevel(1e15)).toBe(CLUB_MAX_LEVEL);
  });
});

describe("club fee", () => {
  it("scales ×10 a Page and books one sink entry", () => {
    expect(clubFee(1)).toBe(CLUB_FEE);
    expect(clubFee(3)).toBe(CLUB_FEE * 100);
    const paid = payClubFee({ pinecone: CLUB_FEE + 5 }, 1);
    expect(paid).toEqual({
      ok: true,
      purse: { pinecone: 5 },
      ledger: [{ currency: "pinecone", amount: -CLUB_FEE, key: "sink.club" }],
    });
    expect(payClubFee({ pinecone: CLUB_FEE - 1 }, 1)).toEqual({ ok: false, error: "insufficient" });
  });
});

describe("대자보 expiry", () => {
  it("lists a post for 48 hours and a pinned notice for the 층장 week", () => {
    const at = Date.UTC(2026, 10, 25);
    const post = { expiresAt: boardExpiry(at, "trade") };
    expect(post.expiresAt - at).toBe(BOARD_POST_HOURS * 3600_000);
    expect(isBoardLive(post, post.expiresAt - 1)).toBe(true);
    expect(isBoardLive(post, post.expiresAt)).toBe(false);
    expect(boardExpiry(at, "notice") - at).toBe(BOARD_PIN_DAYS * 24 * 3600_000);
  });
});

describe("club names", () => {
  it("takes 2 to 10 letters with single spaces between words", () => {
    expect(checkClubName("물리부")).toBeNull();
    expect(checkClubName("  Phys   Club ")).toBeNull();
    expect(checkClubName("가")).toBe("name_invalid");
    expect(checkClubName("가나다라마바사아자차카")).toBe("name_invalid");
    expect(checkClubName("물리!")).toBe("name_invalid");
  });
});

describe("emblem", () => {
  it("round-trips its compact form", () => {
    const e = { shape: "shield", shapeColor: "navy", symbol: "atom", symbolColor: "gold" };
    expect(decodeEmblem(encodeEmblem(e))).toEqual(e);
    expect(decodeEmblem("shield.navy.atom")).toBeUndefined();
  });
});

describe("request validators", () => {
  const ok = (type: Parameters<typeof socialSchema>[0], v: unknown) =>
    socialSchema(type)["~standard"].validate(v).issues === undefined;

  it("accepts the shapes the client sends and nothing else", () => {
    expect(ok("friend.request", { n: 1, name: "민지" })).toBe(true);
    expect(ok("friend.request", { n: 1, name: "민지", extra: 1 })).toBe(false);
    expect(ok("friend.request", { n: -1, name: "민지" })).toBe(false);
    expect(ok("friend.request", { n: 1, name: "<b>" })).toBe(false);
    expect(ok("block.add", { n: 1, id: "00000000-0000-4000-8000-000000000000" })).toBe(true);
    expect(ok("block.add", { n: 1 })).toBe(false);
    expect(ok("party.leave", { n: 3 })).toBe(true);
    expect(ok("board.post", { n: 1, cat: "notice", text: "x" })).toBe(false);
    expect(ok("board.post", { n: 1, cat: "trade", text: "x".repeat(5000) })).toBe(false);
    expect(ok("emote", { n: 1, e: "wave" })).toBe(true);
  });
});
