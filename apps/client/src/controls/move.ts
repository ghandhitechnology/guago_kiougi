import { MOVE_MAX } from "@guago/shared";

/**
 * The thumb's stick, for whoever samples movement: x and y in -1..1, already past the deadzone.
 * The joystick writes it; `sampleMove` turns it into the same wire axes the keyboard sends.
 */
export const stick = { x: 0, y: 0, active: false };

export function sampleMove(keys: { sample(): [number, number] }): [number, number] {
  const fromKeys = keys.sample();
  if (!stick.active) return fromKeys;
  return [Math.round(stick.x * MOVE_MAX), Math.round(stick.y * MOVE_MAX)];
}
