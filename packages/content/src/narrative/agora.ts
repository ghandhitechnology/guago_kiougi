/**
 * What the 아고라's people say when a student from the future walks past (cast.ts, the spots in
 * maps/p1-agora.ts). They were here before the tear and have opinions about it. Their voices are
 * in speakers.ts. The order, the bean watcher, the junior and the scribe change their minds when
 * their teachers are freed; everyone else says the same thing all afternoon, which never ends.
 */
import { Writer } from "./author.ts";
import type { Bark, Milestone } from "./schema.ts";

const w = new Writer("agora");

type Said = readonly [speaker: string, text: string];

const barks = (
  scope: string,
  from: Milestone,
  until: Milestone | undefined,
  lines: readonly Said[],
): Bark[] => {
  const s = w.scope(scope);
  return lines.map(([speaker, text]) => ({
    speaker,
    text: s.t(text),
    from,
    ...(until ? { until } : {}),
    where: "p1-agora",
  }));
};

const TOWN = barks("town", "p1.open", undefined, [
  ["agora-potter", "미래에서 왔다는 애들이냐. 그 옷은 무슨 흙으로 물들였냐."],
  ["agora-potter", "찢어진 데 너무 가까이 가지 마라. 덜 구운 그릇처럼 생겼다."],
  ["agora-potter", "도편 필요하면 와라. 다들 저 균열 이름을 쓰겠다더라."],
  ["agora-barber", "들었어요? 균열 너머에선 다들 똑같은 옷을 입는대요. 매일요."],
  ["agora-barber", "그쪽 머리도 다듬어 드릴까요? 미래 머리는 처음이에요."],
  ["agora-barber", "철학자들 수염은 다 제가 깎아요. 그래서 다 알아요."],
  ["agora-customer", "고개를 돌릴 수 없습니다. 인사는 받은 걸로 하겠습니다."],
  ["agora-customer", "아침에 앉았습니다. 아직 반쪽입니다."],
  ["agora-customer", "방금 그 소문은 사실이 아닙니다. 제 얘기라서 압니다."],
  ["agora-cook", "너희 학교에도 요리사가 있냐. 나보다 잘하냐. 대답하지 마라."],
  ["agora-cook", "저 찢어진 데서 기름 냄새가 난다. 누가 뭘 튀긴다."],
  ["agora-cook", "한 숟갈 맛보고 가라. 공짜는 아니다."],
  ["agora-pointer", "너, 미래에서 왔지. 저 균열 편이냐, 내 편이냐."],
  ["agora-pointer", "투표하자. 도편에 이름만 쓰면 된다. 저것 이름이 뭐냐."],
  ["agora-pointer", "십 년 추방이다. 십 년 뒤에도 저기 있으면 그때 또 하자."],
  ["agora-counter", "저 사람 말 듣지 마요. 오늘만 열한 번 틀렸어요."],
  ["agora-counter", "균열 이름을 몰라서 투표를 못 하는 거예요. 그게 이 사람 문제예요."],
  ["agora-counter", "학생은 오늘 몇 번 틀렸어요? 저는 세는 걸 좋아해요."],
  ["agora-children", "미래에도 굴렁쇠 있어? 거기서도 굴러가?"],
  ["agora-children", "저 찢어진 데 들어가면 혼나. 우리는 안 들어가."],
  ["agora-children", "바지다. 바지 입었어."],
  ["agora-fishmonger", "미래 돈은 안 받는다. 미래 생선도 안 판다."],
  ["agora-fishmonger", "보기만 할 거면 저리 가. 생선이 부끄러워한다."],
  ["agora-fishmonger", "오늘 잡은 거다. 오늘이 안 끝나서 계속 오늘 잡은 거다."],
  ["agora-water", "비켜 주십시오. 가득 찼습니다."],
  ["agora-water", "균열 쪽 물은 맛이 다릅니다. 밤 맛입니다."],
  ["agora-water", "물이 필요하면 샘으로 가십시오. 이 항아리는 집으로 갑니다."],
  ["agora-sleeper", "…자고 일어나도 세 시 십 분이다. 좋은 동네야."],
  ["agora-sleeper", "…미래에서도 낮잠 자냐. 그럼 됐다."],
  ["agora-sleeper", "…저 찢어진 데서 밤 냄새가 나. 잠이 잘 온다."],
  ["agora-sophist", "미래에서 오셨군요. 거기 수업료는 얼마입니까? 참고하려고요."],
  ["agora-sophist", "균열이 좋다는 쪽 변론, 지금 반값입니다."],
  [
    "agora-sophist",
    "무거운 것이 먼저 떨어진다는 강의를 들으셨지요. 저는 반대쪽도 가르칩니다. 둘 다 유료입니다.",
  ],
  ["agora-messenger", "비켜, 비켜. 급보다."],
  ["agora-messenger", "급보다. 균열에서 또 학생이 나왔다. 그게 너다."],
  ["agora-messenger", "급보다. 아무 일도 없다. 그것도 급보다."],
  ["survey-helper", "밟았다. 방금 밟았어. 다시 재야 돼."],
  ["survey-helper", "우리 선생님 말 끝까지 들어 준 건 너희가 처음이래."],
  ["survey-helper", "해까지는 달까지의 스무 배쯤이래. 쯤이 중요하대."],
]);

