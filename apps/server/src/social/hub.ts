/**
 * The social side of the WorldRoom (PLAN §12, §19, §21). Runs every social request, keeps what
 * each online player needs in memory, and tells the people a change concerns with the smallest
 * event that carries it.
 *
 * What lives where: friendships, requests, blocks, clubs and everything about them, 대자보 posts
 * and reports are rows, so they survive a restart; parties (`parties.ts`) and who is online live
 * in memory and end with the process.
 *
 * One rule keeps memory in step with the database. Everything the hub holds about an online
 * player (its model: blocks, friends, requests, club and rank, invites, applications and
 * applicants, plus its club index entry and map-room tag) and every social event sent to that
 * player belong to the player's lane. A lane runs one task at a time, in the order they were
 * queued; a task changes the model only from a database read it makes itself, after the write it
 * follows has committed, and sends only what the model then says. A read older than a landed
 * write therefore can never be applied after it. A club's views are read in the club's lane and
 * handed to each member's lane, whose own fresh read of the member's club decides whether that
 * view applies. Login reads the model inside the lane too, so a change during it queues behind,
 * and a reconnect sends the live model instead of reading a new one.
 *
 * Every request gets exactly one answer: `done` once its events are out, or `refused` with a
 * code. Nothing answers differently because someone blocked the sender: a whisper, friend
 * request, party invite or club invite to a player who blocked you looks delivered and is not.
 *
 * Requests run one at a time per player, and all social database work shares at most
 * `SOCIAL_CONNECTIONS` of the pool, so no player and no burst can park the connections seat
 * saves, item operations and logins need.
 */
import { emoteAllowed } from "@guago/content";
import {
  type Applicant,
  type ClubApplication,
  type ClubInvite,
  type ClubRank,
  type ClubView,
  CONTROL_MODES,
  type ControlMode,
  type Done,
  EMOTE_TILES,
  encodeEmblem,
  type FriendEntry,
  type FriendRequest,
  type Person,
  type PresenceEntry,
  REPORT_NOTE_LENGTH,
  type Refusal,
  type SocialEvent,
  type SocialRequest,
  type SocialSnapshot,
  type SocialType,
  TILE_SIZE,
  WORLD_MESSAGES,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import { clubActivity } from "../club-activity.ts";
import { clubTags } from "../club-tags.ts";
import { describeError } from "../db/index.ts";
import { MUTED_REQUESTS, mutedUntil } from "../moderation/mutes.ts";
import { type PartyPerson, parties } from "../parties.ts";
import { places } from "../places.ts";
import type { ClubChange } from "./clubs.ts";
import { characterById, characterByName } from "./friends.ts";
import type { Social } from "./index.ts";
import { Refuse } from "./tx.ts";

/** An online player as the WorldRoom holds it. */
export interface Peer {
  readonly characterId: string;
  readonly entry: PresenceEntry;
}

/** What the hub needs from the room. */
export interface SocialRoom<P extends Peer> {
  online(characterId: string): P | undefined;
  /** An online player by name, without case. */
  named(name: string): P | undefined;
  send(peer: P, type: string, body: unknown): void;
  /** Sends the answer to the peer's own request, kept for replay after a reconnect. */
  answer(peer: P, type: string, body: Done | Refusal): void;
  /** 0 when the request may go ahead, else ms until it may. */
  limit(peer: P, type: SocialType): number;
}

/** What the hub holds about one online player. Changed only in the player's lane. */
export interface Model {
  blocks: Map<string, Person>;
  friends: Map<string, Omit<FriendEntry, "room">>;
  requests: { in: FriendRequest[]; out: FriendRequest[] };
  club: ClubView | null;
  rank: ClubRank | undefined;
  clubInvites: ClubInvite[];
  applications: ClubApplication[];
  applicants: Applicant[];
}

type Part = "friends" | "requests" | "blocks" | "clubInvites" | "applications" | "applicants";

type Answer = { data?: unknown } | Refuse;
type Handler<P extends Peer, K extends SocialType> = (
  me: P,
  req: SocialRequest<K>,
) => Promise<Answer>;

const OK: Answer = {};
const VITALS_MS = 250;
const SWEEP_EVERY = 4;
const CLUB_EXP_MS = 60_000;
/**
 * Pool connections the social systems may hold at once, of the ten `createDb` opens: the rest
 * stay free for seat saves, item operations, logins and the chat log.
 */
export const SOCIAL_CONNECTIONS = 6;
/**
 * Requests one player may have waiting, above the largest single-type burst (10); past this
 * they are refused as too fast.
 */
const QUEUED_PER_PLAYER = 16;

const person = (e: PresenceEntry): PartyPerson => ({
  id: e.id,
  name: e.name,
  major: e.major,
  level: e.level,
});

const emptyModel = (): Model => ({
  blocks: new Map(),
  friends: new Map(),
  requests: { in: [], out: [] },
  club: null,
  rank: undefined,
  clubInvites: [],
  applications: [],
  applicants: [],
});

const isOfficer = (m: Model) => m.club !== null && m.rank !== undefined && m.rank !== "member";

/** One promise chain per key: a task starts after every task queued before it for that key. */
class Lanes {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const before = this.tails.get(key) ?? Promise.resolve();
    // An earlier task failing never holds up the ones behind it.
    const mine = before.then(task, task);
    const tail = mine.then(
      () => {},
      () => {},
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return mine;
  }

  async drained(): Promise<void> {
    while (this.tails.size > 0) await Promise.all(this.tails.values());
  }
}

/** At most `max` tasks at once; the rest wait their turn in arrival order. */
class Gate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  /** The most ever running at once, for the load measurement. */
  peak = 0;
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.max) this.active++;
    // A finishing task hands its place straight to the next in line.
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.peak = Math.max(this.peak, this.active);
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

