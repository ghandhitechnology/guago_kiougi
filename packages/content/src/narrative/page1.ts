/**
 * Page 1, 고대 그리스: story beats on the Page lifecycle (PLAN §10) and the three boss scripts
 * with lines tied to each fight's gimmick (PLAN §5). Beats play for everyone when the server
 * reaches the milestone; each player then plays the chapter personally (PLAN §15).
 *
 * Maps: 아고라 is the era town; the fields are PAGE1_FIELDS in fields.ts (무너진 열주, 올리브
 * 숲길, 동굴 입구, 아고라 외곽); the 위험 구역 is the 그림자 동굴; the lairs are 크로톤 학당 and
 * 엘레아 경주로; the arena is 리케이온.
 */
import { sound, Writer, wait } from "./author.ts";
import type { BossScript, StoryBeat } from "./schema.ts";

const w = new Writer("p1");

// Week 0: the rift opens ----------------------------------------------------------------------

const open = w.scope("open");
const ari = w.scope("aristarchus");
const wide = w.scope("wide");
const py = w.scope("pythagoreans");
const pyAfter = w.scope("pythagoreans-after");
const ze = w.scope("zeno");
const zeAfter = w.scope("zeno-after");
const ar = w.scope("aristotle");
const era = w.scope("era-change");
const pg = w.scope("page-returns");
const roll = w.scope("roll-call");

