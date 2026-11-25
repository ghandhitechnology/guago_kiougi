/**
 * The game's audio: buses, music and ambient streams, effect voices, ducking and the limiter.
 *
 * Graph:
 *
 * ```
 * music decks ─ duck ─ music bus ──┐
 * ambient decks ─────── ambient bus ┼─ master ─ limiter ─ soft clip ─ speakers
 * effect voices ─────── effects bus ┘
 * ```
 *
 * Nothing here touches the browser until the first call that needs sound, so importing the
 * package is free.
 */

import { EFFECTS } from "../content/effects/index.ts";
import type { AmbientId, Bus, EffectId, SongId } from "../ids.ts";
import { type EffectSource, parseEffect } from "../sfx/format.ts";
import { renderEffect } from "../sfx/render.ts";
import { Deck } from "./deck.ts";
import type { FromWorker, SongInfo, ToWorker } from "./protocol.ts";
import { type EffectMeta, type PlayOptions, type Sound, Voices } from "./voices.ts";

export type { PlayOptions, Sound };

export interface AudioOptions {
  /** Starting volumes 0..1, usually what the player saved last time. */
  readonly volumes?: Partial<Record<Bus, number>>;
  /** Suspend audio while the tab is hidden. Default true. */
  readonly pauseWhenHidden?: boolean;
}

export interface MusicOptions {
  /** Crossfade seconds. Default 1.5. */
  readonly fade?: number;
  /** Starting stem levels by name, 0..1. */
  readonly stems?: Readonly<Record<string, number>>;
}

const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown", "mousedown"] as const;
const DEFAULT_VOLUMES: Record<Bus, number> = { master: 1, music: 0.8, effects: 1, ambient: 0.8 };

interface Graph {
  readonly ctx: AudioContext;
  readonly buses: Record<Bus, GainNode>;
  readonly duck: GainNode;
  readonly analyser: AnalyserNode;
  readonly music: [Deck, Deck];
  readonly ambient: [Deck, Deck];
  readonly voices: Voices;
  readonly worker: Worker;
  readonly timer: ReturnType<typeof setInterval>;
}

/** A soft clip that leaves everything under -2 dBFS alone and never exceeds -0.2 dBFS. */
function clipCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a < 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

export class GameAudio {
  private g: Graph | null = null;
  private readonly volumes: Record<Bus, number>;
  private readonly pauseHidden: boolean;
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private readonly meta = new Map<string, EffectMeta & { duck?: EffectSource["duck"] }>();
  private armed = false;
  private resuming = false;
  private hiddenPaused = false;
  private musicDeck: 0 | 1 = 0;
  private ambientDeck: 0 | 1 = 0;
  private wanted: { music: SongId | null; ambient: AmbientId | null } = {
    music: null,
    ambient: null,
  };
  private duckUntil = 0;
  private duckDepth = 1;

  constructor(o: AudioOptions = {}) {
    this.volumes = { ...DEFAULT_VOLUMES, ...o.volumes };
    this.pauseHidden = o.pauseWhenHidden ?? true;
  }

  /** The audio context, created on first use. Phaser can share it: `audio: { context }`. */
  get context(): AudioContext {
    return this.graph().ctx;
  }

  /**
   * Arms audio: creates the context and listens for the first tap or key press, which is when
   * mobile browsers allow sound. Call once at start-up; calling it inside a gesture handler also
   * starts sound at once. Later interruptions (a phone call, a tab switch, a new headset) are
   * recovered on the next tap the same way.
   */
  unlock(): void {
    this.graph();
    if (!this.armed && typeof window !== "undefined") {
      this.armed = true;
      for (const ev of GESTURES)
        window.addEventListener(ev, this.onGesture, { capture: true, passive: true });
      document.addEventListener("visibilitychange", this.onVisibility);
      navigator.mediaDevices?.addEventListener?.("devicechange", this.onDevice);
    }
    this.onGesture();
  }

  /** Crossfades to a song, or to silence with `null`. Asking for the playing song only changes its stems. */
  music(id: SongId | null, o: MusicOptions = {}): void {
    this.wanted.music = id;
    const g = this.graph();
    const fade = o.fade ?? 1.5;
    const current = g.music[this.musicDeck];
    if (id !== null && current.id === id) {
      for (const [name, level] of Object.entries(o.stems ?? {})) current.stem(name, level, fade);
      return;
    }
    current.stop(fade);
    if (id === null) return;
    this.musicDeck = this.musicDeck === 0 ? 1 : 0;
    g.music[this.musicDeck].start("song", id, current.active ? fade : 0.05, o.stems ?? {});
  }

