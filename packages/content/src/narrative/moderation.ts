/**
 * Moderation as the player meets it (PLAN §12): the filter's automatic mute, an operator's mute
 * (with an end, or until an operator lifts it), kick and ban, and a confirmed filter strike. No jokes: a player is losing something. The
 * automatic mute keeps the school voice (권 사감, plain); anything an operator decided is the
 * 운영진, out of the fiction. `muted` is the key the WorldRoom already sends; the client
 * formats `until` as the clock time the mute ends and fills {time} with it.
 */
import { Writer } from "./author.ts";
import type { CopyPart, Slot, SystemMessage } from "./schema.ts";

const w = new Writer("moderation");
const s = w.scope("line");

const line = (
  id: string,
  voice: string,
  channel: SystemMessage["channel"],
  text: string,
  slots: readonly Slot[] = [],
): SystemMessage => ({ id, voice, channel, text: s.t(text), slots });

const MODERATION: readonly SystemMessage[] = [
  line("muted", "sagam", "toast", "채팅이 막혔습니다. {time}에 풀립니다.", ["time"]),
  line(
    "moderation.muted",
    "office",
    "dialogue",
    "운영진이 채팅을 막았습니다. {time}에 풀립니다. 사유: {reason}",
    ["time", "reason"],
  ),
  line("moderation.kicked", "office", "dialogue", "운영진이 접속을 끊었습니다. 사유: {reason}", [
    "reason",
  ]),
  line(
    "moderation.banned",
    "office",
    "dialogue",
    "이 계정은 {time}까지 이용할 수 없습니다. 사유: {reason}",
    ["time", "reason"],
  ),
  line(
    "moderation.banned-permanent",
    "office",
    "dialogue",
    "이 계정은 더 이상 이용할 수 없습니다. 사유: {reason}",
    ["reason"],
  ),
  line("moderation.strike", "office", "toast", "신고된 채팅이 규정 위반으로 확인되었습니다."),
  line(
    "moderation.muted-permanent",
    "office",
    "dialogue",
    "운영진이 채팅을 막았습니다. 운영진이 풀 때까지입니다. 사유: {reason}",
    ["reason"],
  ),
];

export const MODERATION_COPY: CopyPart = { system: MODERATION, ko: w.ko };
