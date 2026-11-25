import { readFileSync } from "node:fs";
import path from "node:path";
import { API, type LookSource, lookOptions, MAJORS } from "@guago/shared";

const ART_JSON = path.resolve(import.meta.dirname, "../../../packages/art/dist/art.json");

/** `name=value` pairs from a response's Set-Cookie headers, merged over what we had. */
function cookies(res: Response, jar: Map<string, string>): void {
  for (const line of res.headers.getSetCookie()) {
    const [pair = ""] = line.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

/**
 * Signs a bot in through the real HTTP API, creating its account and character the first time,
 * and returns the Cookie header its room join carries. `http` is the game server's base URL.
 */
export async function signIn(http: string, index: number): Promise<string> {
  const jar = new Map<string, string>();
  const header = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const post = async (route: string, body: unknown) => {
    const res = await fetch(http + route, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: header() },
      body: JSON.stringify(body),
    });
    cookies(res, jar);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const loginId = `bot${String(index).padStart(4, "0")}`;
  const password = `bot-${loginId}-walks`;
  let res = await post(API.login, { loginId, password });
  if (res.status !== 200) res = await post(API.signup, { loginId, password, ageConfirmed: true });
  if (res.status !== 200) throw new Error(`${loginId}: ${JSON.stringify(res.body)}`);
  if (!res.body.character) {
    const options = lookOptions(JSON.parse(readFileSync(ART_JSON, "utf8")) as LookSource);
    const pick = (xs: readonly string[]) => xs[index % xs.length] as string;
    const look = {
      body: pick(options.body),
      hair: pick(options.hair),
      hairColor: pick(options.hairColor),
      face: pick(options.face),
      uniform: pick(options.uniform),
      accessories: [],
    };
    const made = await post(API.character, {
      name: `봇${String(index).padStart(4, "0")}`,
      major: MAJORS[index % MAJORS.length],
      look,
    });
    if (made.status !== 200) throw new Error(`${loginId} character: ${JSON.stringify(made.body)}`);
  }
  return header();
}
