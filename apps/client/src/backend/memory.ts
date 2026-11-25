import {
  type Backend,
  BackendError,
  type Character,
  type Look,
  type Major,
  type Session,
} from "./types.ts";

/**
 * A stand-in for the account API, for working on screens with no server. Only loaded when
 * `VITE_BACKEND=memory` in a dev build; production bundles never contain it. Accounts live in
 * localStorage so a reload keeps the session, which is how "returning player" is tried out.
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
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => abc[Math.floor(Math.random() * abc.length)];
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, pick).join("")).join("-");
}

const NAME = /^[가-힣a-zA-Z0-9]{2,8}$/;

export const memoryBackend: Backend = {
  async signup(loginId, password, ageConfirmed) {
    await wait();
    const s = load();
    if (!ageConfirmed) fail("age_required");
    if (password.length < 8) fail("weak_password");
    if (s.accounts.some((a) => a.loginId === loginId)) fail("login_taken");
    const code = recoveryCode();
    const id = `a${s.accounts.length + 1}`;
    s.accounts.push({ id, loginId, password, code });
    s.session = id;
    save(s);
    return { recoveryCode: code };
  },
  async login(loginId, password): Promise<Session> {
    await wait();
    const s = load();
    const a = s.accounts.find((x) => x.loginId === loginId && x.password === password);
    if (!a) fail("bad_credentials");
    s.session = a.id;
    save(s);
    return { account: { id: a.id, loginId: a.loginId }, character: s.characters[a.id] ?? null };
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
    const a = s.accounts.find((x) => x.id === s.session);
    if (!a) return null;
    return { account: { id: a.id, loginId: a.loginId }, character: s.characters[a.id] ?? null };
  },
  async nameAvailable(name) {
    await wait();
    if (!NAME.test(name)) return { available: false, reason: "name_invalid" };
    const taken = Object.values(load().characters).some((c) => c.name === name);
    return taken ? { available: false, reason: "name_taken" } : { available: true };
  },
  async createCharacter(name: string, major: Major, look: Look) {
    await wait();
    const s = load();
    if (!s.session) fail("bad_credentials");
    if (!NAME.test(name)) fail("name_invalid");
    if (Object.values(s.characters).some((c) => c.name === name)) fail("name_taken");
    const character: Character = {
      id: `c${Object.keys(s.characters).length + 1}`,
      name,
      major,
      look,
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
  async recover(loginId, code, newPassword) {
    await wait();
    const s = load();
    const a = s.accounts.find((x) => x.loginId === loginId && x.code === code.toUpperCase());
    if (!a) fail("bad_credentials");
    if (newPassword.length < 8) fail("weak_password");
    a.password = newPassword;
    save(s);
  },
};
