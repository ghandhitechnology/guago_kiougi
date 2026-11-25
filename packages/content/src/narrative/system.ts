/**
 * System messages in the voice of whoever would deliver them (PLAN §11): 권 사감 keeps the 벌점
 * and 상점 ledger, the cat speaks when someone falls in a rift, the nurse is there when they wake.
 * Server announcements for Page events come from the principal or the school broadcast, and
 * the joke awards are printed as a 상장.
 */
import { Writer } from "./author.ts";
import type { Award, Slot, SystemMessage } from "./schema.ts";

const w = new Writer("system");

const msg = (
  scope: ReturnType<Writer["scope"]>,
  id: string,
  voice: string,
  channel: SystemMessage["channel"],
  text: string,
  slots: readonly Slot[] = [],
): SystemMessage => ({ id, voice, channel, text: scope.t(text), slots });

const ledger = w.scope("ledger");
const fall = w.scope("knockout");
const expel = w.scope("expel");

export const SYSTEM: readonly SystemMessage[] = [
  // 벌점.
  msg(ledger, "demerit.curfew", "sagam", "system", "점호 시간 외출입니다. 벌점 1점입니다."),
  msg(ledger, "demerit.knockout", "sagam", "system", "보건실 이송을 확인했습니다. 벌점 1점입니다."),
  msg(
    ledger,
    "demerit.patrol",
    "sagam",
    "system",
    "아테네 측 통보로 위험 구역 출입을 확인했습니다. 벌점 2점입니다.",
  ),
  msg(
    ledger,
    "demerit.dorm-food",
    "sagam",
    "system",
    "기숙사 안 취식입니다. 벌점 1점입니다. 남은 음식은 압수합니다.",
  ),
  msg(
    ledger,
    "demerit.chat",
    "sagam",
    "system",
    "채팅 규정 위반이 확인되었습니다. 벌점 3점입니다.",
  ),
  msg(
    ledger,
    "demerit.warning",
    "sagam",
    "system",
    "현재 벌점 {count}점입니다. 20점이 되면 명령퇴사입니다.",
    ["count"],
  ),

  // 상점.
  msg(ledger, "merit.revive", "sagam", "system", "쓰러진 학생을 일으켰습니다. 상점 1점입니다."),
  msg(ledger, "merit.help", "sagam", "system", "후배의 과제를 도왔습니다. 상점 1점입니다."),
  msg(ledger, "merit.cleaning", "sagam", "system", "청소 당번을 확인했습니다. 상점 1점입니다."),
  msg(
    ledger,
    "merit.floor-leader",
    "sagam",
    "system",
    "이번 주 층장으로 지정합니다. 상점 5점입니다. 대자보에 공지 하나를 고정할 수 있습니다.",
  ),
  msg(
    ledger,
    "merit.cancel",
    "sagam",
    "system",
    "상점 1점으로 벌점 1점을 지웠습니다. 남은 벌점은 {count}점입니다.",
    ["count"],
  ),

  // 기절 and revive.
  msg(fall, "knockout.self", "entropy", "toast", "누웠네."),
  msg(fall, "knockout.nearby", "entropy", "toast", "{player|이} 누웠다. 십 초 안에 일으켜.", [
    "player",
  ]),
  msg(fall, "knockout.revived", "entropy", "toast", "일어나."),
  msg(fall, "knockout.raid", "entropy", "toast", "입구에서 다시. 여기선 벌점 없다."),
  msg(
    fall,
    "knockout.infirmary",
    "nurse",
    "dialogue",
    "깼어요? 그대로 누워 있어요. 물 가져올게요.",
  ),
  msg(
    fall,
    "knockout.infirmary-again",
    "nurse",
    "dialogue",
    "또 왔어요? 이번 주 {count}번째예요. 침대는 비어 있어요.",
    ["count"],
  ),

  // 명령퇴사.
  msg(
    expel,
    "expel.notice",
    "sagam",
    "dialogue",
    "벌점 20점입니다. 명령퇴사 처분합니다. 지금 바로 귀가하십시오.",
  ),
  msg(
    expel,
    "expel.return",
    "sagam",
    "dialogue",
    "복귀를 확인했습니다. 한 시간 동안 경험치가 30퍼센트 줄어듭니다. 벌점은 0점부터 다시 셉니다.",
  ),
  msg(
    expel,
    "expel.title",
    "principal",
    "system",
    "{player} 학생에게 「집에 갔상」을 수여합니다.",
    ["player"],
  ),
];

