import {
  type ApiErrorCode,
  type Backend,
  BackendError,
  type Character,
  type NameCheck,
  type Session,
} from "./types.ts";

const API_CODES: readonly ApiErrorCode[] = [
  "login_taken",
  "bad_credentials",
  "rate_limited",
  "name_taken",
  "name_invalid",
  "signup_limit",
  "age_required",
  "weak_password",
];

/** The API is served from the page's own origin (Caddy in production, Vite's proxy in dev). */
async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new BackendError("offline");
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new BackendError(res.ok ? "unknown" : res.status >= 500 ? "offline" : "unknown");
  }
  if (!res.ok) {
    const code = (data as { error?: string }).error;
    if (res.status === 429) throw new BackendError("rate_limited");
    const known = API_CODES.find((c) => c === code);
    throw new BackendError(known ?? (res.status >= 500 ? "offline" : "unknown"));
  }
  return data as T;
}

export const httpBackend: Backend = {
  signup: (loginId, password, ageConfirmed) =>
    call("POST", "/api/signup", { loginId, password, ageConfirmed }),
  login: (loginId, password) => call<Session>("POST", "/api/login", { loginId, password }),
  async logout() {
    await call("POST", "/api/logout");
  },
  async me() {
    try {
      return await call<Session>("GET", "/api/me");
    } catch (e) {
      if (e instanceof BackendError && e.code !== "offline" && e.code !== "rate_limited") {
        return null;
      }
      throw e;
    }
  },
  nameAvailable: (name) =>
    call<NameCheck>("GET", `/api/name-available?name=${encodeURIComponent(name)}`),
  async createCharacter(name, major, look) {
    const { character } = await call<{ character: Character }>("POST", "/api/character", {
      name,
      major,
      look,
    });
    return character;
  },
  async recover(loginId, recoveryCode, newPassword) {
    await call("POST", "/api/recover", { loginId, recoveryCode, newPassword });
  },
};
