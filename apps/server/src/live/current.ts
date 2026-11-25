/**
 * The live Page, for code that cannot be handed the Page clock: the executor's default, and the
 * 기수 a new character joins. The server points it at its `PageClock` at start (PLAN §10).
 */
import { LIFECYCLES } from "@guago/content";
import type { Live } from "./index.ts";

let source: () => number = () => LIFECYCLES[0]?.page ?? 1;

export const livePage = (): number => source();

export function provideLivePage(page: () => number): void {
  source = page;
}

let service: Live | undefined;

/** Called once at server start. */
export function provideLive(l: Live | undefined): void {
  service = l;
}

/**
 * The process's living world, for combat, navigation and the raid system:
 * `live()?.events.kill(characterId, monsterId, 1)`, `live()?.isOpen(mapId)`.
 */
export function live(): Live | undefined {
  return service;
}