/** The order and its own two, while 크로톤 still counts wrong. */
const ORDER_BEFORE = barks("order", "p1.open", "p1.pythagoreans-freed", [
  ["pythagorean-order", "하나, 둘, 셋, 넷. 합하여 열. 너도 세어라."],
  ["pythagorean-order", "크로톤 쪽 셈이 어긋났다. 형제들이 같은 수를 두 번 센다."],
  ["pythagorean-bean", "이쪽은 콩이다. 돌아가라."],
  ["pythagorean-bean", "콩은 내가 본다. 너는 보지 마라."],
  ["pythagorean-junior", "미래에선 대각선으로 걸어도 돼?"],
  ["pythagorean-junior", "형들이 너희 단추를 셌어. 다섯 개래. 좋은 수래."],
]);

const ORDER_AFTER = barks("order-freed", "p1.pythagoreans-freed", undefined, [
  ["pythagorean-order", "나는, 아니 우리는, 아니 나는… 그 길이를 말해 본다. 루트 이."],
  ["pythagorean-order", "한 사람씩 말하니 시끄럽다. 좋은 시끄러움이다."],
  ["pythagorean-bean", "학파가 풀려났다. 콩은 여전히 콩이다."],
  ["pythagorean-bean", "이제 먹어도 된다고 한다. 안 먹는다. 이건 셈이 아니라 입맛이다."],
  ["pythagorean-junior", "데려다줄 거야? 이번엔 칸 밖으로 걸어 봐도 돼?"],
  ["pythagorean-junior", "대각선은 칸 하나보다 길고 칸 두 개보다 짧아. 그 사이 어딘가야."],
]);

/** The scribe, while the lecture goes on, and once its speaker starts asking. */
const SCRIBE_BEFORE = barks("scribe", "p1.open", "p1.aristotle-freed", [
  ["lyceum-scribe", "균열 얘기도 받아 적었어요. 선생님은 그게 흙이래요. 아래로 가야 한대요."],
  ["lyceum-scribe", "밀랍이 모자라요. 학생 쪽엔 밀랍 없어요?"],
]);

const SCRIBE_AFTER = barks("scribe-freed", "p1.aristotle-freed", undefined, [
  ["lyceum-scribe", "선생님이 이제 질문을 하세요. 질문은 어떻게 적는지 몰라서 물음표만 그려요."],
  ["lyceum-scribe", "틀렸다고 하신 말씀도 다 적었어요. 그게 제일 길었어요."],
]);

export const AGORA_BARKS: readonly Bark[] = [
  ...TOWN,
  ...ORDER_BEFORE,
  ...ORDER_AFTER,
  ...SCRIBE_BEFORE,
  ...SCRIBE_AFTER,
];

export const AGORA_KO = w.ko;
