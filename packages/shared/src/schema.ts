import { type SchemaType, schema, t } from "@colyseus/schema";
import type { Character } from "./api.ts";

/** Synced map state. Positions are whole world pixels; the client interpolates between patches. */
export const MonsterState = schema(
  {
    kind: t.string(),
    x: t.uint16(),
    y: t.uint16(),
    facing: t.uint8(),
  },
  "Monster",
);
export type MonsterState = SchemaType<typeof MonsterState>;

/** A student look as drawn by other clients; ids as in `Look` (api.ts). */
export const LookState = schema(
  {
    body: t.string(),
    hair: t.string(),
    hairColor: t.string(),
    face: t.string(),
    uniform: t.string(),
    accessories: t.array("string"),
  },
  "Look",
);
export type LookState = SchemaType<typeof LookState>;

export const PlayerState = schema(
  {
    x: t.uint16(),
    y: t.uint16(),
    name: t.string(),
    major: t.string(),
    look: LookState,
  },
  "Player",
);
export type PlayerState = SchemaType<typeof PlayerState>;

/** Copies what other clients need to draw a character onto its synced player. */
export function dressPlayer(player: PlayerState, character: Character): void {
  const { look } = character;
  const synced = new LookState();
  synced.body = look.body;
  synced.hair = look.hair;
  synced.hairColor = look.hairColor;
  synced.face = look.face;
  synced.uniform = look.uniform;
  synced.accessories.push(...look.accessories);
  player.name = character.name;
  player.major = character.major;
  player.look = synced;
}

/** Keys of `monsters` are monster ids, keys of `players` are session ids. */
export const MapState = schema(
  {
    tick: t.uint32(),
    monsters: t.map(MonsterState),
    players: t.map(PlayerState),
  },
  "MapState",
);
export type MapState = SchemaType<typeof MapState>;
