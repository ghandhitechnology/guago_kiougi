/**
 * Getting around (PLAN §10 maps and channels, §6 "Interact", §21): doors, zones and what is in
 * reach, as pure functions over a map's data, and the MapRoom messages that carry them. The
 * server decides every one of them; the client runs the same checks on its predicted position
 * only for instant cosmetic feedback (a fade that starts at the door, a prompt over a thing).
 */
import { TILE_SOLID, type TileCollision } from "./collision.ts";
import { TILE_SIZE } from "./constants.ts";
import type { MessageSchema } from "./messages.ts";
import { Facing } from "./movement.ts";

/** Players one channel of a map holds (PLAN §10). A full channel opens the next. */
export const CHANNEL_SEATS = 60;

/** HTTP route that seats a signed-in character in the room of the map it stands on. */
export const ENTER_PATH = "/api/enter";

/** A rectangle in tiles. */
export interface TileArea {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type FacingName = "down" | "up" | "left" | "right";

const FACINGS: Readonly<Record<FacingName, Facing>> = {
  down: Facing.Down,
  up: Facing.Up,
  left: Facing.Left,
  right: Facing.Right,
};

export function facingOf(name: FacingName): Facing {
  return FACINGS[name];
}

/** Whether the feet at (x, y), in world pixels, stand on a tile of the area. */
export function inArea(area: TileArea, x: number, y: number): boolean {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  return tx >= area.x && ty >= area.y && tx < area.x + area.w && ty < area.y + area.h;
}

/** Pixels from (x, y) to the nearest point of the area; 0 inside it. */
export function distanceToArea(area: TileArea, x: number, y: number): number {
  const T = TILE_SIZE;
  const dx = Math.max(area.x * T - x, 0, x - (area.x + area.w) * T);
  const dy = Math.max(area.y * T - y, 0, y - (area.y + area.h) * T);
  return Math.hypot(dx, dy);
}

// Doors --------------------------------------------------------------------------------------

/** What a step needs of a portal: where it is. */
export interface Doorway {
  readonly rect: TileArea;
}

/**
 * The collision a room walks on: the map's own, with every portal that leads nowhere yet shut
 * like a locked door, and those named in `closed` (maps the Page clock has not opened). Both
 * sides build it the same way, so prediction meets the same doors.
 */
export function shutDoors(
  collision: TileCollision,
  portals: readonly (Doorway & { readonly id?: string; readonly built: boolean })[],
  closed: ReadonlySet<string> = new Set(),
): TileCollision {
  const shut = portals.filter((p) => !p.built || (p.id !== undefined && closed.has(p.id)));
  if (shut.length === 0) return collision;
  const rows = collision.rows.map((r) => [...r]);
  for (const { rect } of shut) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const row = rows[y];
      if (!row) continue;
      for (let x = rect.x; x < rect.x + rect.w; x++)
        if (x >= 0 && x < row.length) row[x] = TILE_SOLID;
    }
  }
  return { w: collision.w, h: collision.h, rows: rows.map((r) => r.join("")) };
}

/**
 * Whether a body standing at (x, y) and facing `facing` is pressed against a shut door: the
 * point just past its collider in that direction lies in a portal that leads nowhere yet.
 */
export function shutDoorAhead(
  portals: readonly (Doorway & { readonly id?: string; readonly built: boolean })[],
  x: number,
  y: number,
  facing: Facing,
  radius: number,
  closed: ReadonlySet<string> = new Set(),
): number {
  const reach = radius + 3;
  const dx = facing === Facing.Left ? -reach : facing === Facing.Right ? reach : 0;
  const dy = facing === Facing.Up ? -reach : facing === Facing.Down ? reach : 0;
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i] as Doorway & { readonly id?: string; readonly built: boolean };
    const shut = !p.built || (p.id !== undefined && closed.has(p.id));
    if (shut && inArea(p.rect, x + dx, y + dy)) return i;
  }
  return -1;
}

/** The first portal under the feet at (x, y), as an index into `portals`, or -1. */
export function portalAt(portals: readonly Doorway[], x: number, y: number): number {
  for (let i = 0; i < portals.length; i++) {
    if (inArea((portals[i] as Doorway).rect, x, y)) return i;
  }
  return -1;
}

export interface DoorStep {
  /** The portal each body stands in now, -1 for none. Feed it back in next tick. */
  readonly inside: ReadonlyMap<string, number>;
  /** Bodies that stepped into a portal this tick, in body order. */
  readonly entered: readonly { readonly id: string; readonly portal: number }[];
  /** Arrivals still holding their doors shut. Feed it back in next tick. */
  readonly arrivals: ReadonlyMap<string, Arrival>;
}

