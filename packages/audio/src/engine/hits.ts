/**
 * The hit mixer decides which of the many hit events in a horde are heard. It is pure: it gets
 * events with a time and returns what to play, so the rules can be tested without a browser.
 *
 * | Rule | What it does |
 * |---|---|
 * | Priority | own kill and own crit 2, own hit 1, anyone else's 0; interface sounds sit at 3 above all |
 * | Merging | repeats of the same sound inside a short window are absorbed, then voiced once, louder and heavier, like merged damage numbers |
 * | Rate limits | own impacts, other players' impacts, materials and deaths each have a budget per second |
 * | Distance | other players' hits fade with distance, pan with position and are dropped past hearing range |
 * | Layers | an impact is one sound (body, material and sweetener are inside it); own hits add the target's material, rate-limited per material |
 */

export type HitClass = "math" | "physics" | "chemistry" | "biology" | "earth";

export interface HitEvent {
  /** The attacker's class: picks the impact family. */
  readonly cls: HitClass;
  /** The local player's hit, or their minion's. */
  readonly own: boolean;
  readonly heavy?: boolean;
  readonly crit?: boolean;
  readonly kill?: boolean;
  /** The book's impact cue, `book.cues.impact`. Used for ordinary hits. */
  readonly impact?: string;
  /** The target's hit cue, `monster.cues.hit`: the material the hit lands on. */
  readonly material?: string;
  /** The target's death cue, `monster.cues.die`. */
  readonly death?: string;
  /** Target position relative to the listener, px. */
  readonly dx?: number;
  readonly dy?: number;
}

export interface Play {
  readonly id: string;
  /** Linear gain. */
  readonly gain: number;
  readonly pan: number;
  readonly priority: number;
}

export interface HitRules {
  /** Seconds a repeat of the same sound is absorbed for: own, others. */
  readonly mergeOwn: number;
  readonly mergeOther: number;
  /** Absorbed repeats that turn a light hit into a heavy one when voiced. */
  readonly mergeHeavy: number;
  /** Most the merged gain grows, linear. */
  readonly mergeMaxGain: number;
  /** Other players' hits farther than this are not heard, px. */
  readonly hearing: number;
  /** Distance at which another player's hit is at half gain... squared falloff, px. */
  readonly falloff: number;
  /** Horizontal offset for a full pan, px. */
  readonly panWidth: number;
  /** Sounds per second. */
  readonly ownRate: number;
  readonly otherRate: number;
  readonly materialRate: number;
  readonly ownDeathRate: number;
  readonly otherDeathRate: number;
  /** Seconds between two plays of one material. */
  readonly materialGap: number;
}

export const HIT_RULES: HitRules = {
  mergeOwn: 0.045,
  mergeOther: 0.09,
  mergeHeavy: 3,
  mergeMaxGain: 2,
  hearing: 360,
  falloff: 160,
  panWidth: 240,
  ownRate: 16,
  otherRate: 6,
  materialRate: 5,
  ownDeathRate: 8,
  otherDeathRate: 3,
  materialGap: 0.09,
};

/** The impact family of a class at a weight: `hit.math.light`, `hit.earth.crit`. */
export function classImpact(cls: HitClass, tier: "light" | "heavy" | "crit"): string {
  return `hit.${cls}.${tier}`;
}

