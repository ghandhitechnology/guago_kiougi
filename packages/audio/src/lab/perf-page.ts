/**
 * A bare page for `pnpm --filter @guago/audio perf`: the library alone, driven by the script, with
 * a frame-time recorder. No lab UI, so what it measures is the audio's cost.
 */

import { SONGS } from "../content/index.ts";
import { audio, EFFECT_IDS, type EffectId } from "../index.ts";
import { fingerprint } from "../tools/fingerprint.ts";
import { compileSong } from "../tracker/compile.ts";
import { SongPlayer } from "../tracker/player.ts";
import { Horde } from "./horde.ts";

let horde: Horde | null = null;

declare global {
  interface Window {
    perf: typeof api;
  }
}

const api = {
  unlock(): void {
    audio.unlock();
  },
  start(mode: "simple" | "horde" = "simple"): void {
    if (mode === "horde") {
      audio.music("agora", { fade: 0.05 });
      audio.ambient("campus-afternoon", { fade: 0.05 });
      horde = new Horde(audio, { players: 5, ownClass: "math", surge: 50, lull: 12 });
      horde.start();
      return;
    }
    audio.music("hub", { fade: 0.05 });
    audio.ambient("campus-afternoon", { fade: 0.05 });
  },
  stop(): void {
    horde?.stop();
    audio.music(null, { fade: 0.05 });
    audio.ambient(null, { fade: 0.05 });
  },
  horde: () => (horde ? { ...horde.stats } : null),
  stats: () => audio.debug.stats(),
  /** Records frame intervals for `ms`, firing an effect every `every` ms if given. */
  frames(ms: number, every = 0): Promise<{ intervals: number[]; longTasks: number[] }> {
    return new Promise((resolve) => {
      const intervals: number[] = [];
      const longTasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push(e.duration);
      });
      try {
        observer.observe({ type: "longtask", buffered: false });
      } catch {
        // Long task timing is not available everywhere.
      }
      const pool = EFFECT_IDS.filter((id) => id !== "vending.hum" && id !== "sagam.whistle");
      const timer =
        every > 0
          ? setInterval(() => {
              audio.play(pool[Math.floor(Math.random() * pool.length)] as EffectId, {
                pan: Math.random() * 2 - 1,
              });
            }, every)
          : 0;
      const t0 = performance.now();
      let last = t0;
      const tick = (now: number) => {
        intervals.push(now - last);
        last = now;
        if (now - t0 < ms) requestAnimationFrame(tick);
        else {
          clearInterval(timer);
          observer.disconnect();
          resolve({ intervals: intervals.slice(1), longTasks });
        }
      };
      requestAnimationFrame(tick);
    });
  },
  /** Renders a song here, in the browser's JS engine, for comparison with the Node render. */
  render(
    id: keyof typeof SONGS,
    seconds: number,
    rate: number,
  ): { ms: number; hash: number; rms: number } {
    const song = compileSong(id, SONGS[id]);
    const n = Math.round(seconds * rate);
    const out = Array.from({ length: song.stems.length * 2 }, () => new Float32Array(n));
    const player = new SongPlayer(song, rate);
    const t0 = performance.now();
    for (let i = 0; i < n; i += 4096) player.render(out, i, Math.min(4096, n - i));
    const ms = performance.now() - t0;
    return { ms, ...fingerprint(out) };
  },
};

window.perf = api;
document.title = "ready";
