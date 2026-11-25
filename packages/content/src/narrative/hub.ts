/**
 * Hub life: idle lines for the campus NPCs and the freed scientists, switching at Page 1's story
 * milestones, and one- or two-line descriptions for places, stations, monsters and items.
 */
import { Writer } from "./author.ts";
import type { Bark, Description, Milestone } from "./schema.ts";

const w = new Writer("hub");

type Stage = readonly [from: Milestone, until: Milestone | undefined, lines: readonly string[]];

const barks = (speaker: string, where: string, stages: readonly Stage[]): Bark[] => {
  const s = w.scope(`bark-${speaker}`);
  return stages.flatMap(([from, until, lines]) =>
    lines.map((line) => ({
      speaker,
      text: s.t(line),
      from,
      where,
      ...(until ? { until } : {}),
    })),
  );
};

export const BARKS: readonly Bark[] = [
  ...barks("sagam", "dawn-hall", [
    [
      "p1.open",
      "p1.pythagoreans-freed",
      [
        "복도에서 뛰지 마십시오. 균열 안에서도 마찬가지입니다.",
        "기숙사 안 취식은 벌점 1점입니다. 고대 그리스 음식도 포함입니다.",
        "0시 30분 점호입니다. 늦으면 이름을 부르러 갑니다.",
      ],
    ],
    [
      "p1.pythagoreans-freed",
      "p1.zeno-freed",
      [
        "가우스실 강사분들께 전달했습니다. 콩은 반입 금지 품목이 아닙니다. 본인들이 거절하셨습니다.",
      ],
    ],
    [
      "p1.zeno-freed",
      "p1.aristotle-freed",
      [
        "제논 선생님은 점호 장소까지 오시는 데 오래 걸리십니다. 출발 시각을 0시 정각으로 당겨 드렸습니다.",
      ],
    ],
    [
      "p1.aristotle-freed",
      undefined,
      [
        "아리스토텔레스 선생님도 점호 대상입니다. 예외는 없습니다.",
        "선생님께서 사감실 비품을 분류하셨습니다. 아무것도 찾을 수 없습니다.",
      ],
    ],
  ]),
  ...barks("mo", "staff-room", [
    [
      "p1.open",
      "p1.pythagoreans-freed",
      [
        "네, 네. 균열 탐사 신청서요? 거기 두세요.",
        "R&E 보고서 마감은 지켜야죠. 시간이 찢어졌어도요.",
        "0조 계획서요? 사인한 건 기억나요. 제목이 길었어요.",
      ],
    ],
    [
      "p1.pythagoreans-freed",
      "p1.zeno-freed",
      ["가우스실 강사분들 계약서에 사인했어요. 열 장이었어요. 열 분이라서요."],
    ],
    [
      "p1.zeno-freed",
      "p1.aristotle-freed",
      ["제논 선생님 출근 기록이 이상해요. 출발 시각만 있고 도착 시각이 없어요."],
    ],
    [
      "p1.aristotle-freed",
      undefined,
      [
        "아리스토텔레스 선생님이 교무실 서류를 분류해 주셨어요. 제가 사인한 게 이렇게 많았네요.",
        "0조 실험 승인서도 나왔어요. 제 사인이 있네요. 읽어 볼걸 그랬어요.",
      ],
    ],
  ]),
  ...barks("principal", "gaseolgwan", [
    [
      "p1.open",
      "p1.pythagoreans-freed",
      [
        "균열 탐사는 우리 학교만의 특색 사업입니다. 교육청에서도 관심이 많습니다.",
        "학생 여러분, 아테네에서도 명찰은 패용하십시오.",
      ],
    ],
    [
      "p1.pythagoreans-freed",
      "p1.zeno-freed",
      ["가우스실이 이렇게 붐빈 것은 개교 이래 처음입니다. 내년 예산에 반영하겠습니다."],
    ],
    [
      "p1.zeno-freed",
      "p1.aristotle-freed",
      [
        "제논 선생님 강좌 「끝나지 않는 수업」은 정원이 찼습니다. 수업이 끝나지 않아 다음 반을 받을 수 없습니다.",
      ],
    ],
    [
      "p1.aristotle-freed",
      undefined,
      ["운동장의 기둥과 거북이 석상은 학교 기념물입니다. 사진은 찍되 올라가지는 마십시오."],
    ],
  ]),
  ...barks("hyunwoo", "gaseolgwan-2f", [
    [
      "p1.open",
      "p1.pythagoreans-freed",
      [
        "들어가는 사람 이름 적고 있어. 나오는 사람도.",
        "게시판에 새 공지 붙었어. 오늘 건 쉬워.",
        "복사본에 아직 한 장도 안 붙었어. 처음엔 다 그렇겠지.",
      ],
    ],
    [
      "p1.pythagoreans-freed",
      "p1.zeno-freed",
      ["학파 사람들이 한 말, 노트 뒤쪽에 적어 뒀어. 몇 번을 다시 읽었어."],
    ],
    [
      "p1.zeno-freed",
      "p1.aristotle-freed",
      ["둘이 똑같은 말을 했어. 셋째도 그러면 그건 우연이 아니야."],
    ],
    [
      "p1.aristotle-freed",
      undefined,
      ["한 장 돌아왔어. 열한 장 남았다.", "서하 글씨가 있었어. 그 페이지에."],
    ],
  ]),
  ...barks("garam", "maker-room", [
    [
      "p1.open",
      "p1.pythagoreans-freed",
      [
        "야, 오답 서른 마리면 그냥 숙제야.",
        "아 맞다, 자판기에 새 칸 생겼어. 맛은 묻지 마.",
        "메이커실 공구 함부로 쓰지 마. 반은 내가 고친 거야.",
      ],
    ],
    [
      "p1.pythagoreans-freed",
      "p1.zeno-freed",
      ["가우스실 앞에 콩자반 반납 줄이 있어. 학파 사람들이 받자마자 돌려줘."],
    ],
    [
      "p1.zeno-freed",
      "p1.aristotle-freed",
      ["제논 선생님 급식실 오는 데 점심시간을 다 써. 근데 이제 도착은 해."],
    ],
    [
      "p1.aristotle-freed",
      undefined,
      ["야, 그 아저씨가 메이커실 공구에 다 이름표 붙였어. 망치에 「치기 위한 것」이래."],
    ],
  ]),
  ...barks("cook", "cafeteria", [
    [
      "p1.open",
      "p1.pythagoreans-freed",
      [
        "학생, 국 더 떠 줄까? 오늘 국이 잘 됐어.",
        "지하? 거긴 창고야. 밥 식는다.",
        "균열 들어가는 애들은 두 번 와도 돼. 사감 선생님한텐 말하지 말고.",
      ],
    ],
    [
      "p1.pythagoreans-freed",
      "p1.zeno-freed",
      ["열 명이 와서 콩자반만 빼고 다 먹었어. 열 명이 다."],
    ],
    [
      "p1.zeno-freed",
      "p1.aristotle-freed",
      ["그 느린 선생님 오시면 돈가스 하나 빼 둬. 늘 마지막이라."],
    ],
    [
      "p1.aristotle-freed",
      undefined,
      [
        "수염 선생님이 반찬마다 이름을 적어 가. 맛은 안 적고.",
        "국에 뭐가 떠 있냐고 묻길래 정성이라고 했어. 그것도 적더라.",
      ],
    ],
  ]),
  ...barks("nurse", "infirmary", [
    [
      "p1.open",
      undefined,
      [
        "또 왔어요? 이번 주 세 번째예요.",
        "침대는 비어 있어요. 오래는 안 돼요.",
        "오답에 긁힌 데는 연고 바르면 돼요. 틀린 건 안 옮아요.",
      ],
    ],
  ]),
  ...barks("senior-math", "gauss-room", [
    [
      "p1.open",
      undefined,
      ["한 놈만 계속 때려. 열 번 쌓이면 끝나.", "서른 되면 나한테 와. 구술 면접 준비해 둬."],
    ],
    [
      "p1.pythagoreans-freed",
      undefined,
      ["학파 수업에서 내가 대각선 그었어. 다들 박수 쳤어. 열 명이 정확히 같은 박자로."],
    ],
  ]),
  ...barks("senior-physics", "physics-lab", [
    [
      "p1.open",
      undefined,
      [
        "봤어? 날아간 놈이 뒤에 놈을 쳤어. 운동량은 어디 안 가.",
        "서른 되면 와. 면접은 그냥 던지기야. 대충.",
      ],
    ],
    [
      "p1.zeno-freed",
      undefined,
      ["제논 선생님이랑 달리기 했어. 반씩 줄어도 결국 닿더라. 기록 남겼어."],
    ],
  ]),
  ...barks("senior-chem", "chem-lab", [
    [
      "p1.open",
      undefined,
      [
        "보안경 쓰세요. 균열에서 묻어 온 게 아직 남아 있어요.",
        "서른 되면 화학실로 오세요. 면접은 보안경 쓰고 봐요.",
      ],
    ],
  ]),
  ...barks("senior-bio", "eco-park", [
    [
      "p1.open",
      undefined,
      [
        "생태공원 연못에 사는 거, 세 종까지 셌어. 넷째는 아직 이름이 없어.",
        "오답도 번식해. 밤에 둘이 붙어 있더니 아침에 셋이 됐어.",
      ],
    ],
    [
      "p1.aristotle-freed",
      undefined,
      ["그 선생님이 생태공원 벌레를 다 세 가셨어. 나보다 두 종 더 찾았어. 분해."],
    ],
  ]),
  ...barks("senior-earth", "study-hall", [
    [
      "p1.open",
      undefined,
      [
        "바람이 바다 쪽이야. 오답이 운동장으로 몰리겠다.",
        "…졸방대는 서서 쓰는 거야. 나 서 있어.",
        "서른 되면 지구과학실로 와. 서두를 건 없겠다.",
      ],
    ],
  ]),
  ...barks("aristarchus", "p1-agora", [
    [
      "p1.open",
      undefined,
      ["그림자 밟지 마. 재는 중이야.", "그 고양이 말이 맞았어. 다시 재 보니 삼 도가 모자랐어."],
    ],
    [
      "p1.aristotle-freed",
      undefined,
      ["그 선생이 내 계산을 받아 적었어. 이번엔 누가 받아 적더라고."],
    ],
  ]),
  ...barks("guard", "p1-shadow-cave", [
    [
      "p1.wide",
      undefined,
      [
        "거기 서라. 명부에 없는 얼굴이다.",
        "이 동굴은 출입 금지다. 들어갔다 나온 자들은 그림자를 더 믿게 된다.",
        "너희 학교 사감에게 서신을 보냈다. 답장이 빠르더군.",
      ],
    ],
  ]),
  ...barks("pythagoreans", "gauss-room", [
    [
      "p1.pythagoreans-freed",
      undefined,
      [
        "우리는 이제 무리수를 말한다. 아직 목소리가 작다.",
        "한 사람이 먼저 말하고 나머지가 따라 한다. 그것을 연습한다.",
        "콩자반은 반납한다.",
      ],
    ],
  ]),
  ...barks("zeno", "field", [
    [
      "p1.zeno-freed",
      undefined,
      [
        "급식실까지 반 왔어요. 이제는 나머지 반도 가요.",
        "도착이라는 말이 좋아요. 하루에 몇 번씩 해요.",
      ],
    ],
    [
      "p1.era-change",
      undefined,
      ["거북 씨는 잘 지내요. 석상이 된 줄 알았는데 가끔 자리가 바뀌어 있어요."],
    ],
  ]),
  ...barks("aristotle-freed", "question-library", [
    [
      "p1.aristotle-freed",
      undefined,
      [
        "이 식당의 국은 분류가 안 되네. 무엇이 떠 있는지 아무도 말해 주지 않더군.",
        "자네, 그 벌레 다시 보여 주게. 다리가 여섯인지 세어야 하네.",
        "틀렸다는 걸 아는 건 기쁜 일일세. 다만 이천 년은 좀 길었네.",
        "생선이 나왔기에 이름을 물으니 그냥 생선이라더군. 생선에도 종이 있네.",
        "점호는 훌륭한 제도일세. 누가 어디 있는지 매일 세지 않나.",
        "자판기는 동전을 넣으면 음료가 나오네. 원인과 결과가 이렇게 분명한 기계는 처음일세.",
        "그 얼음 위의 돌은 아직도 미끄러지고 있겠지. 가끔 생각하네.",
        "자네들 시험지를 보았네. 틀린 답에도 분류가 필요하더군.",
      ],
    ],
  ]),
];

