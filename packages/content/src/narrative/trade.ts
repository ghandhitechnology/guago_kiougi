/**
 * Trading (PLAN §13), written ahead of the server: direct trade between two players and the
 * 매점 게시판. Direct trade is the narrator's; the 매점 게시판 is the 학생회 매점부's, who takes
 * the fee up front and the tax on sale. Amounts arrive formatted in {price}.
 */
import { Writer } from "./author.ts";
import type { CopyPart, Slot, SystemMessage } from "./schema.ts";

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
  ["declined", "narrator", "toast", "{player|이} 거래를 거절했다.", ["player"]],
  ["confirm-offer", "narrator", "toast", "올려놓은 것을 확정했다. 상대를 기다린다."],
  ["confirm-final", "narrator", "toast", "둘 다 확정했다. 이제 맞바꿀 차례다."],
  [
    "changed",
    "narrator",
    "dialogue",
    "{player|이} 확정한 뒤에 올려놓은 것을 바꿨다. 다시 확인해야 한다.",
    ["player"],
  ],
  ["tax", "store", "toast", "옮기는 솔방울에서 거래세로 {price} 솔방울을 떼요.", ["price"]],
  ["done", "narrator", "toast", "거래를 마쳤다. 거래세로 {price} 솔방울이 빠졌다.", ["price"]],
  ["cancelled", "narrator", "toast", "거래가 취소되었다. 아무것도 넘어가지 않았다."],
  ["too-far", "narrator", "toast", "너무 멀다. 가까이 가야 거래할 수 있다."],
  ["level", "narrator", "toast", "거래는 1학년 전직 뒤부터 할 수 있다."],
  ["bound", "narrator", "toast", "귀속된 물건은 건넬 수 없다."],
  ["cooldown", "narrator", "toast", "{time}부터 건넬 수 있는 물건이다.", ["time"]],
]);

const MARKET = lines("market", [
  ["fee", "store", "toast", "붙일 때 수수료 {price} 솔방울, 팔리면 세금을 떼요.", ["price"]],
  ["listed", "store", "toast", "{item} 붙였어요. 수수료는 먼저 받았어요.", ["item"]],
  ["sold", "store", "toast", "{item} 팔렸어요. 세금 떼고 {price} 솔방울.", ["item", "price"]],
  ["bought", "store", "toast", "{item} 샀어요. 가방에 넣어 뒀어요.", ["item"]],
  ["expired", "store", "toast", "{item}, 이틀 동안 아무도 안 사 갔어요.", ["item"]],
  ["returned", "store", "toast", "안 팔린 {item}, 가방에 돌려 드렸어요.", ["item"]],
  ["withdrawn", "store", "toast", "{item} 내렸어요. 수수료는 돌려드리지 않아요.", ["item"]],
  ["full", "store", "toast", "한 사람당 열 개까지만 붙일 수 있어요."],
  ["level", "store", "toast", "매점은 1학년 전직 뒤부터 쓸 수 있어요."],
  ["bound", "store", "toast", "이건 못 받아요. 귀속된 물건이에요."],
  ["cooldown", "store", "toast", "{time}부터 팔 수 있는 물건이에요.", ["time"]],
  ["fee-short", "store", "toast", "수수료가 모자라요."],
]);

export const TRADE_COPY: CopyPart = { system: [...DIRECT, ...MARKET], ko: w.ko };
