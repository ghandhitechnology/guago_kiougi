/**
 * The 콜로세움 (PLAN §14) as 권 사감 runs it. The courtyard is under her lit window, so a duel is
 * a supervised night activity with its paperwork: a challenge is a 신청서 she files or 반려s, the
 * queue is her 명단, the ready check is a 점호, and the result goes into a ledger that has no
 * 상점 or 벌점 for it. Every line is hers; the result card's labels, the player card's record and
 * the buttons are terms. Her refusals live in `refusals.ts` with every other code.
 *
 * Ids follow the wire (`packages/shared/src/duel.ts`):
 * - `duel.challenge.<why>` for `challenged`, `challenge` and `challengeEnded`. `<why>` is said to
 *   the other player with {player}; `<why>-self` to the one whose own answer or silence ended it.
 *   A challenge a block dropped lapses as `expired`, the same line as one nobody answered.
 * - `duel.queue.*` for `queued` and `unqueued`; `duel.queue.back` for a `queued` that follows a
 *   `cancelled`, when the match fell through and those who answered keep their place.
 * - `duel.found.<mode>`, `duel.ready.*` for `found` and `ready`; `duel.cancelled.<why>` for
 *   `cancelled`, with `-self` and {time} for the player who refused or let it lapse: the client
 *   fills {time} with the clock moment `DUEL_QUEUE_LOCK_SECONDS` from now.
 * - `duel.match`, then the floor's phases (`FloorView.phase`), each round by `end` and from the
 *   reader's side (`won`, `lost`, `draw`), and the match by `DuelResultView.winner`.
 * - `duel.watch.*` is the same news for the corridor ring, by side: 1 is 청, 2 is 백.
 * - `duel.rules.*` is the four rules, for the ready check and anywhere the 콜로세움 is explained.
 */
import { Writer } from "./author.ts";
import type { CopyPart, Slot, SystemMessage, Term } from "./schema.ts";

const w = new Writer("duel");

type Entry = readonly [
  id: string,
  channel: SystemMessage["channel"],
  text: string,
  slots?: readonly Slot[],
];

const lines = (scope: string, entries: readonly Entry[]): SystemMessage[] => {
  const s = w.scope(scope);
  return entries.map(([id, channel, text, slots]) => ({
    id: `duel.${scope}.${id}`,
    voice: "sagam",
    channel,
    text: s.t(text),
    slots: slots ?? [],
  }));
};

const CHALLENGE = lines("challenge", [
  ["in", "toast", "{player} 학생의 결투 신청서입니다.", ["player"]],
  ["sent", "toast", "{player} 학생에게 결투 신청서를 넣었습니다.", ["player"]],
  ["accepted", "toast", "{player} 학생이 결투를 받았습니다.", ["player"]],
  ["accepted-self", "toast", "결투를 받았습니다."],
  ["declined", "toast", "{player} 학생이 신청서를 반려했습니다.", ["player"]],
  ["declined-self", "toast", "결투 신청서를 반려했습니다."],
  ["expired", "toast", "{player} 학생의 답이 없어 신청서를 폐기합니다.", ["player"]],
  ["expired-self", "toast", "답하지 않은 신청서는 폐기했습니다."],
  ["withdrawn", "toast", "{player} 학생이 신청서를 회수했습니다.", ["player"]],
  ["withdrawn-self", "toast", "결투 신청서를 회수했습니다."],
  ["busy", "toast", "상대에게 다른 일정이 생겨 신청서를 폐기합니다."],
]);

const QUEUE = lines("queue", [
  ["joined.1v1", "toast", "1대1 결투 명단에 올렸습니다."],
  ["joined.3v3", "toast", "3대3 명단에 올렸습니다. 같은 편은 사감실이 정합니다."],
  ["joined.party", "toast", "{names} 학생과 3대3 명단에 올렸습니다.", ["names"]],
  ["back", "toast", "출석한 학생은 명단 맨 앞으로 돌려 두었습니다."],
  ["left", "toast", "결투 명단에서 이름을 지웠습니다."],
  ["party", "toast", "파티장이 명단에서 이름을 지웠습니다."],
  ["offline", "toast", "자리를 비운 학생이 있어 명단에서 지웠습니다."],
]);

const FOUND = lines("found", [
  ["1v1", "dialogue", "1대1 상대가 정해졌습니다. 결투 점호를 시작합니다."],
  ["3v3", "dialogue", "3대3 상대가 정해졌습니다. 결투 점호를 시작합니다."],
]);

const READY = lines("ready", [
  ["ask", "dialogue", "전원 출석하면 바로 시작합니다."],
  ["count", "toast", "출석 {count}/{total}", ["count", "total"]],
  ["self", "toast", "출석을 확인했습니다. 나머지를 기다립니다."],
]);

const CANCELLED = lines("cancelled", [
  ["refused", "toast", "불참자가 있어 결투를 취소합니다."],
  ["refused-self", "toast", "불참입니다. {time}까지 명단에 못 오릅니다.", ["time"]],
  ["lapsed", "toast", "점호에 답하지 않은 학생이 있어 취소합니다."],
  ["lapsed-self", "toast", "무응답입니다. {time}까지 명단에 못 오릅니다.", ["time"]],
  ["offline", "toast", "자리를 비운 학생이 있어 취소합니다."],
  ["no_floor", "toast", "빈 마당이 없어 취소합니다. 다시 신청하십시오."],
]);

