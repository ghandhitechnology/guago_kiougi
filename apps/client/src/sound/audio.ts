import {
  type AmbientId,
  audio,
  type Bus,
  type EffectId,
  type SongId,
  type Surface,
} from "@guago/audio";
import { setUiSoundPlayer } from "../ui/sound.ts";

/**
 * The client's side of `@guago/audio`: arming it, the UI hook, per-device volumes, music and
 * ambient by place, and footsteps. Everything a player hears is asked for here.
 */

const VOLUME_KEY = "guago.volumes";
/** Buses a player sets in 설정; master stays at its default. */
export const PLAYER_BUSES = ["music", "effects", "ambient"] as const;
export type PlayerBus = (typeof PLAYER_BUSES)[number];

function loadVolumes(): Partial<Record<Bus, number>> {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<Bus, number>>) : {};
  } catch {
    return {};
  }
}

/**
 * Nothing touches the audio context before the first tap or key: browsers refuse to start one
 * earlier and warn on every call. Until then the game only remembers which song and air the
 * current place wants; effects asked for before it are dropped, since nobody heard the moment.
 */
let unlocked = false;
const wanted: { music?: SongId | null; ambient?: AmbientId | null } = {};
const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

/** Sound has started: the first gesture happened. */
export function audioLive(): boolean {
  return unlocked;
}

function onFirstGesture(): void {
  if (unlocked) return;
  unlocked = true;
  for (const ev of GESTURES) window.removeEventListener(ev, onFirstGesture, true);
  // Inside the gesture, so the context starts at once.
  audio.unlock();
  if (wanted.music !== undefined) audio.music(wanted.music, { fade: 1 });
  if (wanted.ambient !== undefined) audio.ambient(wanted.ambient, { fade: 1.5 });
}

function music(id: SongId | null, fade: number): void {
  wanted.music = id;
  if (unlocked) audio.music(id, { fade });
}

function ambient(id: AmbientId | null, fade: number): void {
  wanted.ambient = id;
  if (unlocked) audio.ambient(id, { fade });
}

/** An effect, once sound has started. */
export function sfx(id: EffectId, o?: { pan?: number; volume?: number }): void {
  if (unlocked) audio.play(id, o);
}

/** Any sound the library knows by name (jingles, story and menu cues), once sound has started. */
export function cue(name: string, o?: { volume?: number; pan?: number }): void {
  if (unlocked) audio.cue(name, o);
}

/** Readies audio at start-up; sound itself begins on the first tap or key. */
export function startAudio(): void {
  for (const [bus, v] of Object.entries(loadVolumes())) {
    if (typeof v === "number") audio.setVolume(bus as Bus, v);
  }
  for (const ev of GESTURES) {
    window.addEventListener(ev, onFirstGesture, { capture: true, passive: true });
  }
  setUiSoundPlayer((name) => sfx(`ui.${name}` as EffectId));
}

export function volume(bus: PlayerBus): number {
  return audio.volume(bus);
}

/** Sets a bus and remembers it on this device. */
export function setVolume(bus: PlayerBus, value: number): void {
  audio.setVolume(bus, value);
  const saved = loadVolumes();
  saved[bus] = audio.volume(bus);
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(saved));
  } catch {
    // Storage blocked: the volume holds for this visit.
  }
}

export function titleMusic(): void {
  music("title", 1);
  ambient(null, 1);
}

/** What a place sounds like. */
export interface Soundscape {
  /** The song, or null for none (a scene's silence). */
  readonly music: SongId | null;
  /** The air, or null for none (the hum gone with the lights). */
  readonly ambient: AmbientId | null;
}

/**
 * Music and air by map, the one table to change them in. Maps not listed take theirs from the
 * time their clock stopped at and whether they are indoors; story scenes override all of it with
 * `overrideSoundscape`.
 */
export const SOUNDSCAPES: Readonly<Record<string, Soundscape>> = {
  lawn: { music: "hub", ambient: "campus-afternoon" },
  "campus-yard": { music: "hub", ambient: "campus-afternoon" },
  "campus-field": { music: "field-night", ambient: "field-night" },
  // The 자습실 floor, where the 졸방대 keep the lights on.
  "gaseol-4f": { music: "night-study", ambient: "school-interior" },
  home: { music: "home", ambient: "school-interior" },
};

/** Page 1 maps (ids `p1-…`) all play the era town's song. */
const PAGE1 = "p1-";

/** Maps with a roof over them. */
const INDOORS = new Set([
  "gaseol-1f",
  "gaseol-2f",
  "gaseol-4f",
  "gaseolgwan-stairs",
  "jeungmyeong",
  "cafeteria",
  "lounge",
  "saebyeok",
  "silheom",
  "home",
]);

export function soundscapeFor(mapId: string, time?: { readonly phase: string }): Soundscape {
  const listed = SOUNDSCAPES[mapId];
  if (listed) return listed;
  const night = time?.phase === "night" || time?.phase === "dusk";
  if (mapId.startsWith(PAGE1))
    return { music: "agora", ambient: night ? "field-night" : "campus-afternoon" };
  if (INDOORS.has(mapId))
    return { music: night ? "night-study" : "hub", ambient: "school-interior" };
  return {
    music: night ? "field-night" : "hub",
    ambient: night ? "field-night" : "campus-afternoon",
  };
}

let current: Soundscape | undefined;
let override: Soundscape | undefined;

function apply(fade?: number): void {
  const s = override ?? current;
  if (!s) return;
  music(s.music, fade ?? 2);
  ambient(s.ambient, fade ?? 2.5);
}

let page1Ready = false;

/** A rift's own effects are rendered on the way in, once: the campus never pays for them. */
export function preloadFor(mapId: string): void {
  if (page1Ready || !mapId.startsWith(PAGE1)) return;
  page1Ready = true;
  audio.preload("page1");
}

/** Crossfades to a place's music and air; asking for the playing ones changes nothing. */
export function enterSoundscape(s: Soundscape): void {
  current = s;
  apply();
}

/**
 * A story scene's own music and air, until it hands back with `null`; `fade` in seconds cuts
 * shorter than a place's crossfade (a power cut).
 */
export function overrideSoundscape(s: Soundscape | null, fade?: number): void {
  override = s ?? undefined;
  apply(fade);
}

/** A foot landing. Other players' steps are quieter and placed left or right of the listener. */
export function footstep(surface: Surface, pan = 0, near = 1): void {
  if (near <= 0) return;
  sfx(`step.${surface}`, { pan: Math.max(-1, Math.min(1, pan)), volume: near });
}
