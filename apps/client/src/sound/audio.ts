import { type AmbientId, audio, type Bus, type EffectId, type SongId, type Surface } from "@guago/audio";
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
 * Music and air by map. Maps not listed take theirs from the time their clock stopped at:
 * the night field's theme after dark, the hub theme by day, and the school's indoor hum inside.
 */
const BY_MAP: Readonly<Record<string, Soundscape>> = {
  lawn: { music: "hub", ambient: "campus-afternoon" },
  "campus-yard": { music: "hub", ambient: "campus-afternoon" },
  "campus-field": { music: "field-night", ambient: "field-night" },
};

export function soundscapeFor(
  mapId: string,
  time?: { readonly phase: string },
  indoors = false,
): Soundscape {
  const listed = BY_MAP[mapId];
  if (listed) return listed;
  const night = time?.phase === "night" || time?.phase === "dusk";
  return {
    music: night ? "field-night" : "hub",
    ambient: indoors ? "school-interior" : night ? "field-night" : "campus-afternoon",
  };
}

/** Crossfades to a place's music and air; asking for the playing ones changes nothing. */
export function enterSoundscape(s: Soundscape): void {
  audio.music(s.music, { fade: 2 });
  audio.ambient(s.ambient, { fade: 2.5 });
}

/** A foot landing. Other players' steps are quieter and placed left or right of the listener. */
export function footstep(surface: Surface, pan = 0, near = 1): void {
  if (near <= 0) return;
  audio.play(`step.${surface}`, { pan: Math.max(-1, Math.min(1, pan)), volume: near });
}
