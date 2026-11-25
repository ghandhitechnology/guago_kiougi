/**
 * 도감 entries for Page 1 and the campus (PLAN §15, §24). Short, accurate, a little wry. Every
 * science or history claim was checked against the source listed with it, and the nuances of
 * PLAN Appendix C are kept: the Pythagoreans as a school, Hippasus as legend, Zeno defending
 * Parmenides, Philoponus's early criticism of Aristotle.
 */
import { Writer } from "./author.ts";
import type { CodexEntry } from "./schema.ts";

const w = new Writer("codex");

const SEP_PYTHAGORAS = "https://plato.stanford.edu/entries/pythagoras/";
const HIPPASUS = "https://en.wikipedia.org/wiki/Hippasus";
const EUDOXUS = "https://mathshistory.st-andrews.ac.uk/Biographies/Eudoxus/";
const SEP_ZENO = "https://plato.stanford.edu/entries/paradox-zeno/";
const ZENO = "https://en.wikipedia.org/wiki/Zeno_of_Elea";
const SEP_ARISTOTLE_NAT = "https://plato.stanford.edu/entries/aristotle-natphil/";
const SEP_ARISTOTLE_BIO = "https://plato.stanford.edu/entries/aristotle-biology/";
const PHYSICS_IV = "https://classics.mit.edu/Aristotle/physics.4.iv.html";
const HEAVENS_II = "https://classics.mit.edu/Aristotle/heavens.2.ii.html";
const SEP_PHILOPONUS = "https://plato.stanford.edu/entries/philoponus/";
const PHILOPONUS = "https://en.wikipedia.org/wiki/John_Philoponus";
const SEP_GALILEO = "https://plato.stanford.edu/entries/galileo/";
const TWO_NEW_SCIENCES = "https://en.wikipedia.org/wiki/Two_New_Sciences";
const SEP_PRINCIPIA = "https://plato.stanford.edu/entries/newton-principia/";
const TRAITE = "https://en.wikipedia.org/wiki/Trait%C3%A9_%C3%A9l%C3%A9mentaire_de_chimie";
const ARISTARCHUS = "https://en.wikipedia.org/wiki/Aristarchus_of_Samos";
const DE_REVOLUTIONIBUS = "https://en.wikipedia.org/wiki/De_revolutionibus_orbium_coelestium";

const scientist = (
  id: string,
  boss: string,
  name: string,
  f: { era: string; who: string; right: string; wrong: string; replaced: string },
  sources: readonly string[],
  unlock: "freed" | "met" = "freed",
): CodexEntry => {
  const s = w.scope(id);
  return {
    id,
    section: "scientist",
    name: s.t(name),
    unlock: unlock === "freed" ? { when: "freed", boss } : { when: "met", speaker: boss },
    era: s.t(f.era),
    who: s.t(f.who),
    right: s.t(f.right),
    wrong: s.t(f.wrong),
    replaced: s.t(f.replaced),
    sources,
  };
};

/**
 * PLAN §15 unlocks an 오개념 entry at 100 kills. The tortoise is rare and runs away, and the
 * golem is met once in the opening, so they unlock sooner and the set can be finished.
 */
const KILLS: Readonly<Record<string, number>> = { tortoise: 10, "odap-golem": 1 };

const misconception = (
  id: string,
  monsters: readonly string[],
  name: string,
  body: string,
  sources: readonly string[] = [],
): CodexEntry => {
  const s = w.scope(id);
  return {
    id,
    section: "misconception",
    name: s.t(name),
    unlock: { when: "kills", monsters, count: KILLS[id] ?? 100 },
    body: s.t(body),
    sources,
  };
};

const book = (
  id: string,
  name: string,
  flavor: string,
  concept: string,
  sources: readonly string[],
): CodexEntry => {
  const s = w.scope(id);
  return {
    id,
    section: "book",
    name: s.t(name),
    unlock: { when: "crafted", book: id },
    flavor: s.t(flavor),
    concept: s.t(concept),
    sources,
  };
};

