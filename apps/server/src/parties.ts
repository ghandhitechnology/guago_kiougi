/**
 * Parties (PLAN §6, §12), in memory for the life of the process, shared between the WorldRoom
 * (which runs every party request) and the map rooms (which read who shares a kill), the way
 * `places` shares positions. A restart ends every party.
 *
 * Rules: up to `PARTY_MAX` members; the leader invites, kicks and hands the lead on; leaving
 * passes the lead to the longest-standing member online; a party dissolves when one member is
 * left and no invite is out. A member whose session ends stays in, shown offline, for
 * `PARTY_OFFLINE_SECONDS`; the lead leaves an offline leader at once.
 *
 * Map rooms: `parties.of(id)` for membership, `parties.sharers(id)` for kill sharing (members on
 * the same map room instance within `PARTY_RANGE`), `partyExpMultiplier` (combat.ts) for the
 * bonus, and `parties.report(id, vitals)` to feed party frames their HP and control mode.
 */
import {
  type ControlMode,
  type Major,
  PARTY_INVITE_SECONDS,
  PARTY_INVITES_IN_CAP,
  PARTY_MAX,
  PARTY_OFFLINE_SECONDS,
  PARTY_RANGE,
  type PartyInvite,
  type PartyView,
  type Person,
  type RefusalCode,
} from "@guago/shared";
import { places } from "./places.ts";

export interface PartyPerson extends Person {
  major: Major;
  level: number;
}

interface Member extends PartyPerson {
  online: boolean;
  offlineAt: number;
  hp: number;
  mode: ControlMode | "";
}

interface Party {
  id: number;
  leader: string;
  /** In join order. */
  members: Map<string, Member>;
  invited: Map<string, { name: string; expiresAt: number }>;
}

/** What combat reports about a character, for party frames. */
export interface Vitals {
  hp: number;
  maxHp: number;
  mode: ControlMode;
}

type Listener = (characterId: string, partyId: number | undefined) => void;

class Parties {
  private next = 1;
  private readonly parties = new Map<number, Party>();
  private readonly byCharacter = new Map<string, Party>();
  /** Invites each character holds, by party id. */
  private readonly held = new Map<string, Map<number, { from: Person; expiresAt: number }>>();
  private readonly listeners = new Set<Listener>();
  /** Characters whose party view changed since the last `drain`. */
  private readonly dirtyMembers = new Set<string>();
  /** Characters whose held invites changed since the last `drain`. */
  private readonly dirtyHolders = new Set<string>();
  private readonly dirtyVitals = new Set<string>();

  // For map rooms ------------------------------------------------------------------------------

  /** The character's party: its id, leader and member ids in join order. */
  of(characterId: string): { id: number; leader: string; members: string[] } | undefined {
    const party = this.byCharacter.get(characterId);
    return party && { id: party.id, leader: party.leader, members: [...party.members.keys()] };
  }

  /**
   * Members who share the character's kill: those on the same map room instance within
   * `radius` pixels of it, the character included. Alone or outside a party: just the character.
   */
  sharers(characterId: string, radius = PARTY_RANGE): string[] {
    const party = this.byCharacter.get(characterId);
    const here = places.get(characterId);
    const origin = here?.at();
    if (!party || !here || !origin) return [characterId];
    const out: string[] = [];
    for (const id of party.members.keys()) {
      const place = id === characterId ? here : places.get(id);
      const at = place?.at();
      if (!place || !at || place.roomId !== here.roomId) continue;
      if (Math.hypot(at.x - origin.x, at.y - origin.y) <= radius) out.push(id);
    }
    return out;
  }

  /** Combat's feed for party frames. Only changes reach the party, a few times a second. */
  report(characterId: string, vitals: Vitals): void {
    const member = this.byCharacter.get(characterId)?.members.get(characterId);
    if (!member) return;
    const hp = vitals.maxHp > 0 ? Math.round((100 * Math.max(0, vitals.hp)) / vitals.maxHp) : 0;
    const clamped = Math.min(100, hp);
    if (member.hp === clamped && member.mode === vitals.mode) return;
    member.hp = clamped;
    member.mode = vitals.mode;
    this.dirtyVitals.add(characterId);
  }

  /** Called with the new party id, or undefined on leaving one. Returns the unsubscribe. */
  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // For the WorldRoom ------------------------------------------------------------------------

