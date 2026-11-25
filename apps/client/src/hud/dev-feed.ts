import { MODES } from "@guago/content";
import type { ControlMode } from "@guago/shared";
import type * as Phaser from "phaser";
import { bindFight, type FightSource, type FightState } from "./fight.ts";
import { hud } from "./store.ts";

/**
 * Development only: a stand-in for the combat lane's fight source, plus the 벌점, pool and
 * interact values progression and navigation will send, so the HUD can be seen working before
 * those lanes land. Loaded from `?hudfeed` in a dev build; production bundles never contain it.
 * The buttons answer: a cast or dodge starts its cooldown, the chip cycles the mode.
 */
export function startDevFeed(scene: Phaser.Scene): () => void {
  const max = 1927;
  let hp = 1204;
  let exp = 0.61;
  const books = ["probability", "sequence", "graph", "proof"];
  const cooldowns = [0, 0.35, 0, 0.7];
  let mode: ControlMode = "semi";
  let dodge = 0;
  let mentor = 0.4;
  const listeners = new Set<(s: FightState | undefined) => void>();
  const state = (): FightState => ({
    hp: { now: hp, max },
    exp: { now: Math.round(exp * 1000), max: 1000 },
    level: 7,
    books: [
      ...books.map((book, i) => ({ book, cooldown: Math.max(0, cooldowns[i] ?? 0) })),
      null,
      null,
    ],
    mode,
    dodge,
    mentor,
  });
  const source: FightSource = {
    get state() {
      return state();
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    cast(slot) {
      if (slot < books.length && (cooldowns[slot] ?? 0) <= 0) cooldowns[slot] = 1;
    },
    dodge() {
      if (dodge <= 0) dodge = 1;
    },
    cycleMode() {
      const i = MODES.findIndex((m) => m.id === mode);
      mode = (MODES[(i + 1) % MODES.length]?.id ?? "semi") as ControlMode;
    },
    mentor() {
      if (mentor <= 0) mentor = 1;
    },
    aim() {},
  };
  hud.set({ demerits: 3, pool: { now: 200, max: 480 }, interact: { kind: "talk" } });
  const unbind = bindFight(source);
  let t = 0;
  const timer = scene.time.addEvent({
    delay: 100,
    loop: true,
    callback: () => {
      t += 100;
      // A hit every two seconds, then a slow refill.
      if (t % 2000 === 0) hp = Math.max(200, hp - 180);
      else hp = Math.min(max, hp + 6);
      exp = (exp + 0.002) % 1;
      for (let i = 0; i < cooldowns.length; i++) {
        const c = (cooldowns[i] ?? 0) - 0.025;
        // Out of the manual modes the books fire themselves, a beat after coming back.
        const auto = mode !== "skill" && mode !== "manual";
        cooldowns[i] = c > -0.5 ? c : auto ? 1 : -0.5;
      }
      dodge = Math.max(0, dodge - 0.1 / 3);
      mentor = Math.max(0, mentor - 0.01);
      const s = state();
      for (const l of listeners) l(s);
    },
  });
  return () => {
    timer.remove();
    unbind();
    hud.set({ demerits: undefined, pool: undefined, interact: undefined });
  };
}