export class SocialHub<P extends Peer> {
  private readonly social: Social;
  private readonly room: SocialRoom<P>;
  private readonly state = new Map<string, Model>();
  /** Online members by club id; an entry changes only in its member's lane. */
  private readonly clubOnline = new Map<number, Set<string>>();
  /** Lanes for what the hub holds about each player, and for reading each club's views. */
  private readonly people = new Lanes();
  private readonly clubs = new Lanes();
  /** Each player's requests, one at a time. */
  private readonly queue = new Lanes();
  private readonly queued = new Map<string, number>();
  /** Shared by every request and login, so social work never holds more of the pool. */
  readonly gate = new Gate(SOCIAL_CONNECTIONS);
  private readonly timers: NodeJS.Timeout[] = [];
  private ticks = 0;
  private readonly unlisten: () => void;
  private readonly handlers: { [K in SocialType]: Handler<P, K> };

  constructor(social: Social, room: SocialRoom<P>) {
    this.social = social;
    this.room = room;
    this.handlers = this.makeHandlers();
    this.timers.push(setInterval(() => this.tick(), VITALS_MS));
    this.timers.push(setInterval(() => void this.creditClubs(), CLUB_EXP_MS));
    for (const t of this.timers) t.unref();
    // Changes made outside a request (moderation removing a character) reach members too.
    this.unlisten = social.onClubChange((change) => void this.clubChanged(change));
  }

  dispose(): void {
    for (const t of this.timers) clearInterval(t);
    this.unlisten();
  }

  /** Resolves once every queued request and lane task has run. */
  async drained(): Promise<void> {
    await Promise.all([this.queue.drained(), this.clubs.drained(), this.people.drained()]);
    await this.people.drained();
  }

  // Lifecycle ------------------------------------------------------------------------------

  /**
   * Reads the player's model, before the seat is announced. The model is registered first, so a
   * change committed while it is read queues its update behind this read.
   */
  async load(characterId: string): Promise<Model> {
    const model = emptyModel();
    this.state.set(characterId, model);
    try {
      await this.gate.run(() =>
        this.people.run(characterId, async () => {
          if (this.state.get(characterId) !== model) return;
          await this.read(characterId, model);
        }),
      );
    } catch (error) {
      if (this.state.get(characterId) === model) this.state.delete(characterId);
      throw error;
    }
    return model;
  }

