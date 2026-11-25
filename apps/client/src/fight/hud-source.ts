import { CONTROL_MODES, type ControlMode, MAX_AIM } from "@guago/shared";
import type { FightSource, FightState as HudFightState } from "../hud/fight.ts";
import type { BookSlot } from "../hud/store.ts";
import type { FightActions, FightState } from "./state.ts";

/** Slots the HUD shows; the ones the 전직 tier has not opened are null. */
const SLOTS = 6;
/** The HUD is told at most this often, ms, and only when something it shows changed. */
const EVERY_MS = 66;
/** The thumb's full drag aims this far, px. */
const THUMB_REACH = 140;

/**
 * Feeds the HUD from the fight's state (`FightSource` in `hud/fight.ts`): a fresh, frozen state
 * object whenever what it shows has changed, a few times a second at most, and the HUD's buttons
 * straight to the fight's actions. `bindFight(fight.hud)` is the whole wiring.
 */
export class HudFeed implements FightSource {
  private readonly fight: FightState;
  private readonly actions: FightActions;
  private readonly selfAt: () => { x: number; y: number };
  private readonly listeners = new Set<(s: HudFightState | undefined) => void>();
  private current: HudFightState | undefined;
  private key = "";
  private lastAt = 0;

  constructor(fight: FightState, actions: FightActions, selfAt: () => { x: number; y: number }) {
    this.fight = fight;
    this.actions = actions;
    this.selfAt = selfAt;
  }

  get state(): HudFightState | undefined {
    return this.current;
  }

  on(fn: (state: HudFightState | undefined) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  cast(slot: number): void {
    this.actions.cast(slot);
  }

  dodge(): void {
    this.actions.dodge();
  }

  cycleMode(): void {
    this.actions.cycleMode();
  }

  /** 멘토 찬스 has no mentor on the wire yet; the button stays hidden (`mentor` undefined). */
  mentor(): void {}

  aim(dir: { x: number; y: number } | undefined): void {
    if (!dir) {
      this.actions.clearAim();
      return;
    }
    const at = this.selfAt();
    const len = Math.min(1, Math.hypot(dir.x, dir.y));
    const reach = Math.max(24, len * THUMB_REACH);
    const n = Math.hypot(dir.x, dir.y) || 1;
    const dx = Math.max(-MAX_AIM, Math.min(MAX_AIM, (dir.x / n) * reach));
    const dy = Math.max(-MAX_AIM, Math.min(MAX_AIM, (dir.y / n) * reach));
    this.actions.aimAt(at.x + dx, at.y + dy);
  }

  /** Called every frame; tells the HUD when what it shows has changed. */
  update(now: number): void {
    if (now - this.lastAt < EVERY_MS) return;
    this.lastAt = now;
    const f = this.fight;
    if (!f.ready) {
      if (this.current !== undefined) this.emit(undefined, "");
      return;
    }
    // Cooldowns in 32 steps: the HUD's sweep has 16 frames.
    const q = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 32);
    let key = `${Math.round(f.hp)}|${Math.round(f.maxHp)}|${Math.floor(f.exp)}|${f.level}|${f.mode}|${q(f.dodge.cooldown)}`;
    for (const b of f.books) key += `|${b.icon}:${q(b.cooldown)}`;
    if (key === this.key) return;
    const books: (BookSlot | null)[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const b = f.books[i];
      books.push(b ? { book: b.icon.replace(/^book\//, ""), cooldown: q(b.cooldown) / 32 } : null);
    }
    this.emit(
      Object.freeze({
        hp: { now: Math.max(0, f.hp), max: Math.max(1, f.maxHp) },
        exp: { now: Math.max(0, f.exp), max: Math.max(1, f.expToNext) },
        level: f.level,
        books,
        mode: (CONTROL_MODES[f.mode] ?? "semi") as ControlMode,
        dodge: q(f.dodge.cooldown) / 32,
      }),
      key,
    );
  }

  private emit(s: HudFightState | undefined, key: string): void {
    this.current = s;
    this.key = key;
    for (const fn of this.listeners) fn(s);
  }

  /** The fight ended: the HUD takes its combat widgets away. */
  close(): void {
    this.emit(undefined, "");
  }
}