// Announcements ------------------------------------------------------------------------------

const an = w.scope("announce");

export const ANNOUNCEMENTS: readonly SystemMessage[] = [
  msg(
    an,
    "page-open",
    "principal",
    "system",
    "운동장에 첫 번째 균열이 열렸습니다. 오늘부터 「균열 탐사(심화)」를 개강합니다.",
  ),
  msg(
    an,
    "fields-open",
    "broadcast",
    "system",
    "교내 방송입니다. 동굴 입구와 아고라 외곽이 열렸습니다. 동굴 안쪽은 출입 금지입니다. 다시 알려 드립니다. 출입 금지입니다.",
  ),
  msg(
    an,
    "patrol-agreement",
    "principal",
    "system",
    "아테네 측 경비 인력과 협조 체계를 갖추었습니다. 그림자 동굴에서 적발된 학생의 벌점은 우리 학교 기준으로 부과합니다.",
  ),
  msg(
    an,
    "boss-appear-pythagoreans",
    "broadcast",
    "system",
    "교내 방송입니다. 크로톤 학당에 피타고라스 학파가 나타났습니다. 다시 알려 드립니다. 크로톤 학당입니다.",
  ),
  msg(
    an,
    "boss-down-pythagoreans",
    "principal",
    "system",
    "피타고라스 학파 여러분이 풀려났습니다. 다음 주부터 가우스실에서 방과후 강의를 맡습니다. 열 분 모두입니다.",
  ),
  msg(
    an,
    "boss-appear-zeno",
    "broadcast",
    "system",
    "교내 방송입니다. 엘레아 경주로에 제논이 나타났습니다. 다시 알려 드립니다. 아직 반밖에 안 오셨다고 합니다.",
  ),
  msg(
    an,
    "boss-down-zeno",
    "principal",
    "system",
    "제논 선생님께서 엘레아 경주로에서 도착하셨습니다. 강좌명은 「끝나지 않는 수업」입니다.",
  ),
  msg(
    an,
    "boss-appear-aristotle",
    "broadcast",
    "system",
    "교내 방송입니다. 리케이온에서 아리스토텔레스 선생님의 공개 강의가 시작되었습니다. 논제는 네 개입니다.",
  ),
  msg(
    an,
    "thesis-open",
    "broadcast",
    "system",
    "리케이온 소식입니다. {thesis|이} 시작되었습니다.",
    ["thesis"],
  ),
  msg(
    an,
    "thesis-refuted",
    "broadcast",
    "system",
    "리케이온 소식입니다. {thesis|이} 반박되었습니다.",
    ["thesis"],
  ),
  msg(
    an,
    "boss-down-aristotle",
    "principal",
    "system",
    "아리스토텔레스 선생님의 논제 네 개가 모두 반박되었습니다. 선생님께서는 다음 주부터 물음표 서고와 방과후학교를 맡으십니다.",
  ),
  msg(
    an,
    "debate-start",
    "broadcast",
    "system",
    "토론 시간입니다. 22시까지 리케이온의 모든 반론이 1.5배로 들어갑니다.",
  ),
  msg(an, "debate-end", "broadcast", "system", "토론 시간을 마칩니다. 내일 21시에 다시 엽니다."),
  msg(
    an,
    "era-change",
    "principal",
    "system",
    "고대 그리스 페이지를 마칩니다. 0조 연구노트에 첫 장이 돌아왔습니다. 마지막 한 방을 넣은 {player} 학생을 비롯해 참여한 모든 학생의 이름을 적었습니다.",
    ["player"],
  ),
  msg(
    an,
    "daily-reset",
    "broadcast",
    "system",
    "수행평가 게시판이 바뀌었습니다. 오늘 기상송은 어제와 같습니다.",
  ),
  msg(an, "rare-drop", "broadcast", "system", "{player} 학생이 {item|을} 얻었습니다.", [
    "player",
    "item",
  ]),
  msg(an, "elite", "broadcast", "toast", "{place}에 덩치 큰 {monster|이} 나타났습니다.", [
    "place",
    "monster",
  ]),
];

// Awards ---------------------------------------------------------------------------------------

const aw = w.scope("award");
const award = (id: string, title: string, citation: string, when: string): Award => ({
  id,
  title: aw.t(title),
  citation: aw.t(citation),
  when,
});

