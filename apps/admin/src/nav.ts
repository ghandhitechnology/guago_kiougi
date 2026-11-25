import type { AdminView } from "./api.ts";

export interface Ctx {
  admin: AdminView;
  params: URLSearchParams;
  /** Re-renders the current screen. */
  reload(): void;
}

export function go(path: string, params?: Record<string, string>): void {
  const q = params ? new URLSearchParams(params).toString() : "";
  location.hash = `#/${path}${q ? `?${q}` : ""}`;
}

/** A hash link to a screen with these query values; empty ones are left out. */
export function link(path: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return `#/${path}${s ? `?${s}` : ""}`;
}
