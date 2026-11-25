import type { DuelRecord } from "@guago/shared";
import type { WorldLink } from "../../world-link.ts";

/** A record read this long ago is read again the next time a card asks for it. */
const STALE_MS = 60_000;

/**
 * Duels played and won, by character id, as the player card shows them: read with `duel.record`
 * the first time a card asks, and replaced by the server's `record` push after the player's own
 * match. A card subscribes with `on` and redraws when the one it shows arrives.
 */
export class DuelRecords {
  private readonly link: WorldLink;
  private readonly known = new Map<string, { record: DuelRecord; at: number }>();
  private readonly asking = new Set<string>();
  private readonly listeners = new Set<(id: string) => void>();

  constructor(link: WorldLink) {
    this.link = link;
  }

  /** The record as last read, asking the server for it when it is missing or old. */
  get(id: string): DuelRecord | undefined {
    const k = this.known.get(id);
    if (!k || Date.now() - k.at > STALE_MS) void this.read(id);
    return k?.record;
  }

  set(id: string, record: DuelRecord): void {
    this.known.set(id, { record, at: Date.now() });
    for (const l of this.listeners) l(id);
  }

  /** A match these fighters played was decided: their records are read again when next shown. */
  forget(ids: readonly string[]): void {
    for (const id of ids) {
      const k = this.known.get(id);
      if (k) k.at = 0;
    }
  }

  on(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async read(id: string): Promise<void> {
    if (this.asking.has(id)) return;
    this.asking.add(id);
    const r = await this.link.request("duel.record", { id });
    this.asking.delete(id);
    if (r.ok) this.set(id, r.data);
  }
}
