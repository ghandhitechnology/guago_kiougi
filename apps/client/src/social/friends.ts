import {
  BLOCK_CAP,
  FRIEND_CAP,
  PARTY_MAX,
  type PartyMember,
  type Person,
  type SocialEvent,
} from "@guago/shared";
import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import type { MenuTab } from "../menu/notebook.ts";
import { Button } from "../ui/button.ts";
import { List, type ListRow } from "../ui/list.ts";
import { turnPage } from "../ui/motion.ts";
import { Label } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import type { WorldLink } from "../world-link.ts";
import { ask } from "./act.ts";
import { majorIcon, presencePin, text, verbs } from "./rows.ts";
import { Segments } from "./segments.ts";
import { line, mapName, timeLeft } from "./words.ts";

/** What the friend page hands to other screens. */
export interface FriendActions {
  whisper(name: string): void;
  card(target: { id: string; name: string }): void;
}

type Section = "friends" | "party" | "blocked";

const ROW = 18;

/**
 * 친구 (PLAN §12, §18): friends with presence, requests both ways, the party, and the block list,
 * as three sections of one page. Every list redraws from the server's `social` events; nothing
 * changes on screen before the server says so.
 */
export function friendsTab(
  link: () => WorldLink | undefined,
  actions: FriendActions,
  order = 60,
): MenuTab {
  return {
    id: "friends",
    label: t("friends.tab"),
    icon: "menu/friends",
    order,
    build(ctx, page, size) {
      const l = link();
      if (l) new FriendsPage(ctx, page, size, l, actions);
    },
  };
}

/** Which section the page opened on last, kept while the session lasts. */
let lastSection: Section = "friends";

class FriendsPage {
  private readonly ctx: Ctx;
  private readonly link: WorldLink;
  private readonly actions: FriendActions;
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly size: { w: number; h: number };
  private section: Section;
  private field: TextField | undefined;
  private list: List | undefined;
  private timer: Phaser.Time.TimerEvent | undefined;
  /** How full the section's list is, at the right of the section words. */
  private readonly count: Label;

