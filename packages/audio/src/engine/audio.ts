/**
 * The game's audio: buses, music and ambient streams, effect voices, the hit mixer, ducking and
 * the limiter.
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
 * package is free. Effects are rendered in the worker and arrive as buffers; the main thread
 * carries no synthesis code.
 */

import { resolveCue } from "../aliases.ts";
import type { AmbientId, Bus, EffectId, SongId } from "../ids.ts";
import type { Bank } from "../sfx/format.ts";
import { Deck } from "./deck.ts";
import { HIT_RULES, type HitEvent, HitMixer, type Play } from "./hits.ts";
import type { CueMeta, FromWorker, SongInfo, ToWorker } from "./protocol.ts";
import { type PlayOptions, type Sound, type VoiceOptions, Voices } from "./voices.ts";

export type { HitEvent, PlayOptions, Sound };

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
  /** Start in a named part, such as a boss phase. */
  readonly part?: string;
}

export interface CueOptions extends PlayOptions {
  /** The local player's own sound. Default true; false fades it with distance. */
  readonly own?: boolean;
  /** Source position relative to the listener, px. Sets the pan when given. */
  readonly dx?: number;
  readonly dy?: number;
}

export interface ForecastOptions {
  /** Seconds from the cast to the strike. */
  readonly delay: number;
  /** The rising rumble; defaults to 지구는 둥글다's. */
  readonly cast?: string;
  /** The strike; defaults to 지구는 둥글다's crack. */
  readonly land?: string;
  readonly own?: boolean;
  readonly dx?: number;
  readonly dy?: number;
}

const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown", "mousedown"] as const;
const DEFAULT_VOLUMES: Record<Bus, number> = { master: 1, music: 0.8, effects: 1, ambient: 0.8 };
/** Seconds a sound asked for before its samples exist may still start late. */
const WAIT_EFFECT = 0.3;
/** Shortest gap between two plays of one cue: own, others'. */
const CUE_GAP_OWN = 0.03;
const CUE_GAP_OTHER = 0.12;
/** The rumble of 예보 is drawn for a delay of this many seconds. */
const FORECAST_DRAWN = 1.2;

interface Graph {
  readonly ctx: AudioContext;
  readonly buses: Record<Bus, GainNode>;
  readonly duck: GainNode;
  readonly analyser: AnalyserNode;
  readonly music: [Deck, Deck];
  readonly ambient: [Deck, Deck];
  /** Jingles stream over the music on their own deck, so they hold no buffers. */
  readonly jingle: Deck;
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
  private catalog = new Map<string, CueMeta>();
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private readonly waiting = new Map<string, { o: VoiceOptions; until: number }[]>();
  private readonly lastCue = new Map<string, number>();
  private readonly streaks = new Map<string, { at: number; step: number }>();
  private readonly mixer = new HitMixer((id) => this.catalog.has(id));
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProof = { at: -1, stack: 0 };
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

  /** Crossfades to a song, or to silence with `null`. Asking for the playing song changes its stems and part. */
  music(id: SongId | null, o: MusicOptions = {}): void {
    this.wanted.music = id;
    const g = this.graph();
    const fade = o.fade ?? 1.5;
    const current = g.music[this.musicDeck];
    if (id !== null && current.id === id) {
      for (const [name, level] of Object.entries(o.stems ?? {})) current.stem(name, level, fade);
      if (o.part) current.setPart(o.part);
      return;
    }
    current.stop(fade);
    if (id === null) return;
    this.musicDeck = this.musicDeck === 0 ? 1 : 0;
    g.music[this.musicDeck].start("song", id, current.active ? fade : 0.05, o.stems ?? {}, o.part);
  }

  /** Fades one stem of the playing song: `audio.stem("melody", 0)` leaves the bed under a menu. */
  stem(name: string, level: number, fade = 1): void {
    this.graph().music[this.musicDeck].stem(name, level, fade);
  }

