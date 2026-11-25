import {
  API,
  API_ERRORS,
  type CreateCharacterResponse,
  type LoginResponse,
  type NameAvailableResponse,
  type RecoverResponse,
  type SignupResponse,
} from "@guago/shared";
import { type Backend, BackendError } from "./types.ts";

/** The API is served from the page's own origin (the proxy in production, Vite's in dev). */
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
    // A proxy's own error page: the game server behind it is down.
    throw new BackendError(res.status >= 500 ? "offline" : "unknown");
  }
  if (!res.ok) {
    const code = (data as { error?: string }).error;
    const known = API_ERRORS.find((c) => c === code);
    throw new BackendError(known ?? (res.status >= 500 ? "offline" : "unknown"));
  }
  return data as T;
}

export const httpBackend: Backend = {
  signup: (loginId, password, ageConfirmed) =>
    call<SignupResponse>("POST", API.signup, { loginId, password, ageConfirmed }),
  login: (loginId, password) => call<LoginResponse>("POST", API.login, { loginId, password }),
  async logout() {
    await call("POST", API.logout);
  },
  async me() {
    try {
      return await call<LoginResponse>("GET", API.me);
    } catch (e) {
      if (e instanceof BackendError && (e.code === "unauthorized" || e.code === "forbidden")) {
        return null;
      }
      throw e;
    }
  },
  nameAvailable: (name) =>
    call<NameAvailableResponse>("GET", `${API.nameAvailable}?name=${encodeURIComponent(name)}`),
  async createCharacter(name, major, look) {
    const { character } = await call<CreateCharacterResponse>("POST", API.character, {
      name,
      major,
      look,
    });
    return character;
  },
  async recover(loginId, recoveryCode, newPassword) {
    const { recoveryCode: next } = await call<RecoverResponse>("POST", API.recover, {
      loginId,
      recoveryCode,
      newPassword,
    });
    return { recoveryCode: next };
  },
};
