import type { WorldEntry } from "../entry.ts";
import { hud } from "../hud/store.ts";
import { inventory } from "../state/inventory.ts";
import { live } from "../state/live.ts";
import { connectWorld, type WorldLink } from "../world-link.ts";

/**
 * The signed-in session in the world: who is playing and the WorldRoom link that carries
 * presence and chat. The world scene starts it; the UI layer builds the HUD and chat on it.
 */
class Session {
  entry: WorldEntry | undefined;
  link: WorldLink | undefined;
  private readonly listeners = new Set<(s: Session) => void>();
  private stopLink: (() => void) | undefined;

  /** Called once per world entry; a second call with the same character keeps the link. */
  start(entry: WorldEntry): void {
    if (this.entry?.character.id === entry.character.id && this.link) return;
    this.stop();
    this.entry = entry;
    const { name, level, major } = entry.character;
    hud.set({ player: { name, level, major } });
    const link = connectWorld();
    this.link = link;
    inventory.attach(link);
    live.attach(link);
    // 벌점 and the 자습 pool on the HUD come from the rules and the progression the server keeps.
    const unrules = live.watch((l) => {
      if (l.rules) hud.set({ demerits: l.rules.demerits });
    });
    const unpool = inventory.watch((inv) => {
      const pool = inv.snap?.progression.pool;
      hud.set({ pool: pool ? { now: pool.fill.seconds, max: pool.cap } : undefined });
    });
    // The level follows presence, which the server updates on a level-up.
    const stopPresence = link.on((e) => {
      if (e.type !== "presence" || !link.me) return;
      const me = link.presence.get(link.me);
      const shown = hud.get().player;
      if (me && shown && me.level !== shown.level)
        hud.set({ player: { ...shown, level: me.level } });
    });
    this.stopLink = () => {
      stopPresence();
      unrules();
      unpool();
      inventory.detach();
      live.detach();
    };
    for (const l of this.listeners) l(this);
  }

  stop(): void {
    if (!this.entry) return;
    this.stopLink?.();
    void this.link?.close();
    this.link = undefined;
    this.entry = undefined;
    hud.reset();
    for (const l of this.listeners) l(this);
  }

  /** Calls `fn` now and whenever the session starts or stops. */
  watch(fn: (s: Session) => void): () => void {
    this.listeners.add(fn);
    fn(this);
    return () => this.listeners.delete(fn);
  }
}

export const session = new Session();