export const STORY: readonly StoryBeat[] = [
  {
    id: "p1-open",
    week: 0,
    after: "p1.open",
    title: open.t("안쪽은 오후다"),
    map: "p1-agora",
    announce: ["page-open"],
    lines: [
      open.say("hyunwoo", "들어가는 사람 이름 적고 있어. 나오는 사람도."),
      open.say("hyunwoo", "너도 적었어. 나올 때 말하고 나와."),
      open.say("entropy", "여기는 오후다. 잠은 나가서 자."),
      open.say("entropy", "광장에선 아무도 안 덤빈다. 나가면 덤빈다."),
    ],
  },
  {
    id: "p1-aristarchus",
    week: 0,
    after: "p1.open",
    title: ari.t("그림자를 재는 사람"),
    map: "p1-agora",
    lines: [
      ari.say("aristarchus", "아, 그림자 밟지 마. 재는 중이야."),
      ari.ask(
        "aristarchus",
        "막대기 그림자로 해 높이를 재고 있었어. 해가 얼마나 먼지, 얼마나 큰지.",
        undefined,
        [
          ["그걸 막대기로요?", [ari.line("aristarchus", "막대기랑 삼각형. 그거면 돼.")]],
          ["…네.", []],
        ],
      ),
      ari.say(
        "aristarchus",
        "반달일 때 해랑 달 사이 각을 재면 거리 비가 나와. 내가 쟀을 땐 열여덟 배에서 스무 배 사이.",
      ),
      ari.say(
        "aristarchus",
        "그러면 해가 땅보다 몇 배는 커. 큰 게 작은 걸 돈다는 게 이상하지 않아?",
      ),
      ari.say(
        "aristarchus",
        "여기 사람들은 땅이 가운데래. 리케이온 쪽에서 강의하는 그 키 큰 선생도.",
      ),
      ari.say(
        "aristarchus",
        "그 선생 책은 읽었어. 만난 적은 없어. 내가 태어나기 전에 돌아가셨거든.",
      ),
      ari.say("entropy", "저 사람 말이 맞다. 각도는 틀렸고."),
      ari.say("aristarchus", "…각도가? 얼마나?"),
      ari.say("entropy", "삼 도쯤."),
      ari.say("aristarchus", "삼 도면 거리가… 아, 그럼 훨씬 멀어지는데. 해는 더 크고."),
      ari.say("aristarchus", "너희 끝까지 들어 줬다. 여기선 그런 일이 잘 없는데."),
    ],
  },

  // Week 2: fields 3 and 4 and the 위험 구역 ---------------------------------------------------
  {
    id: "p1-wide",
    week: 2,
    after: "p1.wide",
    title: wide.t("출입 금지 동굴"),
    map: "p1-agora",
    announce: ["fields-open", "patrol-agreement"],
    lines: [
      wide.say("garam", "야, 새 구역 열렸어. 동굴 입구랑 아고라 외곽.", "grin"),
      wide.say("garam", "동굴 안쪽은 경비병이 지켜. 걸리면 벌점 2점이래."),
      wide.say(
        "garam",
        "아테네 경비병이 우리 학교 벌점을 어떻게 아냐고? 교장 선생님이 공문 보냈대. 답장도 왔대.",
      ),
      wide.say("hyunwoo", "동굴 안이 낱장이 제일 좋대. 들어갈 거면 경비 시야 끝에 붙어서 가."),
      wide.say("entropy", "동굴에선 벽을 보지 마. 뒤를 봐."),
    ],
  },

  // Week 3: 피타고라스 학파 --------------------------------------------------------------------
  {
    id: "p1-pythagoreans",
    week: 3,
    after: "p1.pythagoreans",
    title: py.t("모눈 위의 학당"),
    map: "p1-croton-school",
    announce: ["boss-appear-pythagoreans"],
    lines: [
      py.say("senior-math", "크로톤 학당 다녀왔어. 바닥 전체가 번호 매긴 모눈이야."),
      py.say(
        "senior-math",
        "쟤네는 칸을 따라서만 봐. 가로 아니면 세로. 대각선으로 선 사람은 못 찾아.",
      ),
      py.say(
        "senior-math",
        "약점도 대각선이야. 한 칸을 모서리에서 모서리로 가로질러. 그 길이를 쟤네가 못 견뎌.",
      ),
      py.say("entropy", "열을 세는 동안은 안 끊긴다. 끊는 건 그 선이다."),
    ],
  },
  {
    id: "p1-pythagoreans-freed",
    week: 5,
    after: "p1.pythagoreans-freed",
    title: py.t("무리수"),
    map: "p1-croton-school",
    cutscene: "p1-pythagoreans-freed",
    announce: ["boss-down-pythagoreans"],
  },
  {
    id: "p1-pythagoreans-after",
    week: 5,
    after: "p1.pythagoreans-freed",
    title: pyAfter.t("가우스실 강사진"),
    map: "gauss-room",
    lines: [
      pyAfter.say(
        "garam",
        "피타고라스 학파가 가우스실 차지했어. 문에 출석부를 열 장 붙여 놨어. 열 명이라서.",
      ),
      pyAfter.say(
        "senior-math",
        "수업 들었어. 무리수라는 말을 처음 소리 내서 해 보는 사람들이랑. 다들 목소리가 작더라.",
      ),
      pyAfter.say(
        "pythagoreans",
        "우리는 이제 한 사람씩 말하는 것을 연습한다. 아직 셋까지만 된다.",
        "one",
      ),
      pyAfter.say("hyunwoo", "학파 사람들이 한 말, 적어 뒀어. 다음에 셀 수를 누가 먼저 셌다고."),
      pyAfter.say("hyunwoo", "…노트에 글씨가 먼저 생기던 거랑 비슷해서.", "lost"),
      pyAfter.say("garam", "야, 그거 우연이야. 우연 맞아. 밥 먹으러 가자."),
    ],
  },

  // Week 6: 제논 -------------------------------------------------------------------------------
  {
    id: "p1-zeno",
    week: 6,
    after: "p1.zeno",
    title: ze.t("결승선 없는 경주로"),
    map: "p1-elea-track",
    announce: ["boss-appear-zeno"],
    lines: [
      ze.say(
        "senior-physics",
        "저 사람한테 대시하면 남은 거리 반만 가. 몇 번을 해도 반. 기록 다 남겼어.",
      ),
      ze.say("senior-physics", "근데 바닥에 원이 생기더라. 점점 작아지는 거."),
      ze.say(
        "senior-math",
        "반, 사분의 일, 팔분의 일. 다 더하면 하나야. 원을 다 채우면 거리가 닫혀.",
      ),
      ze.say("senior-physics", "봐, 수학과는 이렇게 말하면 끝나. 우린 뛰어야 되고."),
      ze.say("entropy", "원에 서. 작은 쪽까지."),
    ],
  },
  {
    id: "p1-zeno-freed",
    week: 8,
    after: "p1.zeno-freed",
    title: ze.t("도착"),
    map: "p1-elea-track",
    cutscene: "p1-zeno-freed",
    announce: ["boss-down-zeno"],
  },
  {
    id: "p1-zeno-after",
    week: 8,
    after: "p1.zeno-freed",
    title: zeAfter.t("끝나지 않는 수업"),
    map: "field-day",
    lines: [
      zeAfter.say("zeno", "도착했어요. 이 말이 좋아서 하루에 몇 번씩 해요."),
      zeAfter.say("zeno", "급식실까지는 아직 오래 걸려요. 그래도 이제는 가요."),
      zeAfter.say(
        "hyunwoo",
        "제논도 비슷한 말을 했어. 답이 먼저 와 있었대. 둘이 따로 한 말인데 똑같아.",
      ),
      zeAfter.say("garam", "…야, 그거 적지 마. 아니, 적어. 적어 둬."),
    ],
  },

  // Week 10: 아리스토텔레스 ----------------------------------------------------------------------
  {
    id: "p1-aristotle",
    week: 10,
    after: "p1.aristotle",
    title: ar.t("리케이온 공개 강의"),
    map: "p1-lyceum",
    announce: ["boss-appear-aristotle"],
    lines: [
      ar.doc("리케이온 공개 강의 · 논제 넷", [
        "첫째  무거운 것이 더 빨리 떨어진다",
        "둘째  모든 것은 제자리로 돌아간다",
        "셋째  움직이는 것은 무언가가 민다",
        "넷째  자연에 빈 곳은 없다",
        "청강 자유 · 반론 불가",
      ]),
      ar.say("garam", "강의 계획서 붙여 놨어. 반론 불가래. 우리 학교 시험보다 심해."),
      ar.say("hyunwoo", "첫 장이 저기 있어. 노트가 리케이온 쪽으로 당겨."),
      ar.say("aristarchus", "저 선생 넷째 논제는 잘 들어 둬. 끝에 가서 자기 발목을 잡을 거야."),
      ar.say("entropy", "반론 불가는 없다. 쳐."),
    ],
  },
  {
    id: "p1-aristotle-freed",
    week: 13,
    after: "p1.aristotle-freed",
    title: ar.t("멈출 까닭"),
    map: "p1-lyceum",
    cutscene: "p1-aristotle-freed",
    announce: ["boss-down-aristotle"],
  },

  // +1 week: 시대 전환 ------------------------------------------------------------------------
  {
    id: "p1-era-change",
    week: 14,
    after: "p1.era-change",
    title: era.t("운동장의 기념물"),
    map: "field-day",
    announce: ["era-change"],
    lines: [
      era.say(
        "principal",
        "고대 그리스에서 오신 강사진을 소개합니다. 가우스실의 피타고라스 학파, 운동장의 제논 선생님, 물음표 서고의 아리스토텔레스 선생님입니다.",
      ),
      era.say(
        "principal",
        "운동장에 남은 기둥 네 개와 거북이 석상은 학교 기념물로 지정합니다. 올라가지 마십시오.",
      ),
      era.say(
        "principal",
        "거북이 석상이 매일 조금씩 자리를 옮긴다는 제보는 시설팀에서 확인 중입니다.",
      ),
      era.say("aristotle-freed", "자네들 도감을 보았네. 분류가 엉망이더군. 오늘부터 내가 맡겠네."),
    ],
  },
  {
    id: "p1-page-returns",
    week: 14,
    after: "p1.era-change",
    title: pg.t("첫 장"),
    map: "gaseolgwan-2f",
    lines: [
      pg.say("garam", "야, 붙었어. 복사본에도 붙었어. 진짜 한 장 돌아왔어.", "grin"),
      pg.doc("0조 연구노트 · 1", [
        ["3/2  기준 측정. 줄무늬 이동 없음.", "student"],
        ["3/4  레이저 켜기 전에 줄무늬가 움직임. 장비 문제?", "student"],
        ["3/5  노트에 모르는 글씨. 내일 측정값이 적혀 있음.", "student"],
        ["3/6  맞았다. 소수점 끝자리까지.", "student"],
        ["가설 하나. 숫자가 너무 잘 맞으면 숫자를 의심한다.", "seoha"],
        ["다음 측정은 노트 안 보고 한다. ㅅㅎ", "seoha"],
      ]),
      pg.say("hyunwoo", "…서하 글씨야.", "lost"),
      pg.say("hyunwoo", "이걸 쓴 건 기억 안 나. 서하가 이걸 썼다는 것도.", "lost"),
      pg.say("garam", "서하는 처음부터 의심했네. 우리만 몰랐어."),
      pg.say("hyunwoo", "열한 장 남았어. 적어 둘게."),
      pg.say(
        "garam",
        "아 맞다. 물음표 서고에서 바닷물 냄새 난대. 책 사이에 파피루스가 끼어 있었대.",
      ),
    ],
  },
  {
    id: "p1-roll-call",
    week: 14,
    after: "p1.era-change",
    title: roll.t("점호"),
    map: "dorm-old",
    lines: [
      sound("whistle"),
      roll.say("sagam", "점호 시작합니다. 구관 1층부터 부르겠습니다.", "whistle"),
      roll.say("sagam", "아리스토텔레스 선생님."),
      roll.say("aristotle-freed", "여기 있네. 강사도 점호를 하는가?"),
      roll.say("sagam", "기숙사에서 주무시는 분은 전원 점호 대상입니다. 0시 40분 소등입니다."),
      roll.say(
        "aristotle-freed",
        "불 끄는 시각까지 정해 두었군. 분류를 좋아하는 학교일세. 마음에 드네.",
      ),
      roll.say("sagam", "다음. 2층."),
      roll.say("sagam", "윤서하."),
      wait(2400),
      roll.say("sagam", "…윤서하 학생은 외박 신청이 되어 있습니다. 다음."),
      roll.say("garam", "…방금 들었어?"),
      roll.say("hyunwoo", "응."),
    ],
  },
];

