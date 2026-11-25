import { type SchemaType, schema, t } from "@colyseus/schema";

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

export const PlayerState = schema(
  {
    x: t.uint16(),
    y: t.uint16(),
    facing: t.uint8(),
    /** Sequence number of the last input the server applied; sent to the owner only. */
    seq: t.uint32().view(OWNER_TAG),
  },
  "Player",
);
export type PlayerState = SchemaType<typeof PlayerState>;

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
