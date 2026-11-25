/**
 * Effect voices: at most eight one-shots at once (PLAN §6), each a pre-rendered buffer with its
 * own gain and pan. When all eight are busy, a new sound steals the oldest of the lowest priority,
 * and is dropped instead if everything playing matters more than it does. Combat hits may hold at
 * most six of the eight, so interface and world sounds always find room. Looping emitters (the
 * vending machine's hum) live outside the eight, capped at four.
 */

export const MAX_VOICES = 8;
const MAX_LOOPS = 4;
const GROUP_CAP: Readonly<Record<string, number>> = { hit: 6, jingle: 2 };
const STEAL_FADE = 0.012;

export interface PlayOptions {
  /** -1 left .. 1 right. */
  readonly pan?: number;
  /** Semitones up or down, on top of the random variation. */
  readonly pitch?: number;
  /** 0..1, linear. */
  readonly volume?: number;
}

export interface VoiceOptions extends PlayOptions {
  /** Seconds from now to start. */
  readonly at?: number;
  /** Playback rate multiplier, replacing the random variation. */
  readonly rate?: number;
  readonly priority?: number;
  /** Voices of a group share a cap below the eight: `hit`, `jingle`. */
  readonly group?: string;
}

export interface Sound {
  /** Stops the sound with a short fade. */
  stop(fade?: number): void;
  /** Moves or re-levels a sound while it plays, for emitters as the player walks. */
  set(o: { readonly pan?: number; readonly volume?: number }): void;
  readonly playing: boolean;
}

export interface EffectMeta {
  readonly vary: number;
  readonly priority: number;
  readonly max: number;
  readonly loop: boolean;
}

interface Voice {
  readonly id: string;
  readonly priority: number;
  readonly started: number;
  readonly group: string | undefined;
  readonly src: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly pan: StereoPannerNode;
  ended: boolean;
}

export class Voices {
  private readonly ctx: AudioContext;
  private readonly out: AudioNode;
  private readonly live: Voice[] = [];
  private readonly loops: Voice[] = [];
  private readonly last = new Map<string, number>();
  stolen = 0;
  dropped = 0;
  started = 0;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
  }

  get count(): number {
    return this.live.length;
  }

  play(
    id: string,
    variants: readonly AudioBuffer[],
    meta: EffectMeta,
    o: VoiceOptions = {},
  ): Sound | null {
    if (variants.length === 0) return null;
    const priority = o.priority ?? meta.priority;
    const pool = meta.loop ? this.loops : this.live;
    // Per-effect cap: the oldest copy makes way.
    const same = pool.filter((v) => v.id === id);
    if (same.length >= meta.max) this.release(same[0] as Voice, pool);
    if (meta.loop) {
      if (pool.length >= MAX_LOOPS) this.release(pool[0] as Voice, pool);
    } else {
      const cap = o.group ? GROUP_CAP[o.group] : undefined;
      if (cap !== undefined) {
        const members = pool.filter((v) => v.group === o.group);
        if (members.length >= cap && !this.steal(members, priority, pool)) return null;
      }
      if (pool.length >= MAX_VOICES && !this.steal(pool, priority, pool)) return null;
    }

    // Pick a variant, never the same one twice in a row.
    let pick = Math.floor(Math.random() * variants.length);
    if (variants.length > 1 && pick === this.last.get(id)) pick = (pick + 1) % variants.length;
    this.last.set(id, pick);

    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = variants[pick] as AudioBuffer;
    src.loop = meta.loop;
    const variation = 1 + (Math.random() * 2 - 1) * meta.vary;
    src.playbackRate.value = 2 ** ((o.pitch ?? 0) / 12) * (o.rate ?? variation);
    const gain = ctx.createGain();
    gain.gain.value = o.volume ?? 1;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
    src.connect(gain).connect(pan).connect(this.out);
    const voice: Voice = {
      id,
      priority,
      started: ctx.currentTime,
      group: o.group,
      src,
      gain,
      pan,
      ended: false,
    };
    src.onended = () => {
      voice.ended = true;
      const i = pool.indexOf(voice);
      if (i >= 0) pool.splice(i, 1);
      pan.disconnect();
    };
    src.start(ctx.currentTime + Math.max(0, o.at ?? 0));
    pool.push(voice);
    this.started++;
    return {
      stop: (fade = 0.05) => this.release(voice, pool, fade),
      set: (s) => {
        const now = ctx.currentTime;
        if (s.volume !== undefined) gain.gain.setTargetAtTime(s.volume, now, 0.03);
        if (s.pan !== undefined)
          pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, s.pan)), now, 0.03);
      },
      get playing() {
        return !voice.ended;
      },
    };
  }

  /** Frees one of `among` for a sound of `priority`: the oldest of the lowest priority. */
  private steal(among: readonly Voice[], priority: number, pool: Voice[]): boolean {
    let victim: Voice | undefined;
    for (const v of among)
      if (
        !victim ||
        v.priority < victim.priority ||
        (v.priority === victim.priority && v.started < victim.started)
      )
        victim = v;
    if (!victim || victim.priority > priority) {
      this.dropped++;
      return false;
    }
    this.stolen++;
    this.release(victim, pool);
    return true;
  }

  /** Fades a voice out and frees its slot at once. */
  private release(v: Voice, pool: Voice[], fade = STEAL_FADE): void {
    const i = pool.indexOf(v);
    if (i >= 0) pool.splice(i, 1);
    if (v.ended) return;
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + fade);
    try {
      v.src.stop(now + fade + 0.005);
    } catch {
      // Already stopped.
    }
  }

  /** Stops everything, for a context rebuild. */
  clear(): void {
    for (const v of [...this.live, ...this.loops]) {
      try {
        v.src.stop();
      } catch {
        // Already stopped.
      }
    }
    this.live.length = 0;
    this.loops.length = 0;
  }
}