/** Where a body was put down: the far side of a door, a login, a reload. */
export interface Arrival {
  readonly x: number;
  readonly y: number;
}

/** An arrival lets doors open again once the body is this far from where it was put down. */
export const ARRIVAL_CLEAR_PX = 24;

/**
 * Whether an arrival still keeps the doors shut for its body: a door is walked through once, so
 * the key still held from the last door cannot carry the player straight back through the one
 * they came out of. It lets go when the keys let go, or once the body has walked clear of where
 * it was put down while standing in no doorway; then a doorway fires when it is stepped into.
 */
export function arrivalHolds(
  a: Arrival,
  x: number,
  y: number,
  pressing: boolean,
  inDoor: boolean,
): boolean {
  if (!pressing) return false;
  return inDoor || Math.hypot(x - a.x, y - a.y) <= ARRIVAL_CLEAR_PX;
}

/**
 * One tick of doorways, run after the movement step. A portal fires only on the tick a body
 * steps into it from outside: a body put down inside one (arriving on a doormat, logging in
 * where it last stood) has to step out and back in, and a body that stays in a doorway fires
 * once, not every tick. A body missing from `before` counts as having stood where it stands.
 */
export function stepDoors(
  before: ReadonlyMap<string, number>,
  bodies: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    /** A direction is held this tick (`arrivalHolds`); bodies with no arrival may leave it out. */
    readonly pressing?: boolean;
  }[],
  portals: readonly Doorway[],
  arrivals: ReadonlyMap<string, Arrival> = new Map(),
): DoorStep {
  const inside = new Map<string, number>();
  const entered: { id: string; portal: number }[] = [];
  const held = new Map<string, Arrival>();
  for (const b of bodies) {
    const at = portalAt(portals, b.x, b.y);
    const was = before.get(b.id) ?? at;
    inside.set(b.id, at);
    const arrival = arrivals.get(b.id);
    if (arrival && arrivalHolds(arrival, b.x, b.y, b.pressing ?? false, at >= 0)) {
      held.set(b.id, arrival);
      continue;
    }
    if (at >= 0 && at !== was) entered.push({ id: b.id, portal: at });
  }
  return { inside, entered, arrivals: held };
}

// Zones --------------------------------------------------------------------------------------

/** Ids of the zones the feet at (x, y) stand in, in the map's order. */
export function zonesAt(
  zones: readonly { readonly id: string; readonly rect: TileArea }[],
  x: number,
  y: number,
): string[] {
  const out: string[] = [];
  for (const z of zones) if (inArea(z.rect, x, y)) out.push(z.id);
  return out;
}

// Reach --------------------------------------------------------------------------------------

/** How far from the feet a thing can be used: a little over a tile from its edge. */
export const INTERACT_REACH_PX = 20;
/** People are reached from a little further off than things: about two tiles from their feet. */
const PERSON_PX = 10;

/** Something that can be used: an interactable's tile area, or a person standing at a point. */
export type Usable =
  | { readonly kind: "thing"; readonly id: string; readonly rect: TileArea }
  | { readonly kind: "npc"; readonly id: string; readonly x: number; readonly y: number };

/** Pixels from the feet at (x, y) to the usable thing. */
export function reachTo(u: Usable, x: number, y: number): number {
  if (u.kind === "thing") return distanceToArea(u.rect, x, y);
  return Math.max(0, Math.hypot(u.x - x, u.y - y) - PERSON_PX);
}

