/**
 * Names and bag descriptions for study materials and the combat vocabulary: the thirty launch
 * books, their evolved forms and linked tools, the 자판기's stock, and the one-row names of
 * statuses, reactions, modes, stats, grades, classes, 전직 tiers and monster nameplates.
 * Descriptions are the narrator's plain 해라체, the same voice as the hub's item descriptions.
 * The combat data in `packages/content/src` points at these by id.
 */
import { Writer } from "./author.ts";
import type { Description, Term, TextKey } from "./schema.ts";

const w = new Writer("study");

type Entry = readonly [id: string, name: string, desc: string];

const items = (prefix: string, entries: readonly Entry[]): Description[] => {
  const s = w.scope(prefix);
  return entries.map(([id, name, desc]) => ({
    id: `${prefix}:${id}`,
    kind: "item",
    name: s.t(name),
    desc: s.t(desc),
  }));
};

const BOOKS: readonly Entry[] = [
  [
    "wangdo",
    "수학의 왕도",
    "왕도는 없다는 말을 듣고 직접 냈다는 책. 펼치면 정다각형이 돌고, 변이 늘수록 원에 가까워진다.",
  ],
  [
    "graph-note",
    "함수 그래프 노트",
    "모눈 위의 사인 곡선이 종이 밖으로 뻗는다. 정의역은 화면 끝까지다.",
  ],
  [
    "sequence",
    "수열 문제집",
    "1, 1, 2, 3, 5, 8까지 풀면 처음으로 돌아간다. 13번 문제는 늘 다음 주에 푼다.",
  ],
  ["probability", "확률과 통계", "던질 때마다 주사위를 굴린다. 기댓값은 3.5인데 기분은 늘 1이다."],
  ["coordinate", "좌표 평면", "원점을 옮기면 몸도 따라간다. 지나간 자리에 x축과 y축이 남는다."],
  [
    "proof-note",
    "증명 노트",
    "마지막 줄에 Q.E.D.를 쓰는 연습만 백 번 했다. 그 앞은 아직 비어 있다.",
  ],
  [
    "holiday-physics",
    "홀리데이 일반물리",
    "두껍고 무겁다. 던지면 포물선을 그린다. 이 책으로 가장 확실히 배운 것은 이 책의 질량이다.",
  ],
  [
    "mechanics-kit",
    "역학 실험 키트",
    "추와 실과 스탠드. 진자는 주기를 지키고, 앞에 선 오답은 주기적으로 맞는다.",
  ],
  [
    "em-lab",
    "전자기 실습서",
    "실습 시간에 아무도 접지를 하지 않았다. 번개가 가까운 적부터 차례로 건너간다.",
  ],
  ["optics", "광학 노트", "입사각과 반사각이 같다는 것만은 확실히 안다. 레이저도 그걸 안다."],
  ["momentum-book", "운동량 문제집", "질량 곱하기 속도. 달려가면 앞에 있던 것들이 같이 밀려간다."],
  [
    "gravity-report",
    "중력 탐구 보고서",
    "사과는 떨어지고 오답은 끌려온다. 보고서의 결론은 둘이 같은 이유라는 것이다.",
  ],
  [
    "zoomin-chem",
    "줌인 일반화학",
    "플라스크째 던진다. 깨진 자리에 산이 고이고, 그 위를 지나가는 것은 녹는다.",
  ],
  [
    "periodic-table",
    "주기율표 브로마이드",
    "벽에 붙여 두던 포스터. 손에 잡히는 대로 원소를 하나 떼어 던진다. 무엇이 나올지는 붙인 사람도 모른다.",
  ],
  ["organic", "유기화학 노트", "탄소가 탄소를 붙잡고 줄줄이 이어진다. 때릴수록 사슬이 길어진다."],
  [
    "lab-report",
    "실험 보고서",
    "가설: 에탄올을 뿌리고 불을 붙이면 탄다. 결과: 탔다. 고찰: 오답이 타는 소리가 좋았다.",
  ],
  ["mole", "몰 계산 문제집", "6.02×10²³개를 세다가 지쳐서 작은 것을 아주 많이 던지기로 했다."],
  [
    "titration",
    "산·염기 적정 노트",
    "산 한 번, 염기 한 번. 색이 바뀌는 순간을 놓치지 않으면 몸을 지켜 준다.",
  ],
  [
    "camping-bio",
    "캠핑 생명과학",
    "야외 실습용이다. 펼치면 세포가 기어 나와 알아서 분열한다. 텐트 안에서는 펼치지 않는다.",
  ],
  [
    "pedigree",
    "유전 가계도 문제집",
    "표시를 붙인 오답이 쓰러지면 표시가 옆의 둘에게 물려진다. 우성인지는 따지지 않는다.",
  ],
  ["dissection", "해부 실습서", "개구리에게는 미안한 책이다. 오답에게는 하나도 미안하지 않다."],
  [
    "ecosystem",
    "생태계 보고서",
    "땅에 펼쳐 두면 뿌리가 내린다. 뿌리 사이를 지나는 것은 발이 느려진다.",
  ],
  ["enzyme", "효소 반응 노트", "반응은 빨라지고 노트는 그대로다. 곁에 있으면 손이 빨라진다."],
  ["immune", "면역 필기", "항체가 주위를 돌며 날아오는 것을 막는다. 쓰러뜨린 만큼 몸이 낫는다."],
  [
    "round-earth",
    "지구는 둥글다 지구과학",
    "제목부터 단호하다. 바닥을 가리키면 잠시 뒤 단층이 갈라진다.",
  ],
  [
    "rock-box",
    "암석 표본 상자",
    "화성암, 퇴적암, 변성암 순서로 던진다. 순서를 바꾸면 선생님이 화낸다.",
  ],
  [
    "weather-map",
    "일기도 분석 노트",
    "등압선을 따라 그린 구름이 머리 위를 따라온다. 비가 먼저 오고 번개가 나중에 온다.",
  ],
  [
    "star-log",
    "천체 관측 일지",
    "일지에 적어 둔 자리에 정말로 무언가가 떨어진다. 일찍 적을수록 크게 떨어진다.",
  ],
  [
    "tide-table",
    "조석 예보표",
    "물이 들어왔다 나간다. 그 사이에 있던 것들도 같이 들어왔다 나간다.",
  ],
  [
    "volcano",
    "화산 탐구 보고서",
    "분화구 모형에 베이킹소다를 넣은 적이 있다. 이번 분화구에 든 것은 베이킹소다가 아니다.",
  ],
];