/** The floor, in the order a match goes: `match`, `arriving`, `countdown`, `fight`, `over`. */
const FLOOR = lines("floor", [
  ["match", "toast", "콜로세움으로 이동합니다. 사감실에서 지켜보겠습니다."],
  ["arriving", "toast", "선수 입장 중입니다. 늦는 학생은 기권 처리합니다."],
  ["countdown", "toast", "호루라기를 기다리십시오."],
  ["start", "toast", "{count}번째 판입니다. 시작하십시오.", ["count"]],
]);

/** A round, by `rounds[i].end` and whose side won it. A drawn round cannot end by forfeit. */
const ROUND = lines("round", [
  ["won.ko", "toast", "상대가 쓰러졌습니다. 이번 판은 학생 쪽입니다."],
  ["won.time", "toast", "시간 종료입니다. 체력이 더 남아 학생 쪽입니다."],
  ["won.forfeit", "toast", "상대가 기권했습니다. 이번 판은 학생 쪽입니다."],
  ["lost.ko", "toast", "쓰러졌습니다. 이번 판은 상대 쪽입니다."],
  ["lost.time", "toast", "시간 종료입니다. 체력이 모자라 상대 쪽입니다."],
  ["lost.forfeit", "toast", "기권으로 이번 판은 상대 쪽입니다."],
  ["draw.ko", "toast", "양쪽 다 쓰러졌습니다. 이번 판은 무승부입니다."],
  ["draw.time", "toast", "시간 종료입니다. 체력이 같아 무승부입니다."],
]);

/** The match. Nothing is won or lost, which she says in her ledger's terms. */
const OVER = lines("over", [
  ["won", "toast", "결투 종료입니다. 학생 쪽 승리입니다. 상점은 없습니다."],
  ["lost", "toast", "결투 종료입니다. 상대 쪽 승리입니다. 벌점도 없습니다."],
  ["draw", "toast", "결투 종료입니다. 무승부입니다. 상점도 벌점도 없습니다."],
  ["forfeit-confirm", "dialogue", "기권하면 이 결투는 패배로 적습니다. 기권하시겠습니까?"],
  ["forfeit-self", "toast", "기권은 패배로 적습니다. 원래 자리로 돌려보냅니다."],
  ["forfeit", "toast", "{player} 학생이 기권했습니다.", ["player"]],
  ["return", "toast", "결투를 마쳤습니다. 원래 있던 자리로 돌려보냅니다."],
]);

/** For the corridor ring: whose side, with no 학생 쪽 in it. */
const WATCH = lines("watch", [
  ["round.1", "toast", "이번 판은 청 쪽입니다."],
  ["round.2", "toast", "이번 판은 백 쪽입니다."],
  ["round.draw", "toast", "이번 판은 무승부입니다."],
  ["over.1", "toast", "결투 종료입니다. 청 쪽 승리입니다."],
  ["over.2", "toast", "결투 종료입니다. 백 쪽 승리입니다."],
  ["over.draw", "toast", "결투 종료입니다. 무승부입니다."],
]);

/** Best of three; the same level, grade and 필기 for everyone; leaving forfeits; no stakes. */
const RULES = lines("rules", [
  ["rounds", "toast", "세 판 중 두 판을 먼저 이기는 쪽이 이깁니다."],
  ["even", "toast", "레벨, 등급, 필기는 사감실에서 똑같이 맞춥니다."],
  ["leave", "toast", "마당을 벗어나면 기권입니다."],
  ["stakes", "toast", "잃는 것도 얻는 것도 없습니다. 내기는 금지입니다."],
]);

const names = w.scope("term");
/**
 * Labels by id: the modes, the two sides, the result card's columns, the player card's record
 * (`{played}전 {won}승` after `record`), and the buttons on the challenge, the queue, the 점호
 * and the floor.
 */
const TERMS: readonly Term[] = [
  ["duel-1v1", "1대1"],
  ["duel-3v3", "3대3"],
  ["duel-side-1", "청"],
  ["duel-side-2", "백"],
  ["duel-round", "판"],
  ["duel-win", "승리"],
  ["duel-loss", "패배"],
  ["duel-draw", "무승부"],
  ["duel-damage", "피해량"],
  ["duel-hits", "적중"],
  ["duel-downs", "기절"],
  ["duel-forfeited", "기권"],
  ["duel-record", "결투 전적"],
  ["duel-played", "전"],
  ["duel-won", "승"],
  ["duel-challenge", "결투"],
  ["duel-accept", "받기"],
  ["duel-decline", "반려"],
  ["duel-withdraw", "회수"],
  ["duel-queue", "신청"],
  ["duel-unqueue", "신청 취소"],
  ["duel-ready", "출석"],
  ["duel-refuse", "불참"],
].map(([id, name]) => ({ id: id as string, kind: "label", name: names.t(name as string) }));

export const DUEL_COPY: CopyPart = {
  system: [
    ...CHALLENGE,
    ...QUEUE,
    ...FOUND,
    ...READY,
    ...CANCELLED,
    ...FLOOR,
    ...ROUND,
    ...OVER,
    ...WATCH,
    ...RULES,
  ],
  terms: TERMS,
  ko: w.ko,
};
