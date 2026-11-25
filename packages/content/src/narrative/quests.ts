/**
 * The 수행평가 board for Page 1 (PLAN §15, §24): forty notices a school would really pin up,
 * with slots for monster, count, place, item and NPC. Departments write in 개조식 (-할 것, -함);
 * a notice a character wrote by hand is in that character's voice and register.
 */
import { Writer } from "./author.ts";
import type { Milestone, QuestTemplate, Slot } from "./schema.ts";

const w = new Writer("quest");

const posters = w.scope("poster");
const P = {
  afterSchool: posters.t("방과후학교 운영부"),
  math: posters.t("수학과"),
  physics: posters.t("물리과"),
  chem: posters.t("화학과"),
  bio: posters.t("생명과학과"),
  earth: posters.t("지구과학과"),
  discipline: posters.t("생활지도부"),
  dorm: posters.t("사감실"),
  cafeteria: posters.t("급식실"),
  team0: posters.t("0조"),
  maker: posters.t("메이커실"),
  council: posters.t("학생회"),
  staff: posters.t("교무실"),
  aristarchus: posters.t("아리스타르코스"),
  gauss: posters.t("가우스실"),
  lyceum: posters.t("리케이온"),
} as const;

type Kind = QuestTemplate["kind"];
type Cadence = QuestTemplate["cadence"];

interface Notice {
  readonly id: string;
  readonly kind: Kind;
  readonly cadence: Cadence;
  readonly poster: string;
  readonly voice?: string;
  readonly from?: Milestone;
  readonly title: string;
  readonly body: string;
  readonly slots: readonly Slot[];
}

const q = w.scope("notice");
const notice = (n: Notice): QuestTemplate => ({
  id: n.id,
  kind: n.kind,
  cadence: n.cadence,
  poster: n.poster,
  ...(n.voice ? { voice: n.voice } : {}),
  ...(n.from ? { from: n.from } : {}),
  title: q.t(n.title),
  body: q.t(n.body),
  slots: n.slots,
});

const HUNT: Slot[] = ["monster", "count", "place"];
const COLLECT: Slot[] = ["item", "count", "place"];

