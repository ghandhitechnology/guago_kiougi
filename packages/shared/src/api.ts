/**
 * The HTTP API between the client and the game server (PLAN §19, §22). Paths, shapes, error codes
 * and validators live here once; the server runs the same parsers the client may run early.
 */

export const API = {
  signup: "/api/signup",
  login: "/api/login",
  logout: "/api/logout",
  me: "/api/me",
  nameAvailable: "/api/name-available",
  character: "/api/character",
  recover: "/api/recover",
  /** GET: the character's `InventorySnapshot`. */
  inventory: "/api/inventory",
  /** POST `{ id, op, req }` (inventory.ts): one item or currency operation, answered by its `OpResult`. */
  op: "/api/op",
} as const;

/**
 * Path prefix for Colyseus matchmaking and room sockets on the page's own origin:
 * `new Client(ROOMS_PATH)`. The dev proxy (and the production proxy) strips it.
 */
export const ROOMS_PATH = "/rooms";

/** Every error the API answers with, as `{ error: code }`. The client owns the copy. */
export const API_ERRORS = [
  "bad_request",
  "forbidden",
  "unauthorized",
  "rate_limited",
  "server_error",
  "login_invalid",
  "login_banned",
  "login_taken",
  "weak_password",
  "age_required",
  "signup_limit",
  "bad_credentials",
  "account_banned",
  "name_invalid",
  "name_banned",
  "name_taken",
  "major_invalid",
  "look_invalid",
  "character_exists",
] as const;
export type ApiErrorCode = (typeof API_ERRORS)[number];

export interface ApiError {
  error: ApiErrorCode;
  /** With `account_banned` on a login whose password was right: what the player is owed. */
  ban?: BanNotice;
}

/**
 * Why and until when an account is banned, as its owner is told: the narrative's
 * `moderation.banned` ({time}, {reason}) or `moderation.banned-permanent` ({reason}).
 */
export interface BanNotice {
  key: "moderation.banned" | "moderation.banned-permanent";
  /** Ms since the epoch; absent for a ban until lifted. */
  until?: number;
  reason: string;
}

export const MAJORS = ["math", "physics", "chemistry", "biology", "earth"] as const;
export type Major = (typeof MAJORS)[number];

/**
 * A student look. Ids come from the art metadata: `body` is a `skin` swap slot option,
 * `hairColor` a `hair` slot option, `hair`, `face` and `uniform` are parts of those rig layers,
 * and `accessories` holds at most one part from each of the `accessory` and `jacket` layers.
 */
export interface Look {
  body: string;
  hair: string;
  hairColor: string;
  face: string;
  uniform: string;
  accessories: string[];
}

export interface Character {
  id: string;
  name: string;
  major: Major;
  look: Look;
  level: number;
  mapId: string;
  x: number;
  y: number;
  cohort: number;
}

export interface Account {
  id: string;
  loginId: string;
}

export interface SignupRequest {
  loginId: string;
  password: string;
  ageConfirmed: boolean;
}
export interface SignupResponse {
  recoveryCode: string;
}

export interface LoginRequest {
  loginId: string;
  password: string;
}
export interface LoginResponse {
  account: Account;
  character: Character | null;
}

export type MeResponse = LoginResponse;

export interface NameAvailableResponse {
  available: boolean;
  reason?: "name_invalid" | "name_banned" | "name_taken";
}

export interface CreateCharacterRequest {
  name: string;
  major: Major;
  look: Look;
}
export interface CreateCharacterResponse {
  character: Character;
}

export interface RecoverRequest {
  loginId: string;
  recoveryCode: string;
  newPassword: string;
}
export interface OkResponse {
  ok: true;
}
/** Recovery spends the old code and issues a new one to show and save. */
export interface RecoverResponse {
  ok: true;
  recoveryCode: string;
}

// Rules ---------------------------------------------------------------------------------------

/** Login ids: 4 to 16 Latin letters, digits or underscores, compared in lower case. */
export const LOGIN_ID_PATTERN = /^[a-z0-9_]{4,16}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** Character names: 2 to 8 Hangul syllables, Latin letters or digits. */
export const NAME_PATTERN = /^[가-힣A-Za-z0-9]{2,8}$/;
/** Recovery codes are shown as four groups of four; dashes and spaces are ignored on input. */
export const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_LENGTH = 16;

export function normalizeLoginId(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeName(raw: string): string {
  return raw.trim().normalize("NFC");
}

export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/*
 * The game's own room close codes sit in 4020-4029. Colyseus uses 4000 (consented), 4001 (server
 * shutdown), 4002 (closed with an error), 4003 (reconnection failed) and 4010 (may reconnect), so
 * none of those may mean anything final here: a restart or a failed reconnection is a drop.
 */
/** Room close code sent to a client whose account joined somewhere else. Do not rejoin on it. */
export const CLOSE_SESSION_REPLACED = 4021;
/** Room close code: an admin closed this session. The player may log in again. Do not rejoin on it. */
export const CLOSE_KICKED = 4022;
/** Room close code: the account was banned. Its sessions are gone; logging in answers `account_banned`. */
export const CLOSE_BANNED = 4023;

/** How a room link ends for good, by close code; anything else is a drop worth rejoining after. */
export type LinkEnd = "replaced" | "kicked" | "banned";

export function closeEnd(code: number): LinkEnd | null {
  if (code === CLOSE_SESSION_REPLACED) return "replaced";
  if (code === CLOSE_KICKED) return "kicked";
  if (code === CLOSE_BANNED) return "banned";
  return null;
}

// Parsers -------------------------------------------------------------------------------------

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ApiErrorCode };

