/**
 * The opening sequence (PLAN §4 "Opening sequence"): eight beats, about eight minutes playable.
 * Tutorial information is carried by people and things: the cat says the book is a weapon,
 * the seniors show their kits, the log book shows the time. Prompts are icons at a spot.
 */
import {
  anim,
  camera,
  face,
  fx,
  move,
  music,
  play,
  sound,
  system,
  Writer,
  wait,
} from "./author.ts";
import type { OpeningBeat } from "./schema.ts";

const w = new Writer("opening");

// 1. 23:38, 자습실 ---------------------------------------------------------------------------

const b1 = w.scope("b1-study-hall");
const studyHall: OpeningBeat = {
  id: "b1-study-hall",
  teaches: "Movement and interaction. The log book plants the notebook's handwriting.",
  scene: {
    id: "opening-b1",
    map: "study-hall",
    cast: ["player", "senior-earth"],
    marks: ["seat", "clock", "cooler", "logbook", "standing-desk"],
    steps: [
      music("night-study"),
      sound("fluorescent"),
      fx("fade-in"),
      camera("clock", 900),
      wait(800),
      camera("seat", 900),
      anim("player", "stretch"),
      b1.offer("standing-desk", [
        b1.line("senior-earth", "…졸방대는 서서 쓰는 거야. 나 서 있어.", "asleep"),
        b1.line("senior-earth", "…오늘 밤은 맑겠다.", "asleep"),
      ]),
      play("near:cooler", "move", "player"),
      play("interact:logbook", "interact", "logbook"),
      b1.doc("이동 기록부 · 4층 자습실", [
        ["21:31  보건실  2-1 배도윤  손가락 끼임", "student"],
        ["22:47  정수기  1-2 김하람", "student"],
        ["23:05  화장실  3-1 한소율", "student"],
        ["23:12  교무실  2-3 윤서하  서류", "seoha"],
        ["23:12  교무실  2-3 도현우  서류", "student"],
        ["23:12  교무실  2-4 민가람  서류", "student"],
        ["23:40  운동장", "stranger"],
        ["23:38  정수기  {player}", "student"],
      ]),
      anim("player", "drink"),
    ],
  },
};

// 2. 23:40 ------------------------------------------------------------------------------------

const b2 = w.scope("b2-hum");
const hum: OpeningBeat = {
  id: "b2-hum",
  teaches: "Tone shift.",
  scene: {
    id: "opening-b2",
    map: "study-hall",
    cast: ["player", "senior-earth"],
    marks: ["cooler", "window", "field"],
    steps: [
      sound("floor-hum"),
      fx("hum"),
      fx("shake"),
      fx("lights-flicker"),
      wait(700),
      fx("lights-out"),
      music(null),
      b2.bubble("senior-earth", "예보에 없었는데."),
      face("player", "up"),
      camera("window", 1200),
      fx("rift-column", "field"),
      fx("columns-rise", "field"),
      wait(1600),
    ],
  },
};

// 3. The page ---------------------------------------------------------------------------------

const b3 = w.scope("b3-page");
const page: OpeningBeat = {
  id: "b3-page",
  teaches: "First book equipped. The cat's two canon lines.",
  scene: {
    id: "opening-b3",
    map: "study-hall",
    cast: ["player", "entropy"],
    marks: ["window", "sill", "stairs"],
    steps: [
      sound("page-flutter"),
      fx("page-gust", "window"),
      camera("player", 500),
      fx("book-glow", "player"),
      move("entropy", "sill", 400),
      b3.say("entropy", "그거, 이제 무기야.", "alert"),
      b3.ask("entropy", "이해한 만큼 아프다.", "neutral", [
        ["고양이가… 말을 해요?", [b3.line("entropy", "여기선.")]],
        ["…이걸로요?", [b3.line("entropy", "응.")]],
      ]),
      sound("odap-swarm"),
      fx("shake"),
      b3.say("entropy", "온다."),
      move("entropy", "stairs", 600),
    ],
  },
};

// 4. The corridor -----------------------------------------------------------------------------