export const AWARDS: readonly Award[] = [
  award(
    "ate-it-all",
    "다 먹었상",
    "위 학생은 한 주 동안 급식을 가장 많이 먹어 급식실 운영에 크게 이바지하였으므로 이 상장을 수여합니다.",
    "Most 급식 eaten in a week",
  ),
  award(
    "caught",
    "딱 걸렸상",
    "위 학생은 위험 구역에서 열 번 적발되고도 굴하지 않고 다시 들어갔으므로 이 상장을 수여합니다.",
    "Caught by patrols ten times",
  ),
  award(
    "went-home",
    "집에 갔상",
    "위 학생은 벌점 20점을 성실히 모아 명령퇴사를 다녀왔으므로 이 상장을 수여합니다.",
    "First 명령퇴사",
  ),
  award(
    "attendance",
    "개근상",
    "위 학생은 수행평가 게시판의 일일 과제를 30일 동안 하루도 빠짐없이 마쳤으므로 이 상장을 수여합니다.",
    "Thirty daily boards in a row",
  ),
  award(
    "lay-down",
    "누워 봤상",
    "위 학생은 졸업하기 전에 보건실 침대에 누워 보는 일을 미루지 않았으므로 이 상장을 수여합니다.",
    "First time lying on the 보건실 bed (easter egg)",
  ),
  award(
    "played-piano",
    "쳐 봤상",
    "위 학생은 아무도 시키지 않았는데 쉼표 라운지의 피아노를 쳤으므로 이 상장을 수여합니다.",
    "First time playing the lounge piano (easter egg)",
  ),
  // The raid boards (PLAN §10): whoever tops a freed boss's damage, support or objective board.
  award(
    "raid-damage-pythagoreans",
    "셈 틀리게 했상",
    "위 학생은 크로톤 학당의 셈판 위에서 누구보다 큰 반론을 던져 학파의 셈을 가장 많이 어긋나게 하였으므로 이 상장을 수여합니다.",
    "Top of the 피타고라스 학파 damage board",
  ),
  award(
    "raid-support-pythagoreans",
    "다시 세웠상",
    "위 학생은 셈판 위에 쓰러진 동료를 누구보다 많이 일으켜 세우고 유리수 병사를 막아 섰으므로 이 상장을 수여합니다.",
    "Top of the 피타고라스 학파 support board",
  ),
  award(
    "raid-objectives-pythagoreans",
    "대각선 그었상",
    "위 학생은 학파가 셀 수 없는 대각선을 누구보다 많이 걸어 셈판의 약점을 열었으므로 이 상장을 수여합니다.",
    "Top of the 피타고라스 학파 objective board",
  ),
  award(
    "raid-damage-zeno",
    "끝까지 갔상",
    "위 학생은 반씩만 갈 수 있다는 엘레아 경주로에서 누구보다 많이 제논에게 닿았으므로 이 상장을 수여합니다.",
    "Top of the 제논 damage board",
  ),
  award(
    "raid-support-zeno",
    "같이 뛰었상",
    "위 학생은 엘레아 경주로에서 쓰러진 동료를 누구보다 많이 일으켜 끝까지 함께 달렸으므로 이 상장을 수여합니다.",
    "Top of the 제논 support board",
  ),
  award(
    "raid-objectives-zeno",
    "극한 취했상",
    "위 학생은 줄어드는 원을 누구보다 많이 채워 끝나지 않는 거리에 끝을 내었으므로 이 상장을 수여합니다.",
    "Top of the 제논 objective board",
  ),
  award(
    "raid-damage-aristotle",
    "반박했상",
    "위 학생은 리케이온의 네 논제에 누구보다 많은 반론을 보태 아리스토텔레스의 강의를 끝내는 데 크게 이바지하였으므로 이 상장을 수여합니다.",
    "Top of the 아리스토텔레스 damage board",
  ),
  award(
    "raid-support-aristotle",
    "부축했상",
    "위 학생은 리케이온에서 쓰러진 동료를 누구보다 많이 일으키고 흙의 정령을 막아 섰으므로 이 상장을 수여합니다.",
    "Top of the 아리스토텔레스 support board",
  ),
  award(
    "raid-objectives-aristotle",
    "얼음 밀었상",
    "위 학생은 비석을 부수고 원소의 자리를 지키고 얼음 위로 돌을 밀어 누구보다 많은 논제를 무너뜨렸으므로 이 상장을 수여합니다.",
    "Top of the 아리스토텔레스 objective board",
  ),
];

export const AWARD_FRAME = { heading: aw.t("상장"), signature: aw.t("해솔과학고등학교장") };

export const SYSTEM_KO = w.ko;
