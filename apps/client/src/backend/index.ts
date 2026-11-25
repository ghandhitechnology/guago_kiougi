import { type TextKey, t } from "../i18n/index.ts";
import { httpBackend } from "./http.ts";
import { type Backend, BackendError, type ErrorCode } from "./types.ts";

export * from "./types.ts";

let chosen: Backend | undefined;

/**
 * The account API. Dev builds started with `VITE_BACKEND=memory` get the in-memory stand-in;
 * the check is on `import.meta.env.DEV`, so production builds drop that branch and its module.
 */
export async function backend(): Promise<Backend> {
  if (chosen) return chosen;
  if (import.meta.env.DEV && import.meta.env.VITE_BACKEND === "memory") {
    chosen = (await import("./memory.ts")).memoryBackend;
  } else chosen = httpBackend;
  return chosen;
}

/** The error code of anything a backend call threw. */
export function errorCode(e: unknown): ErrorCode {
  return e instanceof BackendError ? e.code : "unknown";
}

/** What the school office says about an error. */
export function errorText(e: unknown): string {
  return t(`error.${errorCode(e)}` as TextKey);
}
