import {
  checkLoginId,
  checkName,
  checkPassword,
  normalizeLoginId,
  normalizeName,
  normalizeRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_LENGTH,
} from "@guago/shared";
import { type Backend, BackendError, type Character, type Session } from "./types.ts";

/**
 * A stand-in for the account API, for working on screens with no server. Only loaded when
 * `VITE_BACKEND=memory` in a dev build; production bundles never contain it. It runs the
 * shared rules the server runs. Accounts live in localStorage so a reload keeps the session,
 * which is how "returning player" is tried out.
 */

interface Stored {
  accounts: { id: string; loginId: string; password: string; code: string }[];
  characters: Record<string, Character>;
  session: string | null;
}

const KEY = "guago.memory-backend";

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // Storage blocked: start empty.
  }
  return { accounts: [], characters: {}, session: null };
}

function save(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: this tab keeps its own copy.
  }
}

const wait = () => new Promise((r) => setTimeout(r, 180 + Math.random() * 220));

function fail(code: ConstructorParameters<typeof BackendError>[0]): never {
  throw new BackendError(code);
}

function recoveryCode(): string {
  const pick = () =>
    RECOVERY_CODE_ALPHABET[Math.floor(Math.random() * RECOVERY_CODE_ALPHABET.length)];
  const raw = Array.from({ length: RECOVERY_CODE_LENGTH }, pick).join("");
  return raw.match(/.{4}/g)?.join("-") ?? raw;
}

function session(s: Stored, id: string): Session {
  const a = s.accounts.find((x) => x.id === id);
  if (!a) fail("unauthorized");
  return { account: { id: a.id, loginId: a.loginId }, character: s.characters[a.id] ?? null };
}

export const memoryBackend: Backend = {
  async signup(rawId, password, ageConfirmed) {
    await wait();
    const s = load();
    if (!ageConfirmed) fail("age_required");
    const bad = checkLoginId(rawId) ?? checkPassword(password);
    if (bad) fail(bad);
    const loginId = normalizeLoginId(rawId);
    if (s.accounts.some((a) => a.loginId === loginId)) fail("login_taken");
    const code = recoveryCode();
    const id = `a${s.accounts.length + 1}`;
    s.accounts.push({ id, loginId, password, code: normalizeRecoveryCode(code) });
    s.session = id;
    save(s);
    return { recoveryCode: code };
  },
  async login(rawId, password) {
    await wait();
    const s = load();
    const loginId = normalizeLoginId(rawId);
    const a = s.accounts.find((x) => x.loginId === loginId && x.password === password);
    if (!a) fail("bad_credentials");
    s.session = a.id;
    save(s);
    return session(s, a.id);
  },
  async logout() {
    await wait();
    const s = load();
    s.session = null;
    save(s);
  },
  async me() {
    await wait();
    const s = load();
    return s.session && s.accounts.some((a) => a.id === s.session) ? session(s, s.session) : null;
  },
  async nameAvailable(raw) {
    await wait();
    if (checkName(raw)) return { available: false, reason: "name_invalid" };
    const name = normalizeName(raw);
    const taken = Object.values(load().characters).some((c) => c.name === name);
    return taken ? { available: false, reason: "name_taken" } : { available: true };
  },
  async createCharacter(raw, major, look) {
    await wait();
    const s = load();
    if (!s.session) fail("unauthorized");
    const bad = checkName(raw);
    if (bad) fail(bad);
    const name = normalizeName(raw);
    if (s.characters[s.session]) fail("character_exists");
    if (Object.values(s.characters).some((c) => c.name === name)) fail("name_taken");
    const character: Character = {
      id: `c${Object.keys(s.characters).length + 1}`,
      name,
      major,
      look: { ...look, accessories: [...look.accessories] },
      level: 1,
      mapId: "lawn",
      x: 192,
      y: 208,
      cohort: 1,
    };
    s.characters[s.session] = character;
    save(s);
    return character;
  },
  async recover(rawId, code, newPassword) {
    await wait();
    const s = load();
    const loginId = normalizeLoginId(rawId);
    const a = s.accounts.find(
      (x) => x.loginId === loginId && x.code === normalizeRecoveryCode(code),
    );
    if (!a) fail("bad_credentials");
    const bad = checkPassword(newPassword);
    if (bad) fail(bad);
    const next = recoveryCode();
    a.password = newPassword;
    a.code = normalizeRecoveryCode(next);
    save(s);
    return { recoveryCode: next };
  },
};
