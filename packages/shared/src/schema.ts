import { type SchemaType, schema, t } from "@colyseus/schema";
import type { Character } from "./api.ts";

/** View tag a client holds only on its own player, for fields nobody else needs. */
export const OWNER_TAG = 1;

/**
 * Synced map state: who is here and the owner's numbers that change now and then. Everything
 * that changes every tick (bodies, monsters, effects, the owner's own position and health)
 * travels in the fight snapshot instead (`fight/wire.ts`).
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
    /** The 동아리 shown under the name (PLAN §12): its id, or 0 for none. */
    clubId: t.uint32(),
    club: t.string(),
    /** 과잠 colour, a `jacket` swap slot option, and back emblem (`encodeEmblem` form). */
    jacket: t.string(),
    emblem: t.string(),
    // The owner's numbers that change now and then. Its body, health and shield change every
    // tick and travel in its snapshot's Self record (`fight/wire.ts`); everyone else sees the
    // body in the snapshot.
    /** Walking speed in px/s, which the owner predicts with. */
    speed: t.float32().view(OWNER_TAG),
    maxHp: t.float32().view(OWNER_TAG),
    exp: t.float32().view(OWNER_TAG),
    /** Control mode, `CONTROL_MODES` index. */
    mode: t.uint8().view(OWNER_TAG),
    /** Tick it was knocked out, plus one; 0 while standing. */
    down: t.uint32().view(OWNER_TAG),
    /** Tick the dodge roll is ready again. */
    dodgeReady: t.uint32().view(OWNER_TAG),
    /** Equipped book ids by slot, for casting by hand. */
    books: t.array("string").view(OWNER_TAG),
    /** Tick each book slot is ready again (at or before now: ready). */
    ready: t.array("uint32").view(OWNER_TAG),
    /** Each book slot's whole cooldown in ticks at the current attack speed. */
    cooldown: t.array("uint16").view(OWNER_TAG),
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

/** Puts a character's club on its synced player, or takes it off. Fields change only if needed. */
export function wearClub(
  player: PlayerState,
  club: { id: number; name: string; jacket: string; emblem: string } | undefined,
): void {
  player.clubId = club?.id ?? 0;
  player.club = club?.name ?? "";
  player.jacket = club?.jacket ?? "";
  player.emblem = club?.emblem ?? "";
}

/**
 * A cast member standing on the map (PLAN §3 recurring cast): never moves, turns to face a
 * player who comes close. Every client in the room sees every one.
 */
export const NpcState = schema(
  {
    /** Narrative speaker id. */
    speaker: t.string(),
    x: t.uint16(),
    y: t.uint16(),
    facing: t.uint8(),
  },
  "Npc",
);
export type NpcState = SchemaType<typeof NpcState>;

/** Player bodies a map room holds: the most seats a channel can be given. */
export const MAP_SEATS = 100;

/**
 * Keys of `players` are body slots ("0" to MAP_SEATS - 1), keys of `npcs` are the map's NPC spot
 * indices. `map` and `channel` say which room this is. Bodies and monsters move in the fight
 * snapshot (`fight/wire.ts`), not here.
 */
export const MapState = schema(
  {
    /** The map this room runs, so the client draws the right one. */
    map: t.string(),
    players: t.map(PlayerState).view(),
    channel: t.uint8(),
    npcs: t.map(NpcState),
    /** Ids of built portals whose map the Page clock has not opened yet: shut like unbuilt ones. */
    closed: t.array("string"),
  },
  "MapState",
);
export type MapState = SchemaType<typeof MapState>;