  /** Fades one stem of the playing song: `audio.stem("melody", 0)` leaves the bed under a menu. */
  stem(name: string, level: number, fade = 1): void {
    this.graph().music[this.musicDeck].stem(name, level, fade);
  }

  /** Crossfades to an ambient bed, or to silence with `null`. */
  ambient(id: AmbientId | null, o: { readonly fade?: number } = {}): void {
    this.wanted.ambient = id;
    const g = this.graph();
    const fade = o.fade ?? 2;
    const current = g.ambient[this.ambientDeck];
    if (id !== null && current.id === id) return;
    current.stop(fade);
    if (id === null) return;
    this.ambientDeck = this.ambientDeck === 0 ? 1 : 0;
    g.ambient[this.ambientDeck].start("bed", id, fade, {});
  }

  /**
   * Plays an effect. Returns a handle to stop or move it (looping effects keep going until
   * stopped), or null when the sound was dropped: audio still locked, tab hidden, or eight more
   * important sounds already playing.
   */
  play(id: EffectId, o: PlayOptions = {}): Sound | null {
    const g = this.graph();
    if (g.ctx.state !== "running" && !this.resuming) return null;
    const meta = this.effectMeta(id);
    if (!meta) return null;
    const variants = this.effectBuffers(id);
    const sound = g.voices.play(id, variants, meta, o);
    if (sound && meta.duck) {
      const length = (variants[0]?.duration ?? 0.3) * 0.9;
      this.duck(meta.duck.depth, length, meta.duck.release);
    }
    return sound;
  }

  /** Sets a bus volume 0..1. The caller persists it. */
  setVolume(bus: Bus, value: number): void {
    const v = Math.max(0, Math.min(1, value));
    this.volumes[bus] = v;
    if (this.g) this.g.buses[bus].gain.setTargetAtTime(v * v, this.g.ctx.currentTime, 0.015);
  }

  volume(bus: Bus): number {
    return this.volumes[bus];
  }

  /** Tool hooks for the audio lab. Not for game code. */
  readonly debug = {
    position: (): { id: string; info: SongInfo; frame: number; row: number } | null => {
      const deck = this.g?.music[this.musicDeck];
      const at = deck?.rowNow();
      if (!deck?.id || !deck.info || !at) return null;
      return { id: deck.id, info: deck.info, frame: at.frame, row: at.row };
    },
    analyser: (): AnalyserNode => this.graph().analyser,
    stats: () => {
      const g = this.g;
      const decks = g ? [...g.music, ...g.ambient] : [];
      return {
        state: g?.ctx.state ?? "none",
        sampleRate: g?.ctx.sampleRate ?? 0,
        voices: g?.voices.count ?? 0,
        stolen: g?.voices.stolen ?? 0,
        dropped: g?.voices.dropped ?? 0,
        blocks: decks.reduce((n, d) => n + d.blocks, 0),
        late: decks.reduce((n, d) => n + d.late, 0),
        workerMs: decks.reduce((n, d) => n + d.workerMs, 0),
        effectsReady: this.buffers.size,
        duck: g?.duck.gain.value ?? 1,
      };
    },
  };

  private readonly onGesture = (): void => {
    const g = this.g;
    if (!g) return;
    if (g.ctx.state === "closed") {
      this.rebuild();
      return;
    }
    if (g.ctx.state === "running" || this.hiddenPaused) return;
    this.resuming = true;
    // iOS starts output only for sound begun inside the gesture itself.
    const silent = g.ctx.createBufferSource();
    silent.buffer = g.ctx.createBuffer(1, 1, g.ctx.sampleRate);
    silent.connect(g.ctx.destination);
    silent.start();
    g.ctx
      .resume()
      .catch(() => {})
      .finally(() => {
        this.resuming = false;
      });
  };

  private readonly onVisibility = (): void => {
    const g = this.g;
    if (!g || !this.pauseHidden) return;
    if (document.hidden) {
      if (g.ctx.state === "running") {
        this.hiddenPaused = true;
        void g.ctx.suspend();
      }
    } else if (this.hiddenPaused) {
      this.hiddenPaused = false;
      g.ctx.resume().catch(() => {});
    }
  };

  private readonly onDevice = (): void => {
    const g = this.g;
    if (!g) return;
    if (g.ctx.state === "closed") this.rebuild();
    else if (g.ctx.state !== "running" && !this.hiddenPaused) g.ctx.resume().catch(() => {});
  };

