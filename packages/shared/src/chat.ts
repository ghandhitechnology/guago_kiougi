/**
 * The WorldRoom protocol (PLAN §12 chat, §21): channel ids, limits, message shapes and the
 * validators both sides run. The client renders every chat string as plain text (PLAN §22).
 */
import { checkName, type Major, normalizeName } from "./api.ts";

/** The room every client holds for the whole session, beside its map room (PLAN §19). */
export const WORLD_ROOM = "world";

/**
 * Chat channels. `system` is server to player only. `party` and `club` reach the speaker's party
 * and club; the server refuses them with `no_party` and `no_club` outside one.
 */
export const CHAT_CHANNELS = ["world", "near", "whisper", "party", "club", "system"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];
/** Channels a player may send on. */
export type SpeakChannel = Exclude<ChatChannel, "system">;
const SPEAK_CHANNELS: readonly string[] = CHAT_CHANNELS.filter((c) => c !== "system");

/** User-perceived characters per message, counted after trimming. */
export const CHAT_MAX_LENGTH = 120;
/** UTF-16 units per message after cleaning: 120 characters of up to four units each. */
export const CHAT_MAX_UNITS = 480;
/**
 * Longest raw string a validator accepts for text of `maxLength` characters; anything longer is
 * garbage and drops the client. It leaves room for spaces and invisible characters that cleaning
 * removes.
 */
export const textMaxRaw = (maxLength: number) => maxLength * 4 + 544;
export const CHAT_MAX_RAW = textMaxRaw(CHAT_MAX_LENGTH);
/** Rate limit: a burst of 5, then one more each second. */
export const CHAT_BURST = 5;
export const CHAT_PER_SECOND = 1;
/** Level needed to speak on 전체, which slows throwaway spam accounts. */
export const WORLD_CHAT_LEVEL = 5;
/** 주변 reaches this many tiles from the speaker, on the same map instance. */
export const NEAR_CHAT_TILES = 12;
/** A second filter hit within this window mutes the sender for `FILTER_MUTE_MS`. */
export const FILTER_REPEAT_MS = 10 * 60 * 1000;
export const FILTER_MUTE_MS = 5 * 60 * 1000;

/** WorldRoom message types (PLAN §21). */
export const WORLD_MESSAGES = {
  /** Client to server: `ChatSend`. Server to client: `ChatLine`. */
  chat: "chat",
  /** Server to client: `SystemLine`. */
  system: "system",
  /** Server to client: `PresenceMessage`. */
  presence: "presence",
  /** Server to client: `Refusal`, for any request the server would not carry out. */
  refused: "refused",
  /**
   * Server to client: `OpResult` (inventory.ts), the one answer to an item or currency
   * operation. Each operation is sent under its own name (`OPS`) with `{ id, req }`.
   */
  result: "result",
  /**
   * Server to client: `ChangeNotice` (inventory.ts) for a change the player did not ask for, such
   * as a combat grant landing. Applied like an operation's change, by `rev`.
   */
  change: "change",
  /** Server to client: `Done`, the answer to a social request that was carried out (social.ts). */
  done: "done",
  /** Server to client: `SocialEvent` (social.ts): the login snapshot, then small changes. */
  social: "social",
} as const;

