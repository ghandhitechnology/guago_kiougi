import { PARTY_MAX, type SocialEvent } from "@guago/shared";
import type * as Phaser from "phaser";
import type { ChatPanel } from "../chat/panel.ts";
import { watchFight } from "../hud/fight.ts";
import type { Hud } from "../hud/hud.ts";
import { t } from "../i18n/index.ts";
import { registerMenuTab } from "../menu/notebook.ts";
import { worldView } from "../world/view.ts";
import type { WorldLink } from "../world-link.ts";
import { ask } from "./act.ts";
import { type CardTarget, PlayerCard } from "./card.ts";
import { friendsTab } from "./friends.ts";
import { PartyFrames } from "./party-frames.ts";
import { openReport } from "./report.ts";
import { Slips } from "./slips.ts";
import { EmoteWheel } from "./wheel.ts";
import { line } from "./words.ts";

/** What the UI layer asks of the social screens while a player is in the world. */
export interface SocialUi {
  /** The HUD steps aside (a menu or dialogue is up): the party frames go with it. */
  setHudVisible(on: boolean): void;
  /** Escape with nothing else open: closes the card or the wheel first. True when taken. */
  back(): boolean;
  openCard(target: CardTarget): void;
  /** The emote wheel, for the HUD's phone button. */
  toggleWheel(): void;
  destroy(): void;
}

/** The session the notebook's social pages draw from; set while a player is in the world. */
let current: { link: WorldLink; card: PlayerCard; whisper: (name: string) => void } | undefined;

/**
 * Starts the social layer over the HUD: the player card, invite slips, party frames and the emote
 * wheel, and registers the social pages of the notebook.
 */
export function startSocialUi(
  scene: Phaser.Scene,
  link: WorldLink,
  opts: { chat: ChatPanel | undefined; hud: Hud },
): SocialUi {
  const whisper = (name: string) => opts.chat?.open(name);
  const card = new PlayerCard(scene, link, {
    whisper,
    report: (target) => openReport(scene, link, target),
  });
  current = { link, card, whisper };
  registerSocialTabs();

  let fighting = false;
  const unfight = watchFight((live) => {
    fighting = live;
  });
  // A body tapped mid-fight belongs to the fight; nameplates always open the card.
  worldView.onNameTap = (sid, name, kind, part) => {
    if (kind !== "player" || (part === "body" && fighting)) return;
    card.open({ name, sid });
  };
  if (opts.chat) {
    opts.chat.onNameTap = (from, lineId) =>
      card.open({ id: from.id, name: from.name, line: lineId, at: { x: 120, y: 150 } });
  }

  const frames = new PartyFrames(scene, link, (m) => card.open(m));
  frames.setTop(opts.hud.leftBottom + 6);
  opts.hud.onLeftColumn = (y) => frames.setTop(y + 6);

  const slips = new Slips(scene);
  const offSlips = watchInvites(link, slips);
  const wheel = new EmoteWheel(scene, link);

  return {
    setHudVisible(on) {
      frames.setVisible(on);
      slips.setVisible(on);
      if (!on) card.close();
    },
    back() {
      if (wheel.isOpen) {
        wheel.toggle();
        return true;
      }
      if (card.isOpen) {
        card.close();
        return true;
      }
      return false;
    },
    openCard: (target) => card.open(target),
    toggleWheel: () => wheel.toggle(),
    destroy() {
      unfight();
      offSlips();
      if (worldView.onNameTap) worldView.onNameTap = undefined;
      opts.hud.onLeftColumn = undefined;
      card.destroy();
      frames.destroy();
      slips.destroy();
      wheel.destroy();
      if (current?.link === link) current = undefined;
    },
  };
}

let registered = false;

/** The notebook's social pages, once; they draw from whichever session is current. */
function registerSocialTabs(): void {
  if (registered) return;
  registered = true;
  registerMenuTab(
    friendsTab(() => current?.link, {
      whisper: (name) => current?.whisper(name),
      card: (target) => current?.card.open(target),
    }),
  );
}

/**
 * Requests and invites as they arrive become slips with 수락 and 거절; an acceptance of the
 * player's own request becomes a sealed slip. The login snapshot raises none: those wait on the
 * pages.
 */
