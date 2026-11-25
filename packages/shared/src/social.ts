/**
 * Social systems on the wire (PLAN §11, §12, §21): friends, blocks, parties, 동아리, the 대자보,
 * reports and emotes. Caps, rate limits, request shapes with the validators the WorldRoom runs,
 * the answers and events the server sends, and the pure rules both sides share.
 *
 * Every request carries `n`, the client's request number (one counter with chat), and gets
 * exactly one answer: `done` with the same `n` (and the request's data, if any) or `refused`
 * with a code. A malformed message drops the client; a rule the player can break is a refusal.
 */
import { checkName, type Major } from "./api.ts";
import { textMaxRaw, type WorldMessageSchema, worldSchema } from "./chat.ts";
import type { ControlMode } from "./combat.ts";
import { pageScale } from "./items.ts";
import { type LedgerEntry, type Purse, pay } from "./ledger.ts";

// Caps and times -----------------------------------------------------------------------------

export const FRIEND_CAP = 100;
/** Friend requests a player may have waiting on others. */
export const FRIEND_REQUESTS_OUT_CAP = 20;
/** Friend requests waiting on one player. */
export const FRIEND_REQUESTS_IN_CAP = 50;
/** An unanswered friend request is dropped after this long. */
export const FRIEND_REQUEST_DAYS = 14;
export const BLOCK_CAP = 200;

// Party size, the kill-sharing range and the EXP bonus are combat's: `PARTY_MAX`, `PARTY_RANGE`
// and `partyExpMultiplier` in combat.ts.
export const PARTY_INVITE_SECONDS = 60;
/** Party invites one player may hold at once. */
export const PARTY_INVITES_IN_CAP = 5;
/**
 * A member whose session ended (logout, or the 30-second reconnect window ran out) stays in the
 * party this long, shown offline, so a page reload or a quick re-login keeps the party.
 */
export const PARTY_OFFLINE_SECONDS = 180;

/** Level a character needs to found a club (PLAN §7: 1학년). */
export const CLUB_FOUND_LEVEL = 30;
export const CLUB_SIZE = 30;
/** 솔방울 to found a club on Page 1, ×10 a Page like every fee. */
export const CLUB_FEE = 50_000;
export const CLUB_NAME_MIN = 2;
export const CLUB_NAME_MAX = 10;
/** Applications waiting on one club. */
export const CLUB_APPLICATIONS_CAP = 30;
/** Clubs one player may have applied to at once. */
export const CLUB_APPLIED_CAP = 3;
/** Invites one club may have out at once. */
export const CLUB_INVITES_OUT_CAP = 20;
/** Club invites one player may hold at once. */
export const CLUB_INVITES_IN_CAP = 10;
export const CLUB_INVITE_DAYS = 3;
export const CLUB_NOTICES_CAP = 5;
export const CLUB_NOTICE_LENGTH = 100;
export const CLUB_MAX_LEVEL = 10;
/** Club EXP to reach each level, from level 2: 1000 × (level − 1)². */
export const CLUB_LEVEL_EXP = 1000;
/** Clubs per page in a search. */
export const CLUB_PAGE = 20;

export const BOARD_POST_HOURS = 48;
export const BOARD_POST_LENGTH = 200;
export const BOARD_PAGE = 20;
/** A 층장's pinned notice lasts the 층장 week. */
export const BOARD_PIN_DAYS = 7;

export const REPORT_NOTE_LENGTH = 200;
/** Lines from the reported player the server attaches (PLAN §12). */
export const REPORT_CONTEXT_LINES = 20;
/** Open reports one player may have filed at once. */
export const REPORT_OPEN_CAP = 20;

/** Emotes reach players this many tiles away on the same map instance: about a screen. */
export const EMOTE_TILES = 16;

// Ids ------------------------------------------------------------------------------------------

/** 짱, 부짱, 부원. */
export const CLUB_RANKS = ["leader", "vice", "member"] as const;
export type ClubRank = (typeof CLUB_RANKS)[number];
/** Who may join: anyone, by an application the officers review, or by invite only. */
export const JOIN_RULES = ["open", "apply", "invite"] as const;
export type JoinRule = (typeof JOIN_RULES)[number];

