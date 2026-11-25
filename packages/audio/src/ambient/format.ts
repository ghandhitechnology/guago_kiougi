/**
 * Ambient beds: endless, never-repeating backgrounds built from layers. Continuous layers (wind,
 * hum, insects, the rift) run all the time; event layers drop calls (a gull, distant voices, a far
 * door) at random intervals, at random places in the stereo field and at random distances.
 */

export interface NoiseLayer {
  readonly kind: "noise";
  readonly color: "white" | "pink" | "brown";
  readonly filter: {
    readonly type: "lp" | "bp" | "hp";
    readonly freq: number;
    readonly q?: number;
  };
  /** Slow wander of the filter: Hz and octaves. */
  readonly sway?: { readonly rate: number; readonly depth: number };
  /** Gusts: how often per second on average, and how deep, 0..1. */
  readonly gust?: { readonly rate: number; readonly depth: number };
  /** dB. */
  readonly gain: number;
  /** 0 mono .. 1 fully independent left and right. */
  readonly width?: number;
}

export interface HumLayer {
  readonly kind: "hum";
  /** Hz of the first partial. */
  readonly freq: number;
  /** Amplitude of each harmonic, first is the fundamental. */
  readonly partials: readonly number[];
  /** Ballast buzz, 0..1. */
  readonly buzz?: number;
  readonly gain: number;
  readonly pan?: number;
}

export interface InsectLayer {
  readonly kind: "insects";
  readonly count: number;
  /** Carrier range, Hz. */
  readonly freq: readonly [number, number];
  /** Chirps per second range. */
  readonly rate: readonly [number, number];
  /** Pulses per chirp. */
  readonly pulses: number;
  readonly gain: number;
}

export interface ThrobLayer {
  readonly kind: "throb";
  /** Hz of the low tone. */
  readonly freq: number;
  /** Pulses per second. */
  readonly rate: number;
  /** Glass shimmer above it, 0..1. */
  readonly shimmer: number;
  readonly gain: number;
}

export type CallKind = "gull" | "voices" | "door" | "laugh";

export interface EventLayer {
  readonly kind: "events";
  readonly call: CallKind;
  /** Seconds between calls, min and max. */
  readonly every: readonly [number, number];
  readonly gain: number;
  /** Pan range. */
  readonly pan?: readonly [number, number];
  /** 0 near .. 1 far: darker, quieter and wetter. */
  readonly distance?: readonly [number, number];
}

export type BedLayer = NoiseLayer | HumLayer | InsectLayer | ThrobLayer | EventLayer;

export interface BedSource {
  readonly title: string;
  /** dB for the whole bed. */
  readonly gain: number;
  readonly layers: readonly BedLayer[];
  /** Seconds of reverb tail for calls. */
  readonly space: number;
}
