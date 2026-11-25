/** A tiny browser stand-in for the integration tests: a cookie jar and an IP per request. */
import { setTimeout as sleep } from "node:timers/promises";

export interface Reply {
  status: number;
  body: Record<string, unknown>;
  /** Cookies set by this response, name to value. */
  set: Record<string, string>;
}

export type Jar = Record<string, string>;

export const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

export async function call(
  base: string,
  path: string,
  options: { body?: unknown; jar?: Jar; ip?: string } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { "x-forwarded-for": options.ip ?? "10.0.0.1" };
  if (options.jar) headers.cookie = cookieHeader(options.jar);
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(base + path, {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const set: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (pair && eq > 0) set[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, set };
}

/** Keeps a jar up to date the way a browser would. */
export function remember(jar: Jar, reply: Reply): Reply {
  for (const [k, v] of Object.entries(reply.set)) {
    if (v === "") delete jar[k];
    else jar[k] = v;
  }
  return reply;
}

export async function waitFor(check: () => Promise<boolean> | boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await sleep(20);
  }
}

export async function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not happen within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
