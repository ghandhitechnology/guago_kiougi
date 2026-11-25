/**
 * The 콜로세움's matchmaking (PLAN §14): direct 1v1 challenges, the casual queue for 1v1 and 3v3
 * (a party of up to three queues together; solo players are matched into threes), the ready
 * check, choosing a floor, moving the fighters there, the result, the record, and putting
 * everyone back where they stood. All in memory in the one process; the record is written once
 * per match, off the tick.
 *
 * Requests follow the social shape: one `done` or one `refused` each, changes pushed on `duel`.
 * A block either way keeps two players apart: a blocked player's challenge is answered like any
 * other and lapses, never stored against the target, and the queue never puts them in one match.
 *
 * A match is a closed bracket (`bracket.ts`): each fighter's state is taken once when the match
 * is made, in the room it stands in, and put back once through `exit`, whichever way it leaves:
 * a result, a concession, a drop, a logout, a door, a closing room or a deadline. The origin is
 * also kept in the database while the match lasts (`origins.ts`) so a crash cannot strand anyone.
 */
import { matchMaker } from "@colyseus/core";
import {
  DUEL_ACCEPT_SECONDS,
  DUEL_CHALLENGE_SECONDS,
  DUEL_CHALLENGES_IN_CAP,
  DUEL_FLOORS_MAX,
  DUEL_FORFEIT_WIN_SECONDS,
  DUEL_PAIR_WINS_DAILY,
  DUEL_QUEUE_LOCK_SECONDS,
  duelMarks,
} from "@guago/content";
import {
  DUEL_MESSAGES,
  DUEL_RATE,
  DUEL_TYPES,
  type DuelEvent,
  type DuelMode,
  type DuelPerson,
  type DuelRequest,
  type DuelResultView,
  type DuelSides,
  type DuelType,
  duelSchema,
  type Refusal,
  type RefusalCode,
  TEAM_SIZE,
  WORLD_MESSAGES,
  type WorldMessageSchema,
} from "@guago/shared";
import { background } from "../background.ts";
import { Buckets } from "../economy/buckets.ts";
import { parties } from "../parties.ts";
import { places } from "../places.ts";
import { HOME_MAP } from "../world-maps.ts";
import type { Before } from "./bracket.ts";
import type { FloorEvents, FloorHost, FloorMatch, Leaving } from "./floor.ts";
import { type DuelOrigins, memoryOrigins } from "./origins.ts";
import type { DuelRecords } from "./records.ts";

/** What the WorldRoom lends, as it does to trading. */
export interface DuelHost {
  on<T>(
    type: string,
    schema: WorldMessageSchema<T>,
    run: (characterId: string, message: T) => Promise<{ type: string; body: unknown }>,
  ): void;
  member(characterId: string): { name: string; level: number } | undefined;
  send(characterId: string, type: string, body: unknown): void;
  blocked(owner: string, other: string): boolean;
}

/** Why a character may not be pulled into a duel from where it stands, or `ok`. */
export type DuelReadiness = "ok" | "duel_not_here" | "duel_in_combat";

/** What the hub asks of a map room (`MapRoom` lends it; tests lend their own). */
export interface DuelRoom {
  readonly roomId: string;
  readonly mapId: string;
  readonly channel: number;
  duelReady(characterId: string): DuelReadiness;
  /** Whether `n` fighters on their way still fit. */
  seatsFor(n: number): boolean;
  /** The character's state as the bracket keeps it, if it stands here. */
  snapshot(characterId: string): Before | undefined;
  /** Its own kit, level, mode and party, then `before`'s numbers, on its body here. */
  restoreFromDuel(characterId: string, before: Before): boolean;
  sendTo(
    characterId: string,
    to: { map: string; x: number; y: number; roomId?: string; via: string },
  ): boolean;
  teleport(characterId: string, x: number, y: number): boolean;
}

/** How the hub reaches map rooms: the floors register here, fighters are moved through rooms. */
export interface DuelRooms {
  /** A new channel of `map` for a floor when every floor is busy; resolves once it registered. */
  openChannel(map: string): Promise<void>;
  room(roomId: string): DuelRoom | undefined;
}

type Answer = { type: string; body: unknown };
const done = (type: string, n: number, data?: unknown): Answer => ({
  type: WORLD_MESSAGES.done,
  body: { type, n, ...(data === undefined ? {} : { data }) },
});
const refused = (type: string, n: number, code: RefusalCode, retryMs?: number): Answer => ({
  type: WORLD_MESSAGES.refused,
  body: { type, n, code, ...(retryMs ? { retryMs } : {}) } satisfies Refusal,
});

