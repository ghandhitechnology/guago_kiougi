/**
 * Fights a map room runs besides its field (PLAN §4 opening, §10 raid): a boss arena's shared
 * raid, a 복습 alone, the opening's stairs and golem. Each lives in its own module and is listed
 * in `encounters.ts`; the room asks `encounterFor` once at creation and calls the encounter at
 * fixed points, so `map-room.ts` knows nothing of bosses or tutorials.
 */
import type { BuiltMap } from "@guago/content";
import type { Between, FightMap, FightWorld, Player } from "@guago/shared";
import type { MapRoomOptions } from "./channels.ts";

/** What an encounter may ask of its room. */
export interface EncounterHost {
  readonly world: FightWorld;
  readonly def: BuiltMap;
  readonly options: MapRoomOptions;
  /** The character a seated body belongs to. */
  characterOf(p: Player): string | undefined;
  /** The display name of a seated body's character. */
  nameOf(p: Player): string | undefined;
  /** Sends a character standing here to another map (`MapRoom.relocate`). */
  relocate(characterId: string, to: string, spawn: string, via: string): boolean;
  /** Sends a character standing here to an exact spot on another map (after a 복습). */
  sendTo(
    characterId: string,
    to: { map: string; x: number; y: number; facing: number },
    via: string,
  ): boolean;
  /** The tick a seated body's player last sent an input of its own (0 for never). */
  inputAt(p: Player): number;
  /** Queues a record the room applies at the next tick's start, where a replay finds it. */
  between(e: Between): void;
}

/** One room's running encounter. */
export interface Encounter {
  /** After each step and before the snapshot: read the step's events, move shared state. */
  afterStep(): void;
  /** A body was seated. */
  joined?(p: Player, characterId: string): void;
  /** A body is about to be taken out of the world. */
  leaving?(p: Player, characterId: string): void;
  /** Knock-outs here cost no 벌점 (a boss arena wakes them at its entrance, PLAN §10). */
  readonly noDemerit?: boolean;
  dispose(): void;
}

/** A kind of encounter: which rooms run it, and how. */
export interface EncounterKind {
  readonly id: string;
  matches(def: BuiltMap, options: MapRoomOptions): boolean;
  /** The fight map before the world is made from it (the opening's stairs drop their safe floor). */
  map?(map: FightMap, options: MapRoomOptions): FightMap;
  create(host: EncounterHost): Encounter;
}
