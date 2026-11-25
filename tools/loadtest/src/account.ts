import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { API, type LookSource, lookOptions, MAJORS } from "@guago/shared";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ART_JSON = path.join(ROOT, "packages/art/dist/art.json");
/** Bot sessions kept between runs, so a run does not log 80 accounts in from one address. */
const SESSIONS = path.join(ROOT, ".local/loadtest-sessions.json");

type Jar = Map<string, string>;

function loadSessions(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(SESSIONS, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveSession(loginId: string, cookie: string): void {
  const all = loadSessions();
  all[loginId] = cookie;
  if (!existsSync(path.dirname(SESSIONS))) mkdirSync(path.dirname(SESSIONS), { recursive: true });
  writeFileSync(SESSIONS, JSON.stringify(all, null, 1));
}

/** `name=value` pairs from a response's Set-Cookie headers, merged over what we had. */
function absorb(res: Response, jar: Jar): void {
  for (const line of res.headers.getSetCookie()) {
    const [pair = ""] = line.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

const header = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

function parse(cookie: string): Jar {
  return new Map(
    cookie
      .split(";")
      .map((p) => p.trim().split("=") as [string, string])
      .filter(([k, v]) => k && v),
  );
}

/**
 * Signs a bot in through the real HTTP API and returns the Cookie header its room join carries:
 * a saved session while it is still good, else a login, else a new account and character.
 * `http` is the game server's base URL.
 */
export async function signIn(
  http: string,
  prefix: string,
  index: number,
  major?: string,
): Promise<string> {
  const loginId = `${prefix}${String(index).padStart(4, "0")}`;
  const password = `bot-${loginId}-walks`;
  const jar: Jar = parse(loadSessions()[loginId] ?? "");
  const call = async (method: "GET" | "POST", route: string, body?: unknown) => {
    const res = await fetch(http + route, {
      method,
      headers: { "content-type": "application/json", cookie: header(jar) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    absorb(res, jar);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  // A known bot logs in with the device cookie it was given, which keeps it off the per-address
  // failure count; an unknown one signs up first, so no login ever fails for want of an account.
  let me = jar.size > 0 ? await call("GET", API.me) : { status: 401, body: {} };
  if (me.status !== 200 && jar.size === 0) {
    me = await call("POST", API.signup, { loginId, password, ageConfirmed: true });
  }
  if (me.status !== 200) me = await call("POST", API.login, { loginId, password });
  if (me.status !== 200) throw new Error(`${loginId}: ${JSON.stringify(me.body)}`);
  if (me.body.recoveryCode) me = await call("GET", API.me);
  if (!me.body.character) {
    const options = lookOptions(JSON.parse(readFileSync(ART_JSON, "utf8")) as LookSource);
    // Some parts do not go together; the next combination is tried until the server takes one.
    let made: Awaited<ReturnType<typeof call>> = { status: 0, body: {} };
    for (let k = 0; k < 24; k++) {
      const pick = (xs: readonly string[], step: number) =>
        xs[(index + k * step) % xs.length] as string;
      made = await call("POST", API.character, {
        name: `${prefix === "bot" ? "봇" : prefix}${String(index).padStart(4, "0")}`.slice(0, 8),
        major: major ?? MAJORS[index % MAJORS.length],
        look: {
          body: pick(options.body, 0),
          hair: pick(options.hair, 1),
          hairColor: pick(options.hairColor, 0),
          face: pick(options.face, 0),
          uniform: pick(options.uniform, 3),
          accessories: [],
        },
      });
      if (made.status === 200 || (made.body as { error?: string }).error !== "look_invalid") break;
    }
    if (made.status !== 200) throw new Error(`${loginId} character: ${JSON.stringify(made.body)}`);
  }
  saveSession(loginId, header(jar));
  return header(jar);
}
