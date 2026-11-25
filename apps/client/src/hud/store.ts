import type { ControlMode, Major } from "@guago/shared";

/**
 * What the HUD shows, fed by whichever lane owns each value. An absent key means "no live
 * source": the element for it is not on screen at all, never a zero or a guess.
 *
 * ```ts
 * import { hud } from "./hud/store.ts";
 * hud.set({ hp: { now: 812, max: 1204 } });   // the bar slides in with its first value
 * hud.set({ hp: undefined });                 // and out again
 * ```
 */
export interface HudData {
  /** Name and level: from the character at entry, the level then from presence. */
  readonly player: { readonly name: string; readonly level: number; readonly major: Major };
  /** The map, and the named room inside it when the player stands in one. */
  readonly place: { readonly map: string; readonly name: string; readonly room?: string };
  /** The control mode the server runs the character in. */
  readonly mode: ControlMode;
  readonly hp: { readonly now: number; readonly max: number };
  /** Progress through the current level. */
  readonly exp: { readonly now: number; readonly max: number };
  /** Equipped books by slot (up to six); `null` is a slot not yet unlocked. */
  readonly books: readonly (BookSlot | null)[];
  /** Whether the dodge is live, and its cooldown. */
  readonly dodge: { readonly cooldown: number };
  /** 벌점 on the ledger. */
  readonly demerits: number;
  /** The offline 자습 pool, filled `now` of `max`. */
  readonly pool: { readonly now: number; readonly max: number };
  /** Something the player can interact with is in reach: its kind picks the icon. */
  readonly interact: { readonly kind: string };
}

export interface BookSlot {
  /** A `book` frame in the UI atlas. */
  readonly book: string;
  /** 0 when ready, up to 1 right after casting. */
  readonly cooldown: number;
}

type Key = keyof HudData;
type Listener = (data: Partial<HudData>, changed: ReadonlySet<Key>) => void;

class HudStore {
  private data: Partial<HudData> = {};
  private readonly listeners = new Set<Listener>();

  get(): Partial<HudData> {
    return this.data;
  }

  /** Sets values; `undefined` takes a value away and its element with it. */
  set(patch: { readonly [K in Key]?: HudData[K] | undefined }): void {
    const changed = new Set<Key>();
    const next: Record<string, unknown> = { ...this.data };
    for (const [k, v] of Object.entries(patch) as [Key, unknown][]) {
      if (next[k] === v) continue;
      if (v === undefined) delete next[k];
      else next[k] = v;
      changed.add(k);
    }
    if (changed.size === 0) return;
    this.data = next as Partial<HudData>;
    for (const l of this.listeners) l(this.data, changed);
  }

  /** Calls `fn` now and on every change; returns the unsubscribe. */
  watch(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.data, new Set(Object.keys(this.data) as Key[]));
    return () => this.listeners.delete(fn);
  }

  /** Forgets everything, as on leaving the world. */
  reset(): void {
    const changed = new Set(Object.keys(this.data) as Key[]);
    this.data = {};
    for (const l of this.listeners) l(this.data, changed);
  }
}

export const hud = new HudStore();