/** 파티 모집, 거래, 동아리 홍보, 잡담. A 층장's pinned notice is its own category. */
export const BOARD_CATEGORIES = ["party", "trade", "club", "chat"] as const;
export type BoardCategory = (typeof BOARD_CATEGORIES)[number];
export type BoardSection = BoardCategory | "notice";

/** 욕설·비방, 음란, 도배·광고, 핵·버그 악용, 현금거래, 부적절한 이름, 기타. */
export const REPORT_CATEGORIES = [
  "abuse",
  "sexual",
  "spam",
  "cheat",
  "trade",
  "name",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

// Pure rules ---------------------------------------------------------------------------------

/** What a rank may do in its club. Targets are ranked members of the same club. */
export type ClubAction =
  | "invite"
  | "review"
  | "kick"
  | "rank"
  | "handover"
  | "disband"
  | "settings"
  | "notice";

const RANK_ORDER: Readonly<Record<ClubRank, number>> = { leader: 2, vice: 1, member: 0 };

/**
 * 짱: everything. 부짱: invite, review applications, post and take down notices, kick 부원.
 * 부원: nothing beyond leaving. Acting on another member needs a higher rank than theirs.
 */
export function clubMay(actor: ClubRank, action: ClubAction, target?: ClubRank): boolean {
  if (target !== undefined && RANK_ORDER[actor] <= RANK_ORDER[target]) return false;
  switch (action) {
    case "invite":
    case "review":
    case "notice":
      return actor !== "member";
    case "kick":
      return actor !== "member" && target !== undefined;
    case "rank":
    case "handover":
      return actor === "leader" && target !== undefined;
    case "disband":
    case "settings":
      return actor === "leader";
  }
}

/** Total club EXP needed to stand at `level`. */
export function clubLevelExp(level: number): number {
  return CLUB_LEVEL_EXP * (Math.max(1, level) - 1) ** 2;
}

/** The level a club's total EXP reaches, up to `CLUB_MAX_LEVEL`. */
export function clubLevel(exp: number): number {
  let level = 1;
  while (level < CLUB_MAX_LEVEL && exp >= clubLevelExp(level + 1)) level++;
  return level;
}

/** The founding fee on the live Page. */
export function clubFee(page: number): number {
  return CLUB_FEE * pageScale(page);
}

/** The founding fee leaves the economy as `sink.club`, through the item executor. */
export function payClubFee(
  purse: Purse,
  page: number,
): { ok: true; purse: Purse; ledger: LedgerEntry[] } | { ok: false; error: "insufficient" } {
  const paid = pay(purse, { pinecone: clubFee(page) }, "sink.club");
  return paid ? { ok: true, ...paid } : { ok: false, error: "insufficient" };
}

/** When a post made at `at` (ms) stops being listed. */
export function boardExpiry(at: number, section: BoardSection): number {
  return at + (section === "notice" ? BOARD_PIN_DAYS * 24 : BOARD_POST_HOURS) * 3600 * 1000;
}

export function isBoardLive(post: { expiresAt: number }, now: number): boolean {
  return post.expiresAt > now;
}

/** Club names: 2 to 10 Hangul syllables, Latin letters or digits, single spaces between words. */
const CLUB_NAME = /^[가-힣A-Za-z0-9]+(?: [가-힣A-Za-z0-9]+)*$/;

export function normalizeClubName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** `name_invalid` or null. The server also checks the banned list and the chat filter. */
export function checkClubName(raw: string): "name_invalid" | null {
  const name = normalizeClubName(raw);
  const length = [...name].length;
  return CLUB_NAME.test(name) && length >= CLUB_NAME_MIN && length <= CLUB_NAME_MAX
    ? null
    : "name_invalid";
}

// 과잠 emblem --------------------------------------------------------------------------------

/** A back emblem: a shape and a symbol on it, each in a colour. Ids are content ids. */
export interface Emblem {
  shape: string;
  shapeColor: string;
  symbol: string;
  symbolColor: string;
}

const PART_ID = /^[a-z0-9-]{1,24}$/;

/** The compact form map rooms sync under a member's name: `shape.color.symbol.color`. */
export function encodeEmblem(e: Emblem): string {
  return `${e.shape}.${e.shapeColor}.${e.symbol}.${e.symbolColor}`;
}

export function decodeEmblem(s: string): Emblem | undefined {
  const [shape, shapeColor, symbol, symbolColor, extra] = s.split(".");
  if (extra !== undefined || !shape || !shapeColor || !symbol || !symbolColor) return undefined;
  return { shape, shapeColor, symbol, symbolColor };
}

// Views --------------------------------------------------------------------------------------

export interface Person {
  /** Character id. */
  id: string;
  name: string;
}

/**
 * A friend. Online state, map and level while online come from presence (world-link merges
 * them); `room` is the map room instance (the channel) the friend stands in, sent to friends
 * only, and empty while they are offline or between maps.
 */
export interface FriendEntry extends Person {
  major: Major;
  /** The level when the list was read; presence has the live one. */
  level: number;
  room: string;
}

export interface FriendRequest extends Person {
  /** ms since the epoch. */
  at: number;
}

export interface PartyMember extends Person {
  major: Major;
  level: number;
  /** Map id; empty while offline or between maps. */
  map: string;
  /** False once the session ended; the member is dropped after `PARTY_OFFLINE_SECONDS`. */
  online: boolean;
  /** Health in percent, 0 to 100; −1 until combat reports it. */
  hp: number;
  /** Control mode; empty until combat reports it. */
  mode: ControlMode | "";
}

export interface PartyView {
  id: number;
  /** Character id of the leader. */
  leader: string;
  members: PartyMember[];
  /** Invites out and unanswered, with when they lapse (ms). */
  invited: (Person & { expiresAt: number })[];
}

export interface PartyInvite {
  /** The party id; answer with `party.accept` or `party.decline`. */
  id: number;
  from: Person;
  /** Members in the party now. */
  size: number;
  expiresAt: number;
}

export interface ClubMember extends Person {
  major: Major;
  level: number;
  rank: ClubRank;
  joinedAt: number;
}

export interface ClubNotice {
  id: number;
  author: Person;
  text: string;
  at: number;
}

export interface ClubView {
  id: number;
  name: string;
  joinRule: JoinRule;
  level: number;
  exp: number;
  /** A `jacket` swap slot option of the art. */
  jacket: string;
  emblem: Emblem;
  /** Character id of the 짱. */
  leader: string;
  members: ClubMember[];
  notices: ClubNotice[];
}

/** What anyone may read about a club: search results and `club.view`. */
export interface ClubSummary {
  id: number;
  name: string;
  joinRule: JoinRule;
  level: number;
  members: number;
  jacket: string;
  emblem: Emblem;
  leader: Person;
}

export interface ClubInvite {
  club: { id: number; name: string };
  from: Person;
  expiresAt: number;
}

/** One of the player's own open applications. */
export interface ClubApplication {
  club: { id: number; name: string };
  at: number;
}

/** An applicant waiting on the club, shown to 짱 and 부짱. */
export interface Applicant extends Person {
  major: Major;
  level: number;
  at: number;
}

export interface BoardPost {
  id: number;
  section: BoardSection;
  author: Person;
  text: string;
  at: number;
  expiresAt: number;
}

/** Everything a player's social panels need, sent once on joining the WorldRoom. */
export interface SocialSnapshot {
  friends: FriendEntry[];
  requests: { in: FriendRequest[]; out: FriendRequest[] };
  blocks: Person[];
  party: PartyView | null;
  partyInvites: PartyInvite[];
  club: ClubView | null;
  clubInvites: ClubInvite[];
  applications: ClubApplication[];
  /** Applicants to the player's club; empty unless 짱 or 부짱. */
  applicants: Applicant[];
}

/**
 * Server to client on `social`. After `all`, each change arrives as the smallest event that
 * carries it; list events replace that list whole (every list is capped).
 */
export type SocialEvent =
  | { t: "all"; s: SocialSnapshot }
  /** A friend added, or a friend's entry changed (channel). */
  | { t: "friend"; f: FriendEntry }
  | { t: "unfriend"; id: string }
  | { t: "requests"; in: FriendRequest[]; out: FriendRequest[] }
  | { t: "blocks"; list: Person[] }
  | { t: "party"; party: PartyView | null }
  | { t: "partyInvites"; list: PartyInvite[] }
  /** A party member's health and mode, from combat. */
  | { t: "vitals"; id: string; hp: number; mode: ControlMode | "" }
  | { t: "club"; club: ClubView | null }
  | { t: "clubExp"; level: number; exp: number }
  | { t: "clubInvites"; list: ClubInvite[] }
  | { t: "applications"; list: ClubApplication[] }
  | { t: "applicants"; list: Applicant[] }
  /** A nearby player's emote; `sid` is their session in the map room, for the body. */
  | { t: "emote"; id: string; sid: string; e: string };

// Requests -----------------------------------------------------------------------------------

/** Each request's body (all also carry `n`) and what its `done` answer holds. */
export interface SocialRequests {
  "friend.request": { req: { name: string }; done: undefined };
  "friend.accept": { req: { id: string }; done: undefined };
  "friend.decline": { req: { id: string }; done: undefined };
  "friend.cancel": { req: { id: string }; done: undefined };
  "friend.remove": { req: { id: string }; done: undefined };
  /** By name (typed) or by id (a chat line or a player card). */
  "block.add": { req: { name: string } | { id: string }; done: undefined };
  "block.remove": { req: { id: string }; done: undefined };
  "party.invite": { req: { name: string }; done: undefined };
  "party.accept": { req: { id: number }; done: undefined };
  "party.decline": { req: { id: number }; done: undefined };
  "party.leave": { req: Record<string, never>; done: undefined };
  "party.kick": { req: { id: string }; done: undefined };
  "party.lead": { req: { id: string }; done: undefined };
  /** `op` is an operation id: after `offline` or `timeout`, retry with the same one. */
  "club.create": {
    req: { op: string; name: string; joinRule: JoinRule; jacket: string; emblem: Emblem };
    done: { club: number };
  };
  /** Open clubs take the player at once (`joined`); `apply` clubs queue an application. */
  "club.join": { req: { id: number }; done: { joined: boolean } };
  "club.withdraw": { req: { id: number }; done: undefined };
  "club.invite": { req: { name: string }; done: undefined };
  "club.accept": { req: { id: number }; done: undefined };
  "club.decline": { req: { id: number }; done: undefined };
  "club.review": { req: { id: string; accept: boolean }; done: undefined };
  "club.leave": { req: Record<string, never>; done: undefined };
  "club.kick": { req: { id: string }; done: undefined };
  /** Promote to 부짱 or step down to 부원. */
  "club.rank": { req: { id: string; rank: "vice" | "member" }; done: undefined };
  "club.handover": { req: { id: string }; done: undefined };
  /** `name` must be the club's exact name. */
  "club.disband": { req: { name: string }; done: undefined };
  "club.settings": {
    req: { joinRule?: JoinRule; jacket?: string; emblem?: Emblem };
    done: undefined;
  };
  "club.notice": { req: { text: string }; done: undefined };
  "club.unnotice": { req: { id: number }; done: undefined };
  /** Clubs by name prefix (or all), by name; `after` is the last name of the previous page. */
  "club.search": {
    req: { q?: string; after?: string };
    done: { clubs: ClubSummary[]; more: boolean };
  };
  "club.view": { req: { id: number }; done: { club: ClubSummary | null } };
  /** Newest first; `before` is the last id of the previous page. Pinned notices on page one. */
  "board.list": {
    req: { cat: BoardCategory; before?: number };
    done: { posts: BoardPost[]; pinned: BoardPost[]; more: boolean };
  };
  "board.post": { req: { cat: BoardCategory; text: string }; done: { post: BoardPost } };
  "board.delete": { req: { id: number }; done: undefined };
  /** The 층장's one notice. */
  "board.pin": { req: { text: string }; done: { post: BoardPost } };
  /**
   * `id` is the reported character. `line` is the chat line id when reported from a message.
   * The answer is an acknowledgement and nothing else.
   */
  report: {
    req: { id: string; cat: ReportCategory; note?: string; line?: number };
    done: undefined;
  };
  emote: { req: { e: string }; done: undefined };
}

export type SocialType = keyof SocialRequests;
export type SocialRequest<K extends SocialType> = SocialRequests[K]["req"] & { n: number };
export type SocialDone<K extends SocialType> = SocialRequests[K]["done"];

/** Server to client on `done`: the answer to a request that was carried out. */
export interface Done {
  type: SocialType;
  n: number;
  data?: unknown;
}

interface Rate {
  readonly burst: number;
  readonly perSecond: number;
}

const r = (burst: number, perSecond: number): Rate => ({ burst, perSecond });

/** How fast each request may be sent, per character (PLAN §12 moderation, §21). */
export const SOCIAL_RATE: Readonly<Record<SocialType, Rate>> = {
  "friend.request": r(3, 1 / 10),
  "friend.accept": r(10, 1),
  "friend.decline": r(10, 1),
  "friend.cancel": r(10, 1),
  "friend.remove": r(5, 1 / 2),
  "block.add": r(5, 1 / 2),
  "block.remove": r(5, 1 / 2),
  "party.invite": r(3, 1 / 2),
  "party.accept": r(5, 1),
  "party.decline": r(10, 1),
  "party.leave": r(5, 1),
  "party.kick": r(5, 1),
  "party.lead": r(5, 1),
  "club.create": r(2, 1 / 30),
  "club.join": r(3, 1 / 5),
  "club.withdraw": r(5, 1 / 2),
  "club.invite": r(5, 1 / 3),
  "club.accept": r(3, 1 / 2),
  "club.decline": r(10, 1),
  "club.review": r(10, 1),
  "club.leave": r(3, 1 / 5),
  "club.kick": r(5, 1 / 2),
  "club.rank": r(5, 1 / 2),
  "club.handover": r(2, 1 / 10),
  "club.disband": r(2, 1 / 30),
  "club.settings": r(3, 1 / 10),
  "club.notice": r(3, 1 / 30),
  "club.unnotice": r(5, 1 / 5),
  "club.search": r(5, 1),
  "club.view": r(10, 2),
  "board.list": r(5, 1),
  "board.post": r(2, 1 / 30),
  "board.delete": r(5, 1 / 5),
  "board.pin": r(2, 1 / 60),
  report: r(3, 1 / 120),
  emote: r(3, 2 / 3),
};

// Validators ---------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** As the item executor's operation ids. */
export const SOCIAL_OP_ID = /^[A-Za-z0-9_.-]{8,64}$/;
const EMOTE_ID = /^[a-z0-9-]{1,24}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isRowId = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= 2 ** 52;
export const isCharacterId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
/** A character name as the server accepts it; the client checks first and answers `no_player`. */
export const isPlayerName = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 32 && checkName(v) === null;
const isText = (v: unknown, maxLength: number): v is string =>
  typeof v === "string" && v.length <= textMaxRaw(maxLength);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

function isEmblem(v: unknown): v is Emblem {
  if (!isObject(v) || !only(v, ["shape", "shapeColor", "symbol", "symbolColor"])) return false;
  return [v.shape, v.shapeColor, v.symbol, v.symbolColor].every(
    (p) => typeof p === "string" && PART_ID.test(p),
  );
}

type Check = (v: Record<string, unknown>) => boolean;

/** Field checks per request, besides `n`. Unknown fields are malformed. */
const CHECKS: { [K in SocialType]: [keys: string[], check: Check] } = {
  "friend.request": [["name"], (v) => isPlayerName(v.name)],
  "friend.accept": [["id"], (v) => isCharacterId(v.id)],
  "friend.decline": [["id"], (v) => isCharacterId(v.id)],
  "friend.cancel": [["id"], (v) => isCharacterId(v.id)],
  "friend.remove": [["id"], (v) => isCharacterId(v.id)],
  "block.add": [
    ["name", "id"],
    (v) =>
      v.id === undefined ? isPlayerName(v.name) : v.name === undefined && isCharacterId(v.id),
  ],
  "block.remove": [["id"], (v) => isCharacterId(v.id)],
  "party.invite": [["name"], (v) => isPlayerName(v.name)],
  "party.accept": [["id"], (v) => isRowId(v.id)],
  "party.decline": [["id"], (v) => isRowId(v.id)],
  "party.leave": [[], () => true],
  "party.kick": [["id"], (v) => isCharacterId(v.id)],
  "party.lead": [["id"], (v) => isCharacterId(v.id)],
  "club.create": [
    ["op", "name", "joinRule", "jacket", "emblem"],
    (v) =>
      typeof v.op === "string" &&
      SOCIAL_OP_ID.test(v.op) &&
      typeof v.name === "string" &&
      v.name.length <= 64 &&
      oneOf(JOIN_RULES, v.joinRule) &&
      typeof v.jacket === "string" &&
      PART_ID.test(v.jacket) &&
      isEmblem(v.emblem),
  ],
  "club.join": [["id"], (v) => isRowId(v.id)],
  "club.withdraw": [["id"], (v) => isRowId(v.id)],
  "club.invite": [["name"], (v) => isPlayerName(v.name)],
  "club.accept": [["id"], (v) => isRowId(v.id)],
  "club.decline": [["id"], (v) => isRowId(v.id)],
  "club.review": [["id", "accept"], (v) => isCharacterId(v.id) && typeof v.accept === "boolean"],
  "club.leave": [[], () => true],
  "club.kick": [["id"], (v) => isCharacterId(v.id)],
  "club.rank": [["id", "rank"], (v) => isCharacterId(v.id) && oneOf(["vice", "member"], v.rank)],
  "club.handover": [["id"], (v) => isCharacterId(v.id)],
  "club.disband": [["name"], (v) => typeof v.name === "string" && v.name.length <= 64],
  "club.settings": [
    ["joinRule", "jacket", "emblem"],
    (v) =>
      (v.joinRule === undefined || oneOf(JOIN_RULES, v.joinRule)) &&
      (v.jacket === undefined || (typeof v.jacket === "string" && PART_ID.test(v.jacket))) &&
      (v.emblem === undefined || isEmblem(v.emblem)),
  ],
  "club.notice": [["text"], (v) => isText(v.text, CLUB_NOTICE_LENGTH)],
  "club.unnotice": [["id"], (v) => isRowId(v.id)],
  "club.search": [
    ["q", "after"],
    (v) =>
      (v.q === undefined || (typeof v.q === "string" && v.q.length <= 64)) &&
      (v.after === undefined || (typeof v.after === "string" && v.after.length <= 64)),
  ],
  "club.view": [["id"], (v) => isRowId(v.id)],
  "board.list": [
    ["cat", "before"],
    (v) => oneOf(BOARD_CATEGORIES, v.cat) && (v.before === undefined || isRowId(v.before)),
  ],
  "board.post": [
    ["cat", "text"],
    (v) => oneOf(BOARD_CATEGORIES, v.cat) && isText(v.text, BOARD_POST_LENGTH),
  ],
  "board.delete": [["id"], (v) => isRowId(v.id)],
  "board.pin": [["text"], (v) => isText(v.text, BOARD_POST_LENGTH)],
  report: [
    ["id", "cat", "note", "line"],
    (v) =>
      isCharacterId(v.id) &&
      oneOf(REPORT_CATEGORIES, v.cat) &&
      (v.note === undefined || isText(v.note, REPORT_NOTE_LENGTH)) &&
      (v.line === undefined || isRowId(v.line)),
  ],
  emote: [["e"], (v) => typeof v.e === "string" && EMOTE_ID.test(v.e)],
};

export const SOCIAL_TYPES = Object.keys(CHECKS) as SocialType[];

export function isSocialType(type: string): type is SocialType {
  return Object.hasOwn(CHECKS, type);
}

/** The validator the WorldRoom checks a social request against before its handler runs. */
export function socialSchema<K extends SocialType>(type: K): WorldMessageSchema<SocialRequest<K>> {
  const [keys, check] = CHECKS[type];
  const allowed = [...keys, "n"];
  return worldSchema<SocialRequest<K>>((value) => {
    if (!isObject(value) || !only(value, allowed)) return `${type} has unknown fields`;
    if (!isCount(value.n)) return "n is a whole number";
    return check(value) ? (value as SocialRequest<K>) : `malformed ${type}`;
  });
}