export const QUESTS: readonly QuestTemplate[] = [
  // Hunt ---------------------------------------------------------------------------------------
  notice({
    id: "hunt-basic",
    kind: "hunt",
    cadence: "daily",
    poster: P.afterSchool,
    title: "균열 탐사 기본 실습",
    body: "{place}에서 {monster} {count}마리를 정리할 것. 실습 일지는 따로 걷지 않음.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-erase",
    kind: "hunt",
    cadence: "daily",
    poster: P.math,
    title: "오답 지우기",
    body: "{monster} {count}마리. 지운 자리에 자국이 남지 않게 할 것.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-traffic",
    kind: "hunt",
    cadence: "daily",
    poster: P.discipline,
    title: "통행 방해 해소",
    body: "{place}에 {monster|이} 몰려 통행이 어렵다는 신고가 들어옴. {count}마리 해산 바람.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-collision",
    kind: "hunt",
    cadence: "daily",
    poster: P.physics,
    title: "충돌 실험",
    body: "{monster} {count}마리. 되도록 서로 부딪히게 할 것. 결과는 물리과에서 대충 집계함.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-goggles",
    kind: "hunt",
    cadence: "daily",
    poster: P.chem,
    title: "반응 관찰",
    body: "{place}의 {monster} {count}마리를 처리할 것. 보안경 착용 필수. 미착용 시 집계하지 않음.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-population",
    kind: "hunt",
    cadence: "daily",
    poster: P.bio,
    title: "개체 수 조절",
    body: "{place}의 {monster} 개체 수가 늘고 있음. 번식하기 전에 {count}마리 줄일 것.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-forecast",
    kind: "hunt",
    cadence: "daily",
    poster: P.earth,
    title: "예보 검증",
    body: "{place}에 {monster|이} 몰릴 것으로 예보됨. {count}마리로 예보가 맞았는지 확인할 것.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-garam",
    kind: "hunt",
    cadence: "daily",
    poster: P.team0,
    voice: "garam",
    title: "야 이것 좀",
    body: "{monster} {count}마리만 잡아 줘. 나 메이커실에서 못 나가. 이유는 나중에.",
    slots: ["monster", "count"],
  }),
  notice({
    id: "hunt-hyunwoo",
    kind: "hunt",
    cadence: "daily",
    poster: P.team0,
    voice: "hyunwoo",
    title: "기록 부탁",
    body: "{place}에서 {monster} {count}마리. 잡은 자리는 내가 노트에 옮겨 적을게.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-patrol",
    kind: "hunt",
    cadence: "daily",
    poster: P.dorm,
    voice: "sagam",
    title: "야간 순찰 보조",
    body: "{place}에서 {monster} {count}마리를 정리하십시오. 정리 후 바로 복귀하십시오.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-weekly",
    kind: "hunt",
    cadence: "weekly",
    poster: P.afterSchool,
    title: "균열 탐사 주간 과제",
    body: "이번 주 안에 {monster} {count}마리. 일요일 밤 몰아치기는 권장하지 않음.",
    slots: ["monster", "count"],
  }),
  notice({
    id: "hunt-integers",
    kind: "hunt",
    cadence: "weekly",
    poster: P.math,
    title: "정수 검증",
    body: "{place}의 {monster} {count}마리. 결과는 정수로만 보고할 것. 반 마리는 인정하지 않음.",
    slots: HUNT,
  }),
  notice({
    id: "hunt-remedial",
    kind: "hunt",
    cadence: "repeat",
    poster: P.afterSchool,
    title: "보충 실습",
    body: "{monster} {count}마리. 반복 신청 가능. 단, 같은 날 신청할수록 점수가 줄어듦.",
    slots: ["monster", "count"],
  }),
  notice({
    id: "hunt-leftover",
    kind: "hunt",
    cadence: "repeat",
    poster: P.discipline,
    title: "잔여 오답 정리",
    body: "{place}에 남은 {monster|을} {count}마리 정리할 것. 정리한 자리는 원래대로.",
    slots: HUNT,
  }),

  // Collect ------------------------------------------------------------------------------------
  notice({
    id: "collect-sheets",
    kind: "collect",
    cadence: "daily",
    poster: P.maker,
    title: "낱장 수거",
    body: "{place}에서 {item} {count}개를 모아 메이커실로 가져올 것. 구겨진 것도 받음.",
    slots: COLLECT,
  }),
  notice({
    id: "collect-ink",
    kind: "collect",
    cadence: "daily",
    poster: P.chem,
    title: "잉크 보충",
    body: "{item} {count}개. 실험실 잉크가 바닥남. 맨손으로 만지지 말 것.",
    slots: ["item", "count"],
  }),
  notice({
    id: "collect-specimen",
    kind: "collect",
    cadence: "daily",
    poster: P.bio,
    title: "표본 채집",
    body: "{place}에서 {item} {count}개를 채집할 것. 표본병은 각자 준비.",
    slots: COLLECT,
  }),
  notice({
    id: "collect-rocks",
    kind: "collect",
    cadence: "daily",
    poster: P.earth,
    title: "암석 표본",
    body: "{place}에서 {item} {count}개. 이름표를 바꿔 붙이지 말 것. 이번에는 정말로.",
    slots: COLLECT,
  }),
  notice({
    id: "collect-ladle",
    kind: "collect",
    cadence: "daily",
    poster: P.cafeteria,
    voice: "cook",
    title: "국자 찾습니다",
    body: "{place} 어디에 국자를 흘렸어. {item} {count}개 주워 오는 김에 찾아 봐 줘. 계란 하나 더 줄게.",
    slots: COLLECT,
  }),
  notice({
    id: "collect-parts",
    kind: "collect",
    cadence: "daily",
    poster: P.team0,
    voice: "garam",
    title: "부품 구함",
    body: "{item} {count}개만. 고장 난 거 고치는 중이야. 뭔지는 묻지 마.",
    slots: ["item", "count"],
  }),
  notice({
    id: "collect-weekly",
    kind: "collect",
    cadence: "weekly",
    poster: P.afterSchool,
    title: "주간 교재 수거",
    body: "{item} {count}개를 모아 제출할 것. 제출처는 메이커실 제본대.",
    slots: ["item", "count"],
  }),
  notice({
    id: "collect-fall",
    kind: "collect",
    cadence: "repeat",
    poster: P.physics,
    title: "낙하 기록",
    body: "{place}에서 떨어진 {item|을} {count}개 주워 올 것. 떨어진 시각은 대충 적어도 됨.",
    slots: COLLECT,
  }),

  // Escort -------------------------------------------------------------------------------------
  notice({
    id: "escort-survey",
    kind: "escort",
    cadence: "daily",
    poster: P.aristarchus,
    voice: "aristarchus",
    title: "측량 동행",
    body: "{npc|을} {place}까지 데려다줘. 막대기를 들고 있어서 느려. 그림자는 밟지 말고.",
    slots: ["npc", "place"],
  }),
  notice({
    id: "escort-tour",
    kind: "escort",
    cadence: "daily",
    poster: P.afterSchool,
    title: "견학 인솔",
    body: "{npc|을} {place}까지 인솔할 것. 중간에 그림자를 따라가지 않게 주의.",
    slots: ["npc", "place"],
  }),
  notice({
    id: "escort-junior",
    kind: "escort",
    cadence: "daily",
    poster: P.gauss,
    voice: "pythagoreans",
    from: "p1.pythagoreans-freed",
    title: "막내 인솔",
    body: "{npc|을} {place}까지 데려가라. 대각선으로 걷게 하라. 연습 중이다.",
    slots: ["npc", "place"],
  }),
  notice({
    id: "escort-scribe",
    kind: "escort",
    cadence: "weekly",
    poster: P.lyceum,
    voice: "aristotle-freed",
    from: "p1.aristotle-freed",
    title: "표본 운반",
    body: "{npc|을} {place}까지 데려다주게. 표본 상자가 무거우니 서두르지 말게.",
    slots: ["npc", "place"],
  }),

  // No hit -------------------------------------------------------------------------------------
  notice({
    id: "nohit-clean",
    kind: "nohit",
    cadence: "daily",
    poster: P.math,
    title: "무결점 풀이",
    body: "{place}에서 쉬는 시간이 올 때까지 한 대도 맞지 말 것. 지운 자국이 있으면 감점.",
    slots: ["place"],
  }),
  notice({
    id: "nohit-uniform",
    kind: "nohit",
    cadence: "daily",
    poster: P.discipline,
    title: "단정한 복장",
    body: "{place}에서 한 차례 몰려오는 동안 맞지 말 것. 교복에 얼룩이 생기면 무효.",
    slots: ["place"],
  }),
  notice({
    id: "nohit-dodge",
    kind: "nohit",
    cadence: "daily",
    poster: P.physics,
    title: "회피 실험",
    body: "{place}, 한 차례 동안 피격 0회. 맞으면 운동량 손실로 처리함.",
    slots: ["place"],
  }),
  notice({
    id: "nohit-forecast",
    kind: "nohit",
    cadence: "weekly",
    poster: P.earth,
    title: "예보 따르기",
    body: "{place}에서 갈라지는 땅을 한 번도 밟지 말 것. 예보는 삼 초 전에 나감.",
    slots: ["place"],
  }),
  notice({
    id: "nohit-safe",
    kind: "nohit",
    cadence: "daily",
    poster: P.dorm,
    voice: "sagam",
    title: "무사 귀환",
    body: "{place}에서 한 차례를 다치지 않고 버티십시오. 보건실은 붐빕니다.",
    slots: ["place"],
  }),

  // Deliver ------------------------------------------------------------------------------------
  notice({
    id: "deliver-lunch",
    kind: "deliver",
    cadence: "daily",
    poster: P.cafeteria,
    voice: "cook",
    title: "도시락 배달",
    body: "{place}에 있는 {npc}한테 도시락 좀 갖다줘. 식기 전에.",
    slots: ["npc", "place"],
  }),
  notice({
    id: "deliver-papers",
    kind: "deliver",
    cadence: "daily",
    poster: P.staff,
    voice: "mo",
    title: "서류 전달",
    body: "이 서류 {npc}께 전해 줘요. 사인은 제가 했어요. 아마요.",
    slots: ["npc"],
  }),
  notice({
    id: "deliver-forms",
    kind: "deliver",
    cadence: "daily",
    poster: P.afterSchool,
    title: "수강 신청서 회수",
    body: "{place}의 {npc}에게 수강 신청서를 받아 올 것. 서명란 확인.",
    slots: ["npc", "place"],
  }),
  notice({
    id: "deliver-copy",
    kind: "deliver",
    cadence: "weekly",
    poster: P.team0,
    voice: "hyunwoo",
    title: "노트 복사본",
    body: "{npc}한테 노트 복사본 한 부 전해 줘. 페이지가 붙으면 같이 보게.",
    slots: ["npc"],
  }),
  notice({
    id: "deliver-calc",
    kind: "deliver",
    cadence: "daily",
    poster: P.aristarchus,
    voice: "aristarchus",
    title: "계산 전달",
    body: "이 계산, {place}에 있는 {npc}한테 보여 줘. 끝까지 읽어 달라고 해.",
    slots: ["npc", "place"],
  }),

  // Help ---------------------------------------------------------------------------------------
  notice({
    id: "help-hunt",
    kind: "help",
    cadence: "help",
    poster: P.council,
    title: "도움 요청",
    body: "{player} 학생이 {place}에서 도움을 요청함. 함께 {monster} {count}마리.",
    slots: ["player", "place", "monster", "count"],
  }),
  notice({
    id: "help-walk",
    kind: "help",
    cadence: "help",
    poster: P.council,
    title: "동행 구함",
    body: "{player} 학생과 {place}까지 동행할 것. 앞서 가지 말 것.",
    slots: ["player", "place"],
  }),
  notice({
    id: "help-finish",
    kind: "help",
    cadence: "help",
    poster: P.council,
    title: "선배 구함",
    body: "{player} 학생의 「{quest}」 마무리를 도울 것.",
    slots: ["player", "quest"],
  }),
  notice({
    id: "help-revive",
    kind: "help",
    cadence: "help",
    poster: P.dorm,
    voice: "sagam",
    title: "부축",
    body: "{place}에서 쓰러진 {player} 학생을 일으켜 세우십시오.",
    slots: ["player", "place"],
  }),
];

export const QUESTS_KO = w.ko;
