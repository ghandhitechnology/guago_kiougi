/**
 * Plays a compiled song into stem buffers, sample by sample. The same code runs in the browser's
 * audio worker and in Node for WAV renders, so what the owner hears from a file is what the game
 * plays.
 */

import { dbToGain, Echo, OnePole, panGains, Reverb } from "../dsp/core.ts";
import { makeVoice, type Voice } from "../dsp/voices.ts";
import type { CompiledChannel, CompiledSong } from "./compile.ts";
import type { Cell } from "./parse.ts";
import { nextRow, type Position, rowStart, type Timing, tickStart, timing } from "./schedule.ts";

const BLOCK = 64;
const POLYPHONY = 8;

export interface RowMark {
  /** Sample offset inside the rendered block. */
  readonly offset: number;
  readonly frame: number;
  readonly row: number;
}

class Channel {
  readonly voices: Voice[];
  current: Voice[] = [];
  notes: number[] = [];
  readonly kit: boolean;
  readonly pluck: boolean;
  gainL: number;
  gainR: number;
  readonly reverb: number;
  readonly delay: number;
  readonly volume: number;
  noteGain = 1;
  private lastGain = 0;
  slide = 0; // semitones per second
  slideOffset = 0;
  glide = 0; // semitones away from the target
  glideRate = 0; // semitones per second
  arp: [number, number, number] | null = null;
  arpStep = 0;
  vibRate = 0;
  vibDepth = 0;
  vibPhase = 0;
  volSlide = 0; // per second
  timbre = -1;
  pending: { cell: Cell; tick: number; transpose: number } | null = null;
  cutTick = -1;
  readonly source: CompiledChannel;
  constructor(sr: number, source: CompiledChannel, seed: number) {
    this.source = source;
    this.kit = source.instrument.kind === "kit";
    this.pluck = source.instrument.kind === "pluck";
    this.voices = Array.from({ length: POLYPHONY }, (_, i) =>
      makeVoice(sr, source.instrument, seed * 31 + i * 7919),
    );
    [this.gainL, this.gainR] = panGains(source.source.pan ?? 0);
    this.reverb = source.source.reverb ?? 0;
    this.delay = source.source.delay ?? 0;
    this.volume = source.source.volume ?? 1;
  }
  /** A free voice, or the quietest-to-lose one stolen. */
  allocate(): Voice {
    let best: Voice | undefined;
    for (const v of this.voices) if (!v.active) return v;
    for (const v of this.voices)
      if (v.releasing && !this.current.includes(v) && (!best || v.age > best.age)) best = v;
    if (!best) for (const v of this.voices) if (!best || v.age > best.age) best = v;
    // A stolen voice restarts its attack from the level it is at, so the steal does not click.
    return best as Voice;
  }
  gainStep(target: number): [number, number] {
    const from = this.lastGain;
    this.lastGain = target;
    return [from, target];
  }
}

export class SongPlayer {
  readonly song: CompiledSong;
  readonly sampleRate: number;
  private readonly timing: Timing;
  private readonly channels: Channel[];
  private readonly reverbs: Reverb[];
  private readonly echoes: (Echo | null)[];
  private readonly revIn: Float32Array[];
  private readonly echoIn: Float32Array[];
  private readonly scratch = new Float32Array(BLOCK);
  private readonly gain: number;
  private readonly reverbLevel: number;
  private readonly rowSeconds: number;
  private pos: Position | null = { frame: 0, row: 0 };
  private absRow = 0;
  private tick = 0;
  private sample = 0;
  private nextEvent = 0;
  private endedAt = -1;
  private readonly frameRows: number[];
  private readonly dcBlock: OnePole[];
  private range: readonly [number, number] | null = null;
  private pending: readonly [number, number] | null = null;

  constructor(song: CompiledSong, sampleRate: number, seed = 1, part?: string) {
    this.song = song;
    this.sampleRate = sampleRate;
    const s = song.source;
    this.timing = timing(sampleRate, s.bpm, s.rowsPerBeat, s.swing ?? 0, s.speed ?? 6);
    this.rowSeconds = 60 / (s.bpm * s.rowsPerBeat);
    this.channels = song.channels.map((c, i) => new Channel(sampleRate, c, seed + i));
    const stems = song.stems.length;
    this.reverbs = Array.from(
      { length: stems },
      () => new Reverb(sampleRate, s.reverb?.time ?? 1.6, s.reverb?.damp ?? 5000),
    );
    const beat = 60 / s.bpm;
    this.echoes = Array.from({ length: stems }, () =>
      s.echo
        ? new Echo(sampleRate, s.echo.beats * beat, s.echo.feedback, s.echo.damp ?? 3500)
        : null,
    );
    this.revIn = Array.from({ length: stems }, () => new Float32Array(BLOCK));
    this.echoIn = Array.from({ length: stems }, () => new Float32Array(BLOCK));
    this.gain = dbToGain(s.gain ?? 0);
    this.reverbLevel = s.reverb?.level ?? 1;
    this.frameRows = song.frames.map((f) => f.rows);
    this.dcBlock = Array.from({ length: stems * 2 }, () => {
      const p = new OnePole();
      p.set(sampleRate, 12);
      return p;
    });
    const start = part ? s.parts?.[part] : undefined;
    if (start) {
      this.range = start;
      this.pos = { frame: start[0], row: 0 };
    }
  }

