/**
 * The social side of the WorldRoom (PLAN §12, §19, §21). Runs every social request, keeps what
 * each online player needs in memory (their blocks, friends and club), and tells the people a
 * change concerns with the smallest event that carries it.
 *
 * What lives where: friendships, requests, blocks, clubs and everything about them, 대자보 posts
 * and reports are rows, so they survive a restart; parties (`parties.ts`) and who is online live
 * in memory and end with the process.
 *
 * Every request gets exactly one answer: `done` once its events are out, or `refused` with a
 * code. Nothing answers differently because someone blocked the sender: a whisper, friend
 * request, party invite or club invite to a player who blocked you looks delivered and is not.
 */
import { emoteAllowed } from "@guago/content";
import {
  type ClubRank,
  type ClubView,
  CONTROL_MODES,
  type ControlMode,
  type Done,
  EMOTE_TILES,
  encodeEmblem,
  type FriendEntry,
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

/** Per online player: what delivery and notices read on every message. */
interface Online {
  blocks: Set<string>;
  friends: Set<string>;
  club: { id: number; rank: ClubRank } | undefined;
}

export interface Loaded {
  online: Online;
  snapshot: Omit<SocialSnapshot, "party" | "partyInvites">;
}

type Answer = { data?: unknown } | Refuse;
type Handler<P extends Peer, K extends SocialType> = (
  me: P,
  req: SocialRequest<K>,
) => Promise<Answer>;

const OK: Answer = {};
const VITALS_MS = 250;
const SWEEP_EVERY = 4;
const CLUB_EXP_MS = 60_000;

const person = (e: PresenceEntry): PartyPerson => ({
  id: e.id,
  name: e.name,
  major: e.major,
  level: e.level,
});

export class SocialHub<P extends Peer> {
  private readonly social: Social;
  private readonly room: SocialRoom<P>;
  private readonly state = new Map<string, Online>();
  /** Online members by club id. */
  private readonly clubOnline = new Map<number, Set<string>>();
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
    this.unlisten = social.onClubChange((change) => {
      this.clubChanged(change).catch((error: unknown) => {
        console.error(`club change notice failed: ${describeError(error)}`);
      });
    });
  }

  dispose(): void {
    for (const t of this.timers) clearInterval(t);
    this.unlisten();
  }

  // Lifecycle ------------------------------------------------------------------------------

  /** Everything the player's panels need, read before the seat is announced. */
  async load(characterId: string): Promise<Loaded> {
    const { friends, clubs } = this.social;
    const [list, requests, blocks, membership, clubInvites, applications] = await Promise.all([
      friends.friendsOf(characterId),
      friends.requestsOf(characterId),
      friends.blocksOf(characterId),
      clubs.membership(this.social.db, characterId),
      clubs.invitesOf(characterId),
      clubs.applicationsOf(characterId),
    ]);
    const [club, applicants] = membership
      ? await Promise.all([
          clubs.view(membership.club),
          membership.rank === "member" ? [] : clubs.applicantsOf(membership.club),
        ])
      : [null, []];
    return {
      online: {
        blocks: new Set(blocks.map((b) => b.id)),
        friends: new Set(list.map((f) => f.id)),
        club: membership && club ? { id: membership.club, rank: membership.rank } : undefined,
      },
      snapshot: {
        friends: list.map((f) => ({ ...f, room: "" })),
        requests,
        blocks,
        club,
        clubInvites,
        applications,
        applicants,
      },
    };
  }

  /** The seat is in: hold its state, mark it online in its party and send the snapshot. */
  join(peer: P, loaded: Loaded): void {
    const id = peer.characterId;
    this.state.set(id, loaded.online);
    const club = loaded.online.club;
    if (club) this.indexClub(id, club.id);
    this.setTag(id, loaded.snapshot.club);
    parties.online(person(peer.entry));
    this.sendSnapshot(peer, loaded);
    this.flushParties();
  }

  /** After a reconnect nothing sent meanwhile arrived: the snapshot goes again. */
  async resend(peer: P): Promise<void> {
    try {
      const loaded = await this.load(peer.characterId);
      if (this.room.online(peer.characterId) !== peer) return;
      this.state.set(peer.characterId, loaded.online);
      this.sendSnapshot(peer, loaded);
    } catch (error) {
      console.error(`social snapshot failed: ${describeError(error)}`);
    }
  }

  /** The seat is gone for good (logout, or the reconnect window ran out). */
  leave(characterId: string): void {
    const club = this.state.get(characterId)?.club;
    if (club) this.clubOnline.get(club.id)?.delete(characterId);
    this.state.delete(characterId);
    parties.offline(characterId, this.social.now());
    this.flushParties();
  }

  /** The character entered, left or changed a map room. */
  moved(characterId: string): void {
    if (!this.state.has(characterId)) return;
    this.tellFriends(characterId);
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

  /** Runs one validated request and answers it exactly once. */
  async handle<K extends SocialType>(peer: P, type: K, req: SocialRequest<K>): Promise<void> {
    const retryMs = this.room.limit(peer, type);
    if (retryMs > 0) {
      this.room.answer(peer, WORLD_MESSAGES.refused, {
        type,
        n: req.n,
        code: "rate_limited",
        retryMs,
      });
      return;
    }
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

    return {
      "friend.request": async (me, { name }) => {
        const other = await byName(name);
        if (!other) return new Refuse("no_player");
        return after(await friends.request(me.characterId, other.id), async (r) => {
          if (r === "friends") await this.befriended(me.characterId, other.id);
          await this.pushRequests(me.characterId, other.id);
        });
      },
      "friend.accept": async (me, { id }) =>
        after(await friends.accept(me.characterId, id), async () => {
          await this.befriended(me.characterId, id);
          await this.pushRequests(me.characterId, id);
        }),
      "friend.decline": async (me, { id }) =>
        after(await friends.decline(me.characterId, id), () =>
          this.pushRequests(me.characterId, id),
        ),
      "friend.cancel": async (me, { id }) =>
        after(await friends.cancel(me.characterId, id), () =>
          this.pushRequests(me.characterId, id),
        ),
      "friend.remove": async (me, { id }) =>
        after(await friends.remove(me.characterId, id), () => this.unfriended(me.characterId, id)),

      "block.add": async (me, req) => {
        const other = "id" in req ? await characterById(db, req.id) : await byName(req.name);
        if (!other) return new Refuse("no_player");
        return after(await friends.block(me.characterId, other.id), async (r) => {
          this.state.get(me.characterId)?.blocks.add(other.id);
          if (r.wereFriends) this.unfriended(me.characterId, other.id);
          await this.pushRequests(me.characterId, other.id);
          await this.pushBlocks(me.characterId);
          await this.pushClubInvites(me.characterId);
        });
      },
      "block.remove": async (me, { id }) =>
        after(await friends.unblock(me.characterId, id), async () => {
          this.state.get(me.characterId)?.blocks.delete(id);
          await this.pushRequests(me.characterId);
          await this.pushBlocks(me.characterId);
          await this.pushClubInvites(me.characterId);
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
        await this.pushClubInvites(me.characterId);
        await this.pushApplications(me.characterId);
        return { data: { club: made.club } };
      },
      "club.join": async (me, { id }) => {
        const r = await clubs.join(me.characterId, id);
        if (r instanceof Refuse) return r;
        if (r.joined) await this.clubChanged(r);
        else await this.pushApplicants(id);
        await this.pushApplications(me.characterId);
        await this.pushClubInvites(me.characterId);
        return { data: { joined: r.joined } };
      },
      "club.withdraw": async (me, { id }) =>
        after(await clubs.withdraw(me.characterId, id), async () => {
          await this.pushApplications(me.characterId);
          await this.pushApplicants(id);
        }),
      "club.invite": async (me, { name }) => {
        const other = await byName(name);
        if (!other) return new Refuse("no_player");
        if (this.hasBlocked(me.characterId, other.id)) return new Refuse("blocked");
        const silent = await this.blockedBy(other.id, me.characterId);
        return after(await clubs.invite(me.characterId, other.id, silent), async () => {
          if (!silent) await this.pushClubInvites(other.id);
        });
      },
      "club.accept": async (me, { id }) =>
        after(await clubs.accept(me.characterId, id), async (r) => {
          await this.clubChanged(r);
          await this.pushClubInvites(me.characterId);
          await this.pushApplications(me.characterId);
        }),
      "club.decline": async (me, { id }) =>
        after(await clubs.decline(me.characterId, id), () => this.pushClubInvites(me.characterId)),
      "club.review": async (me, { id, accept }) =>
        after(await clubs.review(me.characterId, id, accept), async (r) => {
          await this.clubChanged(r);
          await this.pushApplicants(r.club);
          await this.pushApplications(id);
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

  // Friends --------------------------------------------------------------------------------

  private friendEntry(id: string): FriendEntry | undefined {
    const peer = this.room.online(id);
    if (!peer) return undefined;
    const { name, major, level } = peer.entry;
    return { id, name, major, level, room: this.roomOf(id) };
  }

  /**
   * Each online friend gets the character's entry again: its channel changed. Going offline
   * needs nothing here; presence says so, and an offline friend's channel means nothing.
   */
  private tellFriends(id: string): void {
    const entry = this.friendEntry(id);
    if (!entry) return;
    for (const other of this.state.get(id)?.friends ?? []) {
      const peer = this.room.online(other);
      if (peer) this.event(peer, { t: "friend", f: entry });
    }
  }

  private async befriended(a: string, b: string): Promise<void> {
    const [ca, cb] = await Promise.all([
      characterById(this.social.db, a),
      characterById(this.social.db, b),
    ]);
    for (const [me, other] of [
      [a, cb],
      [b, ca],
    ] as const) {
      if (!other) continue;
      this.state.get(me)?.friends.add(other.id);
      const peer = this.room.online(me);
      if (peer) this.event(peer, { t: "friend", f: { ...other, room: this.roomOf(other.id) } });
    }
  }

  private unfriended(a: string, b: string): void {
    for (const [me, other] of [
      [a, b],
      [b, a],
    ] as const) {
      this.state.get(me)?.friends.delete(other);
      const peer = this.room.online(me);
      if (peer) this.event(peer, { t: "unfriend", id: other });
    }
  }

  private async pushRequests(...ids: string[]): Promise<void> {
    for (const id of ids) {
      const peer = this.room.online(id);
      if (!peer) continue;
      const lists = await this.social.friends.requestsOf(id);
      this.event(peer, { t: "requests", in: lists.in, out: lists.out });
    }
  }

  private async pushBlocks(id: string): Promise<void> {
    const peer = this.room.online(id);
    if (peer) this.event(peer, { t: "blocks", list: await this.social.friends.blocksOf(id) });
  }

  /** Whether `owner` blocked `other`, online or not. */
  private async blockedBy(owner: string, other: string): Promise<boolean> {
    const online = this.state.get(owner);
    if (online) return online.blocks.has(other);
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

  private indexClub(id: string, club: number | undefined): void {
    for (const [clubId, set] of this.clubOnline) {
      if (clubId !== club && set.delete(id) && set.size === 0) this.clubOnline.delete(clubId);
    }
    if (club === undefined || !this.state.has(id)) return;
    const set = this.clubOnline.get(club) ?? new Set<string>();
    set.add(id);
    this.clubOnline.set(club, set);
  }

  private setTag(id: string, club: ClubView | null): void {
    clubTags.set(
      id,
      club
        ? { id: club.id, name: club.name, jacket: club.jacket, emblem: encodeEmblem(club.emblem) }
        : undefined,
    );
  }

  /**
   * After any club change: members who joined or left get their new club (or none), every
   * current member the club as it now stands, officers the applicant list, and map rooms the
   * tags.
   */
  private async clubChanged(change: ClubChange): Promise<void> {
    const view = change.gone ? null : await this.social.clubs.view(change.club);
    const inClub = new Set(view?.members.map((m) => m.id) ?? []);
    for (const id of change.moved ?? []) {
      if (inClub.has(id)) continue;
      const online = this.state.get(id);
      if (online) online.club = undefined;
      this.indexClub(id, undefined);
      this.setTag(id, null);
      const peer = this.room.online(id);
      if (peer) {
        this.event(peer, { t: "club", club: null });
        this.event(peer, { t: "applicants", list: [] });
      }
    }
    if (!view) return;
    const applicants = view.members.some((m) => m.rank !== "member" && this.room.online(m.id))
      ? await this.social.clubs.applicantsOf(view.id)
      : [];
    for (const m of view.members) {
      this.setTag(m.id, view);
      const online = this.state.get(m.id);
      if (!online) continue;
      const was = online.club?.rank;
      online.club = { id: view.id, rank: m.rank };
      this.indexClub(m.id, view.id);
      const peer = this.room.online(m.id);
      if (!peer) continue;
      this.event(peer, { t: "club", club: view });
      if (m.rank !== "member") this.event(peer, { t: "applicants", list: applicants });
      else if (was !== undefined && was !== "member")
        this.event(peer, { t: "applicants", list: [] });
    }
  }

  private async pushApplicants(clubId: number): Promise<void> {
    const officers = [...(this.clubOnline.get(clubId) ?? [])].filter(
      (id) => this.state.get(id)?.club?.rank !== "member",
    );
    if (officers.length === 0) return;
    const list = await this.social.clubs.applicantsOf(clubId);
    for (const id of officers) {
      const peer = this.room.online(id);
      if (peer) this.event(peer, { t: "applicants", list });
    }
  }

  private async pushApplications(id: string): Promise<void> {
    const peer = this.room.online(id);
    if (peer) {
      this.event(peer, { t: "applications", list: await this.social.clubs.applicationsOf(id) });
    }
  }

  private async pushClubInvites(id: string): Promise<void> {
    const peer = this.room.online(id);
    if (peer) this.event(peer, { t: "clubInvites", list: await this.social.clubs.invitesOf(id) });
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
      try {
        const now = await this.social.clubs.addExp(club, exp);
        if (!now) continue;
        for (const id of this.clubOnline.get(club) ?? []) {
          const peer = this.room.online(id);
          if (peer) this.event(peer, { t: "clubExp", level: now.level, exp: now.exp });
        }
      } catch (error) {
        console.error(`club exp failed: ${describeError(error)}`);
      }
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

  private sendSnapshot(peer: P, loaded: Loaded): void {
    const id = peer.characterId;
    const s: SocialSnapshot = {
      ...loaded.snapshot,
      friends: loaded.snapshot.friends.map((f) => ({ ...f, room: this.roomOf(f.id) })),
      party: parties.view(id),
      partyInvites: parties.invitesOf(id, this.social.now()),
    };
    this.event(peer, { t: "all", s });
  }
}
