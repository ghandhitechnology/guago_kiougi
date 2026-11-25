/**
 * The 콜로세움 on the wire (PLAN §14, §21): challenges, the casual queue, the ready check, the
 * floor's state for everyone in the room, the result and the per-character record.
 *
 * Requests go to the WorldRoom in the social shape: each carries `n` and gets exactly one `done`
 * (`Done`, with the request's data if any) or one `refused` (`Refusal` with a `DuelErrorCode` or
 * a shared code). Changes are pushed on the WorldRoom's `duel` message (`DuelEvent`) to the
 * players involved. What happens on a floor goes to everyone in that map room on its `duel`
 * message (`FloorView`): fighters and spectators read the same thing. Movement, hits and health
 * travel in the fight snapshot as always; a fighter's statuses ride its member record.
 */
import { type WorldMessageSchema, worldSchema } from "./chat.ts";
import { DUEL_MODES, type DuelMode } from "./fight/duel.ts";
import { isCharacterId } from "./social.ts";

export { DUEL_ERRORS, type DuelErrorCode } from "./duel-errors.ts";

/** WorldRoom push type for `DuelEvent`; map room message type for `FloorView`. */
export const DUEL_MESSAGES = { push: "duel", floor: "duel" } as const;

/** Each request's body (all also carry `n`) and what its `done` answer holds. */
export interface DuelRequests {
  /** A 1v1 challenge to the player with that character id (the 결투 action on a player card). */
  "duel.challenge": { req: { id: string }; done: { challenge: number } };
  "duel.accept": { req: { id: number }; done: undefined };
  "duel.decline": { req: { id: number }; done: undefined };
  /** Takes back your own challenge. */
  "duel.withdraw": { req: Record<string, never>; done: undefined };
  /** Into the casual queue; a party's leader queues the party (3v3, up to three members). */
  "duel.queue": { req: { mode: DuelMode }; done: undefined };
  /** Out of the queue (the whole party, when its leader leaves it). */
  "duel.unqueue": { req: Record<string, never>; done: undefined };
  /** Accept or refuse a match the queue found. */
  "duel.ready": { req: { id: number }; done: undefined };
  "duel.refuse": { req: { id: number }; done: undefined };
  /** Concede the match you are fighting: a loss for you, your side plays on without you. */
  "duel.forfeit": { req: Record<string, never>; done: undefined };
  /** Duels played and won, for a player card. */
  "duel.record": { req: { id: string }; done: DuelRecord };
}

export type DuelType = keyof DuelRequests;
export type DuelRequest<K extends DuelType> = DuelRequests[K]["req"] & { n: number };

export interface DuelRecord {
  played: number;
  won: number;
}

/** How fast each request may be sent, per character (PLAN §12 rate limits). */
export const DUEL_RATE: Readonly<Record<DuelType, { burst: number; perSecond: number }>> = {
  "duel.challenge": { burst: 3, perSecond: 1 / 15 },
  "duel.accept": { burst: 5, perSecond: 1 },
  "duel.decline": { burst: 10, perSecond: 1 },
  "duel.withdraw": { burst: 5, perSecond: 1 },
  "duel.queue": { burst: 3, perSecond: 1 / 5 },
  "duel.unqueue": { burst: 5, perSecond: 1 },
  "duel.ready": { burst: 5, perSecond: 1 },
  "duel.refuse": { burst: 5, perSecond: 1 },
  "duel.forfeit": { burst: 3, perSecond: 1 },
  "duel.record": { burst: 10, perSecond: 2 },
};

export interface DuelPerson {
  /** Character id. */
  id: string;
  name: string;
}

/** A match's sides: index 0 is side 1, index 1 side 2. */
export type DuelSides = [DuelPerson[], DuelPerson[]];

export interface DuelResultView {
  /** 1 or 2; 0 for a draw. */
  winner: number;
  rounds: { winner: number; seconds: number; end: "ko" | "time" | "forfeit" }[];
  /** Seconds of fighting over every round. */
  seconds: number;
  fighters: {
    id: string;
    name: string;
    team: number;
    damage: number;
    hits: number;
    downs: number;
    forfeited: boolean;
  }[];
}

