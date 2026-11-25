/**
 * School rules as lines the player receives (PLAN §11): 숙면, 졸음 and its two cures, the joke
 * awards being given, the weekly 층장, the 청소 당번 notice, the 상벌점 ledger's reason names and
 * the four 도감 sets. Each line is in the voice of whoever would deliver it.
 */
import { Writer } from "./author.ts";
import type { ChoreNotice, CopyPart, Slot, SystemMessage, Term } from "./schema.ts";

const w = new Writer("life");

const msg = (
  scope: ReturnType<Writer["scope"]>,
  id: string,
  voice: string,
  channel: SystemMessage["channel"],
  text: string,
  slots: readonly Slot[] = [],
): SystemMessage => ({ id, voice, channel, text: scope.t(text), slots });

// 숙면 and 졸음 ----------------------------------------------------------------------------------

const rest = w.scope("rest");
const RULE_LINES: readonly SystemMessage[] = [
  msg(rest, "rule.rested", "narrator", "toast", "푹 잤다. 오늘은 기상송도 덜 밉다."),
  msg(rest, "rule.drowsy", "narrator", "toast", "눈꺼풀이 무겁다. 같은 줄을 세 번째 읽는다."),
  msg(rest, "rule.drowsy-desk", "narrator", "toast", "졸방대에 서 있었더니 잠이 달아났다."),
  msg(rest, "rule.drowsy-drink", "narrator", "toast", "캔을 땄다. 심장이 먼저 깼다."),
];

// Awards ---------------------------------------------------------------------------------------

const given = w.scope("award-given");
const AWARD_LINES: readonly SystemMessage[] = [
  msg(
    given,
    "award.given.ate-it-all",
    "principal",
    "system",
    "이번 주 「다 먹었상」은 {player} 학생입니다. 급식실에서 직접 추천했습니다.",
    ["player"],
  ),
  msg(
    given,
    "award.given.caught",
    "principal",
    "system",
    "{player} 학생에게 「딱 걸렸상」을 수여합니다. 아테네 측에서도 얼굴을 외웠다고 합니다.",
    ["player"],
  ),
  msg(
    given,
    "award.given.attendance",
    "principal",
    "system",
    "{player} 학생이 한 달 동안 수행평가를 하루도 거르지 않았습니다. 「개근상」을 수여합니다.",
    ["player"],
  ),
  msg(
    given,
    "award.given.lay-down",
    "principal",
    "system",
    "{player} 학생에게 「누워 봤상」을 수여합니다. 보건실에서 확인해 주었습니다.",
    ["player"],
  ),
  msg(
    given,
    "award.given.played-piano",
    "principal",
    "system",
    "{player} 학생에게 「쳐 봤상」을 수여합니다. 4층 자습실까지 들렸다고 합니다.",
    ["player"],
  ),
];

// 층장 and 청소 당번 -----------------------------------------------------------------------------

const floor = w.scope("floor");
const FLOOR_LINES: readonly SystemMessage[] = [
  msg(
    floor,
    "floor-leaders",
    "sagam",
    "system",
    "이번 주 층장을 알립니다. {names}. 다섯 명은 사감실에서 완장을 받아 가십시오.",
    ["names"],
  ),
];

const chore = w.scope("chore");
const CHORES: readonly ChoreNotice[] = [
  {
    id: "cleaning",
    poster: chore.t("생활지도부"),
    title: chore.t("청소 당번"),
    body: chore.t("오늘 {place} 청소 당번임. 빗자루는 계단 밑. 끝나면 사감실에 알릴 것."),
    slots: ["place"],
  },
];

// Names ----------------------------------------------------------------------------------------

const names = w.scope("term");
const term = (kind: Term["kind"], id: string, name: string): Term => ({
  id,
  kind,
  name: names.t(name),
});

const TERMS: readonly Term[] = [
  term("badge", "floor-leader", "층장"),
  term("set", "p1-scientists", "고대 그리스의 과학자"),
  term("set", "p1-misconceptions", "고대 그리스의 오개념"),
  term("set", "launch-books", "입학 교재"),
  term("set", "campus", "해솔 교정"),
  term("conduct", "knockout", "기절"),
  term("conduct", "patrol", "위험 구역 적발"),
  term("conduct", "dorm-food", "기숙사 취식"),
  term("conduct", "chat", "채팅 규정 위반"),
  term("conduct", "expel", "명령퇴사"),
  term("conduct", "revive", "부축"),
  term("conduct", "help", "도움"),
  term("conduct", "cleaning", "청소 당번"),
  term("conduct", "floor-leader", "층장"),
  term("conduct", "merit.cancel", "상점으로 지움"),
];

// 도감 sets ------------------------------------------------------------------------------------

const sets = w.scope("codex-set");
const SET_LINES: readonly SystemMessage[] = [
  msg(
    sets,
    "codex-set.p1-scientists",
    "aristotle-freed",
    "dialogue",
    "과학자 칸을 다 채웠군. 내 이름도 거기 있다는 게 좀 민망하네.",
  ),
  msg(
    sets,
    "codex-set.p1-misconceptions",
    "entropy",
    "dialogue",
    "오개념 칸 다 찼다. 그래도 내일 또 나온다.",
  ),
  msg(
    sets,
    "codex-set.launch-books",
    "garam",
    "dialogue",
    "야, 교재 열 권 다 모았네. 나도 아직 못 했는데.",
  ),
  msg(
    sets,
    "codex-set.campus",
    "hyunwoo",
    "dialogue",
    "학교 다 돌아봤구나. 나는 1학년 때 4월이 돼서야 다 봤어.",
  ),
];

export const SCHOOL_LIFE_COPY: CopyPart = {
  system: [...RULE_LINES, ...AWARD_LINES, ...SET_LINES],
  announcements: FLOOR_LINES,
  chores: CHORES,
  terms: TERMS,
  ko: w.ko,
};