  /** Moves to a named part at the next bar line; unknown names are ignored. */
  setPart(name: string): void {
    const range = this.song.source.parts?.[name];
    if (range) this.pending = range;
  }

  /** True once a song that plays once has finished and its tails have died away. */
  get finished(): boolean {
    return this.endedAt >= 0 && this.sample - this.endedAt > this.sampleRate * 3;
  }

  get position(): Position | null {
    return this.pos;
  }

  /**
   * Adds `n` samples into `out`, which holds two buffers per stem (left, right), starting at
   * `offset`. Returns the rows that started inside the block.
   */
  render(out: readonly Float32Array[], offset: number, n: number): RowMark[] {
    const marks: RowMark[] = [];
    let i = 0;
    while (i < n) {
      while (this.sample >= this.nextEvent) {
        const mark = this.event();
        if (mark) marks.push({ offset: offset + i, ...mark });
      }
      const chunk = Math.min(n - i, BLOCK, this.nextEvent - this.sample);
      this.renderChunk(out, offset + i, chunk);
      this.sample += chunk;
      i += chunk;
    }
    return marks;
  }

  /** Handles the tick at `nextEvent`; returns the row position when a row starts. */
  private event(): Position | null {
    if (!this.pos) {
      this.nextEvent = Number.POSITIVE_INFINITY;
      return null;
    }
    const startsRow = this.tick === 0;
    if (startsRow && this.pending && this.pos.row % this.song.rowsPerBar === 0) {
      this.range = this.pending;
      this.pos = { frame: this.pending[0], row: 0 };
      this.pending = null;
    }
    const at = this.pos;
    if (startsRow) this.startRow(at);
    this.doTick();
    if (this.tick + 1 < this.timing.speed) {
      this.tick++;
      this.nextEvent = tickStart(this.timing, this.absRow, this.tick);
    } else {
      this.tick = 0;
      this.absRow++;
      this.pos = nextRow(this.frameRows, this.song.source.loop, at, this.range);
      if (!this.pos) {
        this.endedAt = rowStart(this.timing, this.absRow);
        this.nextEvent = Number.POSITIVE_INFINITY;
        for (const c of this.channels) for (const v of c.current) v.release();
      } else this.nextEvent = rowStart(this.timing, this.absRow);
    }
    return startsRow ? at : null;
  }

  private startRow(at: Position): void {
    const frame = this.song.frames[at.frame];
    if (!frame) return;
    this.channels.forEach((c, i) => {
      const cell = frame.phrases[i]?.[at.row];
      if (!cell) return;
      const transpose = frame.transpose[i] ?? 0;
      const delay = cell.fx.find((f) => f.code === "e");
      if (delay && delay.value > 0) {
        c.pending = { cell, tick: delay.value, transpose };
        return;
      }
      this.apply(c, cell, transpose);
    });
  }

  private doTick(): void {
    for (const c of this.channels) {
      if (c.pending && c.pending.tick === this.tick) {
        const p = c.pending;
        c.pending = null;
        this.apply(c, p.cell, p.transpose);
      }
      if (c.cutTick === this.tick) {
        for (const v of c.current) v.kill();
        c.current = [];
        c.cutTick = -1;
      }
      if (c.arp) c.arpStep = (c.arpStep + 1) % 3;
    }
  }