const EVOLVED: readonly Entry[] = [
  [
    "elements",
    "유클리드 원론",
    "다섯 개의 공준에서 시작해 원 하나로 끝난다. 펼칠 때마다 원이 퍼져 나간다.",
  ],
  ["fourier", "푸리에 급수", "어떤 곡선도 사인파를 겹치면 된다. 그래서 겹쳤다."],
  ["divergent", "발산 급수", "맞히는 동안에는 다음 항이 멈추지 않는다. 수렴은 남의 일이다."],
  [
    "expectation",
    "기댓값 정리",
    "한 판 안에서는 주사위 눈이 내려가지 않는다. 운이 실력이 되는 순간이다.",
  ],
  ["linear-map", "선형 변환", "축이 돌고 늘어난다. 좌표계가 바뀌어도 맞는 것은 맞는다."],
  ["complete-proof", "완전한 증명", "Q.E.D. 세 글자가 옆의 적에게도 번진다. 빈칸 없는 증명이다."],
  ["principia", "프린키피아 사본", "세 법칙이 적힌 사본. 던지면 벽에 닿기 전까지 멈추지 않는다."],
  [
    "foucault",
    "푸코 진자",
    "진자가 흔들리는 면이 천천히 돈다. 지구가 돈다는 증거가 이번에는 무기다.",
  ],
  ["maxwell", "맥스웰 방정식", "네 줄의 식으로 번개가 장이 된다. 맞은 적마다 둘로 갈라진다."],
  [
    "spectrum",
    "스펙트럼",
    "프리즘을 지난 빛이 일곱 갈래로 나뉜다. 빨주노초파남보 순서대로 아프다.",
  ],
  ["elastic", "탄성 충돌", "운동 에너지가 줄지 않는다. 부딪친 오답이 다른 오답에게 그대로 전한다."],
  ["universal-gravitation", "만유인력", "모든 것이 모든 것을 끌어당긴다. 우물끼리도 서로 당긴다."],
  ["aqua-regia", "왕수", "금도 녹이는 산. 웅덩이에 들어선 것은 무엇이든 갑옷부터 녹는다."],
  ["mendeleev", "멘델레예프의 꿈", "꿈에서 본 표에는 빈칸이 없었다. 이제 던질 원소를 고른다."],
  ["polymer", "고분자", "단위체가 끝없이 이어진다. 사슬이 길어지다 못해 두 번 휘감는다."],
  ["thermite", "테르밋", "알루미늄과 산화철. 불이 붙으면 녹은 쇠가 흘러 길을 낸다."],
  ["avogadro", "아보가드로 수", "이번에는 정말로 세지 않는다. 아주, 아주 많이 던진다."],
  ["buffer", "완충 용액", "무엇을 부어도 pH가 버틴다. 중화가 일어날 때마다 보호막이 두꺼워진다."],
  ["stem-cell", "줄기세포", "무엇이든 될 수 있는 세포. 상대를 보고 무엇이 될지 정한다."],
  ["mendel", "멘델의 법칙", "3 대 1. 표시는 셋에게 물려지고 대를 거듭해도 옅어지지 않는다."],
  [
    "precise-anatomy",
    "정밀 해부도",
    "어디를 가르면 되는지 그림으로 다 나와 있다. 피를 흘리는 곳이 급소다.",
  ],
  [
    "climax-forest",
    "극상림",
    "천이가 끝난 숲. 뿌리가 넓게 퍼지고, 숲에서 쓰러진 것은 숲을 살린다.",
  ],
  ["catalyst", "촉매", "반응에 끼어들고 자신은 그대로 남는다. 곁에 있는 모두의 손이 빨라진다."],
  [
    "herd-immunity",
    "집단 면역",
    "충분히 많은 사람이 지키면 모두가 지켜진다. 항체가 파티원 곁을 돈다.",
  ],
  [
    "plate-tectonics",
    "판 구조론",
    "단층이 닫히지 않고 판이 맞물린다. 경계 근처의 것은 틈으로 끌려 들어간다.",
  ],
  [
    "rock-cycle",
    "암석의 순환",
    "맞을 때마다 다음 암석으로 바뀌어 날아간다. 한 바퀴를 돌면 부서진다.",
  ],
  ["typhoon-eye", "태풍의 눈", "가운데는 맑고 둘레는 사납다. 번개가 쉬지 않고 떨어진다."],
  ["meteor-shower", "유성우", "관측 일지 한 쪽이 별똥별로 가득하다. 소원은 빌 틈이 없다."],
  ["spring-tide", "사리", "해와 달이 한 줄로 서는 날. 물이 가장 멀리 나갔다가 가장 깊이 들어온다."],
  ["stratovolcano", "성층 화산", "쌓이고 또 쌓인 화산. 분화가 길어지고, 흐른 용암이 식지 않는다."],
];