  /** Moves the playing song to a named part at its next bar line: a boss's next phase. */
  part(name: string): void {
    this.graph().music[this.musicDeck].setPart(name);
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

  /** Plays an interface or world effect by its id. See `cue` for the return value. */
  play(id: EffectId, o: PlayOptions = {}): Sound | null {
    return this.cue(id, o);
  }

  /**
   * Plays any sound the content or the story names: an effect id (`sfx.reaction.combustion`), a
   * jingle (`jingle.level-up`, streamed over the ducked music) or a story cue (`whistle`,
   * `page-flutter`). Other players' sounds (`own: false`) fade with distance and are spaced out.
   * Returns a handle to stop or move an effect; null for a jingle, a dropped sound or one still
   * being rendered.
   */
  cue(name: string, o: CueOptions = {}): Sound | null {
    const g = this.graph();
    if (g.ctx.state !== "running" && !this.resuming) return null;
    const id = resolveCue(name);
    const meta = this.catalog.get(id);
    if (!meta) return null;
    const own = o.own ?? true;
    const now = g.ctx.currentTime;
    const last = this.lastCue.get(id) ?? -1;
    if (!meta.loop && now - last < (own ? CUE_GAP_OWN : CUE_GAP_OTHER)) return null;
    const placed = this.place(own, o);
    if (!placed) return null;
    this.lastCue.set(id, now);
    let pitch = o.pitch ?? 0;
    if (meta.streak) {
      const s = this.streaks.get(id);
      const step =
        s && now - s.at < meta.streak.window
          ? Math.min(s.step + 1, meta.streak.steps.length - 1)
          : 0;
      this.streaks.set(id, { at: now, step });
      pitch += meta.streak.steps[step] ?? 0;
    }
    if (meta.jingle) {
      g.jingle.start("jingle", id, 0, {});
      if (meta.duck) this.duck(meta.duck.depth, meta.seconds ?? 2, meta.duck.release);
      return null;
    }
    return this.start(id, meta, {
      ...placed,
      pitch,
      ...(own ? {} : { priority: Math.max(0, meta.priority - 1) }),
    });
  }

  /**
   * One hit event from the server. The library decides what is heard: own hits over others',
   * kills and crits over ordinary hits, repeats merged into one stronger hit, distant hits faded
   * and dropped. See `HitMixer` for the rules.
   */
  hit(e: HitEvent): void {
    const g = this.graph();
    if (g.ctx.state !== "running") return;
    this.voice(this.mixer.hit(e, g.ctx.currentTime));
    this.scheduleFlush();
  }

  /** 수학's 증명 stack reached `stack` (1 to 10); ten proves it with Q.E.D. Own hits only. */
  proof(stack: number): void {
    const now = this.graph().ctx.currentTime;
    const s = Math.max(1, Math.min(10, Math.round(stack)));
    if (s === 10) {
      this.lastProof = { at: now, stack: 10 };
      this.cue("class.math.proof.10");
      this.cue("sfx.signature.qed");
      return;
    }
    // Stacks climb on many targets at once: voice at most one step every 120 ms, never a lower
    // one right after a higher one.
    if (now - this.lastProof.at < 0.12) return;
    if (now - this.lastProof.at < 0.4 && s < this.lastProof.stack) return;
    this.lastProof = { at: now, stack: s };
    this.cue(`class.math.proof.${s}`);
  }

  /** 물리's 운동량: link 1 to 3 of a knockback collision chain. */
  collide(link: number, o: CueOptions = {}): void {
    this.cue(`class.physics.collide.${Math.max(1, Math.min(3, Math.round(link)))}`, o);
  }

  /** 지구과학's 예보: a rumble that grows for `delay` seconds and lands exactly on the strike. */
  forecast(o: ForecastOptions): void {
    const g = this.graph();
    if (g.ctx.state !== "running") return;
    const own = o.own ?? true;
    const placed = this.place(own, o);
    if (!placed) return;
    const cast = resolveCue(o.cast ?? "sfx.book.round-earth.rumble");
    const land = resolveCue(o.land ?? "sfx.book.round-earth.crack");
    const rate = Math.max(0.6, Math.min(1.6, FORECAST_DRAWN / Math.max(0.1, o.delay)));
    const priority = own ? 2 : 0;
    const castMeta = this.catalog.get(cast);
    const landMeta = this.catalog.get(land);
    if (castMeta) this.start(cast, castMeta, { ...placed, rate, priority, group: "hit" });
    if (landMeta) this.start(land, landMeta, { ...placed, at: o.delay, priority, group: "hit" });
  }

  /** Renders a bank ahead of need: `audio.preload("page1")` on entering a Page 1 rift. */
  preload(bank: Bank): void {
    this.graph().worker.postMessage({ type: "bank", bank } satisfies ToWorker);
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
    /** Records the master output, after the limiter, for `seconds`. Tools only. */
    record: (seconds: number): Promise<[Float32Array, Float32Array]> => {
      const g = this.graph();
      const tap = g.ctx.createScriptProcessor(4096, 2, 2);
      const total = Math.round(seconds * g.ctx.sampleRate);
      const left = new Float32Array(total);
      const right = new Float32Array(total);
      let at = 0;
      return new Promise((resolve) => {
        tap.onaudioprocess = (e) => {
          const n = Math.min(e.inputBuffer.length, total - at);
          left.set(e.inputBuffer.getChannelData(0).subarray(0, n), at);
          right.set(e.inputBuffer.getChannelData(1).subarray(0, n), at);
          at += n;
          if (at >= total) {
            g.analyser.disconnect(tap);
            tap.disconnect();
            resolve([left, right]);
          }
        };
        g.analyser.connect(tap);
        tap.connect(g.ctx.destination);
      });
    },
    catalog: (): ReadonlyMap<string, CueMeta> => this.catalog,
    stats: () => {
      const g = this.g;
      const decks = g ? [...g.music, ...g.ambient, g.jingle] : [];
      let bytes = 0;
      for (const list of this.buffers.values())
        for (const b of list) bytes += b.length * b.numberOfChannels * 4;
      return {
        state: g?.ctx.state ?? "none",
        sampleRate: g?.ctx.sampleRate ?? 0,
        voices: g?.voices.count ?? 0,
        started: g?.voices.started ?? 0,
        stolen: g?.voices.stolen ?? 0,
        dropped: g?.voices.dropped ?? 0,
        blocks: decks.reduce((n, d) => n + d.blocks, 0),
        late: decks.reduce((n, d) => n + d.late, 0),
        workerMs: decks.reduce((n, d) => n + d.workerMs, 0),
        sounds: this.catalog.size,
        ready: this.buffers.size,
        bufferBytes: bytes,
        hits: { ...this.mixer.stats },
        duck: g?.duck.gain.value ?? 1,
      };
    },
  };

  /** Gain and pan for a sound at a position, or null when it is too far to hear. */
  private place(own: boolean, o: CueOptions): VoiceOptions | null {
    const has = o.dx !== undefined || o.dy !== undefined;
    const dx = o.dx ?? 0;
    const distance = Math.hypot(dx, o.dy ?? 0);
    if (!own && distance > HIT_RULES.hearing) return null;
    const fade = own ? 1 : 1 / (1 + (distance / HIT_RULES.falloff) ** 2);
    const pan = has
      ? Math.max(-1, Math.min(1, dx / HIT_RULES.panWidth)) * (own ? 0.5 : 0.9)
      : (o.pan ?? 0);
    return {
      pan,
      volume: (o.volume ?? 1) * fade,
      ...(o.pitch !== undefined ? { pitch: o.pitch } : {}),
    };
  }

  private voice(plays: readonly Play[]): void {
    for (const p of plays) {
      const meta = this.catalog.get(p.id);
      const buffers = this.buffers.get(p.id);
      if (!meta || !buffers) continue;
      this.graph().voices.play(p.id, buffers, meta, {
        pan: p.pan,
        volume: Math.min(2, p.gain),
        priority: p.priority,
        group: "hit",
      });
    }
  }

  private scheduleFlush(): void {
    const g = this.g;
    if (!g || this.flushTimer) return;
    const due = this.mixer.nextFlush();
    if (!Number.isFinite(due)) return;
    const ms = Math.max(0, (due - g.ctx.currentTime) * 1000) + 2;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (!this.g) return;
      this.voice(this.mixer.flush(this.g.ctx.currentTime));
      this.scheduleFlush();
    }, ms);
  }

  /** Starts a sound, or asks the worker for it and starts it when it arrives, if still in time. */
  private start(id: string, meta: CueMeta, o: VoiceOptions): Sound | null {
    const g = this.graph();
    const buffers = this.buffers.get(id);
    if (!buffers) {
      const list = this.waiting.get(id) ?? [];
      if (list.length === 0) g.worker.postMessage({ type: "render", id } satisfies ToWorker);
      list.push({ o, until: g.ctx.currentTime + WAIT_EFFECT });
      this.waiting.set(id, list);
      return null;
    }
    const sound = g.voices.play(id, buffers, meta, o);
    if (sound && meta.duck) {
      const length = ((buffers[0]?.duration ?? 0.3) * 0.9) / (o.rate ?? 1);
      this.duck(meta.duck.depth, length + (o.at ?? 0), meta.duck.release);
    }
    return sound;
  }

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
    const jingle = new Deck(ctx, buses.effects, 4, post);
    const decks = [...music, ...ambient, jingle];
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      switch (m.type) {
        case "catalog":
          this.catalog = new Map(Object.entries(m.cues));
          break;
        case "sound": {
          if (this.buffers.has(m.id)) break;
          const meta = this.catalog.get(m.id);
          const toBuffer = (chans: Float32Array[]) => {
            const b = ctx.createBuffer(chans.length, chans[0]?.length ?? 1, ctx.sampleRate);
            chans.forEach((c, i) => {
              b.copyToChannel(c as Float32Array<ArrayBuffer>, i);
            });
            return b;
          };
          const buffers = m.variants.map((v) => toBuffer([v]));
          this.buffers.set(m.id, buffers);
          const waiting = this.waiting.get(m.id);
          this.waiting.delete(m.id);
          if (meta)
            for (const w of waiting ?? [])
              if (ctx.currentTime <= w.until) this.start(m.id, meta, w.o);
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
    const timer = setInterval(() => {
      for (const d of decks) d.pump();
    }, 100);
    const voices = new Voices(ctx, buses.effects);
    this.g = { ctx, buses, duck, analyser, music, ambient, jingle, voices, worker, timer };
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
    this.waiting.clear();
    const { music, ambient } = this.wanted;
    this.graph();
    this.onGesture();
    if (music) this.music(music, { fade: 0.5 });
    if (ambient) this.ambient(ambient, { fade: 0.5 });
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
