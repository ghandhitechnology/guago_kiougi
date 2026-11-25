import { type SchemaType, schema, t } from "@colyseus/schema";
import type { Character } from "./api.ts";

/** View tag a client holds only on its own player, for fields nobody else needs. */
export const OWNER_TAG = 1;

/**
 * Synced map state. Positions are in 1/POS_SCALE pixels. Entities sit in view-gated collections:
 * a client receives only what its interest cells hold.
 */
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
    facing: t.uint8(),
    /** Sequence number of the last input the server applied; sent to the owner only. */
    seq: t.uint32().view(OWNER_TAG),
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
    monsters: t.map(MonsterState).view(),
    players: t.map(PlayerState).view(),
  },
  "MapState",
);
export type MapState = SchemaType<typeof MapState>;