/** Why a request was not carried out. The client owns the copy for each. */
export const REFUSAL_CODES = [
  "empty",
  "too_long",
  "rate_limited",
  "muted",
  "level",
  "target_offline",
  "target_self",
  "no_map",
  "no_channel",
  /** The filter could not read the message in its time budget. */
  "unreadable",
  // Social requests (social.ts). Each names the rule that stopped the request.
  /** Something went wrong on the server; nothing was changed. */
  "server_error",
  /** No character has that name or id. */
  "no_player",
  /** The other player is on your block list. */
  "blocked",
  "blocks_full",
  "already_friends",
  "not_friends",
  "friends_full",
  /** The other player's friend list is full. */
  "their_friends_full",
  "requests_full",
  "no_request",
  "no_party",
  "in_party",
  "target_in_party",
  "party_full",
  "not_leader",
  "no_invite",
  "invites_full",
  "not_member",
  "no_club",
  "in_club",
  "target_in_club",
  "club_full",
  "invite_only",
  "applications_full",
  /** The rank does not allow this. */
  "rank",
  /** The 짱 hands the club over before leaving a club with other members. */
  "leader_stays",
  /** A disband names the club exactly, as a safeguard. */
  "name_mismatch",
  "name_invalid",
  "name_banned",
  "name_taken",
  "jacket_invalid",
  "emblem_invalid",
  /** An emblem part the club's level has not unlocked. */
  "emblem_locked",
  /** Not enough 솔방울. */
  "insufficient",
  /** The operation id was used for a different request. */
  "op_id_reused",
  /** One active 대자보 post per category. */
  "post_active",
  "no_post",
  /** Pinning is for 층장. */
  "not_allowed",
  "unknown_emote",
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export interface ChatSend {
  ch: SpeakChannel;
  text: string;
  /** Whisper target: a character name, compared without case. */
  to?: string;
  /** Client counter, echoed on the sender's own copy and on a refusal. */
  n: number;
}

export interface ChatPerson {
  /** Character id. */
  id: string;
  name: string;
}

export interface ChatLine {
  /** Increases with every line the server sends. */
  id: number;
  ch: SpeakChannel;
  from: ChatPerson & {
    /** The speaker's session id in its map room, for the speech bubble. Only on `near`. */
    sid?: string;
  };
  /** Whisper target. */
  to?: ChatPerson;
  /** Filtered text: words on the list are masked with `*`. */
  text: string;
  /** Server time, ms since the epoch. */
  at: number;
  /** Present only on the sender's own copy: the `n` of its `ChatSend`. */
  n?: number;
}

/** A line from the server. `key` names the event and the client words it from `params`. */
export interface SystemLine {
  id: number;
  key: string;
  params?: Record<string, string | number>;
  /** Free text written by an operator, for notices. */
  text?: string;
  at: number;
}

export interface Refusal {
  /** The message type that was refused. */
  type: string;
  code: RefusalCode;
  /** The request's own number: `n` of a `ChatSend` or of a social request. */
  n?: number;
  /** For `muted`: when the mute ends, ms since the epoch. */
  until?: number;
  /** For `rate_limited`: how long until the next message is accepted. */
  retryMs?: number;
  /** For `level`: the level needed. */
  need?: number;
}

export interface PresenceEntry {
  /** Character id. */
  id: string;
  name: string;
  major: Major;
  level: number;
  /** Map id the character stands on; empty while it is on none. */
  map: string;
  /** Channel of that map, from 1; 0 while it is on none. */
  ch: number;
}

/**
 * Presence is sent as events, never as synced state: one full list on join, then a few bytes
 * per change. `you` is the receiver's own character id.
 */
export type PresenceMessage =
  | { t: "all"; you: string; list: PresenceEntry[] }
  | { t: "join"; p: PresenceEntry }
  | { t: "leave"; id: string }
  | { t: "map"; id: string; map: string; ch: number }
  | { t: "level"; id: string; level: number };

// Text rules ---------------------------------------------------------------------------------

/** Hangul jamo as the compatibility letters a keyboard types. */
export const JAMO_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
export const JAMO_VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
/** Index 0 is "no final". */
export const JAMO_FINALS = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

/** A conjoining jamo (what NFD gives for a syllable) as its compatibility letter. */
export function compatJamo(code: number): string | undefined {
  if (code >= 0x1100 && code <= 0x1112) return JAMO_INITIALS[code - 0x1100];
  if (code >= 0x1161 && code <= 0x1175) return JAMO_VOWELS[code - 0x1161];
  if (code >= 0x11a8 && code <= 0x11c2) return JAMO_FINALS[code - 0x11a8 + 1];
  return undefined;
}

const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" });

/** User-perceived characters. */
export function chatLength(text: string): number {
  let n = 0;
  for (const _ of graphemes.segment(text)) n++;
  return n;
}

/** Each user-perceived character with its UTF-16 offset. */
export function chatGraphemes(text: string): { segment: string; index: number }[] {
  return Array.from(graphemes.segment(text), ({ segment, index }) => ({ segment, index }));
}

/** UTF-16 units one character may take: the longest emoji sequences need about 15. */
export const CHAT_MAX_CHARACTER_UNITS = 20;

// Controls, line and paragraph separators and the braille blank become spaces.
const BREAKS = /[\p{Cc}\u2028\u2029\u2800]/gu;
// Conjoining jamo that NFC could not join into a syllable.
const CONJOINING = /[\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff]/gu;
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/u;
const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\ufe0f/u;
const ZWJ = "\u200d";
const BLACK_FLAG = "\u{1f3f4}";

/**
 * Drops invisible characters (zero-width spaces and joiners, the soft hyphen, word joiners,
 * bidi controls, Hangul fillers), keeping only what emoji need: a joiner between pictographs,
 * variation selectors, and the tag letters of a subdivision flag.
 */
function dropInvisible(text: string): string {
  const cps = Array.from(text);
  let out = "";
  let keptTag = false;
  cps.forEach((cp, i) => {
    const code = cp.codePointAt(0) ?? 0;
    const prev = cps[i - 1] ?? "";
    const next = cps[i + 1] ?? "";
    const tag = code >= 0xe0020 && code <= 0xe007f;
    const keep =
      !INVISIBLE.test(cp) ||
      (cp === ZWJ && PICTOGRAPH.test(prev) && PICTOGRAPH.test(next)) ||
      (code >= 0xfe00 && code <= 0xfe0f && prev !== "" && !INVISIBLE.test(prev)) ||
      (tag && (prev === BLACK_FLAG || keptTag));
    keptTag = tag && keep;
    if (keep) out += cp;
  });
  return out;
}

/**
 * The text as it is delivered and logged: NFC, one line, no invisible characters, stray
 * conjoining jamo as the letters they show, runs of spaces collapsed, trimmed. Checks the length
 * rules; the result is at most `CHAT_MAX_LENGTH` characters and `CHAT_MAX_UNITS` units.
 */
export function cleanChatText(
  raw: string,
): { ok: true; text: string } | { ok: false; code: "empty" | "too_long" } {
  return cleanText(raw, CHAT_MAX_LENGTH);
}

/**
 * `cleanChatText` for any player text with its own length: 대자보 posts, club notices, report
 * notes. `maxLength` is in user-perceived characters, each at most `CHAT_MAX_CHARACTER_UNITS`.
 */
export function cleanText(
  raw: string,
  maxLength: number,
): { ok: true; text: string } | { ok: false; code: "empty" | "too_long" } {
  const maxUnits = maxLength * 4;
  if (raw.length > textMaxRaw(maxLength)) return { ok: false, code: "too_long" };
  const text = dropInvisible(
    raw
      .normalize("NFC")
      .replace(CONJOINING, (c) => compatJamo(c.codePointAt(0) ?? 0) ?? "")
      .replace(BREAKS, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();
  if (text === "") return { ok: false, code: "empty" };
  if (text.length > maxUnits) return { ok: false, code: "too_long" };
  let n = 0;
  for (const { segment } of graphemes.segment(text)) {
    if (++n > maxLength || segment.length > CHAT_MAX_CHARACTER_UNITS) {
      return { ok: false, code: "too_long" };
    }
  }
  return { ok: true, text };
}

/**
 * A whisper target as sent: the name normalised, or undefined when it breaks the name rule. No
 * character has such a name, so the client answers `target_offline` without sending (a target
 * the schema rejects would drop the connection).
 */
export function whisperTarget(raw: string): string | undefined {
  const name = normalizeName(raw);
  return checkName(name) === null ? name : undefined;
}

// Validators ---------------------------------------------------------------------------------

/**
 * A Standard Schema (standardschema.dev v1) validator, the form Colyseus checks a message
 * against before its handler runs. A message that fails it drops the client.
 */
export interface WorldMessageSchema<Out> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: Out; readonly issues?: undefined }
      | { readonly issues: readonly { readonly message: string }[] };
    readonly types?: { readonly input: Out; readonly output: Out };
  };
}