  /** The seat is in: mark it online in its party and send the model as it stands. */
  join(peer: P, model: Model): void {
    parties.online(person(peer.entry));
    this.flushParties();
    void this.people.run(peer.characterId, async () => {
      if (this.state.get(peer.characterId) === model) this.sendSnapshot(peer, model);
    });
  }

  /** After a reconnect nothing sent meanwhile arrived: the live model goes again, unread. */
  resend(peer: P): Promise<void> {
    return this.people.run(peer.characterId, async () => {
      const model = this.state.get(peer.characterId);
      if (model && this.room.online(peer.characterId) === peer) this.sendSnapshot(peer, model);
    });
  }

  /** The seat is gone for good (logout, or the reconnect window ran out). */
  leave(characterId: string): void {
    parties.offline(characterId, this.social.now());
    this.flushParties();
    const model = this.state.get(characterId);
    void this.people.run(characterId, async () => {
      // A newer seat of the same character may have loaded its own model since.
      if (!model || this.state.get(characterId) !== model) return;
      this.index(characterId, undefined);
      clubTags.set(characterId, undefined);
      this.state.delete(characterId);
    });
  }

  /** The character entered, left or changed a map room. */
  moved(characterId: string): void {
    const model = this.state.get(characterId);
    if (!model) return;
    for (const friend of model.friends.keys()) {
      void this.inLane(friend, async (theirs) => {
        if (!theirs.friends.has(characterId)) return;
        const entry = this.friendEntry(characterId);
        const peer = this.room.online(friend);
        if (entry && peer) this.event(peer, { t: "friend", f: entry });
      });
    }
    for (const id of parties.membersOf(characterId)) this.pushParty(id);
  }

  setLevel(characterId: string, level: number): void {
    parties.setLevel(characterId, level);
    this.flushParties();
  }

  // Queries for the room's chat --------------------------------------------------------------

  /** True when `owner` (online) has blocked `other`. */
  hasBlocked(owner: string, other: string): boolean {
    return this.state.get(owner)?.blocks.has(other) ?? false;
  }

  /** The party channel: the party id and its online members, or undefined outside a party. */
  partyChannel(characterId: string): { id: number; members: P[] } | undefined {
    const party = parties.of(characterId);
    if (!party) return undefined;
    return {
      id: party.id,
      members: party.members.flatMap((id) => this.room.online(id) ?? []),
    };
  }

  clubChannel(characterId: string): { id: number; members: P[] } | undefined {
    const club = this.state.get(characterId)?.club;
    if (!club) return undefined;
    const online = this.clubOnline.get(club.id) ?? new Set<string>();
    return { id: club.id, members: [...online].flatMap((id) => this.room.online(id) ?? []) };
  }

  // Requests -------------------------------------------------------------------------------

  /** Queues one validated request behind the player's others and answers it exactly once. */
  async handle<K extends SocialType>(peer: P, type: K, req: SocialRequest<K>): Promise<void> {
    const id = peer.characterId;
    // Text other players see is refused while a mute holds (moderation/mutes.ts, the same check
    // as chat), before it costs a rate-limit token.
    const muted = MUTED_REQUESTS.has(type) ? mutedUntil(id) : 0;
    if (muted > Date.now()) {
      this.room.answer(peer, WORLD_MESSAGES.refused, {
        type,
        n: req.n,
        code: "muted",
        ...(Number.isFinite(muted) ? { until: muted } : {}),
      });
      return;
    }
    const retryMs = this.room.limit(peer, type);
    const waiting = this.queued.get(id) ?? 0;
    if (retryMs > 0 || waiting >= QUEUED_PER_PLAYER) {
      this.room.answer(peer, WORLD_MESSAGES.refused, {
        type,
        n: req.n,
        code: "rate_limited",
        retryMs: retryMs > 0 ? retryMs : 1000,
      });
      return;
    }
    this.queued.set(id, waiting + 1);
    try {
      await this.queue.run(id, () => this.gate.run(() => this.serve(peer, type, req)));
    } finally {
      const left = (this.queued.get(id) ?? 1) - 1;
      if (left > 0) this.queued.set(id, left);
      else this.queued.delete(id);
    }
  }

