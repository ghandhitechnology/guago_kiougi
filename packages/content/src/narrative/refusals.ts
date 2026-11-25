/**
 * A line for every refusal code the server can answer with: the living world
 * (`LIVE_REFUSAL_CODES`), the WorldRoom's chat and social requests (`REFUSAL_CODES`) and item
 * and currency operations (`OP_ERRORS`). Each table is typed by its code list, so a new code
 * without a line fails the typecheck. Rule things are 권 사감's, money is the 자판기's or the
 * 매점부's, club things are the 짱's, the rest is the narrator. Each fits one toast row.
 *
 * Trade codes (`TRADE_ERRORS`) are both WorldRoom refusals (direct trade) and operation errors
 * (the 매점 게시판), so their lines are filed under both. A listing a blocked seller put up reads
 * `listing_missing`, the same as one that is gone, and nothing here hints at a block.
 *
 * Ids: `refusal.live.<code>`, `refusal.world.<code>`, `refusal.op.<code>`. A refusal's own
 * fields fill the slots: `until` as {time} for `muted`, `need` as {level} for `level`.
 */
import type { LiveRefusalCode, OpError, RefusalCode, TradeErrorCode } from "@guago/shared";
import { Writer } from "./author.ts";
import type { CopyPart, Slot, SystemMessage } from "./schema.ts";

const w = new Writer("refusal");

type Line = readonly [voice: string, text: string];

const LIVE: Readonly<Record<LiveRefusalCode, Line>> = {
  rate_limited: ["narrator", "게시판 앞이 붐빈다. 잠시 뒤에 다시."],
  server_error: ["narrator", "게시판이 떨어졌다. 아무것도 바뀌지 않았다."],
  board_closed: ["narrator", "게시판이 비어 있다. 균열이 아직 닫혀 있다."],
  help_level: ["narrator", "아직 도움을 청할 만큼 뒤처지지 않았다."],
  help_open: ["narrator", "붙여 둔 도움 요청이 이미 있다."],
  help_quest: ["narrator", "그 과제는 지금 하고 있지 않다."],
  help_gone: ["narrator", "그 요청은 이미 내려갔다."],
  help_self: ["narrator", "자기 요청을 자기가 받을 수는 없다."],
  help_helper_level: ["narrator", "도와주기엔 아직 레벨이 모자라다."],
  help_busy: ["narrator", "이미 다른 학생을 돕는 중이다."],
  help_not_poster: ["narrator", "붙인 사람만 뗄 수 있다."],
  sent_home: ["sagam", "귀가 중입니다. 복귀한 뒤에 오십시오."],
};

const TRADE: Readonly<Record<TradeErrorCode, Line>> = {
  trade_level: ["narrator", "둘 다 1학년 전직을 마쳐야 거래할 수 있다."],
  trade_offline: ["narrator", "그 학생은 지금 접속해 있지 않다."],
  trade_self: ["narrator", "자기 자신과는 거래할 수 없다."],
  trade_far: ["narrator", "너무 멀다. 가까이 가야 거래할 수 있다."],
  trade_busy: ["narrator", "다른 거래가 아직 끝나지 않았다."],
  trade_no_session: ["narrator", "그 거래 창은 이미 닫혔다."],
  trade_changed: ["narrator", "그사이 올려놓은 것이 바뀌었다. 다시 볼 것."],
  trade_empty: ["narrator", "양쪽 다 아무것도 올려놓지 않았다."],
  trade_too_many: ["narrator", "한 번에 올릴 수 있는 수를 넘었다."],
  trade_item_gone: ["narrator", "올려놓은 물건이 이제 가방에 없다."],
  trade_item_bound: ["narrator", "귀속된 물건은 건넬 수 없다."],
  trade_item_equipped: ["narrator", "장착 중인 물건은 건넬 수 없다."],
  trade_item_cooldown: ["narrator", "받은 지 하루가 안 된 물건이다."],
  trade_stack: ["narrator", "그 묶음은 거래할 수 없다."],
  trade_funds: ["narrator", "가진 것보다 많이 올렸다."],
  listing_limit: ["store", "한 사람당 열 개까지만 붙일 수 있어요."],
  listing_missing: ["store", "그 물건은 매점에 없어요."],
  listing_closed: ["store", "이미 팔렸거나 내려간 물건이에요."],
  listing_expired: ["store", "기한이 지나서 내려간 물건이에요."],
  listing_own: ["store", "자기 물건은 못 사요."],
  listing_qty: ["store", "남은 수량보다 많이 골랐어요."],
  listing_price: ["store", "값이 맞지 않아요. 다시 확인해 주세요."],
  listing_funds: ["store", "솔방울이 모자라요."],
};

