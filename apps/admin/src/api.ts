/** The admin API on this page's own origin, with the session's CSRF token on every request. */

export interface AdminView {
  id: string;
  loginId: string;
  role: "moderator" | "owner";
}

let csrf = "";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(MESSAGES[code] ?? code);
    this.status = status;
    this.code = code;
  }
}

/** What an error code means to the admin, in plain words. */
const MESSAGES: Record<string, string> = {
  bad_request: "Check the fields.",
  bad_credentials: "Wrong login or password.",
  rate_limited: "Too many attempts. Wait a few minutes.",
  unauthorized: "Signed out.",
  forbidden: "Refused.",
  csrf: "Session token out of date. Reload the page.",
  role: "Owners only.",
  not_found: "Not found.",
  no_character: "This account has no character.",
  not_banned: "No ban in force.",
  not_muted: "No admin mute in force.",
  already_struck: "This line is already a strike.",
  already_handled: "This report is already closed.",
  insufficient: "The player holds less than that.",
  item_missing: "An item is no longer in the inventory.",
  op_id_reused: "Reload the page and try again.",
  offline: "The game world is not running.",
  self: "You cannot change your own account.",
  server_error: "Server error.",
};

let onSignedOut: () => void = () => {};
export function whenSignedOut(f: () => void): void {
  onSignedOut = f;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/admin/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "x-csrf-token": csrf,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof data.error === "string" ? data.error : "server_error";
    if (res.status === 401 && path !== "/login") onSignedOut();
    throw new ApiError(res.status, code);
  }
  return data as T;
}

export const get = <T>(path: string) => call<T>("GET", path);
export const post = <T>(path: string, body: unknown = {}) => call<T>("POST", path, body);

export async function me(): Promise<AdminView | null> {
  try {
    const out = await get<{ admin: AdminView; csrf: string }>("/me");
    csrf = out.csrf;
    return out.admin;
  } catch {
    return null;
  }
}

export async function login(loginId: string, password: string): Promise<AdminView> {
  const out = await post<{ admin: AdminView; csrf: string }>("/login", { loginId, password });
  csrf = out.csrf;
  return out.admin;
}

export async function logout(): Promise<void> {
  await post("/logout").catch(() => {});
  csrf = "";
}

export const q = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const t = s.toString();
  return t ? `?${t}` : "";
};