  private async serve<K extends SocialType>(peer: P, type: K, req: SocialRequest<K>) {
    let answer: Answer;
    try {
      answer = await (this.handlers[type] as Handler<P, K>)(peer, req);
    } catch (error) {
      console.error(`${type} failed: ${describeError(error)}`);
      answer = new Refuse("server_error");
    }
    if (answer instanceof Refuse) {
      this.room.answer(peer, WORLD_MESSAGES.refused, {
        type,
        n: req.n,
        code: answer.code,
        ...(answer.need === undefined ? {} : { need: answer.need }),
      });
    } else {
      this.room.answer(peer, WORLD_MESSAGES.done, {
        type,
        n: req.n,
        ...(answer.data === undefined ? {} : { data: answer.data }),
      });
    }
  }

  private makeHandlers(): { [K in SocialType]: Handler<P, K> } {
    const { friends, clubs, board, reports } = this.social;
    const db = this.social.db;
    const now = this.social.now;

    /** Turns a store's result into an answer, running `then` on success. */
    const after = async <T>(result: T | Refuse, then?: (v: T) => Promise<void> | void) => {
      if (result instanceof Refuse) return result;
      await then?.(result);
      return OK;
    };
    const byName = async (name: string) => characterByName(db, name);
    /** Both players' parts again, each in its own lane. */
    const both = async (a: string, b: string, parts: Part[]) => {
      await Promise.all([this.refresh(a, parts), this.refresh(b, parts)]);
    };

    return {
      "friend.request": async (me, { name }) => {
        const other = await byName(name);
        if (!other) return new Refuse("no_player");
        return after(await friends.request(me.characterId, other.id), (r) =>
          both(me.characterId, other.id, r === "friends" ? ["requests", "friends"] : ["requests"]),
        );
      },
      "friend.accept": async (me, { id }) =>
        after(await friends.accept(me.characterId, id), () =>
          both(me.characterId, id, ["friends", "requests"]),
        ),
      "friend.decline": async (me, { id }) =>
        after(await friends.decline(me.characterId, id), () =>
          both(me.characterId, id, ["requests"]),
        ),
      "friend.cancel": async (me, { id }) =>
        after(await friends.cancel(me.characterId, id), () =>
          both(me.characterId, id, ["requests"]),
        ),
      "friend.remove": async (me, { id }) =>
        after(await friends.remove(me.characterId, id), () =>
          both(me.characterId, id, ["friends"]),
        ),

      "block.add": async (me, req) => {
        const other = "id" in req ? await characterById(db, req.id) : await byName(req.name);
        if (!other) return new Refuse("no_player");
        return after(await friends.block(me.characterId, other.id), async () => {
          await this.refresh(me.characterId, ["blocks", "friends", "requests", "clubInvites"]);
          await this.refresh(other.id, ["friends", "requests"]);
        });
      },
      "block.remove": async (me, { id }) =>
        after(await friends.unblock(me.characterId, id), async () => {
          await this.refresh(me.characterId, ["blocks", "requests", "clubInvites"]);
          await this.refresh(id, ["requests"]);
        }),

      "party.invite": async (me, { name }) => {
        const other = this.room.named(name);
        if (!other) return new Refuse("target_offline");
        if (this.hasBlocked(me.characterId, other.characterId)) return new Refuse("blocked");
        const deliver = !this.hasBlocked(other.characterId, me.characterId);
        return this.party(parties.invite(person(me.entry), person(other.entry), deliver, now()));
      },
      "party.accept": async (me, { id }) => this.party(parties.accept(person(me.entry), id, now())),
      "party.decline": async (me, { id }) => this.party(parties.decline(me.characterId, id)),
      "party.leave": async (me) => this.party(parties.leave(me.characterId)),
      "party.kick": async (me, { id }) => this.party(parties.kick(me.characterId, id)),
      "party.lead": async (me, { id }) => this.party(parties.lead(me.characterId, id)),

      "club.create": async (me, req) => {
        const { n: _, ...found } = req;
        const made = await clubs.found(me.characterId, me.entry.level, found);
        if (made instanceof Refuse) return made;
        await this.clubChanged(made);
        await this.refresh(me.characterId, ["clubInvites", "applications"]);
        return { data: { club: made.club } };
      },
      "club.join": async (me, { id }) => {
        const r = await clubs.join(me.characterId, id);
        if (r instanceof Refuse) return r;
        if (r.joined) await this.clubChanged(r);
        else await this.pushApplicants(id);
        await this.refresh(me.characterId, ["applications", "clubInvites"]);
        return { data: { joined: r.joined } };
      },
      "club.withdraw": async (me, { id }) =>
        after(await clubs.withdraw(me.characterId, id), async () => {
          await this.refresh(me.characterId, ["applications"]);
          await this.pushApplicants(id);
        }),
      "club.invite": async (me, { name }) => {
        const other = await byName(name);
        if (!other) return new Refuse("no_player");
        if (this.hasBlocked(me.characterId, other.id)) return new Refuse("blocked");
        const silent = await this.blockedBy(other.id, me.characterId);
        return after(await clubs.invite(me.characterId, other.id, silent), async () => {
          if (!silent) await this.refresh(other.id, ["clubInvites"]);
        });
      },
      "club.accept": async (me, { id }) =>
        after(await clubs.accept(me.characterId, id), async (r) => {
          await this.clubChanged(r);
          await this.refresh(me.characterId, ["clubInvites", "applications"]);
        }),
      "club.decline": async (me, { id }) =>
        after(await clubs.decline(me.characterId, id), () =>
          this.refresh(me.characterId, ["clubInvites"]),
        ),
      "club.review": async (me, { id, accept }) =>
        after(await clubs.review(me.characterId, id, accept), async (r) => {
          if (accept) await this.clubChanged(r);
          else await this.pushApplicants(r.club);
          await this.refresh(id, ["applications"]);
        }),
      "club.leave": async (me) =>
        after(await clubs.leave(me.characterId), (r) => this.clubChanged(r)),
      "club.kick": async (me, { id }) =>
        after(await clubs.kick(me.characterId, id), (r) => this.clubChanged(r)),
      "club.rank": async (me, { id, rank }) =>
        after(await clubs.setRank(me.characterId, id, rank), (r) => this.clubChanged(r)),
      "club.handover": async (me, { id }) =>
        after(await clubs.handover(me.characterId, id), (r) => this.clubChanged(r)),
      "club.disband": async (me, { name }) =>
        after(await clubs.disband(me.characterId, name), (r) => this.clubChanged(r)),
      "club.settings": async (me, { n: _, ...change }) =>
        after(await clubs.settings(me.characterId, change), (r) => this.clubChanged(r)),
      "club.notice": async (me, { text }) =>
        after(await clubs.notice(me.characterId, text), (r) => this.clubChanged(r)),
      "club.unnotice": async (me, { id }) =>
        after(await clubs.unnotice(me.characterId, id), (r) => this.clubChanged(r)),
      "club.search": async (_me, { q, after: from }) => ({ data: await clubs.search(q, from) }),
      "club.view": async (_me, { id }) => ({ data: { club: await clubs.summary(id) } }),

      "board.list": async (me, { cat, before }) => ({
        data: await board.list(me.characterId, cat, before),
      }),
      "board.post": async (me, { cat, text }) => {
        const post = await board.post(me.characterId, cat, text);
        return post instanceof Refuse ? post : { data: { post } };
      },
      "board.delete": async (me, { id }) => after(await board.remove(me.characterId, id)),
      "board.pin": async (me, { text }) => {
        const post = await board.pin(me.characterId, text);
        return post instanceof Refuse ? post : { data: { post } };
      },

      report: async (me, { id, cat, note, line }) => {
        let text = "";
        if (note !== undefined && note.trim() !== "") {
          const cleaned = this.social.clean(note, REPORT_NOTE_LENGTH);
          if (!cleaned.ok) return new Refuse(cleaned.code);
          text = cleaned.text;
        }
        await reports.file(me.characterId, {
          target: id,
          category: cat,
          note: text,
          ...(line === undefined ? {} : { line }),
        });
        return OK;
      },

      emote: async (me, { e }) => {
        if (!emoteAllowed(e)) return new Refuse("unknown_emote");
        const place = places.get(me.characterId);
        if (!place) return new Refuse("no_map");
        const event: SocialEvent = { t: "emote", id: me.characterId, sid: place.sessionId, e };
        for (const { characterId } of places.near(me.characterId, EMOTE_TILES * TILE_SIZE)) {
          const peer = this.room.online(characterId);
          if (peer && !this.hasBlocked(characterId, me.characterId)) this.event(peer, event);
        }
        return OK;
      },
    };
  }

