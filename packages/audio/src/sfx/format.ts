/**
 * Sound effects as parameter sets, in the manner of sfxr/jsfxr but in physical units: hertz,
 * seconds and octaves per second instead of 0..1 knobs, so a value can be read and tuned.
 *
 * An effect has one to three layers that start together (or after `delay`) and are summed:
 * PLAN §6 names them body, material and sweetener. Each layer is one oscillator with a pitch
 * path, an envelope and filters.
 *
 * ```ts
 * const stamp: EffectSource = {
 *   category: "ui",
 *   layers: [
 *     { role: "body", wave: "sine", freq: 95, slide: -1.5, attack: 0.002, hold: 0.02, decay: 0.16 },
 *     { role: "material", wave: "noise", band: { freq: 900, q: 1.2 }, attack: 0.001, hold: 0, decay: 0.06 },
 *   ],
 * };
 * ```
 */

export type SfxWave =
  | "square"
  | "saw"
  | "tri"
  | "sine"
  | "noise"
  | "pink"
  | "brown"
  | "metal"
  | "crackle";

export interface SfxFilter {
  /** Hz. */
  readonly freq: number;
  /** Octaves per second. */
  readonly slide?: number;
  readonly q?: number;
}

export interface Layer {
  readonly role?: "body" | "material" | "sweetener";
  readonly wave: SfxWave;
  /**
   * Hz. For `noise` and `metal` it is the clock the noise is resampled at (0 means every sample);
   * for `crackle` it is clicks per second.
   */
  readonly freq: number;
  /** Octaves per second. */
  readonly slide?: number;
  /** Octaves per second, per second. */
  readonly accel?: number;
  /** The layer stops when its pitch falls below this, Hz. */
  readonly floor?: number;
  /** Square duty 0..1. */
  readonly duty?: number;
  /** Duty change per second. */
  readonly dutySlide?: number;
  readonly vibrato?: { readonly depth: number; readonly rate: number };
  /** Pitch steps: after `at` seconds jump by `semitones`. */
  readonly jumps?: readonly { readonly at: number; readonly semitones: number }[];
  /** Restart the pitch path every this many seconds. */
  readonly repeat?: number;
  /** Seconds. */
  readonly attack: number;
  readonly hold: number;
  readonly decay: number;
  /** Extra loudness at the start of the hold, falling to none at its end, 0..1. */
  readonly punch?: number;
  /** Decay shape: 1 linear, 2 and up falls faster at first. Default 2. */
  readonly curve?: number;
  readonly lowpass?: SfxFilter;
  readonly highpass?: SfxFilter;
  readonly band?: SfxFilter;
  /** Amplitude wobble: rate in Hz, depth 0..1. */
  readonly am?: { readonly rate: number; readonly depth: number };
  /** dB. */
  readonly gain?: number;
  /** Seconds after the effect starts. */
  readonly delay?: number;
}

/**
 * `hit` is an impact: at most three layers (PLAN §6: body, material, sweetener). `combat` is any
 * other fight event (a reaction, a roar, the field bell) and may stack up to six.
 */
export type EffectCategory = "ui" | "world" | "step" | "hit" | "combat";

/**
 * When an effect is rendered: `core` at start-up, `combat` right after, `page1` only when the game
 * asks for it (entering a Page 1 rift) or plays it for the first time.
 */
export type Bank = "core" | "combat" | "page1";

export interface EffectSource {
  readonly category: EffectCategory;
  readonly layers: readonly Layer[];
  /** dB against the category's loudness target. */
  readonly level?: number;
  /** How many renders with different noise and small parameter changes. Default 1. */
  readonly variants?: number;
  /** How far frequencies and times move between variants, as a fraction. Default 0.04. */
  readonly jitter?: number;
  /** Random pitch change per play, as a fraction: PLAN §6 says 0.06. */
  readonly vary?: number;
  /** 0 (first to be stolen) to 3. */
  readonly priority?: number;
  /** Most copies of this effect sounding at once. */
  readonly max?: number;
  /** Lower the music while this plays: dB and seconds to come back. */
  readonly duck?: { readonly depth: number; readonly release: number };
  /** Render as a seamless loop of this many seconds. */
  readonly loop?: number;
  /** Room reverb amount 0..1. */
  readonly room?: number;
  /** Defaults to `core` for ui, world and step sounds, `combat` for hit and combat sounds. */
  readonly bank?: Bank;
  /**
   * Plays in quick succession climb a scale: each play inside `window` seconds of the last moves
   * one step along `steps` (semitones), and a pause starts again from the bottom.
   */
  readonly streak?: { readonly steps: readonly number[]; readonly window: number };
}

/** Loudness each category is normalised to: the loudest 50 ms, K-weighted, in dB. */
export const CATEGORY_TARGET: Record<EffectCategory, number> = {
  ui: -21,
  world: -18,
  step: -26,
  hit: -20,
  combat: -19,
};

export function bankOf(source: EffectSource): Bank {
  return (
    source.bank ?? (source.category === "hit" || source.category === "combat" ? "combat" : "core")
  );
}

export class EffectError extends Error {}

/** Checks an effect and fills defaults, so a bad value fails at load instead of sounding wrong. */
export function parseEffect(
  id: string,
  source: EffectSource,
): Required<
  Pick<EffectSource, "variants" | "jitter" | "vary" | "priority" | "max" | "level" | "room">
> &
  EffectSource {
  const fail = (msg: string) => {
    throw new EffectError(`${id}: ${msg}`);
  };
  const most = source.category === "hit" ? 3 : 6;
  if (source.layers.length < 1 || source.layers.length > most)
    fail(
      source.category === "hit" ? "an impact needs one to three layers" : "needs one to six layers",
    );
  source.layers.forEach((l, i) => {
    const at = `layer ${i}`;
    if (!(l.freq >= 0)) fail(`${at} freq must be 0 or more`);
    for (const k of ["attack", "hold", "decay"] as const)
      if (!(l[k] >= 0)) fail(`${at} ${k} must be 0 or more`);
    if (l.attack + l.hold + l.decay <= 0) fail(`${at} has no length`);
    if (l.duty !== undefined && (l.duty <= 0 || l.duty >= 1))
      fail(`${at} duty must be inside 0..1`);
    if (l.punch !== undefined && (l.punch < 0 || l.punch > 1)) fail(`${at} punch must be 0..1`);
    if (l.am && (l.am.depth < 0 || l.am.depth > 1)) fail(`${at} am depth must be 0..1`);
    for (const f of [l.lowpass, l.highpass, l.band])
      if (f && !(f.freq > 0)) fail(`${at} filter needs a freq`);
  });
  const variants = source.variants ?? 1;
  if (!Number.isInteger(variants) || variants < 1 || variants > 8) fail("variants must be 1..8");
  const vary = source.vary ?? 0.06;
  if (vary < 0 || vary > 0.2) fail("vary must be 0..0.2");
  const priority = source.priority ?? 1;
  if (priority < 0 || priority > 3) fail("priority must be 0..3");
  if (source.loop !== undefined && !(source.loop > 0.1)) fail("loop must be longer than 0.1 s");
  return {
    ...source,
    variants,
    jitter: source.jitter ?? 0.04,
    vary,
    priority,
    max: source.max ?? 3,
    level: source.level ?? 0,
    room: source.room ?? 0,
  };
}
