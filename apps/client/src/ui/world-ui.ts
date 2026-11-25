import { worldView } from "../world/view.ts";
import type { DialogueLine } from "./dialogue.ts";

/**
 * The calls other lanes make on the world's UI. Each is safe to make before the UI is up: the
 * call does nothing, or the line resolves at once, rather than throwing.
 *
 * ```ts
 * import { worldUi } from "./ui/world-ui.ts";
 * worldUi.placeBanner("물음표 서고");                       // entering a map or a named room
 * await worldUi.say([{ speaker: "hyunwoo", text: line }]); // a line from the narrative
 * worldUi.prompt({ x, y, kind: "talk" });                  // something in reach; undefined clears
 * worldUi.npc("sagam", "권 사감", x, y);                   // a cast member standing at their spot
 * worldUi.openBoard();                                     // the 대자보 in the 쉼표 라운지, used
 * ```
 */
export interface WorldUiHost {
  say(lines: readonly DialogueLine[]): Promise<number | undefined>;
  placeBanner(name: string): void;
  openBoard?(): void;
}

let host: WorldUiHost | undefined;

export function setWorldUiHost(h: WorldUiHost | undefined): void {
  host = h;
}

export const worldUi = {
  /** Plays dialogue lines; resolves with the choice picked on the last line, if it had choices. */
  say(lines: readonly DialogueLine[]): Promise<number | undefined> {
    return host ? host.say(lines) : Promise.resolve(undefined);
  },

  /** The 대자보 screen, as when the player uses the board on the lounge wall. */
  openBoard(): void {
    host?.openBoard?.();
  },

  /** The place-name banner, on entering a map or a named room in it. */
  placeBanner(name: string): void {
    host?.placeBanner(name);
  },

  /** The prompt over whatever is in reach, by kind; `undefined` takes it away. */
  prompt(at: { x: number; y: number; kind: "talk" | "use" | "read" } | undefined): void {
    worldView.overlays?.showPrompt(at);
  },

  /** A cast member: nameplate under their feet and a pin on the minimap. Call again as they move. */
  npc(id: string, name: string, x: number, y: number): void {
    const o = worldView.overlays;
    if (!worldView.others.has(id)) o?.plate(id, name, "npc");
    worldView.others.set(id, { kind: "npc", x, y, name });
    o?.move(id, x, y);
  },

  /** A cast member leaves. */
  npcGone(id: string): void {
    worldView.overlays?.remove(id);
    worldView.others.delete(id);
  },

  /** Words over a cast member's head, as a bark. */
  bark(id: string, text: string): void {
    worldView.overlays?.say(id, text);
  },
};