  constructor(
    ctx: Ctx,
    page: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    link: WorldLink,
    actions: FriendActions,
  ) {
    this.ctx = ctx;
    this.link = link;
    this.actions = actions;
    this.size = size;
    this.section = lastSection;
    this.root = ctx.scene.add.container(0, 0);
    page.add(this.root);
    const tabs = new Segments(ctx, 9, 3, {
      items: [
        { id: "friends", label: t("friends.list") },
        { id: "party", label: t("friends.party") },
        { id: "blocked", label: t("friends.blocked") },
      ],
      selected: this.section,
      onChange: (id) => this.show(id as Section),
    });
    const rule = ctx.scene.add.rectangle(8, 19, size.w - 16, 1, paint("stone.light")).setOrigin(0);
    this.count = new Label(ctx.scene, 0, 5, "", { font: "galmuri9", color: "stone.dark" });
    this.body = ctx.scene.add.container(0, 24);
    this.root.add([tabs, rule, this.count.obj, this.body]);
    const off = link.on((e) => {
      if (e.type === "social" && this.wants(e.event)) this.redraw();
      if (e.type === "presence" && this.section !== "blocked") this.redraw();
    });
    // Time left on party invites ticks down.
    this.timer = ctx.scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.section === "party") this.list?.setRows(this.partyRows());
      },
    });
    this.root.once(Phaser.GameObjects.Events.DESTROY, () => {
      off();
      this.timer?.remove();
    });
    this.build();
  }

  private wants(e: SocialEvent): boolean {
    switch (this.section) {
      case "friends":
        return e.t === "all" || e.t === "friend" || e.t === "unfriend" || e.t === "requests";
      case "party":
        return e.t === "all" || e.t === "party" || e.t === "partyInvites" || e.t === "vitals";
      case "blocked":
        return e.t === "all" || e.t === "blocks";
    }
  }

  private show(section: Section): void {
    this.section = section;
    lastSection = section;
    turnPage(this.body, () => this.build());
  }

  /** The name box and its button, then the section's list. */
  private build(): void {
    for (const obj of [...this.body.list]) obj.destroy();
    this.list = undefined;
    const w = this.size.w - 16;
    const verb =
      this.section === "friends"
        ? t("social.add")
        : this.section === "party"
          ? t("social.invite")
          : t("social.block");
    const canInvite = this.section !== "party" || this.leads();
    const field = new TextField(this.ctx, 8, 0, {
      label: t("friends.name"),
      w: w - 64,
      maxLength: 16,
      enterKeyHint: "send",
      onSubmit: () => void this.submit(),
    });
    const go = new Button(this.ctx, 8 + w - 58, 13, {
      label: verb,
      kind: "ink",
      w: 58,
      h: 20,
      sound: "confirm",
      onPress: () => void this.submit(),
    });
    field.setEnabled(canInvite);
    go.setEnabled(canInvite);
    this.field = field;
    this.body.add([field, go]);
    this.redraw();
  }

  private leads(): boolean {
    const party = this.link.social.party;
    return !party || (party.leader === this.link.me && party.members.length < PARTY_MAX);
  }

  private async submit(): Promise<void> {
    const field = this.field;
    if (!field) return;
    const name = field.value.trim();
    if (!name) {
      field.reject();
      return;
    }
    const type =
      this.section === "friends"
        ? "friend.request"
        : this.section === "party"
          ? "party.invite"
          : "block.add";
    const r = await ask(this.link, type, { name });
    if (r.ok) field.value = "";
    else field.reject();
  }

  private redraw(): void {
    const rows =
      this.section === "friends"
        ? this.friendRows()
        : this.section === "party"
          ? this.partyRows()
          : this.blockRows();
    this.list?.destroy();
    const top = 40;
    const visible = Math.floor((this.size.h - 24 - top - 4) / ROW);
    this.list = new List(this.ctx, 8, top, {
      w: this.size.w - 16,
      visible,
      rowH: ROW,
      rows,
    });
    this.body.add(this.list);
    this.empty(rows.length === 0, top);
    this.paintCount();
    if (this.section === "party") this.body.add(this.partyFoot());
  }

  private paintCount(): void {
    const s = this.link.social;
    const text =
      this.section === "friends"
        ? `${s.friends.size} / ${FRIEND_CAP}`
        : this.section === "party"
          ? s.party
            ? `${s.party.members.length} / ${PARTY_MAX}`
            : ""
          : s.blocks.size > 0
            ? `${s.blocks.size} / ${BLOCK_CAP}`
            : "";
    this.count.set(text);
    this.count.at(this.size.w - 8 - this.count.width, 6);
  }

  /** A narrative line on an empty list, when there is one. */
  private empty(on: boolean, top: number): void {
    if (!on) return;
    const said = line(`social.empty.${this.section}`);
    if (!said) return;
    const label = new Label(this.ctx.scene, 16, top + 8, said, {
      font: "galmuri11",
      color: "stone.dark",
      width: this.size.w - 32,
      leading: 2,
    });
    this.body.add(label.obj);
  }

  // 친구 ----------------------------------------------------------------------------------------

  private friendRows(): ListRow[] {
    const link = this.link;
    const s = link.social;
    const rows: ListRow[] = [];
    for (const r of s.requests.in) {
      rows.push({
        draw: (into, w, _h, ctx) => {
          into.add(into.scene.add.image(4, 1, "ui", "menu/friends").setOrigin(0));
          text(into, 24, 4, r.name, "ink.dark", "galmuri11-bold");
          verbs(into, ctx, w - 6, 5, [
            {
              label: t("social.accept"),
              strong: true,
              run: () => void ask(link, "friend.accept", { id: r.id }),
            },
            {
              label: t("social.decline"),
              run: () => void ask(link, "friend.decline", { id: r.id }),
            },
          ]);
        },
        activate: () => void ask(link, "friend.accept", { id: r.id }),
      });
    }
    for (const r of s.requests.out) {
      rows.push({
        draw: (into, w, _h, ctx) => {
          into.add(into.scene.add.image(4, 1, "ui", "menu/friends").setOrigin(0).setAlpha(0.5));
          text(into, 24, 4, r.name, "stone.dark");
          verbs(into, ctx, w - 6, 5, [
            { label: t("social.cancel"), run: () => void ask(link, "friend.cancel", { id: r.id }) },
          ]);
        },
      });
    }
    const friends = link.friends();
    // Who is in school first, then everyone else, each by name.
    friends.sort((a, b) => Number(b.online) - Number(a.online));
    for (const f of friends) {
      rows.push({
        draw: (into, w, _h, ctx) => {
          presencePin(into, 6, 6, f.online);
          majorIcon(into, 16, 1, f.major);
          const name = text(into, 35, 4, f.name, f.online ? "ink.dark" : "stone.dark");
          text(
            into,
            39 + name.width,
            5,
            t("social.level", { n: f.level }),
            "stone.dark",
            "galmuri9",
          );
          const end = verbs(
            into,
            ctx,
            w - 6,
            5,
            ctx.focused
              ? [
                  ...(f.online
                    ? [{ label: t("social.whisper"), run: () => this.actions.whisper(f.name) }]
                    : []),
                  ...(f.online && this.leads()
                    ? [
                        {
                          label: t("friends.party"),
                          run: () => void ask(link, "party.invite", { name: f.name }),
                        },
                      ]
                    : []),
                  {
                    label: t("social.unfriend"),
                    run: () => void ask(link, "friend.remove", { id: f.id }),
                  },
                ]
              : [],
          );
          if (!ctx.focused && f.online) {
            const where = mapName(f.map);
            if (where) {
              const label = text(into, 0, 5, where, "stone.dark", "galmuri9");
              label.at(Math.min(end, w - 6) - label.width, 5);
            }
          }
          ctx.zone(0, 0, 150, ROW, () => this.actions.card({ id: f.id, name: f.name }));
        },
        activate: () => this.actions.card({ id: f.id, name: f.name }),
      });
    }
    return rows;
  }

  // 파티 -----------------------------------------------------------------------------------------

  private partyRows(): ListRow[] {
    const link = this.link;
    const s = link.social;
    const rows: ListRow[] = [];
    for (const inv of s.partyInvites) {
      if (link.isBlocked(inv.from.id)) continue;
      rows.push({
        draw: (into, w, _h, ctx) => {
          into.add(into.scene.add.image(4, 3, "ui", "crown/idle").setOrigin(0));
          text(into, 16, 4, inv.from.name, "ink.dark", "galmuri11-bold");
          verbs(into, ctx, w - 6, 5, [
            {
              label: t("social.accept"),
              strong: true,
              run: () => void ask(link, "party.accept", { id: inv.id }),
            },
            {
              label: t("social.decline"),
              run: () => void ask(link, "party.decline", { id: inv.id }),
            },
          ]);
        },
        activate: () => void ask(link, "party.accept", { id: inv.id }),
      });
    }
    const party = s.party;
    if (!party) return rows;
    const leader = party.leader === link.me;
    for (const m of party.members) rows.push(this.memberRow(m, party.leader, leader));
    for (const inv of party.invited) {
      rows.push({
        draw: (into, w) => {
          text(into, 16, 4, inv.name, "stone.dark");
          const left = text(into, 0, 5, timeLeft(inv.expiresAt), "stone.light", "galmuri9");
          left.at(w - 6 - left.width, 5);
        },
      });
    }
    return rows;
  }

  private memberRow(m: PartyMember, leaderId: string, iLead: boolean): ListRow {
    const link = this.link;
    const me = m.id === link.me;
    return {
      draw: (into, w, _h, ctx) => {
        if (m.id === leaderId)
          into.add(into.scene.add.image(4, 3, "ui", "crown/idle").setOrigin(0));
        majorIcon(into, 13, 1, m.major);
        const name = text(into, 32, 4, m.name, m.online ? "ink.dark" : "stone.dark");
        text(into, 36 + name.width, 5, t("social.level", { n: m.level }), "stone.dark", "galmuri9");
        if (!m.online) into.add(into.scene.add.image(w - 14, 5, "ui", "offline/idle").setOrigin(0));
        if (iLead && !me && ctx.focused) {
          verbs(into, ctx, w - 6, 5, [
            ...(m.online
              ? [{ label: t("party.lead"), run: () => void ask(link, "party.lead", { id: m.id }) }]
              : []),
            {
              label: t("party.kick"),
              strong: true,
              run: () => void ask(link, "party.kick", { id: m.id }),
            },
          ]);
        } else if (m.online) {
          const where = mapName(m.map);
          if (where) {
            const label = text(into, 0, 5, where, "stone.dark", "galmuri9");
            label.at(w - 6 - label.width, 5);
          }
        }
        if (!me) ctx.zone(0, 0, 150, ROW, () => this.actions.card({ id: m.id, name: m.name }));
      },
      ...(me ? {} : { activate: () => this.actions.card({ id: m.id, name: m.name }) }),
    };
  }

  /** Leave, under the party list. */
  private partyFoot(): Phaser.GameObjects.GameObject[] {
    if (!this.link.social.party) return [];
    const b = new Button(this.ctx, this.size.w - 8 - 64, this.size.h - 24 - 22, {
      label: t("party.leave"),
      w: 64,
      h: 19,
      font: "galmuri9",
      onPress: () => void ask(this.link, "party.leave", {}),
    });
    return [b];
  }

  // 차단 -----------------------------------------------------------------------------------------

  private blockRows(): ListRow[] {
    const link = this.link;
    const blocked: Person[] = [...link.social.blocks.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "ko"),
    );
    return blocked.map((p) => ({
      draw: (into, w, _h, ctx) => {
        text(into, 8, 4, p.name, "stone.dark");
        verbs(into, ctx, w - 6, 5, [
          { label: t("social.unblock"), run: () => void ask(link, "block.remove", { id: p.id }) },
        ]);
      },
      activate: () => void ask(link, "block.remove", { id: p.id }),
    }));
  }
}
