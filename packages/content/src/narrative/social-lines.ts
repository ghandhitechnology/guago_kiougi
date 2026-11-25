/**
 * Social life (PLAN §12) as the player reads it: friends, parties and clubs changing, the
 * 대자보's sections and their empty states, report categories and the acknowledgement, the emote
 * wheel and club ranks. The server sends lists (`SocialEvent`); the client picks the line for
 * what changed. Club news a 짱 would say is in the 짱's voice; anything a player loses is plain.
 */
import { Writer } from "./author.ts";
import type { CopyPart, Slot, SystemMessage, Term } from "./schema.ts";

const w = new Writer("social");

const lines = (
  scope: string,
  entries: readonly (readonly [id: string, voice: string, text: string, slots?: readonly Slot[]])[],
): SystemMessage[] => {
  const s = w.scope(scope);
  return entries.map(([id, voice, text, slots]) => ({
    id: `social.${scope}.${id}`,
    voice,
    channel: "toast",
    text: s.t(text),
    slots: slots ?? [],
  }));
};

const P: readonly Slot[] = ["player"];
const C: readonly Slot[] = ["club"];

const EVENTS: readonly SystemMessage[] = [
  ...lines("friend", [
    ["request-in", "narrator", "{player|이} 친구 신청을 보냈다.", P],
    ["request-sent", "narrator", "{player}에게 친구 신청을 보냈다.", P],
    ["accepted", "narrator", "{player|와} 친구가 되었다.", P],
  ]),
  ...lines("party", [
    ["invite-in", "narrator", "{player|이} 파티에 불렀다.", P],
    ["invite-sent", "narrator", "{player}에게 파티 초대를 보냈다.", P],
    ["joined", "narrator", "파티에 들어갔다.", []],
    ["member-joined", "narrator", "{player|이} 파티에 들어왔다.", P],
    ["left", "narrator", "파티에서 나왔다.", []],
    ["member-left", "narrator", "{player|이} 파티에서 나갔다.", P],
    ["kicked", "narrator", "파티에서 빠졌다.", []],
    ["leader", "narrator", "이제 {player|이} 파티장이다.", P],
  ]),
  ...lines("club", [
    ["created", "narrator", "{club|을} 세웠다. 짱이 되었다.", C],
    ["invite-in", "club-leader", "우리 {club} 들어올래? 자리 있어.", C],
    ["invite-sent", "narrator", "{player}에게 가입 권유를 보냈다.", P],
    ["application-in", "narrator", "{player|이} 가입 신청서를 냈다.", P],
    ["application-sent", "narrator", "{club}에 가입 신청서를 냈다.", C],
    ["accepted", "club-leader", "합격. 오늘부터 {club} 부원이야.", C],
    ["declined", "narrator", "{club} 가입 신청이 받아들여지지 않았다.", C],
    ["joined", "narrator", "{club}에 들어갔다.", C],
    ["promoted", "club-leader", "오늘부터 부짱이야. 동아리실 열쇠는 네가 챙겨.", []],
    ["demoted", "narrator", "부원으로 돌아왔다.", []],
    ["handover", "club-leader", "이제 네가 짱이야. 회칙은 건드리지 마.", []],
    ["kicked", "narrator", "{club} 명단에서 이름이 빠졌다.", C],
    ["left", "narrator", "{club}에서 나왔다.", C],
    ["disbanded", "narrator", "{club|이} 해체되었다.", C],
  ]),
  ...lines("board", [
    ["empty-party", "narrator", "같이 가자는 글이 아직 없다.", []],
    ["empty-trade", "narrator", "팔 것도 살 것도 아직 붙지 않았다.", []],
    ["empty-club", "narrator", "홍보하는 동아리가 없다. 다들 조용히 모이는 중이다.", []],
    ["empty-chat", "narrator", "잡담 칸이 비어 있다. 드문 일이다.", []],
    ["empty-notice", "narrator", "이번 주 층장 공지는 아직 없다.", []],
    ["posted", "narrator", "대자보에 글을 붙였다. 이틀 뒤에 떨어진다.", []],
  ]),
  ...lines("report", [
    ["received", "office", "신고가 접수되었습니다. 알려 주셔서 고맙습니다.", []],
  ]),
];

const names = w.scope("term");
const term = (kind: Term["kind"], id: string, name: string): Term => ({
  id,
  kind,
  name: names.t(name),
});

const TERMS: readonly Term[] = [
  term("emote", "wave", "인사"),
  term("emote", "clap", "박수"),
  term("emote", "lol", "ㅋㅋ"),
  term("emote", "sleepy", "졸림"),
  term("emote", "fighting", "화이팅"),
  term("emote", "bow", "절"),
  term("emote", "dance", "춤"),
  term("emote", "meltdown", "멘붕"),
  term("board", "party", "파티 모집"),
  term("board", "trade", "거래"),
  term("board", "club", "동아리 홍보"),
  term("board", "chat", "잡담"),
  term("board", "notice", "층장 공지"),
  term("report", "abuse", "욕설이나 비하"),
  term("report", "sexual", "성적인 내용"),
  term("report", "spam", "도배나 광고"),
  term("report", "cheat", "부정행위"),
  term("report", "trade", "현금 거래"),
  term("report", "name", "부적절한 이름"),
  term("report", "other", "기타"),
  term("rank", "leader", "짱"),
  term("rank", "vice", "부짱"),
  term("rank", "member", "부원"),
  term("join", "open", "자유 가입"),
  term("join", "apply", "신청 가입"),
  term("join", "invite", "초대 가입"),
];

export const SOCIAL_COPY: CopyPart = { system: EVENTS, terms: TERMS, ko: w.ko };
