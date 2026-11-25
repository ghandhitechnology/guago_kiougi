/**
 * The WorldRoom protocol (PLAN §12 chat, §21): channel ids, limits, message shapes and the
 * validators both sides run. The client renders every chat string as plain text (PLAN §22).
 */
import type { Major } from "./api.ts";

/** The room every client holds for the whole session, beside its map room (PLAN §19). */
export const WORLD_ROOM = "world";

/**
 * Chat channels. `system` is server to player only. `party` and `club` are part of the protocol
 * already; the server refuses them with `no_channel` until parties and clubs exist.
 */
export const CHAT_CHANNELS = ["world", "near", "whisper", "party", "club", "system"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];
/** Channels a player may send on. */
export type SpeakChannel = Exclude<ChatChannel, "system">;
const SPEAK_CHANNELS: readonly string[] = CHAT_CHANNELS.filter((c) => c !== "system");

/** User-perceived characters per message, counted after trimming. */
export const CHAT_MAX_LENGTH = 120;
/** UTF-16 units per message after trimming: stops one "character" made of hundreds of marks. */
export const CHAT_MAX_UNITS = 480;
/** Longest raw string the validator accepts; anything longer is garbage and drops the client. */
export const CHAT_MAX_RAW = 2048;
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
}

/**
 * Presence is sent as events, never as synced state: one full list on join, then a few bytes
 * per change. `you` is the receiver's own character id.
 */
export type PresenceMessage =
  | { t: "all"; you: string; list: PresenceEntry[] }
  | { t: "join"; p: PresenceEntry }
  | { t: "leave"; id: string }
  | { t: "map"; id: string; map: string }
  | { t: "level"; id: string; level: number };

// Text rules ---------------------------------------------------------------------------------

const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" });

/** User-perceived characters: a Hangul syllable typed as conjoining jamo counts once. */
export function chatLength(text: string): number {
  let n = 0;
  for (const _ of graphemes.segment(text)) n++;
  return n;
}

/** Each user-perceived character with its UTF-16 offset. */
export function chatGraphemes(text: string): { segment: string; index: number }[] {
  return Array.from(graphemes.segment(text), ({ segment, index }) => ({ segment, index }));
}

// Controls, line and paragraph separators, bidi overrides and isolates, and the BOM. Zero-width
// joiners stay: emoji sequences need them.
const STRIP = /[\p{Cc}\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;

/**
 * The text as it is delivered and logged: NFC, one line, runs of spaces collapsed, trimmed.
 * Checks the length rules; the result is never longer than `CHAT_MAX_LENGTH` characters.
 */
export function cleanChatText(
  raw: string,
): { ok: true; text: string } | { ok: false; code: "empty" | "too_long" } {
  const text = raw
    .normalize("NFC")
    .replace(STRIP, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (text === "") return { ok: false, code: "empty" };
  if (text.length > CHAT_MAX_UNITS || chatLength(text) > CHAT_MAX_LENGTH) {
    return { ok: false, code: "too_long" };
  }
  return { ok: true, text };
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

function worldSchema<Out>(check: (value: unknown) => Out | string): WorldMessageSchema<Out> {
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
