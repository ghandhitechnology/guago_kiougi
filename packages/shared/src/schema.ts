import { type SchemaType, schema, t } from "@colyseus/schema";
import type { Character } from "./api.ts";

/** View tag a client holds only on its own player, for fields nobody else needs. */
export const OWNER_TAG = 1;

/**
 * Synced map state: who is here and what the owner needs of its own character. Everything that
 * moves every tick (monsters, other players' bodies, effects) travels in the fight snapshot
 * instead (`fight/wire.ts`). Positions are in 1/POS_SCALE pixels.
 */

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

/**
 * A player body. Bodies are a fixed pool made with the room and handed from seat to seat, keyed
 * by slot, never by session: a schema instance keeps its ref id for the room's lifetime, ids are
 * never reused, and every patch spends 1 byte on an id under 128 but 3 on one past 255. Pooled
 * bodies keep the moving players on 1-byte ids however many have come and gone.
 */
export const PlayerState = schema(
  {
    /** Session id of the seat using this body; empty while the body is free. */
    sid: t.string(),
    name: t.string(),
    major: t.string(),
    level: t.uint16(),
    look: LookState,
    // The owner's own body and numbers; everyone else sees the body in the snapshot.
    x: t.uint16().view(OWNER_TAG),
    y: t.uint16().view(OWNER_TAG),
    facing: t.uint8().view(OWNER_TAG),
    /** Sequence number of the last input the server applied. */
    seq: t.uint32().view(OWNER_TAG),
    /** Walking speed in px/s, which the owner predicts with. */
    speed: t.float32().view(OWNER_TAG),
    hp: t.float32().view(OWNER_TAG),
    maxHp: t.float32().view(OWNER_TAG),
    shield: t.float32().view(OWNER_TAG),
    exp: t.float32().view(OWNER_TAG),
    /** Control mode, `CONTROL_MODES` index. */
    mode: t.uint8().view(OWNER_TAG),
    /** Tick it was knocked out, plus one; 0 while standing. */
    down: t.uint32().view(OWNER_TAG),
    /** Tick the dodge roll is ready again. */
    dodgeReady: t.uint32().view(OWNER_TAG),
    /** Equipped book ids by slot, for casting by hand. */
    books: t.array("string").view(OWNER_TAG),
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

/** Player bodies a map room holds, which is also its seat count. */
export const MAP_SEATS = 100;

/** Keys of `players` are body slots ("0" to MAP_SEATS - 1). */
export const MapState = schema(
  {
    /** The map this room runs, so the client draws the right one. */
    map: t.string(),
    players: t.map(PlayerState).view(),
  },
  "MapState",
);
export type MapState = SchemaType<typeof MapState>;