/** A token bucket: `rate` per second, bursts of a quarter second. */
class Budget {
  private tokens: number;
  private last = 0;
  private readonly rate: number;
  private readonly cap: number;
  constructor(rate: number) {
    this.rate = rate;
    this.cap = Math.max(2, rate / 4);
    this.tokens = this.cap;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.cap, this.tokens + (now - this.last) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

interface Family {
  /** The sound voiced when this family plays. */
  readonly id: string;
  readonly cls: HitClass;
  readonly own: boolean;
  readonly light: boolean;
  windowEnd: number;
  absorbed: number;
  gain: number;
  pan: number;
}

export interface HitStats {
  events: number;
  played: number;
  merged: number;
  limited: number;
  culled: number;
}

export class HitMixer {
  private readonly known: (id: string) => boolean;
  private readonly rules: HitRules;
  private readonly families = new Map<string, Family>();
  private readonly lastMaterial = new Map<string, number>();
  private readonly own: Budget;
  private readonly other: Budget;
  private readonly material: Budget;
  private readonly ownDeath: Budget;
  private readonly otherDeath: Budget;
  readonly stats: HitStats = { events: 0, played: 0, merged: 0, limited: 0, culled: 0 };

  constructor(known: (id: string) => boolean, rules: HitRules = HIT_RULES) {
    this.known = known;
    this.rules = rules;
    this.own = new Budget(rules.ownRate);
    this.other = new Budget(rules.otherRate);
    this.material = new Budget(rules.materialRate);
    this.ownDeath = new Budget(rules.ownDeathRate);
    this.otherDeath = new Budget(rules.otherDeathRate);
  }

  /** What to play for one hit event at time `now` (seconds). */
  hit(e: HitEvent, now: number): Play[] {
    this.stats.events++;
    const r = this.rules;
    const dx = e.dx ?? 0;
    const distance = Math.hypot(dx, e.dy ?? 0);
    if (!e.own && distance > r.hearing) {
      this.stats.culled++;
      return [];
    }
    const gain = e.own ? 1 : 1 / (1 + (distance / r.falloff) ** 2);
    const pan = Math.max(-1, Math.min(1, dx / r.panWidth)) * (e.own ? 0.5 : 0.9);

    if (e.kill) {
      const budget = e.own ? this.ownDeath : this.otherDeath;
      if (!budget.take(now)) {
        this.stats.limited++;
        return [];
      }
      const id = e.death && this.known(e.death) ? e.death : classImpact(e.cls, "heavy");
      return this.played([{ id, gain, pan, priority: e.own ? 2 : 0 }]);
    }

    const tier = e.crit ? "crit" : e.heavy ? "heavy" : "light";
    const id =
      tier === "light" && e.impact && this.known(e.impact) ? e.impact : classImpact(e.cls, tier);
    const key = `${e.own ? "own" : "far"}|${id}`;
    const out: Play[] = [];
    const family = this.families.get(key);
    if (family && now < family.windowEnd) {
      family.absorbed++;
      family.gain = Math.max(family.gain, gain);
      family.pan = (family.pan + pan) / 2;
      this.stats.merged++;
    } else {
      const budget = e.own ? this.own : this.other;
      if (budget.take(now)) {
        out.push({ id, gain, pan, priority: e.own ? (e.crit ? 2 : 1) : 0 });
        this.families.set(key, {
          id,
          cls: e.cls,
          own: e.own,
          light: tier === "light",
          windowEnd: now + (e.own ? r.mergeOwn : r.mergeOther),
          absorbed: 0,
          gain,
          pan,
        });
      } else this.stats.limited++;
    }

    if (e.own && e.material && this.known(e.material)) {
      const last = this.lastMaterial.get(e.material) ?? -1;
      if (now - last >= r.materialGap && this.material.take(now)) {
        this.lastMaterial.set(e.material, now);
        out.push({ id: e.material, gain: 0.8, pan, priority: 1 });
      }
    }
    return this.played(out);
  }

  /**
   * Voices the repeats absorbed by windows that have closed by `now`: one sound per family,
   * louder for more repeats, and heavy once enough light hits piled up.
   */
  flush(now: number): Play[] {
    const out: Play[] = [];
    const r = this.rules;
    for (const [key, f] of this.families) {
      if (now < f.windowEnd) continue;
      if (f.absorbed === 0) {
        this.families.delete(key);
        continue;
      }
      const budget = f.own ? this.own : this.other;
      if (budget.take(now)) {
        const boost = Math.min(r.mergeMaxGain, 1 + 0.3 * Math.log2(1 + f.absorbed));
        const id = f.light && f.absorbed >= r.mergeHeavy ? classImpact(f.cls, "heavy") : f.id;
        out.push({ id, gain: f.gain * boost, pan: f.pan, priority: f.own ? 1 : 0 });
      } else this.stats.limited++;
      f.absorbed = 0;
      f.windowEnd = now + (f.own ? r.mergeOwn : r.mergeOther);
    }
    return this.played(out);
  }

  /** The time the next absorbed repeat is due to be voiced, or Infinity. */
  nextFlush(): number {
    let t = Number.POSITIVE_INFINITY;
    for (const f of this.families.values()) if (f.absorbed > 0 && f.windowEnd < t) t = f.windowEnd;
    return t;
  }

  private played(p: Play[]): Play[] {
    this.stats.played += p.length;
    return p;
  }
}