/** WorldRoom pushes on `duel`, to the players a change concerns. */
export type DuelEvent =
  /** To the challenged player: answer with `duel.accept` or `duel.decline` before `expiresAt`. */
  | { t: "challenged"; id: number; from: DuelPerson; expiresAt: number }
  /** To the challenger, once sent. */
  | { t: "challenge"; id: number; to: DuelPerson; expiresAt: number }
  /** To both: the challenge is over. `accepted` is followed by `match`. */
  | {
      t: "challengeEnded";
      id: number;
      why: "accepted" | "declined" | "expired" | "withdrawn" | "busy";
    }
  /** To every queued member of a queue entry. */
  | { t: "queued"; mode: DuelMode; since: number; with: DuelPerson[] }
  | { t: "unqueued"; why: "left" | "found" | "party" | "offline" }
  /** The queue found a match: answer `duel.ready` or `duel.refuse` before `expiresAt`. */
  | { t: "found"; id: number; mode: DuelMode; expiresAt: number; you: number; sides: DuelSides }
  /** Who has accepted so far, by character id. */
  | { t: "ready"; id: number; accepted: string[] }
  /** The found match will not be played. Those who accepted are back in the queue (`queued`). */
  | { t: "cancelled"; id: number; why: "refused" | "lapsed" | "offline" | "no_floor" }
  /**
   * The match is on: the floor is `map` channel `channel`. A fighter standing elsewhere is moved
   * there at once (the map room's `transfer`); the floor's own messages follow.
   */
  | {
      t: "match";
      id: number;
      mode: DuelMode;
      map: string;
      channel: number;
      you: number;
      sides: DuelSides;
    }
  /** The match is decided; everyone is put back where they stood shortly after. */
  | { t: "over"; id: number; result: DuelResultView }
  /** Your record after a match was written. */
  | { t: "record"; record: DuelRecord };

/** A floor's phase, as the map room tells everyone in it. */
export const FLOOR_PHASES = ["idle", "arriving", "countdown", "fight", "pause", "over"] as const;
export type FloorPhase = (typeof FLOOR_PHASES)[number];

/**
 * Map room message `duel`, to everyone in the room: on joining and whenever the floor changes.
 * Ticks are the fight's own (`FightWorld.tick`, the snapshot's stamp).
 */
export interface FloorView {
  /** The floor's id in the map's `arenas`. */
  arena: string;
  /** 0 while no match holds the floor. */
  match: number;
  mode: DuelMode | "";
  phase: FloorPhase;
  round: number;
  /** Rounds won by side 1 and side 2. */
  score: [number, number];
  /** Tick the phase ends at: the countdown's end, the round clock, the pause; 0 for none. */
  endsAt: number;
  /** `sid` is the fighter's session in this room, for its body; empty until it arrives. */
  fighters: { id: string; name: string; sid: string; team: number; out: boolean }[];
  /** Set in `over`. */
  result?: DuelResultView;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isRowId = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= 2 ** 52;

const CHECKS: {
  [K in DuelType]: [keys: string[], check: (v: Record<string, unknown>) => boolean];
} = {
  "duel.challenge": [["id"], (v) => isCharacterId(v.id)],
  "duel.accept": [["id"], (v) => isRowId(v.id)],
  "duel.decline": [["id"], (v) => isRowId(v.id)],
  "duel.withdraw": [[], () => true],
  "duel.queue": [
    ["mode"],
    (v) => typeof v.mode === "string" && (DUEL_MODES as readonly string[]).includes(v.mode),
  ],
  "duel.unqueue": [[], () => true],
  "duel.ready": [["id"], (v) => isRowId(v.id)],
  "duel.refuse": [["id"], (v) => isRowId(v.id)],
  "duel.forfeit": [[], () => true],
  "duel.record": [["id"], (v) => isCharacterId(v.id)],
};

export const DUEL_TYPES = Object.keys(CHECKS) as DuelType[];

/** The validator the WorldRoom checks a duel request against; malformed drops the client. */
export function duelSchema<K extends DuelType>(type: K): WorldMessageSchema<DuelRequest<K>> {
  const [keys, check] = CHECKS[type];
  const allowed = [...keys, "n"];
  return worldSchema<DuelRequest<K>>((value) => {
    if (!isObject(value) || !only(value, allowed)) return `${type} has unknown fields`;
    if (!isCount(value.n)) return "n is a whole number";
    return check(value) ? (value as DuelRequest<K>) : `malformed ${type}`;
  });
}
