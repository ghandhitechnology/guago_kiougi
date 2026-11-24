import { type SchemaType, schema, t } from "@colyseus/schema";

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

export const PlayerState = schema(
  {
    x: t.uint16(),
    y: t.uint16(),
  },
  "Player",
);
export type PlayerState = SchemaType<typeof PlayerState>;

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