// Descriptions ------------------------------------------------------------------------------

const d = w.scope("desc");
const describe = (
  id: string,
  kind: Description["kind"],
  name: string,
  desc: string,
): Description => ({
  id,
  kind,
  name: d.t(name),
  desc: d.t(desc),
});

export const DESCRIPTIONS: readonly Description[] = [
  // Stations and hub places.
  describe(
    "bindery",
    "station",
    "제본대",
    "낱장 스무 장과 제본 재료를 올려 두면 교과서 한 권이 된다. 스테이플러는 쓰지 않는다.",
  ),
  describe(
    "forge",
    "station",
    "제련기",
    "같은 책 세 권을 넣으면 한 단계 위의 책 한 권이 나온다. 나머지 두 권이 어디로 가는지는 아무도 묻지 않는다.",
  ),
  describe(
    "vending",
    "station",
    "자판기",
    "급식실 앞. 음료와 간식, 에너지 드링크가 있다. 매주 한 칸에 처음 보는 물건이 들어온다.",
  ),
  describe(
    "corkboard",
    "station",
    "매점 게시판",
    "학교에 처음 생긴 매점. 코르크판이다. 압정 하나에 물건 하나.",
  ),
  describe(
    "cafeteria",
    "place",
    "급식실",
    "식단은 매일 바뀌고, 먹으면 30분 동안 힘이 난다. 시험 기간에는 반찬이 하나 는다.",
  ),
  describe(
    "study-hall",
    "place",
    "자습실",
    "여기서 접속을 끊으면 자습 시간이 더 쌓인다. 의자는 120도까지 젖혀진다.",
  ),
  describe(
    "standing-desk",
    "station",
    "졸방대",
    "서서 공부하는 책상. 삼십 초 서 있으면 졸음이 가신다.",
  ),
  describe(
    "colosseum",
    "place",
    "콜로세움",
    "새벽관 신관 복도에 둘러싸인 마당. 결투는 마당에서 하고, 구경은 복도 난간에서 한다.",
  ),

  // Page 1 places. Field names follow PAGE1_FIELDS in fields.ts.
  describe("p1-agora", "place", "아고라", "아테네의 광장. 균열 안의 거점이다. 여기는 늘 오후다."),
  describe(
    "p1-colonnade",
    "place",
    "무너진 열주",
    "운동장 균열을 막 지나면 나오는 기둥 터. 서 있는 기둥보다 누운 기둥이 많다.",
  ),
  describe(
    "p1-olive-road",
    "place",
    "올리브 숲길",
    "낮은 올리브 나무 사이로 난 길. 거북이가 길 한가운데를 천천히 건넌다.",
  ),
  describe(
    "p1-cave-mouth",
    "place",
    "동굴 입구",
    "그림자 동굴 앞 비탈. 안쪽에서 나온 그림자가 여기까지 기어 나온다.",
  ),
  describe(
    "p1-agora-edge",
    "place",
    "아고라 외곽",
    "광장으로 들어가는 길목. 4원소 정령들이 서로 제자리를 우긴다.",
  ),
  describe(
    "p1-croton-school",
    "place",
    "크로톤 학당",
    "피타고라스 학파의 학당. 바닥 전체가 번호를 매긴 모눈이고, 대각선으로 걷는 사람은 없다.",
  ),
  describe(
    "p1-elea-track",
    "place",
    "엘레아 경주로",
    "제논의 고향 엘레아의 경주로. 출발선은 있고 결승선은 없다.",
  ),
  describe(
    "p1-lyceum",
    "place",
    "리케이온",
    "아리스토텔레스가 걸으며 가르쳤다고 전해지는 곳. 기둥마다 강의 계획서가 붙어 있다.",
  ),
  describe(
    "p1-shadow-cave",
    "place",
    "그림자 동굴",
    "아테네 경비병이 입구를 지키는 동굴. 안쪽 벽에는 바깥의 무언가가 그림자로 비친다.",
  ),

  // Assistants for escort notices.
  describe(
    "pythagorean-junior",
    "npc",
    "학파의 막내",
    "피타고라스 학파의 막내. 대각선으로 걷는 연습을 한다.",
  ),
  describe(
    "lyceum-scribe",
    "npc",
    "리케이온 서기",
    "아리스토텔레스의 말을 밀랍판에 받아 적는다. 손이 늘 바쁘다.",
  ),
  describe(
    "survey-helper",
    "npc",
    "측량 조수",
    "아리스타르코스의 막대기를 들고 다닌다. 그림자를 밟으면 혼난다.",
  ),

  // Items.
  describe("pinecone", "item", "솔방울", "학교 해솔에서 떨어진 솔방울. 이 학교에서는 돈이다."),
  describe(
    "merit",
    "item",
    "상점",
    "규칙을 지켜서 받은 점수. 벌점을 하나씩 지운다. 남으면 학생회 상점에서 쓴다.",
  ),
  describe("token", "item", "탐구 토큰", "보스와 싸운 증표. 탐구 상점에서만 받는다."),
  describe("sheet", "item", "낱장", "책에서 떨어져 나온 한 장. 스무 장이면 제본대에서 책이 된다."),
  describe("ink", "item", "잉크", "필기에 쓴다. 쓰다 보면 손에 묻는다."),
  describe("binding", "item", "제본 재료", "실, 풀, 표지. 제본대에 낱장과 같이 올린다."),
  describe(
    "energy-drink",
    "item",
    "에너지 드링크",
    "졸음을 쫓는다. 사감 선생님은 몇 캔째인지 센다.",
  ),
];

export const HUB_KO = w.ko;
