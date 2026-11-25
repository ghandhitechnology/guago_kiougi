/**
 * The voice bible as data. Every speaker the hub and Page 1 use, with one register each, habits,
 * what they never say, three sample lines and the voice test: each one is told the cafeteria ran
 * out of 돈가스. If two of those answers could swap owners, the voices are not distinct yet.
 */
import { Writer } from "./author.ts";
import type { Register, Speaker } from "./schema.ts";

const w = new Writer("speaker");

interface Voice {
  readonly id: string;
  readonly name: string;
  readonly register: Register;
  readonly actor?: string;
  readonly portrait?: string;
  readonly faces: readonly string[];
  readonly role: string;
  readonly habits: readonly string[];
  readonly never: readonly string[];
  readonly samples: readonly [string, string, string];
  readonly donkatsu: string;
}

const voice = (v: Voice): Speaker => {
  const s = w.scope(v.id);
  return {
    id: v.id,
    name: s.t(v.name),
    register: v.register,
    ...(v.actor ? { actor: v.actor } : {}),
    ...(v.portrait ? { portrait: v.portrait } : {}),
    faces: v.faces,
    role: v.role,
    habits: v.habits,
    never: v.never,
    samples: v.samples.map((t) => s.t(t)),
    donkatsu: s.t(v.donkatsu),
  };
};