  // Lanes ------------------------------------------------------------------------------------

  /**
   * Runs `task` in the player's lane on its current model; nothing when the player is offline.
   * A failed read is logged and the model left as it was, to be put right by the next change.
   */
  private inLane(id: string, task: (model: Model) => Promise<void>): Promise<void> {
    return this.people.run(id, async () => {
      const model = this.state.get(id);
      if (!model) return;
      try {
        await task(model);
      } catch (error) {
        console.error(`social state of ${id} failed: ${describeError(error)}`);
      }
    });
  }

  /** Reads the given parts of the player's model again and sends each. */
  private refresh(id: string, parts: readonly Part[]): Promise<void> {
    return this.inLane(id, async (model) => {
      for (const part of parts) await this.reload(id, model, part);
    });
  }

  /** One part from the database into the model and out to the player. Lane only. */
  private async reload(id: string, model: Model, part: Part): Promise<void> {
    const { friends, clubs } = this.social;
    const peer = this.room.online(id);
    switch (part) {
      case "friends": {
        const list = await friends.friendsOf(id);
        const next = new Map(list.map((f) => [f.id, f]));
        for (const old of model.friends.keys()) {
          if (!next.has(old) && peer) this.event(peer, { t: "unfriend", id: old });
        }
        for (const f of list) {
          if (!model.friends.has(f.id) && peer) {
            this.event(peer, { t: "friend", f: { ...f, room: this.roomOf(f.id) } });
          }
        }
        model.friends = next;
        return;
      }
      case "requests": {
        model.requests = await friends.requestsOf(id);
        if (peer) this.event(peer, { t: "requests", ...model.requests });
        return;
      }
      case "blocks": {
        const list = await friends.blocksOf(id);
        model.blocks = new Map(list.map((b) => [b.id, b]));
        if (peer) this.event(peer, { t: "blocks", list });
        return;
      }
      case "clubInvites": {
        model.clubInvites = await clubs.invitesOf(id);
        if (peer) this.event(peer, { t: "clubInvites", list: model.clubInvites });
        return;
      }
      case "applications": {
        model.applications = await clubs.applicationsOf(id);
        if (peer) this.event(peer, { t: "applications", list: model.applications });
        return;
      }
      case "applicants": {
        const had = model.applicants.length > 0;
        const club = isOfficer(model) ? model.club : null;
        model.applicants = club ? await clubs.applicantsOf(club.id) : [];
        if (peer && (had || club)) this.event(peer, { t: "applicants", list: model.applicants });
        return;
      }
    }
  }