const school = (id: string, name: string, body: string): CodexEntry => {
  const s = w.scope(id);
  return {
    id,
    section: "school",
    name: s.t(name),
    unlock: { when: "visited", place: id },
    body: s.t(body),
    sources: [],
  };
};

export const CODEX: readonly CodexEntry[] = [
  // 과학자 --------------------------------------------------------------------------------------
  scientist(
    "pythagoreans",
    "pythagoreans",
    "피타고라스 학파",
    {
      era: "기원전 530년 무렵부터 기원전 4세기까지, 남이탈리아 크로톤",
      who: "사모스에서 자란 피타고라스가 남이탈리아 크로톤으로 옮겨 가 만든 공동체와 그 뒤를 이은 사람들. 식사 규칙과 침묵을 지키며 함께 살았고, 콩을 먹지 않았다는 기록이 있다.",
      right:
        "어울리는 음이 2:1, 3:2, 4:3 같은 간단한 비와 맞아떨어진다는 데서 수로 자연을 읽으려 했다. 피타고라스 정리는 바빌로니아 사람들이 먼저 알았고, 피타고라스가 증명했다는 증거는 없다.",
      wrong:
        "모든 것은 수이고 모든 길이는 두 정수의 비로 나타낼 수 있다고 보았다. 아리스토텔레스는 이 생각을 피타고라스 본인보다 기원전 5세기의 학파에게 돌린다.",
      replaced:
        "한 변이 1인 정사각형의 대각선은 어떤 정수비로도 쓸 수 없다. 학파 안에서 증명된 이 사실을 히파소스가 퍼뜨렸다가 바다에 빠졌다는 이야기는 전설이다. 에우독소스의 비례론이 이런 길이를 다루는 길을 열었다.",
    },
    [SEP_PYTHAGORAS, HIPPASUS, EUDOXUS],
  ),
  scientist(
    "zeno",
    "zeno",
    "제논",
    {
      era: "기원전 490년 무렵부터 430년 무렵까지, 남이탈리아 엘레아",
      who: "엘레아의 철학자. 있는 것은 하나뿐이고 변하지 않는다는 스승 파르메니데스의 주장을 지키려고 역설을 만들었다. 아리스토텔레스는 그를 변증술의 창시자라 불렀다.",
      right:
        "모두가 당연하게 여기던 운동과 무한을 처음으로 정면에서 따졌다. 그의 질문은 이천 년 넘게 수학자와 철학자를 붙잡아 두었다.",
      wrong:
        "아킬레우스는 거북이를 따라잡지 못하고, 날아가는 화살은 매 순간 멈춰 있다. 무한히 나뉘는 거리를 끝까지 갈 수 없으니 운동은 모순이라고 주장했다.",
      replaced:
        "무한히 많은 항을 더해도 합은 유한할 수 있다. 1/2 + 1/4 + 1/8 + …은 1이다. 무한급수의 합을 엄밀하게 다룬 것은 19세기의 코시이고, 이것으로 역설이 다 풀렸는지는 철학자들이 지금도 따진다.",
    },
    [SEP_ZENO, ZENO],
  ),
  scientist(
    "aristotle",
    "aristotle",
    "아리스토텔레스",
    {
      era: "기원전 384년부터 322년까지, 아테네",
      who: "스타게이라에서 태어나 플라톤의 아카데메이아에서 공부했고, 아테네의 리케이온에서 학교를 이끌었다. 논리학부터 동물학, 천문학, 정치학까지 거의 모든 것을 분류했다.",
      right:
        "월식 때 달에 비친 땅의 그림자가 늘 둥글고, 남북으로 조금만 가도 보이는 별이 달라진다는 것을 들어 땅이 둥글다고 했다. 동물을 직접 해부하며 관찰했고, 남은 저작의 4분의 1쯤이 동물에 관한 것이다.",
      wrong:
        "무거운 것이 더 빨리 떨어지고, 던진 물체는 공기가 계속 밀어 주며, 땅 위의 물질은 흙, 물, 공기, 불로 되어 있다고 보았다. 진공에서는 움직이는 것이 멈출 까닭이 없으니 진공은 없다고 했다.",
      replaced:
        "6세기 필로포노스는 무게가 몇 배 다른 두 물체를 떨어뜨려도 시간 차가 아주 작다고 반박했다. 갈릴레오가 1638년 낙하 법칙을 내놓았고, 뉴턴이 1687년 관성 법칙을 정리했다. 4원소는 1789년 라부아지에의 원소 목록이 대신했다.",
    },
    [
      SEP_ARISTOTLE_NAT,
      PHYSICS_IV,
      HEAVENS_II,
      SEP_ARISTOTLE_BIO,
      SEP_PHILOPONUS,
      PHILOPONUS,
      SEP_GALILEO,
      TWO_NEW_SCIENCES,
      SEP_PRINCIPIA,
      TRAITE,
    ],
  ),
  scientist(
    "aristarchus",
    "aristarchus",
    "아리스타르코스",
    {
      era: "기원전 310년 무렵부터 230년 무렵까지, 사모스와 알렉산드리아",
      who: "사모스 출신 천문학자. 아리스토텔레스가 죽고 십여 년 뒤에 태어났다. 남은 책은 『해와 달의 크기와 거리에 관하여』 한 권뿐이다.",
      right:
        "땅이 해를 돈다는 가설을 세웠다. 이 가설은 아르키메데스가 『모래알을 세는 사람』에 옮겨 적은 덕분에 전해진다. 해가 땅보다 몇 배나 크다는 것도 계산으로 보였다.",
      wrong:
        "반달일 때 해와 달 사이 각을 87도로 쟀고, 그래서 해가 달보다 18~20배 멀다고 보았다. 실제 각은 89.8도쯤이고, 해는 달보다 400배쯤 멀다.",
      replaced:
        "방법은 옳았고 각을 재기가 어려웠을 뿐이다. 해 중심설이 다시 힘을 얻은 것은 1800년 가까이 지나 1543년 코페르니쿠스의 책이 나온 뒤다.",
    },
    [ARISTARCHUS, DE_REVOLUTIONIBUS],
    "met",
  ),

  // 오개념 ----------------------------------------------------------------------------------------
  misconception(
    "odap",
    ["odap"],
    "오답",
    "빨간펜 X를 받고도 고쳐지지 않은 답이다. 틀렸다는 표시를 훈장처럼 달고 다닌다.",
  ),
  misconception(
    "odap-pencil",
    ["odap-pencil"],
    "연필 오답",
    "흐릿하게 연필로 찍은 답이다. 지우개 한 번이면 사라지지만, 아무도 지우지 않으면 정답 행세를 한다.",
  ),
  misconception(
    "rational",
    ["rational"],
    "유리수 병사",
    "모든 길이는 두 정수의 비로 쓸 수 있다는 믿음이 창과 방패를 들었다. 한 변이 1인 정사각형의 대각선 √2 앞에서는 방패의 ÷가 맞지 않는다.",
    [EUDOXUS, SEP_PYTHAGORAS],
  ),
  misconception(
    "elements",
    ["element-fire", "element-water", "element-air", "element-earth"],
    "4원소 정령",
    "세상 물질이 흙, 물, 공기, 불 네 가지로 되어 있다는 생각이다. 지금 주기율표에는 118번까지 원소가 있고, 불은 연료가 산소와 반응하며 내는 열과 빛이다.",
    [
      "https://iupac.org/what-we-do/periodic-table-of-elements/",
      "https://en.wikipedia.org/wiki/Fire_triangle",
      TRAITE,
    ],
  ),
  misconception(
    "cave-shadow",
    ["cave-shadow"],
    "동굴의 그림자",
    "벽에 비친 그림자를 실물로 아는 착각이다. 플라톤의 『국가』 7권에서 동굴에 묶인 사람들은 평생 그림자만 보고 그것이 세상의 전부라고 믿는다.",
    ["https://en.wikipedia.org/wiki/Allegory_of_the_cave"],
  ),
  misconception(
    "tortoise",
    ["tortoise"],
    "제논의 거북이",
    "무한히 많은 단계를 거치는 일은 끝날 수 없다는 생각이다. 따라잡을 때마다 거북이가 조금 앞서 있지만, 그 간격들의 합이 유한해서 아킬레우스는 결국 앞지른다.",
    [SEP_ZENO],
  ),
  misconception(
    "odap-golem",
    ["odap-golem"],
    "오답노트 골렘",
    "틀린 문제를 모아 두기만 하면 공부가 된다는 착각이다. 다시 풀지 않은 오답노트는 두꺼워지기만 한다.",
  ),

  // 책 -------------------------------------------------------------------------------------------
  book(
    "wangdo",
    "수학의 왕도",
    "프로클로스가 전하기로, 유클리드는 더 쉬운 길을 묻는 왕에게 기하학에 왕도는 없다고 답했다. 이 책은 제목부터 그 말을 듣지 않았다.",
    "정다각형은 변이 늘수록 원에 가까워진다. 아르키메데스는 정96각형으로 원주율이 223/71보다 크고 22/7보다 작다는 것을 보였다.",
    [
      "https://mathshistory.st-andrews.ac.uk/Biographies/Euclid/",
      "https://en.wikipedia.org/wiki/Approximations_of_%CF%80",
    ],
  ),
  book(
    "graph-note",
    "함수 그래프 노트",
    "모눈 한 칸 남기지 않고 사인 곡선을 그려 놓았다. 마지막 장에는 「주기 2π, 시험에 나옴」이라고 적혀 있다.",
    "사인 함수는 2π마다 같은 모양을 되풀이한다. 진폭과 주기만 알면 다음 마루가 어디에 올지 정확히 안다.",
    ["https://en.wikipedia.org/wiki/Sine_and_cosine"],
  ),
  book(
    "holiday-physics",
    "홀리데이 일반물리",
    "이 학교 학생이라면 한 번은 베개로 썼다. 무기가 되기 전부터 무게로는 흉기였다.",
    "던진 물체는 수평으로는 같은 빠르기로, 수직으로는 점점 빨라지며 움직여 포물선을 그린다. 갈릴레오가 1638년 『새로운 두 과학』에서 보였다.",
    [TWO_NEW_SCIENCES],
  ),
  book(
    "em-lab",
    "전자기 실습서",
    "안전 수칙만 첫머리 열두 쪽이다. 끝까지 읽은 학생은 아직 확인되지 않았다.",
    "공기는 보통 전기가 통하지 않지만 1밀리미터에 3천 볼트쯤 걸리면 절연이 깨져 불꽃이 튄다. 이 책의 번개는 그 틈을 타고 가까운 적으로 건너간다.",
    ["https://en.wikipedia.org/wiki/Dielectric_strength"],
  ),
  book(
    "zoomin-chem",
    "줌인 일반화학",
    "표지에 계산기 지참이라고 적혀 있다. 책을 펴 보면 이유를 안다.",
    "pH가 1 낮아지면 수소 이온 농도는 열 배가 된다. 산성도는 로그로 세기 때문에 계산기가 필요하다.",
    ["https://en.wikipedia.org/wiki/PH"],
  ),
  book(
    "lab-report",
    "실험 보고서",
    "결론 칸은 실험이 끝난 뒤에 쓴다. 결과를 미리 적어 둔 노트 한 권이 이 학교에서 크게 사고를 친 적이 있다.",
    "불이 붙으려면 열, 연료, 산소가 모두 있어야 하고, 하나만 없애도 꺼진다. 이 책은 먼저 연료를 묻히고 나중에 열을 준다.",
    ["https://en.wikipedia.org/wiki/Fire_triangle"],
  ),
  book(
    "camping-bio",
    "캠핑 생명과학",
    "제목과 달리 캠핑에 들고 갈 무게는 아니다. 대부분 사물함에서 한 학기를 보낸다.",
    "세포는 둘로 나뉘며 수를 늘린다. 처음엔 기하급수적으로 늘다가 자원이 모자라면 어느 수에서 멈추는데, 이것이 로지스틱 성장이다.",
    ["https://en.wikipedia.org/wiki/Logistic_function"],
  ),
  book(
    "dissection",
    "해부 실습서",
    "실습 전날 밤에 읽으면 다음 날 급식을 거르게 된다.",
    "구조를 알려면 열어 봐야 한다. 아리스토텔레스도 개와 돼지 같은 동물을 직접 해부해 내장의 생김새를 기록했다.",
    [SEP_ARISTOTLE_BIO],
  ),
  book(
    "round-earth",
    "지구는 둥글다 지구과학",
    "제목에는 아리스토텔레스도 동의한다. 그는 월식 때 달에 비친 둥근 그림자를 근거로 들었다.",
    "단층 양쪽 암석은 오랫동안 휘어지며 힘을 모았다가 한순간에 튕겨 돌아간다. 1906년 샌프란시스코 지진 뒤 리드가 탄성 반발설로 정리했다.",
    [HEAVENS_II, "https://en.wikipedia.org/wiki/Elastic-rebound_theory"],
  ),
  book(
    "rock-box",
    "암석 표본 상자",
    "칸마다 이름표가 붙어 있는데 절반은 자리가 바뀌어 있다. 누가 바꿨는지는 지구과학실의 오랜 수수께끼다.",
    "마그마가 식으면 화성암, 쌓인 퇴적물이 굳으면 퇴적암, 높은 열과 압력에 성질이 바뀌면 변성암이 된다. 암석은 이 셋 사이를 돌고 돈다.",
    ["https://en.wikipedia.org/wiki/Rock_cycle"],
  ),

  // 학교 -----------------------------------------------------------------------------------------
  school(
    "gaseolgwan",
    "가설관",
    "본관. 1층에 교무실, 메이커실, 물음표 서고가 있고 4층은 자습실이다. 옥상 천문돔 문을 억지로 열면 학교 전체에 경보가 울린다.",
  ),
  school(
    "study-hall",
    "자습실",
    "가설관 4층. 자리를 뜰 때마다 이동 기록부에 시각과 사유를 적는다. 졸방대까지는 적지 않아도 된다.",
  ),
  school(
    "maker-room",
    "메이커실",
    "제본대와 제련기가 있는 방. 뭐든 만들어 보라고 만든 곳인데, 요즘은 책을 무기로 만든다.",
  ),
  school(
    "cafeteria",
    "급식실",
    "하루 세 번 학교 전체가 모이는 곳. 1학년은 늘 마지막에 들어간다. 주방 안쪽 지하로 내려가는 문은 몇 년째 잠겨 있다.",
  ),
  school(
    "corkboard",
    "매점 게시판",
    "학생들이 몇 년을 요구한 끝에 학교에 매점이 생겼다. 코르크판이다.",
  ),
  school(
    "dawn-hall",
    "새벽관",
    "기숙사. 구관과 신관이 붙어 있다. 신관 복도가 가운데 마당을 네모나게 둘러싸서 다들 콜로세움이라고 부른다. 신관 2층 2인실은 1인실만 하다.",
  ),
  school(
    "eco-park",
    "생태공원",
    "꽃을 보라고 만든 정원. 지금은 잡초가 꽃보다 많고, 분수 조각상은 초록색이 되었다. 균열 탐사 첫 실습지다.",
  ),
  school(
    "field",
    "운동장",
    "정확한 정사각형이다. 첫 번째 균열이 열린 뒤로 체육 수업은 체육관으로 옮겨 갔다.",
  ),
  school(
    "lab-building",
    "실험동",
    "2층 화학, 3층 물리, 4층 생명 실험실. 1층은 비어 있고, 바퀴 빠진 전기차 한 대가 서 있다.",
  ),
];

export const CODEX_KO = w.ko;