function watchInvites(link: WorldLink, slips: Slips): () => void {
  const s = link.social;
  let requestsIn = new Set(s.requests.in.map((r) => r.id));
  let requestsOut = new Set(s.requests.out.map((r) => r.id));
  let friends = new Set(s.friends.keys());
  let partyInvites = new Set(s.partyInvites.map((i) => i.id));
  let clubInvites = new Set(s.clubInvites.map((i) => i.club.id));
  let applicants = new Set(s.applicants.map((a) => a.id));
  const reset = () => {
    requestsIn = new Set(s.requests.in.map((r) => r.id));
    requestsOut = new Set(s.requests.out.map((r) => r.id));
    friends = new Set(link.social.friends.keys());
    partyInvites = new Set(link.social.partyInvites.map((i) => i.id));
    clubInvites = new Set(link.social.clubInvites.map((i) => i.club.id));
    applicants = new Set(link.social.applicants.map((a) => a.id));
  };
  const on = (e: SocialEvent) => {
    switch (e.t) {
      case "all":
        reset();
        return;
      case "requests": {
        for (const r of e.in) {
          if (requestsIn.has(r.id) || link.isBlocked(r.id)) continue;
          slips.push({
            key: `friend:${r.id}`,
            icon: "menu/friends",
            title: r.name,
            sub: t("friends.list"),
            ttl: 12_000,
            accept: () => void ask(link, "friend.accept", { id: r.id }),
            decline: () => void ask(link, "friend.decline", { id: r.id }),
          });
        }
        const still = new Set(e.in.map((r) => r.id));
        for (const id of requestsIn) if (!still.has(id)) slips.drop(`friend:${id}`);
        requestsIn = still;
        requestsOut = new Set([...requestsOut, ...e.out.map((r) => r.id)]);
        return;
      }
      case "friend":
        if (!friends.has(e.f.id) && requestsOut.has(e.f.id)) {
          const sub = line("social.friend.accepted", { name: e.f.name });
          slips.push({
            key: `friend-ok:${e.f.id}`,
            icon: "menu/friends",
            title: e.f.name,
            ...(sub ? { sub } : {}),
            sealed: true,
            ttl: 5000,
          });
        }
        friends.add(e.f.id);
        requestsOut.delete(e.f.id);
        return;
      case "unfriend":
        friends.delete(e.id);
        return;
      case "partyInvites": {
        for (const inv of e.list) {
          if (partyInvites.has(inv.id) || link.isBlocked(inv.from.id)) continue;
          const from = link.presence.get(inv.from.id);
          slips.push({
            key: `party:${inv.id}`,
            icon: from ? `emblem/${from.major}` : "menu/friends",
            title: inv.from.name,
            sub: `${t("friends.party")} ${inv.size}/${PARTY_MAX}`,
            expiresAt: inv.expiresAt,
            accept: () => void ask(link, "party.accept", { id: inv.id }),
            decline: () => void ask(link, "party.decline", { id: inv.id }),
          });
        }
        const still = new Set(e.list.map((i) => i.id));
        for (const id of partyInvites) if (!still.has(id)) slips.drop(`party:${id}`);
        partyInvites = still;
        return;
      }
      case "clubInvites": {
        for (const inv of e.list) {
          if (clubInvites.has(inv.club.id) || link.isBlocked(inv.from.id)) continue;
          slips.push({
            key: `club:${inv.club.id}`,
            icon: "menu/club",
            title: inv.club.name,
            sub: inv.from.name,
            ttl: 12_000,
            accept: () => void ask(link, "club.accept", { id: inv.club.id }),
            decline: () => void ask(link, "club.decline", { id: inv.club.id }),
          });
        }
        const still = new Set(e.list.map((i) => i.club.id));
        for (const id of clubInvites) if (!still.has(id)) slips.drop(`club:${id}`);
        clubInvites = still;
        return;
      }
      case "applicants": {
        for (const a of e.list) {
          if (applicants.has(a.id)) continue;
          slips.push({
            key: `applicant:${a.id}`,
            icon: `emblem/${a.major}`,
            title: a.name,
            sub: t("club.applicants"),
            ttl: 12_000,
            accept: () => void ask(link, "club.review", { id: a.id, accept: true }),
            decline: () => void ask(link, "club.review", { id: a.id, accept: false }),
          });
        }
        applicants = new Set(e.list.map((a) => a.id));
        return;
      }
    }
  };
  return link.on((e) => {
    if (e.type === "social") on(e.event);
  });
}
