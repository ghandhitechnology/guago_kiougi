/** Messages between the main thread and the audio worker. */

export type ToWorker =
  | { readonly type: "init"; readonly sampleRate: number }
  | { readonly type: "effects" }
  | {
      readonly type: "start";
      readonly deck: number;
      readonly gen: number;
      readonly kind: "song" | "bed";
      readonly id: string;
      readonly seed: number;
    }
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
}

export type FromWorker =
  | {
      readonly type: "effect";
      readonly id: string;
      readonly variants: Float32Array[];
      readonly loop: boolean;
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
