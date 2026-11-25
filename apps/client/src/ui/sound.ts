/**
 * The one place UI code asks for a sound: each name plays `ui.<name>` from `@guago/audio`, which
 * `startAudio` connects with `setUiSoundPlayer`.
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
  | "stamp"
  | "toast";

let player: ((name: UiSound) => void) | undefined;

export function sound(name: UiSound): void {
  player?.(name);
}

export function setUiSoundPlayer(play: ((name: UiSound) => void) | undefined): void {
  player = play;
}