  /**
   * The leader (or a player in no party, who then leads a new one) invites `target`. When not
   * `deliver` (the target blocked the inviter) the invite is listed and lapses like any other,
   * but the target never holds it.
   */
  invite(me: PartyPerson, target: PartyPerson, deliver: boolean, now: number): RefusalCode | null {
    if (target.id === me.id) return "target_self";
    let party = this.byCharacter.get(me.id);
    if (party && party.leader !== me.id) return "not_leader";
    if (this.byCharacter.has(target.id)) return "target_in_party";
    const already = party?.invited.has(target.id) ?? false;
    const taken = (party?.members.size ?? 1) + (party?.invited.size ?? 0) - (already ? 1 : 0);
    if (taken >= PARTY_MAX) return "party_full";
    // Checked whether or not the invite is delivered, so a block never changes the answer.
    const holding = this.held.get(target.id);
    if (!already && (holding?.size ?? 0) >= PARTY_INVITES_IN_CAP) return "invites_full";
    if (!party) party = this.create(me);
    const expiresAt = now + PARTY_INVITE_SECONDS * 1000;
    party.invited.set(target.id, { name: target.name, expiresAt });
    if (deliver) {
      const mine = holding ?? new Map();
      mine.set(party.id, { from: { id: me.id, name: me.name }, expiresAt });
      this.held.set(target.id, mine);
      this.dirtyHolders.add(target.id);
    }
    this.touch(party);
    return null;
  }

  /** Two accepts of one invite: the second finds it spent. */
  accept(me: PartyPerson, partyId: number, now: number): RefusalCode | null {
    const invite = this.held.get(me.id)?.get(partyId);
    const party = this.parties.get(partyId);
    if (!invite || invite.expiresAt <= now || !party) {
      this.dropHeld(me.id, partyId);
      return "no_invite";
    }
    if (this.byCharacter.has(me.id)) return "in_party";
    if (party.members.size >= PARTY_MAX) return "party_full";
    this.dropHeld(me.id, partyId);
    party.invited.delete(me.id);
    this.add(party, me);
    return null;
  }

  decline(me: string, partyId: number): RefusalCode | null {
    if (!this.held.get(me)?.has(partyId)) return "no_invite";
    this.dropHeld(me, partyId);
    const party = this.parties.get(partyId);
    if (party) {
      party.invited.delete(me);
      this.touch(party);
      this.settle(party);
    }
    return null;
  }

  leave(me: string): RefusalCode | null {
    const party = this.byCharacter.get(me);
    if (!party) return "no_party";
    this.remove(party, me);
    return null;
  }

  kick(me: string, target: string): RefusalCode | null {
    const party = this.byCharacter.get(me);
    if (!party) return "no_party";
    if (party.leader !== me) return "not_leader";
    if (target === me) return "target_self";
    if (!party.members.has(target)) return "not_member";
    this.remove(party, target);
    return null;
  }

  lead(me: string, target: string): RefusalCode | null {
    const party = this.byCharacter.get(me);
    if (!party) return "no_party";
    if (party.leader !== me) return "not_leader";
    if (target === me) return "target_self";
    if (!party.members.has(target)) return "not_member";
    party.leader = target;
    this.touch(party);
    return null;
  }

  /** The character's session began: back online in its party, with fresh name and level. */
  online(me: PartyPerson): void {
    const party = this.byCharacter.get(me.id);
    const member = party?.members.get(me.id);
    if (!party || !member) return;
    Object.assign(member, { name: me.name, major: me.major, level: me.level, online: true });
    this.touch(party);
  }

  /** The character's session ended. The lead passes to someone online, if anyone is. */
  offline(me: string, now: number): void {
    const party = this.byCharacter.get(me);
    const member = party?.members.get(me);
    if (!party || !member) return;
    member.online = false;
    member.offlineAt = now;
    if (party.leader === me) party.leader = this.successor(party) ?? me;
    this.touch(party);
  }

  setLevel(me: string, level: number): void {
    const party = this.byCharacter.get(me);
    const member = party?.members.get(me);
    if (!party || !member || member.level === level) return;
    member.level = level;
    this.touch(party);
  }

  /** Lapses invites and drops members offline past the grace. */
  sweep(now: number): void {
    for (const party of [...this.parties.values()]) {
      for (const [id, invite] of party.invited) {
        if (invite.expiresAt > now) continue;
        party.invited.delete(id);
        this.dropHeld(id, party.id);
        this.touch(party);
      }
      for (const member of [...party.members.values()]) {
        if (!member.online && now - member.offlineAt >= PARTY_OFFLINE_SECONDS * 1000) {
          this.remove(party, member.id);
        }
      }
      if (this.parties.has(party.id)) this.settle(party);
    }
    for (const [holder, invites] of this.held) {
      for (const [id, invite] of invites) {
        if (invite.expiresAt <= now || !this.parties.has(id)) this.dropHeld(holder, id);
      }
    }
  }

