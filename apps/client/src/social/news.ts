import type { ClubRank, ClubView, PartyView } from "@guago/shared";
import { toast } from "../ui/overlay.ts";
import type { WorldLink } from "../world-link.ts";
import { askedLately } from "./act.ts";
import { line } from "./words.ts";

/**
 * What changed in the player's party and club, said once as a toast in the narrative's words: a
 * member joining or leaving, the lead passing, being let into a club, promoted or let go. The
 * server sends whole views; this compares each with the last.
 */
export function watchNews(link: WorldLink): () => void {
  let party: PartyView | null = link.social.party;
  let club: ClubView | null = link.social.club;
  let applied = new Map(link.social.applications.map((a) => [a.club.id, a.club.name]));
  const say = (id: string, params: Record<string, string> = {}) => {
    const text = line(id, params);
    if (text) toast(text);
  };
  const me = () => link.me;
  const rankOf = (c: ClubView | null): ClubRank | undefined =>
    c?.members.find((m) => m.id === me())?.rank;

  const onParty = (next: PartyView | null) => {
    const was = party;
    party = next;
    if (!was && next) {
      // A party of one is the player's own invite going out, not a party joined.
      if (next.leader !== me() && next.members.length > 1) say("social.party.joined");
      return;
    }
    if (was && !next) {
      say(askedLately("party.leave") ? "social.party.left" : "social.party.kicked");
      return;
    }
    if (!was || !next) return;
    const before = new Map(was.members.map((m) => [m.id, m.name]));
    const after = new Map(next.members.map((m) => [m.id, m.name]));
    for (const [id, name] of after) {
      if (!before.has(id) && id !== me()) say("social.party.member-joined", { player: name });
    }
    for (const [id, name] of before) {
      if (!after.has(id) && id !== me()) say("social.party.member-left", { player: name });
    }
    if (was.leader !== next.leader) {
      const leader = after.get(next.leader);
      if (leader) say("social.party.leader", { player: leader });
    }
  };

  const onClub = (next: ClubView | null) => {
    const was = club;
    club = next;
    if (!was && next) {
      if (rankOf(next) === "leader") return; // Founded: the editor said so.
      say(applied.has(next.id) ? "social.club.accepted" : "social.club.joined", {
        club: next.name,
      });
      return;
    }
    if (was && !next) {
      const id = askedLately("club.leave")
        ? "social.club.left"
        : askedLately("club.disband")
          ? "social.club.disbanded"
          : "social.club.kicked";
      say(id, { club: was.name });
      return;
    }
    if (!was || !next) return;
    const a = rankOf(was);
    const b = rankOf(next);
    if (a === b) return;
    if (b === "leader") say("social.club.handover");
    else if (b === "vice") say("social.club.promoted");
    else if (a === "vice" && b === "member") say("social.club.demoted");
  };

  return link.on((e) => {
    if (e.type !== "social") return;
    const ev = e.event;
    if (ev.t === "all") {
      party = link.social.party;
      club = link.social.club;
      applied = new Map(link.social.applications.map((x) => [x.club.id, x.club.name]));
    } else if (ev.t === "party") onParty(ev.party);
    else if (ev.t === "club") onClub(ev.club);
    else if (ev.t === "applications") {
      // An application gone without a club joined was turned down.
      const now = new Set(ev.list.map((x) => x.club.id));
      for (const [id, name] of applied) {
        if (!now.has(id) && club?.id !== id && !askedLately("club.withdraw")) {
          queueMicrotask(() => {
            if (link.social.club?.id !== id) say("social.club.declined", { club: name });
          });
        }
      }
      applied = new Map(ev.list.map((x) => [x.club.id, x.club.name]));
    }
  });
}