// Boss scripts ------------------------------------------------------------------------------

const bp = w.scope("fight-pythagoreans");
const bz = w.scope("fight-zeno");
const ba = w.scope("fight-aristotle");

export const BOSSES: readonly BossScript[] = [
  {
    boss: "pythagoreans",
    map: "p1-croton-school",
    freed: "p1-pythagoreans-freed",
    fight: [
      {
        on: "enter",
        lines: [
          bp.line(
            "pythagoreans",
            "하나, 둘, 셋, 넷. 합하여 열. 들어오는 자는 칸을 따라 걸어라.",
            "chorus",
          ),
        ],
      },
      {
        on: "start",
        lines: [bp.line("pythagoreans", "셈을 시작한다. 모든 칸에는 번호가 있다.", "chorus")],
      },
      {
        on: "grid-step",
        lines: [
          bp.line("pythagoreans", "가로로 하나. 세로로 하나. 셈이 맞는다.", "chorus"),
          bp.line("pythagoreans", "그렇다. 칸 위에 서라. 보인다.", "chorus"),
        ],
      },
      {
        on: "diagonal",
        lines: [
          bp.line("pythagoreans", "어디로 갔느냐. 칸 밖에 서 있지 마라.", "chorus"),
          bp.line("pythagoreans", "보이지 않는다. 셀 수 없는 자리다.", "chorus"),
        ],
      },
      { on: "weak-open", lines: [bp.line("pythagoreans", "그 선을 긋지 마라.", "chorus")] },
      { on: "hp-50", lines: [bp.line("pythagoreans", "칠 대 오. 모자라다. 다시 센다.", "chorus")] },
      { on: "hp-25", lines: [bp.line("pythagoreans", "형제여, 왜 너 혼자 세느냐.", "chorus")] },
      {
        on: "knockout",
        lines: [bp.line("pythagoreans", "셈이 끝났다. 누운 채로 열까지 세라.", "chorus")],
      },
    ],
  },
  {
    boss: "zeno",
    map: "p1-elea-track",
    freed: "p1-zeno-freed",
    fight: [
      { on: "enter", lines: [bz.line("zeno", "오셨어요? 아직 반밖에 안 오셨어요.")] },
      { on: "start", lines: [bz.line("zeno", "출발은 하셨죠? 그럼 반부터 오세요.")] },
      {
        on: "dash",
        lines: [
          bz.line("zeno", "또 반이에요. 나머지 반은 언제 오세요?"),
          bz.line("zeno", "빠르시네요. 그래도 반이에요."),
        ],
      },
      {
        on: "ring-filled",
        lines: [bz.line("zeno", "원 하나 찼네요. 다음 원은 더 작아요. 끝이 없을 텐데요.")],
      },
      {
        on: "arrow",
        lines: [
          bz.line("zeno", "날아가는 화살은 매 순간 한자리에 있어요. 그럼 언제 움직이는 걸까요?"),
        ],
      },
      { on: "tortoise", lines: [bz.line("zeno", "거북 씨가 먼저 출발했어요. 공정하게요.")] },
      {
        on: "hp-50",
        lines: [bz.line("zeno", "저희 선생님 말씀이 틀렸다면 저한테 와 보세요. 반씩 말고요.")],
      },
      { on: "hp-25", lines: [bz.line("zeno", "합이… 하나에 가까워지기만 하네요. 넘지도 않고요.")] },
      { on: "knockout", lines: [bz.line("zeno", "쉬다 오세요. 남은 거리는 그대로 있을 거예요.")] },
    ],
  },
  {
    boss: "aristotle",
    map: "p1-lyceum",
    freed: "p1-aristotle-freed",
    theses: [
      ba.t("첫째 논제 「무거운 것이 더 빨리 떨어진다」"),
      ba.t("둘째 논제 「모든 것은 제자리로 돌아간다」"),
      ba.t("셋째 논제 「움직이는 것은 무언가가 민다」"),
      ba.t("넷째 논제 「자연에 빈 곳은 없다」"),
    ],
    fight: [
      {
        on: "enter",
        lines: [ba.line("aristotle", "아, 청중이 왔군. 앉게. 오늘은 자연을 말하겠네.", "lecture")],
      },
      {
        on: "phase",
        phase: 1,
        lines: [
          ba.line("aristotle", "첫째 논제일세. 무거운 것은 더 빨리 떨어지네. 보게.", "lecture"),
        ],
      },
      {
        on: "fall",
        phase: 1,
        lines: [
          ba.line("aristotle", "바위는 서두르고 깃털은 머뭇거리지. 본성대로일세."),
          ba.line("aristotle", "자네들이 가벼워서 느린 걸세."),
        ],
      },
      {
        on: "phase",
        phase: 2,
        lines: [
          ba.line(
            "aristotle",
            "둘째 논제. 흙은 아래로, 물은 그 위로, 공기는 더 위로, 불은 맨 위로. 자네들도 제자리로 가게.",
            "lecture",
          ),
        ],
      },
      {
        on: "element-zone",
        phase: 2,
        lines: [ba.line("aristotle", "불 속에 선 자네, 자네 자리는 거기가 아닐세.")],
      },
      {
        on: "phase",
        phase: 3,
        lines: [
          ba.line(
            "aristotle",
            "셋째 논제. 움직이는 것에는 반드시 미는 것이 있네. 나를 움직이고 싶으면 계속 밀게.",
            "lecture",
          ),
        ],
      },
      { on: "push", phase: 3, lines: [ba.line("aristotle", "그렇지, 밀게. 손을 떼면 그치네.")] },
      { on: "unpushed", phase: 3, lines: [ba.line("aristotle", "보게. 손을 떼니 그쳤지.")] },
      {
        on: "phase",
        phase: 4,
        lines: [
          ba.line(
            "aristotle",
            "넷째 논제. 자연에 빈 곳은 없네. 있다면 움직이는 것이 멈출 까닭이 없을 테니까.",
            "lecture",
          ),
        ],
      },
      {
        on: "ice",
        phase: 4,
        lines: [
          ba.line("aristotle", "이 얼음은 무엇인가. 미는 이가 없는데 왜 미끄러지나.", "stunned"),
        ],
      },
      {
        on: "knockout",
        lines: [ba.line("aristotle", "누운 자는 제자리를 찾은 걸세. 흙은 아래로.")],
      },
      {
        on: "debate-hour",
        lines: [ba.line("aristotle", "토론 시간인가. 좋네. 반론이 있으면 하게. 듣지는 않겠지만.")],
      },
    ],
  },
];

export const PAGE1_KO = w.ko;