  /** The party as its members see it; `map` reads where each member stands. */
  view(characterId: string): PartyView | null {
    const party = this.byCharacter.get(characterId);
    if (!party) return null;
    return {
      id: party.id,
      leader: party.leader,
      members: [...party.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        major: m.major,
        level: m.level,
        map: places.get(m.id)?.mapId ?? "",
        online: m.online,
        hp: m.hp,
        mode: m.mode,
      })),
      invited: [...party.invited].map(([id, i]) => ({ id, name: i.name, expiresAt: i.expiresAt })),
    };
  }

  invitesOf(characterId: string, now: number): PartyInvite[] {
    const out: PartyInvite[] = [];
    for (const [id, invite] of this.held.get(characterId) ?? []) {
      const party = this.parties.get(id);
      if (!party || invite.expiresAt <= now) continue;
      out.push({ id, from: invite.from, size: party.members.size, expiresAt: invite.expiresAt });
    }
    return out;
  }

  /** Members of the character's party, the character included. */
  membersOf(characterId: string): string[] {
    return [...(this.byCharacter.get(characterId)?.members.keys() ?? [])];
  }

  /**
   * What changed since the last call: whose party view to send again (null for those who left
   * one), whose invite list, and which members' vitals.
   */
  drain(): { views: string[]; holders: string[]; vitals: string[] } {
    const out = {
      views: [...this.dirtyMembers],
      holders: [...this.dirtyHolders],
      vitals: [...this.dirtyVitals],
    };
    this.dirtyMembers.clear();
    this.dirtyHolders.clear();
    this.dirtyVitals.clear();
    return out;
  }

  vitalsOf(characterId: string): { hp: number; mode: ControlMode | "" } | undefined {
    const m = this.byCharacter.get(characterId)?.members.get(characterId);
    return m && { hp: m.hp, mode: m.mode };
  }

  /** Forgets every party (tests). */
  reset(): void {
    this.parties.clear();
    this.byCharacter.clear();
    this.held.clear();
    this.drain();
  }

  // Internals ------------------------------------------------------------------------------

  private create(leader: PartyPerson): Party {
    const party: Party = {
      id: this.next++,
      leader: leader.id,
      members: new Map(),
      invited: new Map(),
    };
    this.parties.set(party.id, party);
    this.add(party, leader);
    return party;
  }

  private add(party: Party, person: PartyPerson): void {
    party.members.set(person.id, { ...person, online: true, offlineAt: 0, hp: -1, mode: "" });
    this.byCharacter.set(person.id, party);
    this.touch(party);
    this.emit(person.id, party.id);
  }

  private remove(party: Party, id: string): void {
    party.members.delete(id);
    this.byCharacter.delete(id);
    this.dirtyMembers.add(id);
    this.emit(id, undefined);
    if (party.leader === id)
      party.leader = this.successor(party) ?? party.members.keys().next().value ?? id;
    this.touch(party);
    this.settle(party);
  }

  /** The longest-standing member online, else none. */
  private successor(party: Party): string | undefined {
    for (const m of party.members.values()) if (m.online && m.id !== party.leader) return m.id;
    return undefined;
  }

  /** Dissolves a party down to one member with no invite out. */
  private settle(party: Party): void {
    if (party.members.size > 1 || (party.members.size === 1 && party.invited.size > 0)) return;
    for (const id of party.members.keys()) {
      this.byCharacter.delete(id);
      this.dirtyMembers.add(id);
      this.emit(id, undefined);
    }
    for (const id of party.invited.keys()) this.dropHeld(id, party.id);
    this.parties.delete(party.id);
  }

  private touch(party: Party): void {
    for (const id of party.members.keys()) this.dirtyMembers.add(id);
  }

  private dropHeld(holder: string, partyId: number): void {
    const mine = this.held.get(holder);
    if (!mine?.delete(partyId)) return;
    if (mine.size === 0) this.held.delete(holder);
    this.dirtyHolders.add(holder);
  }

  private emit(characterId: string, partyId: number | undefined): void {
    for (const listener of this.listeners) listener(characterId, partyId);
  }
}

export const parties = new Parties();