export const SPEAKERS: readonly Speaker[] = [
  voice({
    id: "entropy",
    name: "엔트로피",
    register: "banmal",
    portrait: "portrait-entropy",
    faces: ["neutral", "alert"],
    role: "The tricolor campus cat. Speaks only where an era leaks into the campus. Guide and tutorial voice. Always right.",
    habits: [
      "One-clause verdicts about what is in front of her, present tense",
      "Two sentences at most; the second undercuts the first",
      "Calls the player nothing; a name never leaves her mouth",
      "Teaches by stating a fact the player can act on (피해. 주워.)",
    ],
    never: [
      "Exclamation marks, questions, 냥 or any cat noise",
      "Encouragement (힘내, 할 수 있어) or feeling words",
      "Explaining why something is funny",
    ],
    samples: ["그거, 이제 무기야.", "이해한 만큼 아프다.", "거북이는 쫓지 마. 저건 안 잡힌다."],
    donkatsu: "늦게 왔네. 생선은 남았다.",
  }),
  voice({
    id: "sagam",
    name: "권 사감",
    register: "hapsyo",
    portrait: "portrait-sagam",
    faces: ["neutral", "whistle"],
    role: "Dorm supervisor. Runs 점호, keeps the 상벌점 ledger. The school outranks the apocalypse because of her.",
    habits: [
      "Rule, time to the minute, consequence, in that order",
      "Calls every resident 학생 and every adult 선생님, and enforces the same rules on both",
      "Treats the rift as an agenda item for a meeting",
      "Two short blasts of the whistle before anything important",
    ],
    never: [
      "Raises her voice: no exclamation marks",
      "Threatens anything the rulebook does not say",
      "Jokes on purpose, or says how she feels",
    ],
    samples: [
      "점호 시간입니다. 전원 기숙사로 복귀하십시오.",
      "23시 52분, 소등 후 외출입니다. 벌점 1점입니다.",
      "아리스토텔레스 선생님, 기숙사에 머무시는 동안은 점호 대상입니다.",
    ],
    donkatsu: "돈가스는 12시 51분에 소진되었습니다. 새치기한 학생 셋은 이름을 적었습니다.",
  }),
  voice({
    id: "mo",
    name: "모 선생님",
    register: "haeyo",
    faces: ["neutral", "signing"],
    role: "R&E 지도교사. Signs every form without reading it, which is how all of this got approved.",
    habits: [
      "Says 네, 네 before the question ends",
      "Remembers a document's title and its length, never its content",
      "Signs whatever is put in front of him, and is kind about it",
    ],
    never: ["Reads anything to the end", "Says no", "Asks what a form is for", "반말"],
    samples: [
      "네, 네. 여기 사인하면 되죠?",
      "0조 계획서요? 사인한 건 기억나요. 제목이 길었어요.",
      "균열 탐사 신청서는 책상에 두고 가요. 아, 벌써 사인돼 있네요. 제가 했나 봐요.",
    ],
    donkatsu: "돈가스 없어요? 그럼 아무거나 주세요. 이 식단표도 사인해야 하는 거예요?",
  }),
  voice({
    id: "principal",
    name: "교장 선생님",
    register: "hapsyo",
    faces: ["neutral"],
    role: "Reclassifies a tear in spacetime as a 방과후학교 program within one morning.",
    habits: [
      "Turns any event into a program with a name in 「」, a percentage and a deadline",
      "Long sentences, 여러분, surveys and committees",
      "Announces the money before the plan",
    ],
    never: [
      "Calls anything dangerous as a reason to stop it",
      "Admits a mistake",
      "Two short sentences in a row",
    ],
    samples: [
      "운동장에 생긴 현상은 오늘부터 방과후학교 「균열 탐사(심화)」로 운영합니다. 수행평가의 20퍼센트입니다.",
      "아테네 측 경비 인력과 협조 체계를 갖추었습니다. 적발된 학생의 벌점은 우리 학교 기준으로 부과합니다.",
      "외부 강사 초빙 예산은 이미 확보했습니다. 어느 분을 모실지는 아직 정하지 않았습니다.",
    ],
    donkatsu:
      "돈가스 조기 소진은 급식 만족도가 높다는 뜻입니다. 다음 주부터 「돈가스 수요 조사」를 실시하겠습니다.",
  }),
  voice({
    id: "broadcast",
    name: "교내 방송",
    register: "hapsyo",
    faces: [],
    role: "The broadcasting club's announcer. Reads exactly what is on the paper, however strange.",
    habits: [
      "Opens with 교내 방송입니다 or 알려 드립니다",
      "Gives the place, then repeats the one fact that matters with 다시 알려 드립니다",
    ],
    never: ["Comments on the news", "Guesses", "반말"],
    samples: [
      "교내 방송입니다. 크로톤 학당에 피타고라스 학파가 나타났습니다. 다시 알려 드립니다. 크로톤 학당입니다.",
      "토론 시간입니다. 22시까지 리케이온의 모든 반론이 1.5배로 들어갑니다.",
      "분실물 안내입니다. 급식실 앞에서 「홀리데이 일반물리」 한 권이 발견되었습니다. 표지에 오답 자국이 있습니다.",
    ],
    donkatsu:
      "급식실에서 알려 드립니다. 오늘 돈가스는 모두 소진되었습니다. 다시 알려 드립니다. 돈가스는 없습니다.",
  }),
  voice({
    id: "nurse",
    name: "보건 선생님",
    register: "haeyo",
    faces: ["neutral"],
    role: "Runs the 보건실 where knocked-out students wake. Has seen everything twice.",
    habits: [
      "Counts visits out loud",
      "Gives one practical order (누워 있어요, 물 마셔요)",
      "Keeps care and discipline apart: 벌점 is someone else's job",
    ],
    never: ["Panics", "Scolds", "Asks how it happened"],
    samples: [
      "또 왔어요? 이번 주 세 번째예요.",
      "일어나지 말고 그대로 있어요. 물 가져올게요.",
      "벌점은 제 담당이 아니에요. 그건 문 앞에서 기다리고 있을 거예요.",
    ],
    donkatsu: "돈가스 없다고 쓰러지진 않아요. 아, 그런 학생이 있었죠. 일단 누워요.",
  }),
  voice({
    id: "cook",
    name: "조리사님",
    register: "banmal",
    faces: ["neutral"],
    role: "급식실 조리사. Keeper of buffs. Knows more about the tunnel under the kitchen than she admits.",
    habits: [
      "Calls everyone 학생",
      "Answers questions with food, measured in 국자",
      "Remembers who ate what and who skipped",
      "Changes the subject the moment the tunnel comes up",
    ],
    never: [
      "Explains the tunnel",
      "Refuses seconds",
      "존댓말 to a student",
      "Complains about work",
    ],
    samples: [
      "학생, 국 더 떠 줄까? 오늘 국이 잘 됐어.",
      "지하? 거긴 창고야. 밥 식는다.",
      "그 수염 선생님, 반찬 이름을 또 적어 가더라. 맛은 안 적고.",
    ],
    donkatsu: "돈가스 떨어졌어. 계란 하나 더 얹어 줄게. 사감 선생님한텐 말하지 말고.",
  }),
  voice({
    id: "parent",
    name: "엄마",
    register: "banmal",
    faces: ["neutral"],
    role: "Voice at home during 명령퇴사. Worry comes out as food.",
    habits: [
      "Asks if you eat",
      "Lists what is in the fridge",
      "Gets to the 벌점 late and never finishes",
    ],
    never: ["Yells", "Mentions grades", "Knows anything about rifts"],
    samples: [
      "밥은 잘 먹고 다니니?",
      "학교에서 전화 왔더라. 벌점이 스무 점이라며. 밥은 먹었고?",
      "냉장고에 장조림 있어. 가방에 반찬통도 넣어 놨다.",
    ],
    donkatsu: "학교에 돈가스가 없어? 그럼 주말에 와. 엄마가 해 줄게.",
  }),
  voice({
    id: "hyunwoo",
    name: "도현우",
    register: "banmal",
    portrait: "portrait-hyunwoo",
    faces: ["neutral", "lost"],
    role: "2학년, 0조. Carries the notebook, takes every job on himself, cannot remember the night.",
    habits: [
      "Short practical sentences that end in the next step",
      "Writes things down, and says so (적어 둘게)",
      "Trails off where a memory of that night should be",
      "Counts people in and out of the rift",
    ],
    never: [
      "Says 서하's name with drama, or cries",
      "Says he is fine",
      "Makes the first joke in a conversation",
    ],
    samples: [
      "이거 우리 조 연구노트야. 열두 장이 찢겨 나갔어.",
      "그날 밤 지하에 왜 내려갔는지는 기억이 안 나. 노트에 그렇게 쓰여 있었다는 것만 기억나.",
      "게시판 봤어? 균열 탐사가 수행평가 이십 퍼센트래. 우리가 연 문으로 점수를 주네.",
    ],
    donkatsu: "돈가스 없대. 내일 메뉴 적어 둘게. 내일은 일찍 가자.",
  }),
  voice({
    id: "garam",
    name: "민가람",
    register: "banmal",
    faces: ["neutral", "grin"],
    role: "2학년, 0조. Built the laser rig. Fills every silence, especially the ones about 서하.",
    habits: [
      "Starts with 야, or 아 맞다,",
      "Talks fast, nicknames monsters and teachers",
      "Turns a job into a count and the count into a joke",
      "Calls small disasters 사건",
    ],
    never: ["Speaks slowly", "Says scared", "Lets a silence last", "Talks about feelings directly"],
    samples: [
      "야, 저 X들 빨간펜 자국 같지 않아? 기말 시험지에서 걸어 나온 거 같아.",
      "아 맞다, 게시판에 새 공지 붙었어. 오답 서른 마리. 서른이면 그냥 숙제야.",
      "서하 자리 치우지 마. 돌아와서 지 자리 없으면 나한테 뭐라 할걸.",
    ],
    donkatsu: "야, 돈가스 없대. 나 이거 하나 보고 4교시 버텼는데. 이건 사건이야.",
  }),
  voice({
    id: "seoha",
    name: "윤서하",
    register: "banmal",
    faces: ["neutral"],
    role: "2학년, 0조 leader. Gone into the first rift. In Page 1 she exists in handwriting and in what the others leave unsaid.",
    habits: [
      "Numbers her hypotheses (가설 하나.)",
      "Writes short notes ending in a period, signed ㅅㅎ",
      "Trusts a measurement over anyone's confidence, including her own",
    ],
    never: ["Guesses without saying it is a guess", "Gushes", "Gives up on a measurement"],
    samples: [
      "가설 하나. 숫자가 너무 잘 맞으면 숫자를 의심한다.",
      "다음 측정은 노트 안 보고 한다.",
      "늦지 마. 마감은 안 기다려 줘.",
    ],
    donkatsu: "몇 시에 떨어졌어? 내일은 그 오 분 전에 가면 되겠네.",
  }),
  voice({
    id: "senior-math",
    name: "석지안",
    register: "banmal",
    faces: ["neutral"],
    role: "3학년, 수학. Holds the 1층 로비 in the opening. Gives the 수학 전직.",
    habits: [
      "Probabilities and exact ratios",
      "Corrects round numbers",
      "Says what is optimal and stops talking",
    ],
    never: ["Rounds without saying so", "Hurries", "Exclamation marks"],
    samples: [
      "한 놈만 계속 때려. 열 번 쌓이면 방어고 뭐고 없어.",
      "손으로 겨누면 십 퍼센트 더 들어가. 전부 손으로 하면 이십.",
      "운동장 재 봤어. 정사각형이야. 오차 없이.",
    ],
    donkatsu: "돈가스는 백이십 인분이고 나는 백사십일 번째였어. 확률 문제도 아니야.",
  }),
  voice({
    id: "senior-physics",
    name: "배도윤",
    register: "banmal",
    faces: ["neutral"],
    role: "2학년, 물리. Holds the 3층 landing. Delighted by every collision. Gives the 물리 전직.",
    habits: [
      "Narrates in physics terms: 운동량, 마찰, 포물선",
      "Estimates with 대충 and is proud of it",
      "Times things on his phone; never stands still",
    ],
    never: ["Says something is scary", "Exact decimals", "Stands still"],
    samples: [
      "봤어? 날아간 놈이 뒤에 놈을 쳤어. 운동량은 어디 안 가.",
      "난간 타지 마. 마찰이 없어서 진짜 끝까지 간다.",
      "책은 위로 던져. 포물선으로 떨어질 때가 제일 아파.",
    ],
    donkatsu: "돈가스 없어? 밥 두 공기면 열량은 대충 맞아. 계산했어. 대충.",
  }),
  voice({
    id: "senior-chem",
    name: "한소율",
    register: "haeyo",
    faces: ["neutral"],
    role: "3학년, 화학. Holds the 2층 landing in goggles. Polite to everyone, juniors included, which frightens them. Gives the 화학 전직.",
    habits: [
      "해요체 to everyone, first-years included",
      "Safety first: 보안경, 장갑, distance",
      "Describes anything as a reaction with an order of steps",
    ],
    never: ["반말", "Runs", "Touches anything bare-handed", "Exclamation marks"],
    samples: [
      "보안경 쓰세요. 지금 이 계단 전체가 실험대예요.",
      "먼저 묻히고 나중에 불 붙이세요. 순서 바꾸면 덜 타요.",
      "맨손으로 만지지 마세요. 오답은 묻어요.",
    ],
    donkatsu: "돈가스가 없으면 튀김 기름이 식는 중이겠네요. 오늘은 주방 근처에 가지 마세요.",
  }),
  voice({
    id: "senior-bio",
    name: "오여름",
    register: "banmal",
    faces: ["neutral"],
    role: "2학년, 생명. Holds the front door with her dividing cells. Counts species in the 생태공원. Gives the 생명 전직.",
    habits: [
      "Calls creatures 얘, 쟤, 얘네",
      "Counts species and individuals",
      "Gentle, and a little on the side of anything alive",
    ],
    never: ["Hurts something for no reason", "Says gross", "Raises her voice"],
    samples: [
      "얘네도 번식해. 오답이 오답을 낳는 거 봤어.",
      "내 세포 밟지 마. 지금 분열 중이야.",
      "생태공원 연못에 사는 거, 세 종까지 셌어. 넷째는 아직 이름이 없어.",
    ],
    donkatsu: "돈가스 없대. 오이무침은 오늘도 남았고. 쟤는 매일 살아남네.",
  }),
  voice({
    id: "senior-earth",
    name: "우태산",
    register: "banmal",
    faces: ["neutral", "asleep"],
    role: "3학년, 지구과학. Sleeps standing at the 졸방대. Holds the 4층 landing. Gives the 지구과학 전직.",
    habits: [
      "Forecasts with -겠다",
      "Gives delays in seconds",
      "Few words, slow, never moves first",
    ],
    never: ["Hurries", "Exclamation marks", "Talks about the past"],
    samples: [
      "삼 초 뒤에 갈라지겠다. 비켜 있어.",
      "예보에 없었는데.",
      "바람이 바다 쪽이야. 오답이 운동장으로 몰리겠다.",
    ],
    donkatsu: "돈가스는 12시 50분쯤 떨어지겠다고 봤어. 그래서 비빔밥 먹었어.",
  }),
  voice({
    id: "guard",
    name: "아테네 경비병",
    register: "banmal",
    faces: [],
    role: "Patrols the 그림자 동굴, the Page 1 위험 구역. Reports students to 권 사감 by letter.",
    habits: ["Barked orders in 해라체", "Checks faces against a list (명부)"],
    never: ["Polite endings", "Chases anyone far"],
    samples: [
      "거기 서라. 명부에 없는 얼굴이다.",
      "이 동굴은 출입 금지다. 돌아가라.",
      "너희 학교 사감에게 서신을 보냈다. 답장이 빠르더군.",
    ],
    donkatsu: "돈가스가 뭐냐. 명부에 없는 음식이다.",
  }),
  voice({
    id: "pythagoreans",
    name: "피타고라스 학파",
    register: "banmal",
    faces: ["chorus", "one"],
    role: "Mid boss 1, a collective that speaks as one. Trapped by 만물은 정수의 비다. After they are freed, members start to speak alone.",
    habits: [
      "Say 우리, count aloud, revere ten (1 + 2 + 3 + 4)",
      "Every length is a ratio of two whole numbers",
      "Will not name the diagonal's length: 그것, 그 길이",
      "해라체 like a creed",
    ],
    never: ["나 (until the diagonal breaks them)", "Approximately", "Beans"],
    samples: [
      "하나, 둘, 셋, 넷. 합하여 열. 우리는 열을 센다.",
      "모든 길이는 두 정수의 비다. 비로 쓸 수 없는 것은 말하지 않는다.",
      "대각선으로 오지 마라. 그 길이는 우리 셈에 없다.",
    ],
    donkatsu:
      "돈가스가 없다. 그러면 남은 것을 센다. 밥 하나, 국 하나, 김치 하나. 콩자반은 세지 않는다.",
  }),
  voice({
    id: "zeno",
    name: "제논",
    register: "haeyo",
    faces: ["neutral"],
    role: "Mid boss 2. Defends his teacher 파르메니데스 with paradoxes: motion and plurality are incoherent. Polite and maddening.",
    habits: [
      "Polite questions that halve every distance",
      "Speaks of 저희 선생님 with complete loyalty",
      "Never moves, never hurries",
      "Polite to everyone, the tortoise included",
    ],
    never: ["반말, even to the tortoise", "The word 도착 (until he is freed)", "Insults"],
    samples: [
      "저한테 오시려면 먼저 반을 오셔야 해요. 그 반의 반도요. 언제 출발하세요?",
      "저희 선생님 말씀은 하나예요. 있는 것은 하나고, 움직임은 말이 안 된다고요.",
      "아킬레우스한테도 똑같이 여쭤봤어요. 거북이가 먼저 출발했으니까요.",
    ],
    donkatsu:
      "돈가스가 다 떨어졌다고요? 마지막 조각을 반으로, 또 반으로 나누면 끝이 없잖아요. 그럼 아직 남아 있는 거 아닐까요?",
  }),
  voice({
    id: "aristotle",
    name: "아리스토텔레스",
    register: "hage",
    faces: ["neutral", "lecture", "stunned"],
    role: "Era boss, trapped by 무거운 것이 더 빨리 떨어진다, 움직임에는 미는 것이 있어야 한다, 4원소설. Lectures to nobody.",
    habits: [
      "자네; 하게체 like a dubbed elder scholar",
      "Classifies: 본성, 제자리, ~에는 네 가지가 있네",
      "States, never asks; talks over objections",
    ],
    never: ["Asks a question he wants answered", "모르겠네", "Polite or 반말 endings"],
    samples: [
      "무거운 것은 본성대로 아래를 향하네. 더 무거우면 더 서두르지.",
      "움직이는 것에는 반드시 미는 것이 있네. 미는 손이 떨어지면 움직임도 그치지.",
      "흙은 아래로, 불은 위로. 자네도 제자리로 돌아가게.",
    ],
    donkatsu: "무거운 쟁반이 먼저 내려가듯, 무거운 돈가스가 먼저 사라진 걸세. 당연한 일이네.",
  }),
  voice({
    id: "aristotle-freed",
    name: "아리스토텔레스",
    register: "hage",
    actor: "aristotle",
    faces: ["neutral", "curious"],
    role: "Freed: 방과후 강사 and curator of the 도감. Catalogues everything, complains about the cafeteria, enjoys having been wrong.",
    habits: [
      "Asks questions now, and writes the answers on a wax tablet",
      "Classifies the campus: insects, side dishes, tools by what they are for",
      "Complains about the cafeteria with taxonomy",
      "Wry about his own two thousand years",
    ],
    never: ["Refuses evidence", "Pretends he was right", "Polite or 반말 endings"],
    samples: [
      "이 식당의 국은 분류가 안 되네. 무엇이 떠 있는지 아무도 말해 주지 않더군.",
      "자네, 그 벌레 다시 보여 주게. 다리가 여섯인지 세어야 하네.",
      "틀렸다는 걸 아는 건 기쁜 일일세. 다만 이천 년은 좀 길었네.",
    ],
    donkatsu: "돈가스가 없다고? 어제 먹어 두길 잘했군. 식단표에 「희귀」라고 적어 두겠네.",
  }),
  voice({
    id: "aristarchus",
    name: "아리스타르코스",
    register: "banmal",
    faces: ["neutral"],
    role: "Page 1 ally, the one who was right. Measures the sky with shadows. Used to not being listened to.",
    habits: [
      "Measures with a stick, his fingers and shadows; draws triangles in the dirt",
      "Gives estimates with 쯤 and ranges",
      "Asks people to hear him out (들어 볼래?)",
    ],
    never: ["Bitterness", "Says he was right first", "Boasts"],
    samples: [
      "반달일 때 해랑 달 사이 각을 재면 거리 비가 나와. 내가 쟀을 땐 열여덟 배에서 스무 배 사이.",
      "해가 땅보다 훨씬 커. 큰 게 작은 걸 돈다는 게 이상하지 않아?",
      "끝까지 들어 줄 거지? 여기 사람들은 끝까지 듣던데.",
    ],
    donkatsu: "돈가스가 뭔지는 모르겠는데 다들 그쪽으로 뛰더라. 나는 사람 없는 쪽이 익숙해.",
  }),
  voice({
    id: "player",
    name: "{player}",
    register: "haeyo",
    faces: [],
    role: "The player, a 1학년 in the second week of school. Speaks only through choices.",
    habits: ["Few words", "해요체 to everyone, the cat included"],
    never: ["반말", "Speeches"],
    samples: ["네.", "…이걸로요?", "고양이가… 말을 해요?"],
    donkatsu: "…그럼 밥만 주세요.",
  }),
];

export const SPEAKERS_KO = w.ko;
