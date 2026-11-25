/**
 * Sounds of the world itself: doors, steps, the cast. Plays through the audio package once the
 * first tap or key has unlocked it, silently before.
 */
import { audio, type EffectId } from "@guago/audio";

let armed = false;

export function playWorld(
  id: EffectId,
  opts: { pitch?: number; volume?: number; pan?: number } = {},
) {
  if (!armed) {
    armed = true;
    audio.unlock();
  }
  try {
    audio.play(id, opts);
  } catch {
    // Audio is a nicety: a browser without Web Audio still walks through doors.
  }
}