/** A validator from a check that answers the value, or a string saying what is wrong. */
export function worldSchema<Out>(check: (value: unknown) => Out | string): WorldMessageSchema<Out> {
  return {
    "~standard": {
      version: 1,
      vendor: "guago",
      validate(value) {
        const out = check(value);
        return typeof out === "string" ? { issues: [{ message: out }] } : { value: out };
      },
    },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `chat`: the shape only. Length, level and every other rule the player can break by accident
 * are refusals, checked by the room; only a malformed message is invalid.
 */
export const chatSendSchema = worldSchema<ChatSend>((value) => {
  if (!isObject(value)) return "chat is an object";
  const { ch, text, to, n } = value;
  if (typeof ch !== "string" || !SPEAK_CHANNELS.includes(ch)) return "unknown channel";
  if (typeof text !== "string" || text.length > CHAT_MAX_RAW) return "text is a short string";
  if (!Number.isSafeInteger(n) || (n as number) < 0) return "n is a whole number";
  if (ch === "whisper") {
    if (typeof to !== "string" || to.length === 0 || to.length > 32) return "whisper needs to";
    return { ch, text, to, n: n as number };
  }
  if (to !== undefined) return "only whispers have a target";
  return { ch: ch as SpeakChannel, text, n: n as number };
});