const WORLD: Readonly<Record<RefusalCode, Line>> = {
  ...TRADE,
  // Chat.
  empty: ["narrator", "아무 말도 쓰지 않았다."],
  too_long: ["narrator", "너무 길다. 조금 줄여야 한다."],
  rate_limited: ["narrator", "말이 너무 빠르다. 숨 좀 고르고."],
  muted: ["sagam", "채팅 금지 중입니다. {time}에 풀립니다."],
  level: ["narrator", "전체 채팅은 {level}레벨부터 쓸 수 있다."],
  target_offline: ["narrator", "그 학생은 지금 접속해 있지 않다."],
  target_self: ["narrator", "자기 자신한테는 보낼 수 없다."],
  no_map: ["narrator", "아직 어느 지도에도 서 있지 않다."],
  no_channel: ["narrator", "그 채널은 지금 쓸 수 없다."],
  unreadable: ["narrator", "필터가 읽지 못한 말이다. 바꿔서 다시."],
  server_error: ["narrator", "무언가 꼬였다. 아무것도 바뀌지 않았다."],
  // Friends and blocks.
  no_player: ["narrator", "그런 이름의 학생은 없다."],
  blocked: ["narrator", "차단한 학생이다."],
  blocks_full: ["narrator", "차단 목록이 가득 찼다."],
  already_friends: ["narrator", "이미 친구다."],
  not_friends: ["narrator", "친구 목록에 없는 학생이다."],
  friends_full: ["narrator", "친구 목록이 가득 찼다."],
  their_friends_full: ["narrator", "상대의 친구 목록이 가득 찼다."],
  requests_full: ["narrator", "친구 신청이 너무 많이 쌓여 있다."],
  no_request: ["narrator", "그 신청은 이미 사라졌다."],
  // Parties.
  no_party: ["narrator", "파티에 들어가 있지 않다."],
  in_party: ["narrator", "이미 파티에 들어가 있다."],
  target_in_party: ["narrator", "그 학생은 이미 다른 파티에 있다."],
  party_full: ["narrator", "파티 자리가 다 찼다."],
  not_leader: ["narrator", "파티장만 할 수 있다."],
  no_invite: ["narrator", "그 초대는 이미 사라졌다."],
  invites_full: ["narrator", "초대가 너무 많이 쌓여 있다."],
  not_member: ["narrator", "그 학생은 이 파티에 없다."],
  // Clubs.
  no_club: ["narrator", "들어가 있는 동아리가 없다."],
  in_club: ["club-leader", "너 이미 딴 동아리잖아. 두 집 살림은 안 돼."],
  target_in_club: ["club-leader", "그 친구 이미 딴 동아리야."],
  club_full: ["club-leader", "정원 꽉 찼어. 미안."],
  invite_only: ["club-leader", "우린 초대받아야 들어와."],
  applications_full: ["club-leader", "신청서가 너무 많이 쌓였어."],
  rank: ["club-leader", "회칙상 그건 네 직급으로 못 해."],
  leader_stays: ["club-leader", "짱은 마지막에 나가는 거야. 넘겨주고 가."],
  name_mismatch: ["club-leader", "해체하려면 동아리 이름을 정확히 써."],
  name_invalid: ["club-leader", "그 이름은 길이나 글자가 안 맞아."],
  name_banned: ["club-leader", "그 이름은 학교에서 허락 안 해."],
  name_taken: ["club-leader", "그 이름 이미 있는 동아리야."],
  jacket_invalid: ["club-leader", "그 색으로는 과잠 못 맞춰."],
  emblem_invalid: ["club-leader", "그런 문양은 없어."],
  emblem_locked: ["club-leader", "그 문양은 동아리 레벨 더 올려야 열려."],
  insufficient: ["store", "창립비가 모자라요. 솔방울이 더 있어야 해요."],
  op_id_reused: ["narrator", "같은 서류가 두 번 들어왔다. 처음 것만 받는다."],
  // 대자보 and emotes.
  post_active: ["narrator", "그 칸에는 이미 붙여 둔 글이 있다."],
  no_post: ["narrator", "그 글은 이미 떨어졌다."],
  not_allowed: ["sagam", "고정 공지는 층장만 붙일 수 있습니다."],
  unknown_emote: ["narrator", "모르는 동작이다."],
};

