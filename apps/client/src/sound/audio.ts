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

/** Arms audio once at start-up: sound begins on the first tap or key. */
export function startAudio(): void {
  for (const [bus, v] of Object.entries(loadVolumes())) {
    if (typeof v === "number") audio.setVolume(bus as Bus, v);
  }
  audio.unlock();
  setUiSoundPlayer((name) => audio.play(`ui.${name}` as EffectId));
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
  audio.music("title", { fade: 1 });
  audio.ambient(null);
}

/** What a place sounds like. */
export interface Soundscape {
  readonly music: SongId;
  readonly ambient: AmbientId;
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
  agora: { music: "agora", ambient: "campus-afternoon" },
};

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
  if (INDOORS.has(mapId))
    return { music: night ? "night-study" : "hub", ambient: "school-interior" };
  return {
    music: night ? "field-night" : "hub",
    ambient: night ? "field-night" : "campus-afternoon",
  };
}

let current: Soundscape | undefined;
let override: Soundscape | undefined;

function apply(): void {
  const s = override ?? current;
  if (!s) return;
  audio.music(s.music, { fade: 2 });
  audio.ambient(s.ambient, { fade: 2.5 });
}

/** Crossfades to a place's music and air; asking for the playing ones changes nothing. */
export function enterSoundscape(s: Soundscape): void {
  current = s;
  apply();
}

/** A story scene's own music and air, until it hands back with `null`. */
export function overrideSoundscape(s: Soundscape | null): void {
  override = s ?? undefined;
  apply();
}

/** A foot landing. Other players' steps are quieter and placed left or right of the listener. */
export function footstep(surface: Surface, pan = 0, near = 1): void {
  if (near <= 0) return;
  audio.play(`step.${surface}`, { pan: Math.max(-1, Math.min(1, pan)), volume: near });
}