/** The nearest usable thing within reach of the feet at (x, y); people win ties. */
export function nearestUsable<U extends Usable>(things: readonly U[], x: number, y: number) {
  let best: U | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const u of things) {
    const d = reachTo(u, x, y);
    if (d > INTERACT_REACH_PX) continue;
    if (d < bestD || (d === bestD && u.kind === "npc" && best?.kind !== "npc")) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

// MapRoom messages ---------------------------------------------------------------------------

/** MapRoom message types besides `input` (PLAN §21). */
export const MAP_MESSAGES = {
  /** Client to server: `[n]`, a counter echoed in the answer. The server picks the target. */
  interact: "interact",
  /** Server to client: `Interaction`, the answer to one `interact`. */
  interaction: "interaction",
  /** Server to client: `Transfer`. Leave this room and take the seat in the other one. */
  transfer: "transfer",
  /** Server to everyone in the room: `DoorRattle`, a shut door pushed or a locked hatch tried. */
  door: "door",
  /** Server to everyone in the room: `NpcLine`, a speech bubble over a person. */
  npcLine: "npcLine",
  /** Server to client: `ZoneUpdate`, the zones the player stands in, on change. */
  zones: "zones",
  /** Server to client: `Caught`, a patrol saw the player and put them back at the entrance. */
  caught: "caught",
  /** Server to everyone in the room: `Halt`, a patrol's guard calls out (plays its signature). */
  halt: "halt",
} as const;

/**
 * A seat the server reserved in a room, to be taken with the SDK's `consumeSeatReservation`
 * within the room's reservation time. One use.
 */
export interface SeatTicket {
  readonly name: string;
  readonly sessionId: string;
  readonly roomId: string;
  readonly processId?: string;
  readonly publicAddress?: string;
  readonly devMode?: boolean;
}

/** Where the server seated a character: `ENTER_PATH`'s answer and part of every `Transfer`. */
export interface Seating {
  readonly map: string;
  /** 1 for the first channel of a map. */
  readonly channel: number;
  readonly seat: SeatTicket;
}

/**
 * `ENTER_PATH`'s answer: the seat, and the page's generation. The page presents it when it enters
 * again (`{ gen }` in the request body and in its WorldRoom join options); a page that presents
 * one older than the account's newest page is answered 409 `replaced`, which is final for it.
 */
export interface Entry extends Seating {
  readonly gen: number;
}

/** The player walked through a door: the server saved them on the other side. */
export interface Transfer extends Seating {
  /** The portal they went through, in the map they are leaving. */
  readonly via: string;
}

/**
 * Why a door does not open, for the line said with it: the map behind it is not built yet, the
 * Page clock has not opened it, or it is a locked hatch.
 */
export type DoorRefusal = "door_unbuilt" | "door_closed" | "door_locked";

/** A shut door or a locked hatch shaken: `id` of a portal or an interactable of the map. */
export interface DoorRattle {
  readonly id: string;
  readonly of: "portal" | "thing";
  /** Session of the player who pushed it, empty when it was used, not pushed. */
  readonly sid: string;
  readonly why: DoorRefusal;
}

export interface Caught {
  readonly patrol: string;
  /** Where the player was put back, in pixels. */
  readonly x: number;
  readonly y: number;
}

export interface Halt {
  readonly patrol: string;
}

/** `kind` is where a line comes from: a bark said now and then, or the answer to `interact`. */
export interface NpcLine {
  /** Key of the person in `MapState.npcs`. */
  readonly npc: string;
  /** Narrative text key. */
  readonly text: string;
  readonly kind: "bark" | "talk";
}

export interface ZoneUpdate {
  readonly zones: readonly string[];
}

/**
 * The answer to `interact`. `say`: a person spoke (the line also goes to the room as an
 * `NpcLine`). `read`: a notice or lore object's description (narrative keys). `open`: a station,
 * shop or board to open a panel for. `locked`: a locked hatch or door. `none`: nothing in reach.
 */
export type Interaction =
  | { readonly t: "say"; readonly n: number; readonly npc: string; readonly text: string }
  | {
      readonly t: "read";
      readonly n: number;
      readonly id: string;
      readonly name: string;
      readonly desc: string;
    }
  | { readonly t: "open"; readonly n: number; readonly id: string; readonly kind: string }
  | { readonly t: "locked"; readonly n: number; readonly id: string }
  /** The 급식 counter served (or did not): what the living world answered. */
  | {
      readonly t: "ate";
      readonly n: number;
      readonly id: string;
      readonly result: "ok" | "meal_full" | "sent_home";
    }
  | { readonly t: "none"; readonly n: number };

/** Close code of a map room seat the server ends because its player moved to another map. */
export const CLOSE_MAP_CHANGED = 4020;

/** The largest `interact` counter. */
export const MAX_INTERACT_N = 0x7fffffff;

/** `interact` is `[n]`; a malformed one drops the client like any invalid message. */
export const interactMessage: MessageSchema<number> = {
  "~standard": {
    version: 1,
    vendor: "guago",
    validate(value: unknown) {
      if (!Array.isArray(value) || value.length !== 1) {
        return { issues: [{ message: "interact is [n]" }] };
      }
      const n = value[0] as unknown;
      if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > MAX_INTERACT_N) {
        return { issues: [{ message: "interact n is a whole number" }] };
      }
      return { value: n as number };
    },
  },
};