  /** The whole model, read at login inside the lane, one query at a time. */
  private async read(id: string, model: Model): Promise<void> {
    for (const part of ["friends", "requests", "blocks", "clubInvites", "applications"] as const) {
      await this.reload(id, model, part);
    }
    const membership = await this.social.clubs.membership(this.social.db, id);
    const view = membership ? await this.social.clubs.view(membership.club) : null;
    const me = view?.members.find((m) => m.id === id);
    if (view && me) await this.setClub(id, model, view, me.rank);
  }

  // Friends --------------------------------------------------------------------------------

  private friendEntry(id: string): FriendEntry | undefined {
    const peer = this.room.online(id);
    if (!peer) return undefined;
    const { name, major, level } = peer.entry;
    return { id, name, major, level, room: this.roomOf(id) };
  }

  /** Whether `owner` blocked `other`, from the database. */
  private async blockedBy(owner: string, other: string): Promise<boolean> {
    const { rows } = await this.social.db.execute(sql`
      select 1 from blocks where character_id = ${owner} and other_id = ${other}`);
    return rows.length > 0;
  }

  // Parties ----------------------------------------------------------------------------------

  private party(refusal: ReturnType<typeof parties.leave>): Answer {
    this.flushParties();
    return refusal ? new Refuse(refusal) : OK;
  }