const fail = (error: ApiErrorCode): { ok: false; error: ApiErrorCode } => ({ ok: false, error });
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function checkLoginId(raw: string): ApiErrorCode | null {
  return LOGIN_ID_PATTERN.test(normalizeLoginId(raw)) ? null : "login_invalid";
}

export function checkPassword(raw: string): ApiErrorCode | null {
  if (raw.length > PASSWORD_MAX) return "bad_request";
  return [...raw].length >= PASSWORD_MIN ? null : "weak_password";
}

export function checkName(raw: string): ApiErrorCode | null {
  return NAME_PATTERN.test(normalizeName(raw)) ? null : "name_invalid";
}

export function parseSignup(body: unknown): Parsed<SignupRequest> {
  if (!isObject(body)) return fail("bad_request");
  const { loginId, password, ageConfirmed } = body;
  if (typeof loginId !== "string" || typeof password !== "string") return fail("bad_request");
  if (ageConfirmed !== true) return fail("age_required");
  const error = checkLoginId(loginId) ?? checkPassword(password);
  if (error) return fail(error);
  return { ok: true, value: { loginId: normalizeLoginId(loginId), password, ageConfirmed } };
}

export function parseLogin(body: unknown): Parsed<LoginRequest> {
  if (!isObject(body)) return fail("bad_request");
  const { loginId, password } = body;
  if (typeof loginId !== "string" || typeof password !== "string") return fail("bad_request");
  if (loginId.length > 64 || password.length > PASSWORD_MAX) return fail("bad_request");
  return { ok: true, value: { loginId: normalizeLoginId(loginId), password } };
}

export function parseRecover(body: unknown): Parsed<RecoverRequest> {
  if (!isObject(body)) return fail("bad_request");
  const { loginId, recoveryCode, newPassword } = body;
  if (typeof loginId !== "string" || typeof recoveryCode !== "string") return fail("bad_request");
  if (typeof newPassword !== "string" || loginId.length > 64 || recoveryCode.length > 64) {
    return fail("bad_request");
  }
  const error = checkPassword(newPassword);
  if (error) return fail(error);
  return {
    ok: true,
    value: {
      loginId: normalizeLoginId(loginId),
      recoveryCode: normalizeRecoveryCode(recoveryCode),
      newPassword,
    },
  };
}

/** Allowed ids per look field, read from the art metadata by `lookOptions`. */
export interface LookOptions {
  body: readonly string[];
  hair: readonly string[];
  hairColor: readonly string[];
  face: readonly string[];
  uniform: readonly string[];
  /** Accessory id to the rig layer it is drawn in; one per layer. */
  accessories: Readonly<Record<string, string>>;
}

/** The slice of `art.json` the look needs, typed structurally so `shared` stays art-free. */
export interface LookSource {
  rigs: Readonly<Record<string, { parts: Readonly<Record<string, readonly string[]>> }>>;
  slots: Readonly<Record<string, { options: Readonly<Record<string, unknown>> }>>;
}

export const ACCESSORY_LAYERS = ["accessory", "jacket"] as const;

export function lookOptions(art: LookSource, rig = "student"): LookOptions {
  const parts = art.rigs[rig]?.parts;
  if (!parts) throw new Error(`art metadata has no rig "${rig}"`);
  const slot = (name: string) => Object.keys(art.slots[name]?.options ?? {});
  const accessories: Record<string, string> = {};
  for (const layer of ACCESSORY_LAYERS) {
    for (const id of parts[layer] ?? []) accessories[id] = layer;
  }
  return {
    body: slot("skin"),
    hair: parts.hair ?? [],
    hairColor: slot("hair"),
    face: parts.face ?? [],
    uniform: parts.uniform ?? [],
    accessories,
  };
}

export function parseLook(value: unknown, options: LookOptions): Parsed<Look> {
  if (!isObject(value)) return fail("look_invalid");
  const { body, hair, hairColor, face, uniform, accessories } = value;
  const pick = (v: unknown, allowed: readonly string[]) =>
    typeof v === "string" && allowed.includes(v);
  if (
    !pick(body, options.body) ||
    !pick(hair, options.hair) ||
    !pick(hairColor, options.hairColor) ||
    !pick(face, options.face) ||
    !pick(uniform, options.uniform) ||
    !Array.isArray(accessories)
  ) {
    return fail("look_invalid");
  }
  const layers = new Set<string>();
  for (const id of accessories) {
    const layer = typeof id === "string" ? options.accessories[id] : undefined;
    if (layer === undefined || layers.has(layer)) return fail("look_invalid");
    layers.add(layer);
  }
  return {
    ok: true,
    value: {
      body: body as string,
      hair: hair as string,
      hairColor: hairColor as string,
      face: face as string,
      uniform: uniform as string,
      accessories: accessories as string[],
    },
  };
}

export function parseCreateCharacter(
  body: unknown,
  options: LookOptions,
): Parsed<CreateCharacterRequest> {
  if (!isObject(body)) return fail("bad_request");
  const { name, major, look } = body;
  if (typeof name !== "string" || name.length > 32) return fail("name_invalid");
  const nameError = checkName(name);
  if (nameError) return fail(nameError);
  if (!MAJORS.includes(major as Major)) return fail("major_invalid");
  const parsed = parseLook(look, options);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: { name: normalizeName(name), major: major as Major, look: parsed.value },
  };
}
