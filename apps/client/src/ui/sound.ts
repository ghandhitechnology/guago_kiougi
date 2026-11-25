/**
 * The one place UI code asks for a sound. Silent until the audio engine connects a player with
 * `setUiSoundPlayer`; every interaction already calls it, so wiring audio touches nothing else.
 */
export type UiSound =
  | "open"
  | "close"
  | "hover"
  | "select"
  | "confirm"
  | "error"
  | "tab"
  | "type"
  | "page"
  | "stamp";

let player: ((name: UiSound) => void) | undefined;

export function sound(name: UiSound): void {
  player?.(name);
}

export function setUiSoundPlayer(play: ((name: UiSound) => void) | undefined): void {
  player = play;
}