  private pushParty(id: string): void {
    const peer = this.room.online(id);
    if (peer) this.event(peer, { t: "party", party: parties.view(id) });
  }

  /** Sends what changed in parties: views, held invites and vitals. */
  private flushParties(): void {
    const { views, holders, vitals } = parties.drain();
    for (const id of views) this.pushParty(id);
    const now = this.social.now();
    for (const id of holders) {
      const peer = this.room.online(id);
      if (peer) this.event(peer, { t: "partyInvites", list: parties.invitesOf(id, now) });
    }
    // One message per member per flush, whatever changed in the party.
    const byParty = new Map<number, { members: string[]; dirty: string[] }>();
    for (const id of vitals) {
      const party = parties.of(id);
      if (!party) continue;
      const entry = byParty.get(party.id) ?? { members: party.members, dirty: [] };
      entry.dirty.push(id);
      byParty.set(party.id, entry);
    }
    for (const { members, dirty } of byParty.values()) {
      for (const member of members) {
        const peer = this.room.online(member);
        if (!peer) continue;
        const v: number[] = [];
        for (const id of dirty) {
          const vitals = id === member ? undefined : parties.vitalsOf(id);
          if (!vitals) continue;
          v.push(members.indexOf(id), vitals.hp, CONTROL_MODES.indexOf(vitals.mode as ControlMode));
        }
        if (v.length > 0) this.event(peer, { t: "vitals", v });
      }
    }
  }

  private tick(): void {
    if (++this.ticks % SWEEP_EVERY === 0) parties.sweep(this.social.now());
    this.flushParties();
  }

  // Clubs ------------------------------------------------------------------------------------

  /** Moves the player's club index entry. Lane only. */
  private index(id: string, club: number | undefined): void {
    for (const [clubId, set] of this.clubOnline) {
      if (clubId !== club && set.delete(id) && set.size === 0) this.clubOnline.delete(clubId);
    }
    if (club === undefined) return;
    const set = this.clubOnline.get(club) ?? new Set<string>();
    set.add(id);
    this.clubOnline.set(club, set);
  }

  /** The player's club (or none) into the model, the index, the map tag and the client. */
  private async setClub(
    id: string,
    model: Model,
    view: ClubView | null,
    rank: ClubRank | undefined,
  ): Promise<void> {
    model.club = view;
    model.rank = view ? rank : undefined;
    this.index(id, view?.id);
    clubTags.set(
      id,
      view
        ? { id: view.id, name: view.name, jacket: view.jacket, emblem: encodeEmblem(view.emblem) }
        : undefined,
    );
    const peer = this.room.online(id);
    if (peer) this.event(peer, { t: "club", club: view });
    await this.reload(id, model, "applicants");
  }

