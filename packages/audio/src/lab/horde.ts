/**
 * A horde simulator for the lab and the performance check: hit events at the rates of a busy
 * Page 1 field, 150 monsters and 5 players (the local player and four others around the screen),
 * plus kills, pickups, casts, class signatures, monster attacks and the surge and 쉬는 시간 cycle.
 *
 * Rates come from the content's balance numbers: a player hits about 18 times a second with two
 * books in a dense horde, the field supplies about 73 kills a minute to a solo player, a kill drops
 * one to three 솔방울.
 */

import { BOOK_TABLE } from "../content/effects/books.ts";
import { MONSTER_TABLE } from "../content/effects/monsters.ts";
import type { GameAudio } from "../engine/audio.ts";
import type { HitClass } from "../engine/hits.ts";

const CLASSES: HitClass[] = ["math", "physics", "chemistry", "biology", "earth"];

export interface HordeOptions {
  readonly players: number;
  readonly ownClass: HitClass;
  /** Seconds of surge and of 쉬는 시간; the field's own are 50 and 12. */
  readonly surge: number;
  readonly lull: number;
}

interface Player {
  cls: HitClass;
  own: boolean;
  dx: number;
  dy: number;
}

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T;
/** Poisson arrivals: how many events at `rate` per second fall in `dt` seconds. */
const arrivals = (rate: number, dt: number) => {
  let n = 0;
  let t = -Math.log(1 - Math.random()) / rate;
  while (t < dt) {
    n++;
    t += -Math.log(1 - Math.random()) / rate;
  }
  return n;
};

export class Horde {
  private readonly audio: GameAudio;
  private readonly o: HordeOptions;
  private readonly players: Player[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private started = 0;
  private proof = 0;
  private phase: "surge" | "lull" = "surge";
  readonly stats = { events: 0, callMs: 0, seconds: 0 };

  constructor(audio: GameAudio, o: HordeOptions) {
    this.audio = audio;
    this.o = o;
    this.players = Array.from({ length: o.players }, (_, i) => ({
      cls: i === 0 ? o.ownClass : pick(CLASSES),
      own: i === 0,
      dx: i === 0 ? 0 : (Math.random() * 2 - 1) * 380,
      dy: i === 0 ? 0 : (Math.random() * 2 - 1) * 220,
    }));
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    this.last = performance.now();
    this.started = this.last;
    this.timer = setInterval(() => this.step(), 16);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private step(): void {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    const t0 = performance.now();
    const a = this.audio;
    const cycle = this.o.surge + this.o.lull;
    const inCycle = ((now - this.started) / 1000) % cycle;
    const phase = inCycle < this.o.surge ? "surge" : "lull";
    if (phase !== this.phase) {
      this.phase = phase;
      if (phase === "lull") {
        a.cue("sfx.field.bell");
        a.music("agora", { stems: { drive: 0.25, surge: 0 }, fade: 2 });
      } else {
        a.cue("sfx.field.surge");
        a.music("agora", { stems: { drive: 1, surge: 1 }, fade: 1 });
      }
      this.stats.events++;
    }
    const busy = phase === "surge" ? 1 : 0.25;
    for (const p of this.players) {
      const books = BOOK_TABLE.filter((b) => b.cls === p.cls);
      // Wander a little, as players do.
      if (!p.own) {
        p.dx = Math.max(-420, Math.min(420, p.dx + (Math.random() - 0.5) * 40 * dt));
        p.dy = Math.max(-260, Math.min(260, p.dy + (Math.random() - 0.5) * 40 * dt));
      }
      const spot = () => ({
        dx: p.dx + (Math.random() - 0.5) * 120,
        dy: p.dy + (Math.random() - 0.5) * 80,
      });
      for (let i = arrivals(18 * busy, dt); i > 0; i--) {
        const b = pick(books);
        const m = pick(MONSTER_TABLE);
        const r = Math.random();
        a.hit({
          cls: p.cls,
          own: p.own,
          heavy: r < 0.15,
          crit: r > 0.9,
          impact: `sfx.book.${b.id}.${b.hit}`,
          material: `sfx.monster.${m.id}.hit`,
          ...spot(),
        });
        this.stats.events++;
        if (p.own && p.cls === "math") {
          this.proof = (this.proof % 10) + 1;
          a.proof(this.proof);
        }
      }
      for (let i = arrivals(1.2 * busy, dt); i > 0; i--) {
        const m = pick(MONSTER_TABLE);
        a.hit({ cls: p.cls, own: p.own, kill: true, death: `sfx.monster.${m.id}.die`, ...spot() });
        this.stats.events++;
        if (p.own) {
          a.cue("combat.drop.cone", spot());
          for (let k = 1 + Math.floor(Math.random() * 3); k > 0; k--) a.cue("sfx.pickup.cone");
          if (Math.random() < 0.02) a.cue("sfx.pickup.page");
          this.stats.events += 2;
        }
      }
      for (let i = arrivals(1.3 * busy, dt); i > 0; i--) {
        const b = pick(books);
        if (b.kind === "telegraph") a.forecast({ delay: 1.2, own: p.own, ...spot() });
        else a.cue(`sfx.book.${b.id}.${b.cast}`, { own: p.own, ...spot() });
        this.stats.events++;
      }
      if (p.own) {
        const sig = { physics: 0.5, chemistry: 0.3, biology: 0.4, math: 0, earth: 0 }[p.cls] * busy;
        for (let i = arrivals(sig || 1e-9, dt); i > 0; i--) {
          if (p.cls === "physics") a.collide(1 + Math.floor(Math.random() * 3));
          if (p.cls === "chemistry")
            a.cue(
              pick([
                "sfx.reaction.neutralize",
                "sfx.reaction.combustion",
                "sfx.reaction.corrosion",
                "sfx.reaction.explosion",
              ]),
            );
          if (p.cls === "biology") a.cue("class.biology.divide");
          this.stats.events++;
        }
      }
    }
    for (let i = arrivals(0.6 * busy, dt); i > 0; i--) {
      const m = pick(MONSTER_TABLE.filter((x) => x.attack));
      a.cue(`sfx.monster.${m.id}.attack`, {
        own: false,
        dx: (Math.random() - 0.5) * 600,
        dy: (Math.random() - 0.5) * 300,
      });
      this.stats.events++;
    }
    this.stats.callMs += performance.now() - t0;
    this.stats.seconds += dt;
  }
}
