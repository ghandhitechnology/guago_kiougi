/**
 * The live Page, for code that cannot be handed the Page clock: the executor's default, and the
 * 기수 a new character joins. The server points it at its `PageClock` at start (PLAN §10).
 */
import { LIFECYCLES } from "@guago/content";

let source: () => number = () => LIFECYCLES[0]?.page ?? 1;

export const livePage = (): number => source();

export function provideLivePage(page: () => number): void {
  source = page;
}