  /**
   * In the player's lane: applies a view of `clubId` when the player's own fresh read says it
   * still belongs there and the view already holds it, clears the club when it belongs nowhere,
   * and otherwise leaves the model to the task of the club it now belongs to.
   */
  private async applyClub(
    id: string,
    model: Model,
    clubId: number,
    view: ClubView | null,
  ): Promise<void> {
    const membership = await this.social.clubs.membership(this.social.db, id);
    if (!membership) {
      if (model.club) await this.setClub(id, model, null, undefined);
      return;
    }
    if (membership.club !== clubId) return;
    const me = view?.members.find((m) => m.id === id);
    if (view && me) await this.setClub(id, model, view, me.rank);
  }

  /**
   * After any club change, in the club's lane: one read of the club as it now stands, handed to
   * the lane of everyone it may concern: who moved, who is in it, and who the index still lists.
   */
  private clubChanged(change: ClubChange): Promise<void> {
    return this.clubs.run(String(change.club), async () => {
      try {
        const view = change.gone ? null : await this.social.clubs.view(change.club);
        const concerned = new Set([
          ...(change.moved ?? []),
          ...(view?.members.map((m) => m.id) ?? []),
          ...(this.clubOnline.get(change.club) ?? []),
        ]);
        for (const id of concerned) {
          if (this.state.has(id)) {
            await this.inLane(id, (model) => this.applyClub(id, model, change.club, view));
          }
        }
      } catch (error) {
        console.error(`club ${change.club} notice failed: ${describeError(error)}`);
      }
    });
  }

  /** Officers of the club read its applicants again. */
  private async pushApplicants(clubId: number): Promise<void> {
    for (const id of [...(this.clubOnline.get(clubId) ?? [])]) {
      await this.inLane(id, async (model) => {
        if (model.club?.id === clubId) await this.reload(id, model, "applicants");
      });
    }
  }

  /** Credits a minute of member activity to each club and tells its online members. */
  private async creditClubs(): Promise<void> {
    const taken = clubActivity.take();
    if (taken.size === 0) return;
    const byClub = new Map<number, number>();
    for (const [id, exp] of taken) {
      const club =
        this.state.get(id)?.club?.id ??
        (await this.social.clubs.membership(this.social.db, id).catch(() => undefined))?.club;
      if (club !== undefined) byClub.set(club, (byClub.get(club) ?? 0) + exp);
    }
    for (const [club, exp] of byClub) {
      await this.clubs.run(String(club), async () => {
        try {
          const total = await this.social.clubs.addExp(club, exp);
          if (!total) return;
          for (const id of [...(this.clubOnline.get(club) ?? [])]) {
            await this.inLane(id, async (model) => {
              if (model.club?.id !== club) return;
              model.club = { ...model.club, level: total.level, exp: total.exp };
              const peer = this.room.online(id);
              if (peer) this.event(peer, { t: "clubExp", level: total.level, exp: total.exp });
            });
          }
        } catch (error) {
          console.error(`club exp failed: ${describeError(error)}`);
        }
      });
    }
  }

  // Sending ------------------------------------------------------------------------------------

  private event(peer: P, event: SocialEvent): void {
    this.room.send(peer, WORLD_MESSAGES.social, event);
  }

  /** The map room instance an online character stands in; empty offline or between maps. */
  private roomOf(id: string): string {
    return this.room.online(id) ? (places.get(id)?.roomId ?? "") : "";
  }

  private sendSnapshot(peer: P, model: Model): void {
    const id = peer.characterId;
    const s: SocialSnapshot = {
      friends: [...model.friends.values()].map((f) => ({ ...f, room: this.roomOf(f.id) })),
      requests: model.requests,
      blocks: [...model.blocks.values()],
      party: parties.view(id),
      partyInvites: parties.invitesOf(id, this.social.now()),
      club: model.club,
      clubInvites: model.clubInvites,
      applications: model.applications,
      applicants: model.applicants,
    };
    this.event(peer, { t: "all", s });
  }
}