  private graph(): Graph {
    if (this.g) return this.g;
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const buses = {
      master: ctx.createGain(),
      music: ctx.createGain(),
      effects: ctx.createGain(),
      ambient: ctx.createGain(),
    };
    for (const b of Object.keys(buses) as Bus[]) buses[b].gain.value = this.volumes[b] ** 2;
    const duck = ctx.createGain();
    duck.connect(buses.music);
    buses.music.connect(buses.master);
    buses.effects.connect(buses.master);
    buses.ambient.connect(buses.master);
    // A fast compressor as a limiter, then a soft clip that catches anything it lets through.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const clip = ctx.createWaveShaper();
    clip.curve = clipCurve();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buses.master.connect(limiter).connect(pre).connect(clip).connect(ctx.destination);
    clip.connect(analyser);

    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const post = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
    const music: [Deck, Deck] = [new Deck(ctx, duck, 0, post), new Deck(ctx, duck, 1, post)];
    const ambient: [Deck, Deck] = [
      new Deck(ctx, buses.ambient, 2, post),
      new Deck(ctx, buses.ambient, 3, post),
    ];
    const decks = [...music, ...ambient];
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      switch (m.type) {
        case "effect": {
          if (this.buffers.has(m.id)) break;
          this.buffers.set(
            m.id,
            m.variants.map((v) => {
              const b = ctx.createBuffer(1, v.length, ctx.sampleRate);
              b.copyToChannel(v as Float32Array<ArrayBuffer>, 0);
              return b;
            }),
          );
          break;
        }
        case "started":
          decks[m.deck]?.onStarted(m.gen, m.info);
          break;
        case "block":
          decks[m.deck]?.onBlock(m.gen, m.channels, m.rows, m.ended, m.ms);
          break;
        case "error":
          console.warn(`audio worker: ${m.message}`);
          break;
      }
    };
    worker.postMessage({ type: "init", sampleRate: ctx.sampleRate } satisfies ToWorker);
    worker.postMessage({ type: "effects" } satisfies ToWorker);
    const timer = setInterval(() => {
      for (const d of decks) d.pump();
    }, 100);
    const voices = new Voices(ctx, buses.effects);
    this.g = { ctx, buses, duck, analyser, music, ambient, voices, worker, timer };
    return this.g;
  }

  /** Recovers from a closed context (a lost audio device): new context, same songs. */
  private rebuild(): void {
    const old = this.g;
    if (!old) return;
    clearInterval(old.timer);
    old.worker.terminate();
    old.voices.clear();
    this.g = null;
    this.buffers.clear();
    const { music, ambient } = this.wanted;
    this.graph();
    this.onGesture();
    if (music) this.music(music, { fade: 0.5 });
    if (ambient) this.ambient(ambient, { fade: 0.5 });
  }

  private effectMeta(id: EffectId) {
    let m = this.meta.get(id);
    if (m) return m;
    const source = EFFECTS[id as keyof typeof EFFECTS] as EffectSource | undefined;
    if (!source) return undefined;
    const fx = parseEffect(id, source);
    m = {
      vary: fx.vary,
      priority: fx.priority,
      max: fx.max,
      loop: fx.loop !== undefined,
      ...(fx.duck ? { duck: fx.duck } : {}),
    };
    this.meta.set(id, m);
    return m;
  }

  /** The effect's buffers; rendered here at once if the worker has not delivered them yet. */
  private effectBuffers(id: EffectId): AudioBuffer[] {
    const ready = this.buffers.get(id);
    if (ready) return ready;
    const ctx = this.graph().ctx;
    const source = EFFECTS[id as keyof typeof EFFECTS] as EffectSource;
    const r = renderEffect(id, source, ctx.sampleRate);
    const buffers = r.variants.map((v) => {
      const b = ctx.createBuffer(1, v.length, ctx.sampleRate);
      b.copyToChannel(v as Float32Array<ArrayBuffer>, 0);
      return b;
    });
    this.buffers.set(id, buffers);
    return buffers;
  }

  /** Lowers the music, holds, then lets it back up. Overlapping ducks keep the deepest. */
  private duck(depthDb: number, hold: number, release: number): void {
    const g = this.graph();
    const now = g.ctx.currentTime;
    const level = 10 ** (depthDb / 20);
    const active = now < this.duckUntil;
    const target = active ? Math.min(level, this.duckDepth) : level;
    const until = Math.max(now + hold, active ? this.duckUntil : 0);
    this.duckDepth = target;
    this.duckUntil = until;
    const p = g.duck.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(target, now + 0.03);
    p.setValueAtTime(target, until);
    p.linearRampToValueAtTime(1, until + release);
  }
}
