import type { ControlMode } from "@guago/shared";
import { type BookSlot, hud } from "./store.ts";

/**
 * The fight as the HUD reads it: the shape of the combat lane's read-only fight state. That lane
 * implements `FightSource` and calls `bindFight` once; the bars, the book fan, the mode chip, the
 * dodge, 멘토 찬스 and the right thumb's aim then follow it with no other wiring.
 */
export interface FightState {
  readonly hp: { readonly now: number; readonly max: number };
  readonly exp: { readonly now: number; readonly max: number };
  readonly level: number;
  /** Six slots; `null` is a slot the player's 전직 tier has not opened. */
  readonly books: readonly (BookSlot | null)[];
  readonly mode: ControlMode;
  /** 0 when the dodge is ready, up to 1 right after rolling. */
  readonly dodge: number;
  /** 멘토 찬스 once a freed mentor can be called: 0 ready, up to 1 after a call. */
  readonly mentor?: number;
}

export interface FightSource {
  /** The fight now, or undefined outside one. */
  readonly state: FightState | undefined;
  /** Calls `fn` on every change; returns the unsubscribe. */
  on(fn: (state: FightState | undefined) => void): () => void;
  cast(slot: number): void;
  dodge(): void;
  cycleMode(): void;
  mentor(): void;
  /** The right thumb's aim, 0 to 1 in length; `undefined` hands aim back to auto-aim. */
  aim(dir: { x: number; y: number } | undefined): void;
}

let bound: FightSource | undefined;
const watchers = new Set<(live: boolean) => void>();

/** The source the HUD's buttons talk to, while one is bound. */
export function fight(): FightSource | undefined {
  return bound;
}

/** Calls `fn` now and whenever a fight starts or ends. */
export function watchFight(fn: (live: boolean) => void): () => void {
  watchers.add(fn);
  fn(bound?.state !== undefined);
  return () => watchers.delete(fn);
}

/** Feeds the HUD from a fight source; returns the unbind, which takes the combat HUD away. */
export function bindFight(source: FightSource): () => void {
  bound = source;
  let live = false;
  const push = (s: FightState | undefined) => {
    if (live !== (s !== undefined)) {
      live = s !== undefined;
      for (const w of watchers) w(live);
    }
    if (!s) {
      hud.set({
        hp: undefined,
        exp: undefined,
        books: undefined,
        mode: undefined,
        dodge: undefined,
        mentor: undefined,
      });
      return;
    }
    const player = hud.get().player;
    hud.set({
      hp: s.hp,
      exp: s.exp,
      books: s.books,
      mode: s.mode,
      dodge: { cooldown: s.dodge },
      mentor: s.mentor === undefined ? undefined : { cooldown: s.mentor },
      ...(player && player.level !== s.level ? { player: { ...player, level: s.level } } : {}),
    });
  };
  push(source.state);
  const off = source.on(push);
  return () => {
    off();
    push(undefined);
    if (bound === source) bound = undefined;
  };
}