const TOOLS: readonly Entry[] = [
  ["compass", "컴퍼스", "바늘 쪽은 아무도 잡지 않는다."],
  ["grid-ruler", "모눈자", "1밀리미터까지 잰다. 쓸데없이 길다."],
  ["calculator", "계산기", "공학용이다. 시험 때는 걷어 간다."],
  ["dice", "주사위", "육면체. 가끔 모서리로 섰다고 우기는 학생이 있다."],
  ["set-square", "삼각자", "직각을 재는 용도다. 들고 뛰면 이상하게 발이 빨라진다."],
  ["red-pen", "빨간펜", "채점용이다. 동그라미보다 빗금 쪽이 많이 닳았다."],
  ["weight", "저울추", "1킬로그램짜리다. 왜 필통에 들어 있는지는 아무도 모른다."],
  ["stopwatch", "초시계", "재면 빨라진다. 안 재면 원래대로다."],
  ["battery", "건전지", "혀에 대 보면 아직 쓸 만하다."],
  ["prism", "프리즘", "창가에 두면 교실 벽에 무지개가 생긴다. 수업은 거기서 끝난다."],
  ["spring", "스프링", "늘였다 놓으면 돌아온다. 놓친 사람 손등으로."],
  ["apple", "사과", "급식 후식으로 나왔다. 아무도 먹지 않고 떨어뜨려 본다."],
  ["pipette", "피펫", "한 방울씩. 정확히 한 방울씩."],
  ["element-card", "원소 카드", "118장 한 벌. 뒤집어 보면 늘 원하던 원소가 아니다."],
  ["molecule-kit", "분자 모형", "공과 막대. 다 끼우면 책상보다 길어진다."],
  ["alcohol-lamp", "알코올램프", "뚜껑을 덮어서 끈다. 입으로 불면 혼난다."],
  ["scale", "전자저울", "0.01그램까지 잰다. 숨만 쉬어도 숫자가 바뀐다."],
  ["indicator", "지시약", "BTB 용액. 노란색과 파란색 사이에서 마음을 못 정한다."],
  ["microscope", "현미경", "배율을 올리면 세포가 늘어난 것처럼 보인다. 실제로 늘어난다."],
  ["peas", "완두콩", "주름진 것과 매끈한 것. 몇 대째를 세는 중인지 다들 잊었다."],
  ["tweezers", "핀셋", "끝이 너무 뾰족하다. 그래서 좋다."],
  ["flowerpot", "화분", "자습실 창가의 화분. 물은 당번이 준다고 했다."],
  ["test-tube", "시험관", "기울여서 가열한다. 입구는 늘 옆 사람이 아닌 쪽을 본다."],
  ["vaccine", "백신", "맞은 자리가 하루쯤 뻐근하다. 그래도 맞는다."],
  ["seismometer", "지진계", "자습실 책상만 흔들려도 바늘이 튄다. 범인은 대개 다리 떠는 사람이다."],
  ["rock-hammer", "돌망치", "표본을 깨는 용도다. 다른 것도 잘 깬다."],
  ["wind-vane", "풍향계", "옥상에 있던 것을 떼어 왔다. 바람은 여전히 옥상에서 분다."],
  ["telescope", "망원경", "천문돔 망원경의 보조 경통. 맑은 밤에는 빌려 달라는 줄이 선다."],
  ["calendar", "달력", "보름과 그믐에 동그라미가 쳐져 있다. 시험 날짜에는 아무 표시도 없다."],
  ["thermometer", "온도계", "100도까지 잰다. 이번 분화는 눈금 밖이다."],
];