const OP: Readonly<Record<OpError, Line>> = {
  ...TRADE,
  bad_request: ["narrator", "서류 양식이 맞지 않는다."],
  rate_limited: ["narrator", "손이 너무 빠르다. 잠시 뒤에 다시."],
  op_id_reused: ["narrator", "같은 서류가 두 번 들어왔다. 처음 것만 받는다."],
  no_character: ["narrator", "학생부를 찾을 수 없다. 다시 등교해야 한다."],
  server_error: ["narrator", "무언가 꼬였다. 아무것도 바뀌지 않았다."],
  insufficient: ["store", "모자라요. 가방이랑 지갑을 다시 보세요."],
  item_missing: ["narrator", "그 물건이 가방에 없다."],
  item_kind: ["narrator", "그 물건으로는 안 된다."],
  item_equipped: ["narrator", "장착 중인 물건이다. 먼저 빼야 한다."],
  unknown_def: ["narrator", "그런 물건은 없다."],
  odds_changed: ["narrator", "그사이 확률이 바뀌었다. 새 확률로 다시."],
  pool_empty: ["narrator", "쌓인 자습 시간이 없다."],
  quest_missing: ["narrator", "그 공지는 게시판에 없다."],
  quest_not_done: ["narrator", "아직 다 하지 않은 과제다."],
  quest_claimed: ["narrator", "이미 받아 간 보상이다."],
  pilgi_cost: ["narrator", "필기할 잉크나 솔방울이 모자라다."],
  bind_cost: ["narrator", "낱장이나 제본 재료가 모자라다."],
  forge_three: ["narrator", "같은 책이 세 권 있어야 제련된다."],
  forge_same_item: ["narrator", "같은 책을 두 번 넣었다."],
  forge_mismatch: ["narrator", "종류나 등급이 다른 책이 섞였다."],
  forge_top_grade: ["narrator", "이미 가장 높은 등급이다."],
  forge_cost: ["narrator", "제련할 솔방울이 모자라다."],
  feed_count: ["narrator", "먹일 낱장 수가 맞지 않는다."],
  feed_capped: ["narrator", "책 레벨은 학생 레벨을 넘을 수 없다."],
  feed_cost: ["narrator", "먹일 낱장이 모자라다."],
  merge_same_item: ["narrator", "같은 도구를 두 번 넣었다."],
  merge_mismatch: ["narrator", "서로 다른 도구는 합칠 수 없다."],
  merge_max: ["narrator", "이미 끝까지 올린 도구다."],
  evolve_done: ["narrator", "이미 진화한 책이다."],
  evolve_requirements: ["narrator", "아직 진화할 준비가 안 됐다."],
  stat_amount: ["narrator", "찍을 수 없는 숫자다."],
  stat_points: ["narrator", "남은 능력치 점수가 모자라다."],
  reset_cost: ["store", "초기화 비용이 모자라요."],
  buy_qty: ["vending", "수량을 다시 선택하십시오."],
  buy_cost: ["vending", "솔방울이 부족합니다."],
  equip_slot: ["narrator", "그 칸은 아직 열리지 않았다."],
  equip_subject: ["narrator", "전공이나 부전공 과목이 아니다."],
  equip_duplicate: ["narrator", "같은 것을 두 개 낄 수는 없다."],
  equip_minor_slots: ["narrator", "부전공 칸이 모자라다."],
  equip_not_worn: ["narrator", "끼고 있지 않은 물건이다."],
  drink_none: ["narrator", "가방에 에너지 드링크가 없다."],
};

const SLOTS_OF: Readonly<Record<string, readonly Slot[]>> = { muted: ["time"], level: ["level"] };

function table(protocol: string, lines: Readonly<Record<string, Line>>): SystemMessage[] {
  const s = w.scope(protocol);
  return Object.entries(lines).map(([code, [voice, text]]) => ({
    id: `refusal.${protocol}.${code}`,
    voice,
    channel: "toast",
    text: s.t(text),
    slots: SLOTS_OF[code] ?? [],
  }));
}

export const REFUSALS_COPY: CopyPart = {
  system: [...table("live", LIVE), ...table("world", WORLD), ...table("op", OP)],
  ko: w.ko,
};
