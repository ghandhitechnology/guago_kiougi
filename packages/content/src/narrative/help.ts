/**
 * 도움 notices (PLAN §15) as the poster and the helper see them change: posted, taken, moving,
 * finished, taken down and expired. The narrator's plain 해라체; the 상점 for finishing is
 * 권 사감's `merit.help`.
 */
import { Writer } from "./author.ts";
import type { CopyPart, Slot, SystemMessage } from "./schema.ts";

const w = new Writer("help");
const s = w.scope("toast");

const toast = (id: string, text: string, slots: readonly Slot[] = []): SystemMessage => ({
  id,
  voice: "narrator",
  channel: "toast",
  text: s.t(text),
  slots,
});

const HELP_LINES: readonly SystemMessage[] = [
  toast("help.posted", "도움 요청을 게시판에 붙였다."),
  toast("help.taken.poster", "{player|이} 도움 요청을 받아 갔다.", ["player"]),
  toast("help.taken.helper", "{player}의 도움 요청을 맡았다.", ["player"]),
  toast("help.progress.poster", "{player|이} 돕는 중이다. {count}/{total}", [
    "player",
    "count",
    "total",
  ]),
  toast("help.progress.helper", "{player} 돕기 {count}/{total}", ["player", "count", "total"]),
  toast("help.done.poster", "{player} 덕에 도움 요청을 마쳤다.", ["player"]),
  toast("help.done.helper", "{player}의 일을 끝까지 도왔다.", ["player"]),
  toast("help.cancelled.poster", "도움 요청을 내렸다."),
  toast("help.cancelled.helper", "{player|이} 도움 요청을 거두었다.", ["player"]),
  toast("help.expired.poster", "기한이 지나 도움 요청이 내려갔다."),
  toast("help.expired.helper", "{player}의 도움 요청이 기한을 넘겨 내려갔다.", ["player"]),
];

export const HELP_COPY: CopyPart = { system: HELP_LINES, ko: w.ko };