const b4 = w.scope("b4-stairs");
const stairs: OpeningBeat = {
  id: "b4-stairs",
  teaches:
    "Attacks run by themselves while the player moves; telegraphs; knockback; status order; control modes and the manual bonus; minions. Each senior shows a class kit.",
  scene: {
    id: "opening-b4",
    map: "gaseolgwan-stairs",
    cast: [
      "player",
      "entropy",
      "senior-earth",
      "senior-physics",
      "senior-chem",
      "senior-math",
      "senior-bio",
      "odap",
    ],
    marks: ["landing-4f", "landing-3f", "landing-2f", "lobby-1f", "front-door"],
    steps: [
      fx("odap-surge", "landing-4f"),
      b4.say("entropy", "걸어. 책은 알아서 친다."),
      play("clear:landing-4f-first", "move", "player"),
      move("senior-earth", "landing-4f", 900),
      b4.say("senior-earth", "1학년이네. 삼 초 뒤에 갈라지겠다. 비켜 있어."),
      fx("fault-crack", "landing-4f"),
      play("clear:landing-4f"),
      b4.say("senior-earth", "아래층은 더 몰리겠다. 내려가."),

      camera("landing-3f"),
      b4.say("senior-physics", "오, 1학년? 2주 차에 이런 걸 보네. 운 좋다."),
      b4.say("senior-physics", "밀어서 뒤에 놈한테 박아. 박힌 놈도 아파. 운동량은 어디 안 가."),
      play("clear:landing-3f"),

      camera("landing-2f"),
      b4.say("senior-chem", "보안경 쓰세요. 지금 이 계단 전체가 실험대예요."),
      b4.say("senior-chem", "먼저 묻히고 나중에 불 붙이세요. 순서 바꾸면 덜 타요."),
      play("clear:landing-2f"),

      camera("lobby-1f"),
      b4.say("senior-math", "한 놈만 계속 때려. 열 번 쌓이면 방어고 뭐고 없어."),
      b4.say("senior-math", "손으로 겨누면 십 퍼센트 더 들어가. 전부 손으로 하면 이십."),
      play("mode-cycled", "mode", "player"),
      play("clear:lobby-1f"),

      camera("front-door"),
      b4.say("senior-bio", "내 세포 밟지 마. 지금 분열 중이야."),
      b4.say("senior-bio", "문은 얘네가 지켜. 다치면 얘네 옆에 서. 조금씩 낫는다."),
      play("near:front-door", "move", "front-door"),
    ],
  },
};

// 5. The field --------------------------------------------------------------------------------

const b5 = w.scope("b5-field");
const field: OpeningBeat = {
  id: "b5-field",
  teaches:
    "Dodging, hitstop, a first drop. The tortoise and the silhouette foreshadow Zeno and Aristotle.",
  scene: {
    id: "opening-b5",
    map: "field-night",
    cast: ["player", "entropy", "tortoise", "aristotle", "odap-golem", "odap"],
    marks: ["field-edge", "rift", "colonnade", "tortoise-path", "golem-rise", "lectern"],
    steps: [
      music("rift-first"),
      camera("rift", 1400),
      move("tortoise", "tortoise-path", 6000),
      camera("field-edge", 900),
      b5.offer("tortoise-path", [b5.line("entropy", "거북이는 쫓지 마. 저건 안 잡힌다.")]),
      b5.bubble(
        "aristotle",
        "…그러므로 무거운 것은 더 빨리 떨어지네. 누구든 보면 알 걸세.",
        "lecture",
      ),
      play("near:colonnade", "move", "colonnade"),
      fx("golem-rise", "golem-rise"),
      b5.say("entropy", "오답노트다. 고친 적은 없는 거."),
      play("golem-telegraph"),
      b5.say("entropy", "피해."),
      play("dodged:odap-golem", "dodge", "player"),
      play("defeat:odap-golem"),
      fx("drop-pop", "golem-rise"),
      b5.say("entropy", "주워."),
      play("pickup:first-drop", "move", "golem-rise"),
    ],
  },
};

// 6. The whistle ------------------------------------------------------------------------------

const b6 = w.scope("b6-whistle");
const whistle: OpeningBeat = {
  id: "b6-whistle",
  teaches: "벌점. The school outranks the apocalypse.",
  scene: {
    id: "opening-b6",
    map: "field-night",
    cast: ["player", "entropy", "sagam", "aristotle", "tortoise", "odap", "senior-physics"],
    marks: ["field-edge", "field-center", "rift", "dorm"],
    steps: [
      sound("whistle"),
      sound("whistle"),
      fx("freeze-field"),
      anim("tortoise", "head-in"),
      move("sagam", "field-center", 2400),
      b6.say("sagam", "점호 시간입니다. 전원 기숙사로 복귀하십시오.", "whistle"),
      b6.say("sagam", "0시 30분. 운동장에 있는 학생 전원, 벌점 1점입니다."),
      system("demerit.curfew"),
      b6.bubble("senior-physics", "…나도냐."),
      face("sagam", "up"),
      b6.say("sagam", "저것은 내일 아침 교무 회의 안건으로 올리겠습니다."),
      b6.say("sagam", "돌아가십시오."),
      move("player", "dorm", 2000),
      move("entropy", "rift", 2000),
      fx("fade-out"),
    ],
  },
};

