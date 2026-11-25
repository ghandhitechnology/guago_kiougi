import {
  API,
  type ChangeNotice,
  type InventorySnapshot,
  type ItemKind,
  type ItemView,
  isFinalResult,
  type OpName,
  type OpRequests,
  type OpResult,
} from "@guago/shared";
import type { OpCall, WorldLink } from "../world-link.ts";

/**
 * Everything the player owns, as the server last said (PLAN §21): the snapshot read at entry,
 * then every operation's change applied in `rev` order. A change at `rev + 1` applies; an older
 * one is already in; one further ahead means something was missed, and the snapshot is read
 * again. Changes carry absolute values, so applying one twice is harmless, and nothing on screen
 * ever counts ahead of the server.
 */

type Listener = (inv: Inventory, change: ChangeNotice | null) => void;

/** How long to wait before reading the snapshot again after a refused read. */
const RELOAD_MS = 2500;

export class Inventory {
  snap: InventorySnapshot | undefined;
  private link: WorldLink | undefined;
  private readonly listeners = new Set<Listener>();
  private unlisten: (() => void) | undefined;
  private loading: Promise<void> | undefined;
  private reloadTimer: ReturnType<typeof setTimeout> | undefined;

  /** Starts following a session's link: reads the snapshot and applies what follows. */
  attach(link: WorldLink): void {
    this.detach();
    this.link = link;
    this.unlisten = link.on((e) => {
      if (e.type === "result" && e.result.ok) this.apply(e.result.change);
      else if (e.type === "change") this.apply(e.change);
      // Back from a drop: whatever happened meanwhile is in a fresh snapshot.
      else if (e.type === "status" && e.status === "online") void this.load();
    });
    void this.load();
  }

  detach(): void {
    this.unlisten?.();
    this.unlisten = undefined;
    this.link = undefined;
    this.snap = undefined;
    clearTimeout(this.reloadTimer);
  }

  /** Calls `fn` now (when loaded) and on every change; returns the unsubscribe. */
  watch(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.snap) fn(this, null);
    return () => this.listeners.delete(fn);
  }

  /** Reads the whole snapshot again. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const res = await fetch(API.inventory, { credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const snap = (await res.json()) as InventorySnapshot;
        if (!this.snap || snap.rev >= this.snap.rev) {
          this.snap = snap;
          this.emit(null);
        }
      } catch {
        clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(() => void this.load(), RELOAD_MS);
      } finally {
        this.loading = undefined;
      }
    })();
    return this.loading;
  }

  /**
   * One operation. Its change is applied when the result arrives (here or, after a reconnect,
   * through the link's replay). After `offline` or `timeout` it is sent once more with the same
   * id, which the server answers with the id's one result and never applies twice.
   */
  async op<K extends OpName>(name: K, req: OpRequests[K]): Promise<OpCall> {
    const link = this.link;
    if (!link) return { id: "", op: name, ok: false, error: "offline" };
    const id = crypto.randomUUID();
    let r = await link.op(name, req, id);
    if (!r.ok && (r.error === "offline" || r.error === "timeout")) {
      await new Promise((ok) => setTimeout(ok, 900));
      r = await link.op(name, req, id);
    }
    if (r.ok) this.apply(r.change);
    // A refusal that decided nothing (`insufficient`, `server_error`) may mean the bag moved.
    else if (r.error !== "offline" && r.error !== "timeout" && !isFinalResult(r as OpResult)) {
      void this.load();
    }
    return r;
  }

  /** A change the server reported outside an operation's result, as a finished trade's. */
  applyChange(change: ChangeNotice): void {
    this.apply(change);
  }

  private apply(change: ChangeNotice): void {
    const s = this.snap;
    if (!s) return;
    if (change.rev <= s.rev) return;
    if (change.rev > s.rev + 1) {
      void this.load();
      return;
    }
    const items = new Map(s.items.map((i) => [i.id, i]));
    for (const it of change.items ?? []) items.set(it.id, it);
    for (const [id, exp] of Object.entries(change.exp ?? {})) {
      const it = items.get(id);
      if (it) items.set(id, { ...it, exp });
    }
    for (const id of change.removed ?? []) items.delete(id);
    const materials = { ...s.materials };
    for (const [k, v] of Object.entries(change.materials ?? {})) {
      if (v > 0) materials[k] = v;
      else delete materials[k];
    }
    const quests = new Map(s.quests.map((q) => [q.id, q]));
    for (const q of change.quests ?? []) quests.set(q.id, q);
    this.snap = {
      rev: change.rev,
      wallet: { ...s.wallet, ...(change.wallet ?? {}) },
      materials,
      items: [...items.values()],
      progression: change.progression ?? s.progression,
      codex: change.codex ?? s.codex,
      quests: [...quests.values()],
    };
    this.emit(change);
  }

  private emit(change: ChangeNotice | null): void {
    for (const l of this.listeners) l(this, change);
  }

  // Reading ---------------------------------------------------------------------------------

  get loaded(): boolean {
    return this.snap !== undefined;
  }

  items(kind?: ItemKind): ItemView[] {
    return (this.snap?.items ?? []).filter((i) => kind === undefined || i.kind === kind);
  }

  item(id: string): ItemView | undefined {
    return this.snap?.items.find((i) => i.id === id);
  }

  /** What sits in each slot of a kind, by slot index. */
  worn(kind: ItemKind): Map<number, ItemView> {
    const out = new Map<number, ItemView>();
    for (const i of this.items(kind)) if (i.slot !== null) out.set(i.slot, i);
    return out;
  }

  /** A material or consumable count: `ink`, `binding`, `sheet:<book>`, `snack:<id>`. */
  count(id: string): number {
    return this.snap?.materials[id] ?? 0;
  }

  /** A currency as a number (balances are exact decimal strings on the wire). */
  money(currency: "pinecone" | "merit" | "token"): number {
    return Number(this.snap?.wallet[currency] ?? 0);
  }

  /** The exact balance, for drawing. */
  moneyText(currency: "pinecone" | "merit" | "token"): string {
    return this.snap?.wallet[currency] ?? "0";
  }
}

export const inventory = new Inventory();
