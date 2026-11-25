import type { Account, Character } from "./backend/index.ts";

/** What the front end hands the world scene: who signed in, and who they play. */
export interface WorldEntry {
  readonly account: Account;
  readonly character: Character;
}

export const WORLD_SCENE = "world";
export const FRONT_SCENE = "front";
export const UI_SCENE = "ui";
