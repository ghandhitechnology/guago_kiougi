import type * as Phaser from "phaser";
import { hud } from "./store.ts";

/**
 * Development only: plays the values combat and progression will send, so the HUD's bars, fan,
 * 벌점 and pool can be seen working before those lanes land. Loaded from `?hudfeed` in a dev
 * build; production bundles never contain it.
 */
export function startDevFeed(scene: Phaser.Scene): void {
  const max = 1927;
  let hp = 1204;
  let exp = 0.61;
  const books = ["probability", "sequence", "graph", "proof"];
  const cooldowns = [0, 0.35, 0, 0.7];
  hud.set({
    mode: "semi",
    hp: { now: hp, max },
    exp: { now: exp * 1000, max: 1000 },
    demerits: 3,
    pool: { now: 200, max: 480 },
    dodge: { cooldown: 0 },
    interact: { kind: "talk" },
  });
  let t = 0;
  scene.time.addEvent({
    delay: 100,
    loop: true,
    callback: () => {
      t += 100;
      // A hit every two seconds, then a slow refill.
      if (t % 2000 === 0) hp = Math.max(200, hp - 180);
      else hp = Math.min(max, hp + 6);
      exp = (exp + 0.002) % 1;
      for (let i = 0; i < cooldowns.length; i++) {
        const c = (cooldowns[i] ?? 0) - 0.04;
        cooldowns[i] = c <= -0.6 ? 1 : c;
      }
      hud.set({
        hp: { now: hp, max },
        exp: { now: exp * 1000, max: 1000 },
        books: [
          ...books.map((book, i) => ({ book, cooldown: Math.max(0, cooldowns[i] ?? 0) })),
          null,
          null,
        ],
      });
    },
  });
}