  private apply(c: Channel, cell: Cell, transpose: number): void {
    const fx = cell.fx;
    const porta = fx.find((f) => f.code === "p");
    c.cutTick = -1;
    switch (cell.kind) {
      case "off":
        for (const v of c.current) v.release();
        c.current = [];
        break;
      case "cut":
        for (const v of c.current) v.kill();
        c.current = [];
        break;
      case "drum": {
        c.noteGain = 1;
        for (const piece of cell.drums ?? []) {
          if (piece === "H") for (const v of c.voices) if (v.active && v.piece === "O") v.kill();
          const v = c.allocate();
          v.start(60, cell.vol ?? 1, c.timbre, piece);
        }
        break;
      }
      case "note": {
        const notes = (cell.notes ?? []).map((n) => n + transpose);
        if (porta && c.current.length > 0) {
          // Glide from where the old note is now to the new one, without retriggering.
          const from = (c.notes[0] ?? notes[0] ?? 60) + c.slideOffset + c.glide;
          c.notes = notes;
          c.glide = from - (notes[0] ?? 60);
          c.glideRate = porta.value / 16 / this.rowSeconds;
          if (porta.value === 0) c.glide = 0;
          c.slideOffset = 0;
        } else {
          if (!c.pluck) for (const v of c.current) v.release();
          c.current = [];
          c.notes = notes;
          c.noteGain = 1;
          c.slideOffset = 0;
          c.glide = 0;
          c.slide = 0;
          c.arp = null;
          c.vibDepth = 0;
          c.volSlide = 0;
          for (const n of notes) {
            const v = c.allocate();
            v.start(n, cell.vol ?? 1, c.timbre);
            c.current.push(v);
          }
        }
        break;
      }
      case "hold":
        if (cell.vol !== undefined) c.noteGain = cell.vol;
        break;
    }
    for (const f of fx) {
      const x = f.value >> 4;
      const y = f.value & 15;
      switch (f.code) {
        case "a":
          c.arp = f.value === 0 ? null : [0, x, y];
          c.arpStep = 2; // the tick that follows steps it to the base note
          break;
        case "u":
          c.slide = f.value / 16 / this.rowSeconds;
          break;
        case "d":
          c.slide = -f.value / 16 / this.rowSeconds;
          break;
        case "~":
          c.vibRate = x;
          c.vibDepth = y / 8;
          break;
        case "f":
          c.volSlide = (x - y) / 16 / this.rowSeconds;
          break;
        case "c":
          c.cutTick = f.value;
          break;
        case "t":
          c.timbre = f.value;
          for (const v of c.current) v.setTimbre(f.value);
          break;
        case "q":
          [c.gainL, c.gainR] = panGains((f.value - 128) / 128);
          break;
      }
    }
  }

  private renderChunk(out: readonly Float32Array[], offset: number, n: number): void {
    const seconds = n / this.sampleRate;
    const stems = this.song.stems.length;
    for (let s = 0; s < stems; s++) {
      (this.revIn[s] as Float32Array).fill(0, 0, n);
      (this.echoIn[s] as Float32Array).fill(0, 0, n);
    }
    const scratch = this.scratch;
    for (const c of this.channels) {
      let any = false;
      for (const v of c.voices) if (v.active) any = true;
      if (!any) continue;
      // Pitch for the block.
      if (c.slide !== 0) c.slideOffset += c.slide * seconds;
      if (c.glide !== 0) {
        const step = c.glideRate * seconds;
        c.glide = Math.abs(c.glide) <= step ? 0 : c.glide - Math.sign(c.glide) * step;
      }
      if (c.volSlide !== 0)
        c.noteGain = Math.min(1, Math.max(0, c.noteGain + c.volSlide * seconds));
      let offsetSemis = c.slideOffset + c.glide;
      if (c.arp) offsetSemis += c.arp[c.arpStep] as number;
      if (c.vibDepth > 0) {
        offsetSemis += Math.sin(c.vibPhase) * c.vibDepth;
        c.vibPhase += 2 * Math.PI * c.vibRate * seconds;
      }
      if (!c.kit)
        c.current.forEach((v, i) => {
          v.setPitch((c.notes[i] ?? 60) + offsetSemis);
        });
      scratch.fill(0, 0, n);
      for (const v of c.voices) if (v.active) v.render(scratch, 0, n);
      const [g0, g1] = c.gainStep(c.noteGain * c.volume);
      const stem = c.source.stem;
      const L = out[stem * 2] as Float32Array;
      const R = out[stem * 2 + 1] as Float32Array;
      const rev = this.revIn[stem] as Float32Array;
      const echo = this.echoIn[stem] as Float32Array;
      const dg = (g1 - g0) / n;
      for (let k = 0; k < n; k++) {
        const x = (scratch[k] as number) * (g0 + dg * k);
        L[offset + k] = (L[offset + k] as number) + x * c.gainL;
        R[offset + k] = (R[offset + k] as number) + x * c.gainR;
        rev[k] = (rev[k] as number) + x * c.reverb;
        echo[k] = (echo[k] as number) + x * c.delay;
      }
    }
    for (let s = 0; s < stems; s++) {
      const L = out[s * 2] as Float32Array;
      const R = out[s * 2 + 1] as Float32Array;
      const reverb = this.reverbs[s] as Reverb;
      const echo = this.echoes[s] ?? null;
      const rev = this.revIn[s] as Float32Array;
      const ein = this.echoIn[s] as Float32Array;
      const level = this.reverbLevel;
      for (let k = 0; k < n; k++) reverb.process(rev[k] as number, L, R, offset + k, level);
      if (echo) for (let k = 0; k < n; k++) echo.process(ein[k] as number, L, R, offset + k);
      const g = this.gain;
      const dl = this.dcBlock[s * 2] as OnePole;
      const dr = this.dcBlock[s * 2 + 1] as OnePole;
      for (let k = offset; k < offset + n; k++) {
        L[k] = dl.highpass(L[k] as number) * g;
        R[k] = dr.highpass(R[k] as number) * g;
      }
    }
  }
}
