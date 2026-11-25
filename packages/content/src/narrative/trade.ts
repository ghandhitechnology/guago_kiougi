/**
 * Trading (PLAN §13), written ahead of the server: direct trade between two players and the
 * 매점 게시판 (`packages/shared/src/trade.ts`). Direct trade is the narrator's; the 매점 게시판 is
 * the 학생회 매점부's, who takes the fee up front and the tax on sale. Amounts arrive formatted
 * in {price}. Refusals live in `refusals.ts` with every other code.
 */
import { Writer } from "./author.ts";
import type { CopyPart, Slot, SystemMessage, Term } from "./schema.ts";

const w = new Writer("trade");

const lines = (
  scope: string,
  entries: readonly (readonly [
    id: string,
    voice: string,
    channel: SystemMessage["channel"],
    text: string,
    slots?: readonly Slot[],
  ])[],
): SystemMessage[] => {
  const s = w.scope(scope);
  return entries.map(([id, voice, channel, text, slots]) => ({
    id: `${scope}.${id}`,
    voice,
    channel,
    text: s.t(text),
    slots: slots ?? [],
  }));
};

const DIRECT = lines("trade", [
  ["request-in", "narrator", "toast", "{player|이} 거래를 청했다.", ["player"]],
  ["request-sent", "narrator", "toast", "{player}에게 거래를 청했다.", ["player"]],
  ["confirm-offer", "narrator", "toast", "올려놓은 것을 확정했다. 상대를 기다린다."],
  ["confirm-final", "narrator", "toast", "둘 다 확정했다. 이제 맞바꿀 차례다."],
  [
    "changed",
    "narrator",
    "dialogue",
    "{player|이} 확정한 뒤에 올려놓은 것을 바꿨다. 다시 확인해야 한다.",
    ["player"],
  ],
  ["tax", "store", "toast", "받는 솔방울에서 거래세로 {price} 솔방울을 떼요.", ["price"]],
  ["opened", "narrator", "toast", "{player|와} 거래 창을 열었다.", ["player"]],
  ["done", "narrator", "toast", "거래를 마쳤다. 거래세로 {price} 솔방울이 빠졌다.", ["price"]],
  ["done-untaxed", "narrator", "toast", "거래를 마쳤다."],
  ["failed", "narrator", "toast", "거래를 마치지 못했다. 두 사람 확인이 모두 풀렸다."],
  [
    "failed-server",
    "narrator",
    "dialogue",
    "서버가 거래를 끝내지 못했다. 가방에 보이는 것이 지금 그대로다. 한쪽만 가져간 것은 없다.",
  ],
]);

/**
 * A window closing (`TradeCloseReason`), as `trade.closed.<reason>`. Both sides get the push; a
 * `-self` line is for the player whose own answer or silence closed it. A request a block
 * dropped lapses as `expired`: the asker reads the same line as for one nobody answered.
 */
const CLOSED = lines("trade.closed", [
  ["cancelled", "narrator", "toast", "거래가 취소되었다."],
  ["declined", "narrator", "toast", "{player|이} 거래를 거절했다.", ["player"]],
  ["declined-self", "narrator", "toast", "거래 신청을 거절했다."],
  ["expired", "narrator", "toast", "{player|이} 거래 신청에 답하지 않았다.", ["player"]],
  ["expired-self", "narrator", "toast", "거래 신청이 시간이 지나 사라졌다."],
  ["far", "narrator", "toast", "서로 멀어져 거래 창이 닫혔다."],
  ["map", "narrator", "toast", "한쪽이 자리를 옮겨 거래 창이 닫혔다."],
  ["left", "narrator", "toast", "상대가 접속을 끊어 거래 창이 닫혔다."],
  ["replaced", "narrator", "toast", "다른 곳에서 다시 접속해 거래 창이 닫혔다."],
  ["timeout", "narrator", "toast", "시간이 다 되어 거래 창이 닫혔다."],
]);

const MARKET = lines("market", [
  ["fee", "store", "toast", "붙일 때 수수료 {price} 솔방울, 팔리면 세금을 떼요.", ["price"]],
  ["listed", "store", "toast", "{item} 붙였어요. 수수료는 먼저 받았어요.", ["item"]],
  ["sold", "store", "toast", "{item} 팔렸어요. 세금 떼고 {price} 솔방울.", ["item", "price"]],
  ["bought", "store", "toast", "{item} 샀어요. 가방에 넣어 뒀어요.", ["item"]],
  ["expired", "store", "toast", "{item}, 이틀 동안 아무도 안 사 갔어요.", ["item"]],
  ["returned", "store", "toast", "안 팔린 {item}, 가방에 돌려 드렸어요.", ["item"]],
  ["withdrawn", "store", "toast", "{item} 내렸어요. 수수료는 돌려드리지 않아요.", ["item"]],
]);

const names = w.scope("term");
const TERMS: readonly Term[] = [
  ["book", "책"],
  ["tool", "도구"],
  ["sheet", "낱장"],
  ["material", "재료"],
  ["snack", "간식"],
].map(([id, name]) => ({ id: id as string, kind: "listing", name: names.t(name as string) }));

export const TRADE_COPY: CopyPart = {
  system: [...DIRECT, ...CLOSED, ...MARKET],
  terms: TERMS,
  ko: w.ko,
};