interface Challenge {
  readonly id: number;
  readonly from: string;
  readonly to: string;
  readonly expiresAt: number;
  /**
   * The target blocked the challenger: the challenger sees an ordinary challenge that lapses;
   * it is never stored against the target, never counted in its inbox, never shown to it.
   */
  readonly silent: boolean;
  timer: ReturnType<typeof setTimeout>;
}

interface Entry {
  readonly mode: DuelMode;
  readonly members: string[];
  readonly since: number;
}

interface Pending {
  readonly id: number;
  readonly mode: DuelMode;
  readonly sides: [string[], string[]];
  readonly entries: Entry[];
  readonly accepted: Set<string>;
  readonly expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

interface Match extends FloorMatch {
  readonly sides: [string[], string[]];
  floor: FloorHost | null;
  /** Each fighter as it was the instant before the match. */
  readonly before: Map<string, Before>;
  /** Fighters that have left the match: put back already, never again. */
  readonly exited: Set<string>;
  /** The queue entries it was made from, to put back at the front if no floor takes it. */
  readonly entries: readonly Entry[];
}

/** The map every floor is on. */
export const ARENA_MAP = "saebyeok";

export interface DuelingOptions {
  records: DuelRecords;
  rooms: DuelRooms;
  /** Where fighters stood, kept while their match lasts; in memory without a database. */
  origins?: DuelOrigins;
  /** Matchmaking runs this often. */
  everyMs?: number;
  /** Checks the hub's invariants on every sweep and logs any break (local development). */
  strict?: boolean;
  now?: () => number;
}

/** Characters put back from a match but not yet home are remembered this long. */
const PENDING_MS = 15 * 60_000;

export function createDueling({
  records,
  rooms,
  origins = memoryOrigins(),
  everyMs = 1000,
  strict = false,
  now = Date.now,
}: DuelingOptions) {
  let host: DuelHost | undefined;
  let nextId = 1;
  const buckets = new Buckets();
  const floors = new Map<string, FloorHost>();
  const challenges = new Map<number, Challenge>();
  const outgoing = new Map<string, Challenge>();
  const queues: Record<DuelMode, Entry[]> = { "1v1": [], "3v3": [] };
  const queued = new Map<string, Entry>();
  const pendings = new Map<number, Pending>();
  const inPending = new Map<string, Pending>();
  const matches = new Map<number, Match>();
  const inMatch = new Map<string, Match>();
  const locks = new Map<string, number>();
  /** Put back from a match while away from the room it came from: made good where it next sits. */
  const pending = new Map<string, { before: Before; at: number }>();
  /** Wins counted today by lineup (winners, then losers, sorted), for the per-pair cap. */
  const pairWins = new Map<string, number>();
  let sweep: ReturnType<typeof setInterval> | undefined;
  let opening: Promise<void> | null = null;

  const push = (id: string, e: DuelEvent) => host?.send(id, DUEL_MESSAGES.push, e);
  const person = (id: string): DuelPerson => ({ id, name: host?.member(id)?.name ?? "" });
  const online = (id: string) => host?.member(id) !== undefined;
  const blockedEither = (a: string, b: string) =>
    (host?.blocked(a, b) ?? false) || (host?.blocked(b, a) ?? false);

  /**
   * Whether a character may be pulled into a duel from where it stands right now: seated, on its
   * feet, out of a fight, and not on a hunting field's open ground, in a 위험 구역, on a boss
   * floor or in the 집 (`MapRoom.duelReady`).
   */
  function readiness(id: string): DuelReadiness {
    const place = places.get(id);
    if (!place || place.mapId === HOME_MAP) return "duel_not_here";
    const room = rooms.room(place.roomId);
    return room ? room.duelReady(id) : "duel_not_here";
  }
  const canDuelHere = (id: string) => readiness(id) === "ok";

  function busy(id: string): boolean {
    return outgoing.has(id) || queued.has(id) || inPending.has(id) || inMatch.has(id);
  }

  // ── Challenges ─────────────────────────────────────────────────────────────

  function endChallenge(
    c: Challenge,
    why: Extract<DuelEvent, { t: "challengeEnded" }>["why"],
  ): void {
    if (challenges.get(c.id) !== c) return;
    clearTimeout(c.timer);
    challenges.delete(c.id);
    if (outgoing.get(c.from) === c) outgoing.delete(c.from);
    push(c.from, { t: "challengeEnded", id: c.id, why });
    if (!c.silent) push(c.to, { t: "challengeEnded", id: c.id, why });
  }

  /** Challenges waiting on a player: hidden ones from players it blocked are not among them. */
  function incomingTo(id: string): Challenge[] {
    return [...challenges.values()].filter((c) => c.to === id && !c.silent);
  }

  function challenge(me: string, m: DuelRequest<"duel.challenge">): Answer {
    const type = "duel.challenge";
    const target = m.id;
    if (target === me) return refused(type, m.n, "target_self");
    if (busy(me)) return refused(type, m.n, "duel_busy");
    const here = readiness(me);
    if (here !== "ok") return refused(type, m.n, here);
    // A target that blocked the challenger tells it nothing, not even whether it is online or
    // busy: the challenge is answered and lapses like any unanswered one.
    const silent = online(target) && (host?.blocked(target, me) ?? false);
    if (!silent) {
      if (!online(target)) return refused(type, m.n, "target_offline");
      if (host?.blocked(me, target)) return refused(type, m.n, "blocked");
      if (
        inPending.has(target) ||
        inMatch.has(target) ||
        incomingTo(target).length >= DUEL_CHALLENGES_IN_CAP
      ) {
        return refused(type, m.n, "duel_target_busy");
      }
    }
    const id = nextId++;
    const expiresAt = now() + DUEL_CHALLENGE_SECONDS * 1000;
    const c: Challenge = {
      id,
      from: me,
      to: target,
      expiresAt,
      silent,
      timer: setTimeout(() => endChallenge(c, "expired"), DUEL_CHALLENGE_SECONDS * 1000),
    };
    challenges.set(id, c);
    outgoing.set(me, c);
    push(me, { t: "challenge", id, to: person(target), expiresAt });
    if (!c.silent) push(target, { t: "challenged", id, from: person(me), expiresAt });
    return done(type, m.n, { challenge: id });
  }

  function accept(me: string, m: DuelRequest<"duel.accept">): Answer {
    const type = "duel.accept";
    const c = challenges.get(m.id);
    if (!c || c.to !== me || c.silent) return refused(type, m.n, "duel_no_challenge");
    if (inPending.has(me) || inMatch.has(me) || outgoing.has(me))
      return refused(type, m.n, "duel_busy");
    if (!online(c.from) || inPending.has(c.from) || inMatch.has(c.from) || queued.has(c.from)) {
      endChallenge(c, "busy");
      return refused(type, m.n, "duel_target_busy");
    }
    // A block made since the challenge was sent ends it, without saying who blocked whom.
    if (blockedEither(me, c.from)) {
      endChallenge(c, "expired");
      return refused(type, m.n, "duel_no_challenge");
    }
    const mine = readiness(me);
    if (mine !== "ok") return refused(type, m.n, mine);
    if (!canDuelHere(c.from)) return refused(type, m.n, "duel_not_here");
    // Accepting takes the player out of the queue, and its party's entry with it.
    leaveQueue(me, "left");
    endChallenge(c, "accepted");
    background("duel start", startMatch("1v1", [[c.from], [me]], []));
    return done(type, m.n);
  }

  // ── The queue ──────────────────────────────────────────────────────────────

  function leaveQueue(id: string, why: Extract<DuelEvent, { t: "unqueued" }>["why"]): void {
    const e = queued.get(id);
    if (!e) return;
    const list = queues[e.mode];
    const at = list.indexOf(e);
    if (at >= 0) list.splice(at, 1);
    for (const member of e.members) {
      queued.delete(member);
      push(member, { t: "unqueued", why: member === id ? why : why === "left" ? "party" : why });
    }
  }

  function enqueue(e: Entry, front = false): void {
    if (front) queues[e.mode].unshift(e);
    else queues[e.mode].push(e);
    for (const member of e.members) {
      queued.set(member, e);
      push(member, {
        t: "queued",
        mode: e.mode,
        since: e.since,
        with: e.members.filter((x) => x !== member).map(person),
      });
    }
  }

  function queue(me: string, m: DuelRequest<"duel.queue">): Answer {
    const type = "duel.queue";
    if (busy(me)) return refused(type, m.n, "duel_busy");
    const lockedFor = (locks.get(me) ?? 0) - now();
    if (lockedFor > 0) return refused(type, m.n, "duel_queue_locked", lockedFor);
    let members = [me];
    const party = parties.of(me);
    if (m.mode === "3v3" && party && party.members.length > 1) {
      if (party.leader !== me) return refused(type, m.n, "not_leader");
      if (party.members.length > TEAM_SIZE["3v3"]) return refused(type, m.n, "duel_party_size");
      members = [...party.members];
    }
    for (const id of members) {
      if (id !== me && (!online(id) || busy(id) || (locks.get(id) ?? 0) > now())) {
        return refused(type, m.n, "duel_target_busy");
      }
      const here = readiness(id);
      if (here !== "ok") return refused(type, m.n, id === me ? here : "duel_target_busy");
    }
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (blockedEither(members[i] as string, members[j] as string))
          return refused(type, m.n, "blocked");
      }
    }
    enqueue({ mode: m.mode, members, since: now() });
    matchmake();
    return done(type, m.n);
  }

  /** Whether two groups may meet in one match: nobody in one blocked anybody in the other. */
  function compatible(a: readonly string[], b: readonly string[]): boolean {
    for (const x of a) for (const y of b) if (blockedEither(x, y)) return false;
    return true;
  }

  /** Pulls an entry whose members can no longer duel; true when it stays. */
  function stillGood(e: Entry): boolean {
    if (e.members.every((id) => online(id) && canDuelHere(id))) return true;
    for (const id of e.members) {
      queued.delete(id);
      push(id, { t: "unqueued", why: "offline" });
    }
    const list = queues[e.mode];
    const at = list.indexOf(e);
    if (at >= 0) list.splice(at, 1);
    return false;
  }

  /** Oldest first: a side of `size` from whole entries, nobody blocking anybody. */
  function side(list: Entry[], size: number, against: readonly string[]): Entry[] | null {
    const picked: Entry[] = [];
    let n = 0;
    for (const e of list) {
      if (n + e.members.length > size) continue;
      const members = picked.flatMap((p) => p.members);
      if (!compatible(members, e.members) || !compatible(against, e.members)) continue;
      // Within a side, members of different entries must not block each other either.
      picked.push(e);
      n += e.members.length;
      if (n === size) return picked;
    }
    return null;
  }

  function matchmake(): void {
    for (const mode of ["1v1", "3v3"] as const) {
      const list = queues[mode];
      for (const e of [...list]) stillGood(e);
      for (;;) {
        const size = TEAM_SIZE[mode];
        let made = false;
        for (let i = 0; i < list.length && !made; i++) {
          const first = list.slice(i);
          const a = side(first, size, []);
          if (!a) continue;
          const rest = list.filter((e) => !a.includes(e));
          const b = side(
            rest,
            size,
            a.flatMap((e) => e.members),
          );
          if (!b) continue;
          for (const e of [...a, ...b]) {
            list.splice(list.indexOf(e), 1);
            for (const id of e.members) queued.delete(id);
          }
          found(mode, a, b);
          made = true;
        }
        if (!made) break;
      }
    }
  }

  function sidesOf(p: { sides: [string[], string[]] }): DuelSides {
    return [p.sides[0].map(person), p.sides[1].map(person)];
  }

  function found(mode: DuelMode, a: Entry[], b: Entry[]): void {
    const id = nextId++;
    const expiresAt = now() + DUEL_ACCEPT_SECONDS * 1000;
    const p: Pending = {
      id,
      mode,
      sides: [a.flatMap((e) => e.members), b.flatMap((e) => e.members)],
      entries: [...a, ...b],
      accepted: new Set(),
      expiresAt,
      timer: setTimeout(() => cancelPending(p, "lapsed"), DUEL_ACCEPT_SECONDS * 1000),
    };
    pendings.set(id, p);
    const sides = sidesOf(p);
    p.sides.forEach((list, i) => {
      for (const member of list) {
        inPending.set(member, p);
        push(member, { t: "unqueued", why: "found" });
        push(member, { t: "found", id, mode, expiresAt, you: i + 1, sides });
      }
    });
  }

  /**
   * A ready check that will not be played. Only whoever caused it may not queue for a while: the
   * one who refused, the one who left, those who cannot duel from where they stand, or, when the
   * window ran out, those who never answered. Every entry whose members are all still good goes
   * back to the front of the queue.
   */
  function cancelPending(
    p: Pending,
    why: Extract<DuelEvent, { t: "cancelled" }>["why"],
    by?: string,
  ): void {
    if (pendings.get(p.id) !== p) return;
    clearTimeout(p.timer);
    pendings.delete(p.id);
    const all = [...p.sides[0], ...p.sides[1]];
    for (const id of all) {
      inPending.delete(id);
      push(id, { t: "cancelled", id: p.id, why });
    }
    const until = now() + DUEL_QUEUE_LOCK_SECONDS * 1000;
    const blame = new Set<string>(by ? [by] : []);
    if (why === "lapsed") for (const id of all) if (!p.accepted.has(id)) blame.add(id);
    if (why === "offline") for (const id of all) if (!online(id) || !canDuelHere(id)) blame.add(id);
    for (const id of blame) locks.set(id, until);
    for (const e of [...p.entries].reverse()) {
      const good = e.members.every((id) => !blame.has(id) && online(id));
      const answered = why !== "lapsed" || e.members.every((id) => p.accepted.has(id));
      if (good && answered) enqueue(e, true);
    }
    matchmake();
  }

  function ready(me: string, m: DuelRequest<"duel.ready">): Answer {
    const p = pendings.get(m.id);
    if (!p || inPending.get(me) !== p) return refused("duel.ready", m.n, "duel_no_match");
    p.accepted.add(me);
    const all = [...p.sides[0], ...p.sides[1]];
    for (const id of all) push(id, { t: "ready", id: p.id, accepted: [...p.accepted] });
    if (all.every((id) => p.accepted.has(id))) {
      if (!all.every((id) => online(id) && canDuelHere(id))) {
        cancelPending(p, "offline");
        return done("duel.ready", m.n);
      }
      clearTimeout(p.timer);
      pendings.delete(p.id);
      for (const id of all) inPending.delete(id);
      background("duel start", startMatch(p.mode, p.sides, p.entries));
    }
    return done("duel.ready", m.n);
  }

  function refuse(me: string, m: DuelRequest<"duel.refuse">): Answer {
    const p = pendings.get(m.id);
    if (!p || inPending.get(me) !== p) return refused("duel.refuse", m.n, "duel_no_match");
    cancelPending(p, "refused", me);
    return done("duel.refuse", m.n);
  }

  // ── Matches ────────────────────────────────────────────────────────────────

  /** An idle floor, the one most of the fighters already stand at first, with seats for the rest. */
  function pickFloor(fighters: readonly string[]): FloorHost | undefined {
    let best: FloorHost | undefined;
    let bestHere = -1;
    for (const [roomId, f] of floors) {
      if (f.busy) continue;
      const room = rooms.room(roomId);
      if (!room) continue;
      const here = fighters.filter((id) => places.get(id)?.roomId === roomId).length;
      if (!room.seatsFor(fighters.length - here)) continue;
      if (here > bestHere) {
        best = f;
        bestHere = here;
      }
    }
    return best;
  }

  async function floorFor(fighters: readonly string[]): Promise<FloorHost | undefined> {
    let f = pickFloor(fighters);
    if (f || floors.size >= DUEL_FLOORS_MAX) return f;
    // Every floor is taken: one more channel of the 새벽관, opened once however many wait.
    opening ??= rooms.openChannel(ARENA_MAP).finally(() => {
      opening = null;
    });
    try {
      await opening;
    } catch (error) {
      console.error(`opening a dueling floor failed: ${String(error)}`);
      return undefined;
    }
    f = pickFloor(fighters);
    return f;
  }

  async function startMatch(
    mode: DuelMode,
    sides: [string[], string[]],
    entries: readonly Entry[],
  ): Promise<void> {
    const all = [...sides[0], ...sides[1]];
    const id = nextId++;
    const match: Match = {
      id,
      mode,
      sides,
      names: new Map(all.map((x) => [x, host?.member(x)?.name ?? ""])),
      floor: null,
      before: new Map(),
      exited: new Set(),
      entries,
    };
    matches.set(id, match);
    for (const x of all) inMatch.set(x, match);
    const floor = await floorFor(all);
    if (!floor || !floor.reserve(match)) {
      matches.delete(id);
      for (const x of all) {
        inMatch.delete(x);
        push(x, { t: "cancelled", id, why: "no_floor" });
      }
      // A queued match nobody could host goes back to the front of the queue, whole.
      for (const e of [...entries].reverse()) {
        if (e.members.every((x) => online(x) && !busy(x))) enqueue(e, true);
      }
      return;
    }
    match.floor = floor;
    const floorId = floorRoomId(floor);
    const floorRoom = rooms.room(floorId);
    const view = sidesOf(match);
    const marks = duelMarks(floor.arena, mode);
    // Everyone is checked and taken before anyone is placed: an arrival can start the match, and
    // a fighter looked at after that would already be armed.
    const here: string[] = [];
    const away: { x: string; from: DuelRoom; mark: { x: number; y: number } | undefined }[] = [];
    sides.forEach((list, i) => {
      list.forEach((x, k) => {
        const team = i + 1;
        push(x, {
          t: "match",
          id,
          mode,
          map: ARENA_MAP,
          channel: floorRoom?.channel ?? 0,
          you: team,
          sides: view,
        });
        const place = places.get(x);
        const from = place ? rooms.room(place.roomId) : undefined;
        // Knocked out, in a fight, sent home or between maps since accepting: never carried off.
        const before = from && readiness(x) === "ok" ? from.snapshot(x) : undefined;
        if (!from || !before) {
          exit(match, x, "absent");
          return;
        }
        pending.delete(x);
        match.before.set(x, before);
        if (from === floorRoom) here.push(x);
        else away.push({ x, from, mark: marks.filter((mk) => mk.team === team)[k] ?? marks[0] });
      });
    });
    // The trip to the floor saves the floor as the character's place: keep the way back first.
    try {
      await origins.save(
        away.map(({ x }) => {
          const b = match.before.get(x) as Before;
          return { characterId: x, map: b.map, x: b.x, y: b.y };
        }),
      );
    } catch (error) {
      console.error(`saving duel origins failed: ${String(error)}`);
      for (const { x } of away) exit(match, x, "absent");
      away.length = 0;
    }
    for (const { x, from, mark } of away) {
      if (match.exited.has(x)) continue;
      const sent = from.sendTo(x, {
        map: ARENA_MAP,
        x: mark?.x ?? 0,
        y: mark?.y ?? 0,
        roomId: floorId,
        via: "duel",
      });
      if (!sent) exit(match, x, "absent");
    }
    for (const x of here) if (!match.exited.has(x)) floor.seatedHere(x);
  }

  function floorRoomId(f: FloorHost): string {
    for (const [roomId, x] of floors) if (x === f) return roomId;
    return "";
  }

  /**
   * The one way out of a match. The fighter leaves the simulation, then is put back exactly as
   * it was the instant before the match: its own kit, level, mode and party, health, shield,
   * every cooldown, the dodge and an ally's buffs, and the spot it stood on. A body that is not
   * standing anywhere is put back where it next sits down, and its place is written back now.
   */
  function exit(match: Match, id: string, how: Leaving | "concede" | "end"): void {
    if (match.exited.has(id)) return;
    match.exited.add(id);
    if (inMatch.get(id) === match) inMatch.delete(id);
    match.floor?.disarm(id);
    const before = match.before.get(id);
    if (before) bringBack(id, before, how);
  }

  function bringBack(id: string, before: Before, how: Leaving | "concede" | "end"): void {
    const place = places.get(id);
    const room = place ? rooms.room(place.roomId) : undefined;
    if (!place || !room || !room.restoreFromDuel(id, before)) {
      // On the way to the floor, or gone: made good wherever it next sits, and its place now.
      pending.set(id, { before, at: now() });
      background("duel origin", origins.restore(id));
      return;
    }
    if (how === "moving" || how === "gone") {
      // A door or the school is taking it elsewhere, or its seat is going: the numbers are back
      // on the body as it leaves; a logout's place is written back to where it stood.
      if (how === "gone") {
        pending.set(id, { before, at: now() });
        background("duel origin", origins.restore(id));
      } else background("duel origin", origins.forget(id));
      return;
    }
    if (place.roomId === before.roomId) {
      room.teleport(id, before.x, before.y);
      background("duel origin", origins.forget(id));
      return;
    }
    // Home is another room: the trip there finishes the restore when it sits down (`arrived`).
    pending.set(id, { before, at: now() });
    const sent = room.sendTo(id, {
      map: before.map,
      x: before.x,
      y: before.y,
      roomId: before.roomId,
      via: "duel",
    });
    if (!sent) background("duel origin", origins.restore(id));
  }

  /** Whether a room is where a fighter came from: its channel, or its map when that is gone. */
  function isHome(room: DuelRoom, before: Before): boolean {
    return room.roomId === before.roomId || room.mapId === before.map;
  }

  /** Counts a win for the cap per lineup per day; false once the lineup has had its share. */
  function countWin(winners: readonly string[], losers: readonly string[]): boolean {
    const day = new Date(now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const key = `${day}|${[...winners].sort().join(",")}|${[...losers].sort().join(",")}`;
    const n = pairWins.get(key) ?? 0;
    if (n >= DUEL_PAIR_WINS_DAILY) return false;
    pairWins.set(key, n + 1);
    return true;
  }

  const floorEvents: FloorEvents = {
    over(m, result: DuelResultView) {
      const match = matches.get(m.id);
      if (!match) return;
      const all = [...match.sides[0], ...match.sides[1]];
      for (const id of all) push(id, { t: "over", id: m.id, result });
      // Played by everyone in the match; won by the winning side's fighters who did not forfeit,
      // only when a round was fought out or the other side quit well into the fight, and only so
      // many times a day against the same opponents, so the card's number means something.
      const fought =
        result.rounds.some((r) => r.end !== "forfeit") ||
        result.seconds >= DUEL_FORFEIT_WIN_SECONDS;
      const winners = result.winner > 0 ? (match.sides[result.winner - 1] ?? []) : [];
      const losers = result.winner > 0 ? (match.sides[2 - result.winner] ?? []) : [];
      const counts = fought && winners.length > 0 && countWin(winners, losers);
      const rows = all.map((id) => {
        const f = result.fighters.find((x) => x.id === id);
        const won = counts && f?.team === result.winner && !f.forfeited;
        return { characterId: id, won };
      });
      background(
        "duel records",
        records.add(rows).then(async () => {
          for (const id of all) {
            if (online(id)) push(id, { t: "record", record: await records.read(id) });
          }
        }),
      );
    },
    released(m) {
      const match = matches.get(m.id);
      if (!match) return;
      matches.delete(m.id);
      for (const id of [...match.sides[0], ...match.sides[1]]) exit(match, id, "end");
    },
    left(m, id, how) {
      const match = matches.get(m.id);
      if (match) exit(match, id, how);
    },
  };

  function forfeit(me: string, m: DuelRequest<"duel.forfeit">): Answer {
    const match = inMatch.get(me);
    if (!match || match.exited.has(me)) return refused("duel.forfeit", m.n, "duel_not_in");
    // Conceded, in any phase: back as before at once, while the others play on.
    exit(match, me, "concede");
    return done("duel.forfeit", m.n);
  }

  /**
   * Every character in a match has a live match, every live match a live floor holding it, and
   * nobody waits in two places at once. Returns what is broken.
   */
  function check(): string[] {
    const broken: string[] = [];
    for (const [id, match] of inMatch) {
      if (matches.get(match.id) !== match)
        broken.push(`${id} is in match ${match.id}, which is gone`);
      if (match.exited.has(id)) broken.push(`${id} left match ${match.id} but is still in it`);
    }
    for (const match of matches.values()) {
      const f = match.floor;
      if (!f) continue;
      if (![...floors.values()].includes(f)) broken.push(`match ${match.id} is on a closed floor`);
      else if (f.matchId !== match.id) broken.push(`match ${match.id}'s floor holds ${f.matchId}`);
    }
    for (const id of queued.keys()) {
      if (inPending.has(id) || inMatch.has(id)) broken.push(`${id} is queued and matched at once`);
    }
    return broken;
  }

  function sweepAll(): void {
    matchmake();
    const t = now();
    for (const [id, p] of pending) if (t - p.at > PENDING_MS) pending.delete(id);
    if (strict) {
      const broken = check();
      if (broken.length > 0) console.error(`duel hub invariant broken: ${broken.join("; ")}`);
    }
  }

  async function handle(me: string, type: DuelType, m: DuelRequest<DuelType>): Promise<Answer> {
    const wait = buckets.take(`${me}:${type}`, DUEL_RATE[type], Date.now());
    if (wait > 0) return refused(type, m.n, "rate_limited", wait);
    switch (type) {
      case "duel.challenge":
        return challenge(me, m as DuelRequest<"duel.challenge">);
      case "duel.accept":
        return accept(me, m as DuelRequest<"duel.accept">);
      case "duel.decline": {
        const c = challenges.get((m as DuelRequest<"duel.decline">).id);
        if (!c || c.to !== me || c.silent) return refused(type, m.n, "duel_no_challenge");
        endChallenge(c, "declined");
        return done(type, m.n);
      }
      case "duel.withdraw": {
        const c = outgoing.get(me);
        if (!c) return refused(type, m.n, "duel_not_in");
        endChallenge(c, "withdrawn");
        return done(type, m.n);
      }
      case "duel.queue":
        return queue(me, m as DuelRequest<"duel.queue">);
      case "duel.unqueue":
        if (!queued.has(me)) return refused(type, m.n, "duel_not_in");
        leaveQueue(me, "left");
        return done(type, m.n);
      case "duel.ready":
        return ready(me, m as DuelRequest<"duel.ready">);
      case "duel.refuse":
        return refuse(me, m as DuelRequest<"duel.refuse">);
      case "duel.forfeit":
        return forfeit(me, m as DuelRequest<"duel.forfeit">);
      case "duel.record":
        try {
          return done(type, m.n, await records.read((m as DuelRequest<"duel.record">).id));
        } catch {
          return refused(type, m.n, "server_error");
        }
    }
  }

  return {
    attach(h: DuelHost): void {
      host = h;
      for (const type of DUEL_TYPES) {
        h.on(type, duelSchema(type) as WorldMessageSchema<DuelRequest<DuelType>>, (me, m) =>
          handle(me, type, m),
        );
      }
      sweep = setInterval(sweepAll, everyMs);
    },
    /** The character's WorldRoom seat dropped or left: out of the queue, ready checks and challenges. */
    left(characterId: string): void {
      leaveQueue(characterId, "offline");
      const p = inPending.get(characterId);
      if (p) cancelPending(p, "offline", characterId);
      const mine = outgoing.get(characterId);
      if (mine) endChallenge(mine, "withdrawn");
      for (const c of incomingTo(characterId)) endChallenge(c, "busy");
    },
    detach(): void {
      if (sweep) clearInterval(sweep);
      for (const c of challenges.values()) clearTimeout(c.timer);
      for (const p of pendings.values()) clearTimeout(p.timer);
      host = undefined;
    },
    /** A map room with a dueling floor opened (`MapRoom.onCreate`). */
    addFloor(roomId: string, make: (events: FloorEvents) => FloorHost): FloorHost {
      const f = make(floorEvents);
      floors.set(roomId, f);
      return f;
    },
    /** The floor's room is closing: its match ends and everyone in it goes back. */
    removeFloor(roomId: string): void {
      const f = floors.get(roomId);
      f?.abandon();
      floors.delete(roomId);
      for (const match of [...matches.values()]) {
        if (match.floor !== f || !f) continue;
        matches.delete(match.id);
        for (const id of [...match.sides[0], ...match.sides[1]]) exit(match, id, "end");
      }
    },
    /**
     * A character sat down in a room (`MapRoom` seat, after its re-entry restore). One that left a
     * match while away from home is made good here: at home, as before; anywhere else (it was
     * still on its way to the floor), as before and sent home.
     */
    arrived(characterId: string, room: DuelRoom): void {
      const p = pending.get(characterId);
      if (!p || inMatch.has(characterId)) return;
      if (now() - p.at > PENDING_MS) {
        pending.delete(characterId);
        return;
      }
      room.restoreFromDuel(characterId, p.before);
      if (isHome(room, p.before)) {
        pending.delete(characterId);
        if (room.roomId === p.before.roomId) room.teleport(characterId, p.before.x, p.before.y);
        background("duel origin", origins.forget(characterId));
        return;
      }
      const sent = room.sendTo(characterId, {
        map: p.before.map,
        x: p.before.x,
        y: p.before.y,
        roomId: p.before.roomId,
        via: "duel",
      });
      if (!sent) background("duel origin", origins.restore(characterId));
    },
    check,
    /** For tools and the evidence script. */
    stats() {
      return {
        floors: floors.size,
        busyFloors: [...floors.values()].filter((f) => f.busy).length,
        queued: queued.size,
        matches: matches.size,
      };
    },
  };
}

export type Dueling = ReturnType<typeof createDueling>;

let current: Dueling | undefined;

/** The process's dueling, for map rooms to register their floors with. */
export function provideDueling(d: Dueling | undefined): void {
  current = d;
}

export function dueling(): Dueling | undefined {
  return current;
}

/** Map rooms by id through the match maker, and new channels through `channels`. */
export function localRooms(open: (map: string) => Promise<void>): DuelRooms {
  return {
    openChannel: open,
    room: (roomId) => matchMaker.getLocalRoomById(roomId) as unknown as DuelRoom | undefined,
  };
}
