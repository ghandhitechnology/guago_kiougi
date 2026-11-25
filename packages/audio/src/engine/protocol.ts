/** Messages between the main thread and the audio worker. */

import type { Bank, EffectSource } from "../sfx/format.ts";

export type ToWorker =
  | { readonly type: "init"; readonly sampleRate: number }
  /** Render every effect and jingle of a bank, one per task. */
  | { readonly type: "bank"; readonly bank: Bank }
  /** Render one effect or jingle now, ahead of its bank. */
  | { readonly type: "render"; readonly id: string }
  | {
      readonly type: "start";
      readonly deck: number;
      readonly gen: number;
      readonly kind: "song" | "bed" | "jingle";
      readonly id: string;
      readonly seed: number;
      readonly part?: string;
    }
  | { readonly type: "part"; readonly deck: number; readonly gen: number; readonly part: string }
  | { readonly type: "stop"; readonly deck: number }
  | {
      readonly type: "pull";
      readonly deck: number;
      readonly gen: number;
      readonly frames: number;
      /** Buffers handed back for reuse, so steady playback allocates nothing. */
      readonly recycle: Float32Array[];
    };

export interface SongInfo {
  readonly title: string;
  readonly stems: readonly string[];
  readonly bpm: number;
  readonly rowsPerBar: number;
  readonly loop: number | false;
  readonly parts: readonly string[];
}

/** What the main thread needs to know about a sound before its samples exist. */
export interface CueMeta {
  readonly bank: Bank;
  readonly vary: number;
  readonly priority: number;
  readonly max: number;
  readonly loop: boolean;
  readonly jingle: boolean;
  /** A jingle's length in seconds, for how long it ducks the music. */
  readonly seconds?: number;
  readonly duck?: EffectSource["duck"];
  readonly streak?: EffectSource["streak"];
}

export type FromWorker =
  | { readonly type: "catalog"; readonly cues: Readonly<Record<string, CueMeta>> }
  | {
      readonly type: "sound";
      readonly id: string;
      /** One buffer per variant; a jingle has one variant per channel, left then right. */
      readonly variants: Float32Array[];
    }
  | {
      readonly type: "started";
      readonly deck: number;
      readonly gen: number;
      readonly info: SongInfo;
    }
  | {
      readonly type: "block";
      readonly deck: number;
      readonly gen: number;
      /** Two per stem: left, right. */
      readonly channels: Float32Array[];
      /** Row starts inside the block: offset, frame, row, repeated. */
      readonly rows: Int32Array;
      readonly ended: boolean;
      /** Milliseconds the worker spent rendering the block. */
      readonly ms: number;
    }
  | { readonly type: "error"; readonly message: string };
