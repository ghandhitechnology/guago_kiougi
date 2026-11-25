/**
 * Banned names for login ids and character names (PLAN §12 signup limits). Small on purpose:
 * staff impersonation and the commonest slurs. The chat filter replaces it later.
 */

/** Names that pose as staff or the game, rejected anywhere inside a name. */
const IMPERSONATION = [
  "admin",
  "moderator",
  "gamemaster",
  "guago",
  "운영자",
  "운영팀",
  "관리자",
  "개발자",
  "어드민",
  "과고키우기",
];

/** Short staff words, rejected only as the whole name ("gm" alone, not "gmlwns"). */
const RESERVED = ["root", "system", "staff", "operator", "gm", "시스템", "공지", "지엠"];

/** Slurs and profanity, rejected anywhere inside a name. */
const PROFANE = [
  "fuck",
  "shit",
  "bitch",
  "nigger",
  "nigga",
  "faggot",
  "cunt",
  "pussy",
  "porn",
  "hitler",
  "시발",
  "씨발",
  "씨빨",
  "ㅅㅂ",
  "병신",
  "븅신",
  "개새끼",
  "좆",
  "존나",
  "지랄",
  "섹스",
  "보지",
  "자지",
  "느금",
  "니미",
  "김치녀",
  "일베",
  "엠창",
];

/** True when a login id or character name is on the banned list. */
export function isBannedName(raw: string): boolean {
  const name = raw.normalize("NFC").toLowerCase().replace(/[\s_]/g, "");
  if (RESERVED.includes(name)) return true;
  return IMPERSONATION.some((w) => name.includes(w)) || PROFANE.some((w) => name.includes(w));
}