/** 자판기 goods. 에너지 드링크 is already described in the hub (`energy-drink`). */
const SNACKS: readonly Entry[] = [
  ["water", "생수", "정수기 물을 병에 담았다. 그래도 돈을 받는다."],
  ["banana-milk", "바나나 우유", "단지 모양 병. 빨대는 하나만 준다."],
  ["kimbap", "삼각김밥", "참치마요. 비닐을 순서대로 뜯지 못하면 김이 찢어진다."],
  ["choco-bar", "초코바", "시험 기간에 가장 먼저 품절된다."],
  ["cup-ramen", "컵라면", "자정에 먹으면 가장 맛있다. 사감 선생님도 안다."],
  ["pudding", "푸딩", "숟가락은 들어 있지 않다."],
  ["ice-pop", "쭈쭈바", "반으로 나눠 먹는 것이 원칙이다."],
];

const termScope = w.scope("term");
const terms = (kind: Term["kind"], entries: readonly (readonly [string, string])[]): Term[] =>
  entries.map(([id, name]) => ({ id, kind, name: termScope.t(name) }));

export const STUDY_TERMS: readonly Term[] = [
  ...terms("status", [
    ["flammable", "가연"],
    ["burn", "불"],
    ["acid", "산"],
    ["base", "염기"],
    ["metal", "금속"],
    ["wet", "수분"],
    ["sodium", "나트륨"],
    ["bleed", "출혈"],
    ["slow", "둔화"],
    ["armorBreak", "방어 감소"],
    ["infection", "감염"],
    ["mark", "표식"],
    ["proof", "증명"],
    ["shield", "보호막"],
    ["invulnerable", "무적"],
  ]),
  ...terms("reaction", [
    ["neutralize", "중화"],
    ["combustion", "연소"],
    ["corrosion", "부식"],
    ["explosion", "폭발"],
  ]),
  ...terms("mode", [
    ["auto", "완전 자동"],
    ["semi", "반자동"],
    ["skill", "스킬 수동"],
    ["manual", "완전 수동"],
  ]),
  ...terms("stat", [
    ["understanding", "이해력"],
    ["memory", "암기력"],
    ["focus", "집중력"],
    ["vitality", "체력"],
    ["agility", "순발력"],
    ["luck", "운"],
  ]),
  ...terms("grade", [
    ["0", "교과서"],
    ["1", "참고서"],
    ["2", "심화서"],
    ["3", "전공서"],
    ["4", "원서"],
  ]),
  ...terms("class", [
    ["math", "수학"],
    ["physics", "물리"],
    ["chemistry", "화학"],
    ["biology", "생명"],
    ["earth", "지구과학"],
  ]),
  ...terms("tier", [
    ["freshman", "신입생"],
    ["first-year", "1학년"],
    ["midterm", "1학년 2학기"],
    ["second-year", "2학년"],
    ["third-year", "3학년"],
    ["researcher", "연구생"],
  ]),
  ...terms("monster", [
    ["odap", "오답"],
    ["odap-pencil", "연필 오답"],
    ["rational", "유리수 병사"],
    ["element-fire", "불의 정령"],
    ["element-water", "물의 정령"],
    ["element-air", "공기의 정령"],
    ["element-earth", "흙의 정령"],
    ["element-earth-pebble", "흙의 정령 조각"],
    ["cave-shadow", "동굴의 그림자"],
    ["tortoise", "제논의 거북이"],
    ["odap-golem", "오답노트 골렘"],
  ]),
  ...terms("label", [["elite", "심화"]]),
];

export const STUDY_DESCRIPTIONS: readonly Description[] = [
  ...items("book", BOOKS),
  ...items("evolved", EVOLVED),
  ...items("tool", TOOLS),
  ...items("snack", SNACKS),
];

export const STUDY_KO = w.ko;

const byId = new Map(STUDY_DESCRIPTIONS.map((d) => [d.id, d]));
const termById = new Map(STUDY_TERMS.map((t) => [`${t.kind}:${t.id}`, t.name]));

/** Name and bag description of `book:wangdo`, `tool:compass`, `evolved:elements`, `snack:water`. */
export function studyText(id: string): { readonly name: TextKey; readonly desc: TextKey } {
  const d = byId.get(id);
  if (!d) throw new Error(`no study text for ${id}`);
  return { name: d.name, desc: d.desc };
}

export function termKey(kind: Term["kind"], id: string): TextKey {
  const key = termById.get(`${kind}:${id}`);
  if (!key) throw new Error(`no ${kind} term ${id}`);
  return key;
}