// 7. Morning assembly -------------------------------------------------------------------------

const b7 = w.scope("b7-assembly");
const b7b = w.scope("b7-notebook");
const assembly: OpeningBeat = {
  id: "b7-assembly",
  teaches: "The quest board and the shared goal: twelve stubs where pages used to be.",
  scene: {
    id: "opening-b7",
    map: "gym",
    cast: ["player", "principal", "sagam", "mo", "hyunwoo", "garam"],
    marks: ["stage", "rows", "board"],
    steps: [
      sound("wake-song"),
      fx("fade-in"),
      music("school-theme"),
      camera("stage", 900),
      b7.say("principal", "여러분, 앉으십시오. 짧게 하겠습니다."),
      b7.say(
        "principal",
        "어젯밤 운동장에 생긴 일을 알려 드리겠습니다. 오늘 아침 7시에 교육청과 통화를 마쳤습니다.",
      ),
      b7.say(
        "principal",
        "오늘부터 이 현상은 방과후학교 프로그램 「균열 탐사(심화)」로 운영합니다. 수행평가의 20퍼센트로 반영합니다.",
      ),
      b7.say(
        "principal",
        "수강 신청서는 R&E 담당 모 선생님께 내면 됩니다. 사인은 미리 받아 두었습니다.",
      ),
      b7.bubble("mo", "네, 네.", "signing"),
      b7.say(
        "principal",
        "운동장은 당분간 체육 수업에 쓰지 않습니다. 안전 수칙은 권 사감 선생님께서 안내하겠습니다.",
      ),
      b7.say("sagam", "안전 수칙은 하나입니다. 점호 시간에는 방에 계십시오."),
      b7.say("principal", "이상입니다. 하나만 더 말씀드리면, 균열 안에서도 명찰은 패용합니다."),
      fx("fade-out"),

      fx("fade-in", "board"),
      camera("board", 700),
      b7b.say("garam", "야, 1학년. 어제 운동장에서 골렘 잡은 게 너지? 소문 다 났어.", "grin"),
      b7b.say("hyunwoo", "도현우. 2학년 0조. 얘는 민가람."),
      b7b.say("hyunwoo", "어젯밤 그거, 우리 조 실험 때문이야."),
      b7b.say("garam", "솔직히 우리도 잘 몰라. 어젯밤 기억이 군데군데 비어."),
      b7b.say(
        "hyunwoo",
        "급식실 지하에 있었던 건 기억나. 왜 내려갔는지는… 노트에 그렇게 쓰여 있었다는 것만.",
        "lost",
      ),
      b7b.doc("간섭계를 이용한 미세 시간 지연 측정", [
        "0조  윤서하 · 도현우 · 민가람",
        "지도교사  모 (사인)",
      ]),
      b7b.say(
        "hyunwoo",
        "열두 장이 찢겨 나갔어. 네 책에 붙은 종이도 이 노트 조각이야. 어젯밤에 학교에 다 흩어졌어.",
      ),
      b7b.say("hyunwoo", "균열마다 한 장씩 박혀 있는 것 같아. 노트가 운동장 쪽으로 당겨."),
      b7b.say("garam", "그러니까 열두 번 들어갔다 나오면 돼. 간단하지? 간단하다고 해 줘."),
      b7b.say("hyunwoo", "서하는 저 안으로 들어갔어. 그건 확실해.", "lost"),
      b7b.say(
        "garam",
        "서하 자리 치우지 마. 가방도 그대로 둬. 돌아와서 지 자리 없으면 나한테 뭐라 할걸.",
      ),
      b7b.say(
        "hyunwoo",
        "이거 복사본이야. 원본은 내가 들고 다녀. 페이지가 돌아오면 복사본에도 생기더라.",
      ),
      b7b.say("garam", "아 맞다, 게시판 봐. 벌써 붙었어. 방과후학교는 이런 건 빨라."),
      play("interact:quest-board", "interact", "board"),
    ],
  },
};

// 8. Title card -------------------------------------------------------------------------------

const b8 = w.scope("b8-title");
const title: OpeningBeat = {
  id: "b8-title",
  teaches: "Title card.",
  scene: {
    id: "opening-b8",
    map: "field-day",
    cast: [],
    marks: ["rift"],
    steps: [camera("rift", 1200), music("agora"), b8.title("과고키우기", "Page 1 · 고대 그리스")],
  },
};

export const OPENING: readonly OpeningBeat[] = [
  studyHall,
  hum,
  page,
  stairs,
  field,
  whistle,
  assembly,
  title,
];

export const OPENING_KO = w.ko;
