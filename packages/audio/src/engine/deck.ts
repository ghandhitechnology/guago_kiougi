/**
 * A deck plays one worker stream (a song or an ambient bed). The worker renders blocks ahead of
 * time; the deck schedules each block on the audio clock right after the previous one, so the
 * stream is gapless and sample-aligned. Stems get their own gain so they fade without latency.
 */

import type { SongInfo, ToWorker } from "./protocol.ts";

/** Seconds of audio kept scheduled ahead of the clock. Covers a one-second timer in a background tab. */
const LOOKAHEAD = 1.6;
/** Seconds per block. */
const BLOCK = 0.2;
/** First block starts this far after the request, so it is ready in time. */
const START_DELAY = 0.12;

export interface RowAt {
  time: number;
  frame: number;
  row: number;
}

export class Deck {
  readonly out: GainNode;
  private readonly ctx: AudioContext;
  private readonly post: (m: ToWorker, transfer?: Transferable[]) => void;
  private readonly index: number;
  private stems: GainNode[] = [];
  private stemLevels = new Map<string, number>();
  private gen = 0;
  private nextTime = 0;
  private inflight = 0;
  private recycle: Float32Array[] = [];
  private stopAt = Number.POSITIVE_INFINITY;
  private ended = false;
  id: string | null = null;
  info: SongInfo | null = null;
  readonly rows: RowAt[] = [];
  late = 0;
  blocks = 0;
  workerMs = 0;

  constructor(
    ctx: AudioContext,
    out: AudioNode,
    index: number,
    post: (m: ToWorker, transfer?: Transferable[]) => void,
  ) {
    this.ctx = ctx;
    this.index = index;
    this.post = post;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(out);
  }

  get active(): boolean {
    return this.id !== null;
  }

  start(
    kind: "song" | "bed",
    id: string,
    fade: number,
    stems: Readonly<Record<string, number>>,
  ): void {
    this.reset();
    this.gen++;
    this.id = id;
    this.stemLevels = new Map(Object.entries(stems));
    this.ended = false;
    this.stopAt = Number.POSITIVE_INFINITY;
    const t = this.ctx.currentTime + START_DELAY;
    this.nextTime = t;
    const g = this.out.gain;
    g.cancelScheduledValues(0);
    g.setValueAtTime(fade > 0 ? 0 : 1, t);
    if (fade > 0) g.linearRampToValueAtTime(1, t + fade);
    this.post({
      type: "start",
      deck: this.index,
      gen: this.gen,
      kind,
      id,
      seed: (Math.random() * 2 ** 31) | 0,
    });
    this.pump();
    this.pump();
  }

  /** Fades out and stops. */
  stop(fade: number): void {
    if (!this.id) return;
    const now = this.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
    this.stopAt = now + Math.max(0.01, fade) + 0.05;
  }

  /** Sets a stem's level, by name, with a fade. */
  stem(name: string, level: number, fade: number): void {
    this.stemLevels.set(name, level);
    const i = this.info?.stems.indexOf(name) ?? -1;
    const node = this.stems[i];
    if (!node) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(level, now + Math.max(0.01, fade));
  }

  onStarted(gen: number, info: SongInfo): void {
    if (gen !== this.gen) return;
    this.info = info;
    for (const s of this.stems) s.disconnect();
    this.stems = info.stems.map((name) => {
      const node = this.ctx.createGain();
      node.gain.value = this.stemLevels.get(name) ?? 1;
      node.connect(this.out);
      return node;
    });
  }

  onBlock(
    gen: number,
    channels: Float32Array[],
    rows: Int32Array,
    ended: boolean,
    ms: number,
  ): void {
    if (gen !== this.gen) {
      this.recycle.push(...channels);
      return;
    }
    this.inflight--;
    this.blocks++;
    this.workerMs += ms;
    const frames = channels[0]?.length ?? 0;
    const sr = this.ctx.sampleRate;
    const now = this.ctx.currentTime;
    let at = this.nextTime;
    let offset = 0;
    if (at < now) {
      // The block is late: play the part still ahead of the clock, so the stream stays in time.
      this.late++;
      offset = now - at + 0.005;
      at = now + 0.005;
    }
    for (let s = 0; s < this.stems.length; s++) {
      const buffer = this.ctx.createBuffer(2, frames, sr);
      buffer.copyToChannel(channels[s * 2] as Float32Array<ArrayBuffer>, 0);
      buffer.copyToChannel(channels[s * 2 + 1] as Float32Array<ArrayBuffer>, 1);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.stems[s] as GainNode);
      if (offset < frames / sr) src.start(at, offset);
    }
    for (let i = 0; i < rows.length; i += 3)
      this.rows.push({
        time: this.nextTime + (rows[i] as number) / sr,
        frame: rows[i + 1] as number,
        row: rows[i + 2] as number,
      });
    while (this.rows.length > 512) this.rows.shift();
    this.recycle.push(...channels);
    this.nextTime += frames / sr;
    if (ended) {
      this.ended = true;
      this.stopAt = Math.min(this.stopAt, this.nextTime);
    }
    this.pump();
  }

  /** Asks the worker for blocks until the lookahead is full; stops a finished deck. */
  pump(): void {
    if (!this.id) return;
    const now = this.ctx.currentTime;
    if (now >= this.stopAt) {
      this.reset();
      return;
    }
    if (this.ended) return;
    const ahead = this.nextTime + this.inflight * BLOCK - now;
    if (this.inflight < 3 && ahead < LOOKAHEAD) {
      this.inflight++;
      const recycle = this.recycle.splice(0);
      this.post(
        {
          type: "pull",
          deck: this.index,
          gen: this.gen,
          frames: Math.round(BLOCK * this.ctx.sampleRate),
          recycle,
        },
        recycle.map((b) => b.buffer),
      );
    }
  }

  /** The row sounding now, for the lab's pattern view. */
  rowNow(): RowAt | null {
    const t = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    let found: RowAt | null = null;
    for (const r of this.rows) {
      if (r.time > t) break;
      found = r;
    }
    return found;
  }

  private reset(): void {
    if (this.id) this.post({ type: "stop", deck: this.index });
    this.id = null;
    this.info = null;
    this.inflight = 0;
    this.rows.length = 0;
    for (const s of this.stems) s.disconnect();
    this.stems = [];
    this.out.gain.cancelScheduledValues(0);
    this.out.gain.value = 0;
    this.gen++;
  }
}
