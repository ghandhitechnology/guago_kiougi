import {
  CLUB_FOUND_LEVEL,
  CLUB_NOTICE_LENGTH,
  CLUB_SIZE,
  type ClubMember,
  type ClubRank,
  type ClubSummary,
  type ClubView,
  clubLevelExp,
  clubMay,
  JOIN_RULES,
  type JoinRule,
} from "@guago/shared";
import * as Phaser from "phaser";
import { hud } from "../hud/store.ts";
import { t } from "../i18n/index.ts";
import type { MenuTab } from "../menu/notebook.ts";
import { Button } from "../ui/button.ts";
import { List, type ListRow } from "../ui/list.ts";
import { turnPage } from "../ui/motion.ts";
import { Label } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import type { WorldLink } from "../world-link.ts";
import { ask } from "./act.ts";
import { emblemTexture, jacketTexture } from "./emblem.ts";
import { openJacketEditor } from "./jacket-editor.ts";
import { majorIcon, presencePin, text, verbs } from "./rows.ts";
import { Segments } from "./segments.ts";
import { openSheet } from "./sheet.ts";
import { line } from "./words.ts";

/** What the club page hands to other screens. */
export interface ClubActions {
  card(target: { id: string; name: string }): void;
}

type Section = "members" | "notices" | "jacket" | "manage";

const ROW = 18;
const RANK_COLOR: Readonly<Record<ClubRank, string>> = {
  leader: "red.mid",
  vice: "navy.mid",
  member: "stone.dark",
};

export function clubTab(
  link: () => WorldLink | undefined,
  actions: ClubActions,
  order = 70,
): MenuTab {
  return {
    id: "club",
    label: t("club.tab"),
    icon: "menu/club",
    order,
    build(ctx, page, size) {
      const l = link();
      if (l) new ClubPage(ctx, page, size, l, actions);
    },
  };
}

let lastSection: Section = "members";

/**
 * 동아리 (PLAN §12, §18). Outside a club: the clubs there are, searched by name, each opening to
 * its card with 가입 or 가입 신청, the player's own invites and applications on top, and 동아리
 * 만들기. Inside: the club's emblem, name and level over four sections, 부원 with what each rank
 * may do to whom, 공지, 과잠, and 관리 for the officers.
 */
class ClubPage {
  private readonly ctx: Ctx;
  private readonly link: WorldLink;
  private readonly actions: ClubActions;
  private readonly root: Phaser.GameObjects.Container;
  private readonly size: { w: number; h: number };
  private body: Phaser.GameObjects.Container | undefined;
  private section: Section = lastSection;
  private list: List | undefined;
  /** Outside a club: the search's results so far, and the club opened from them. */
  private found: ClubSummary[] = [];
  private more = false;
  private query = "";
  private viewing: ClubSummary | undefined;
  private inClub: number | null;

  constructor(
    ctx: Ctx,
    page: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    link: WorldLink,
    actions: ClubActions,
  ) {
    this.ctx = ctx;
    this.link = link;
    this.actions = actions;
    this.size = size;
    this.root = ctx.scene.add.container(0, 5);
    page.add(this.root);
    this.inClub = link.social.club?.id ?? null;
    const off = link.on((e) => {
      if (e.type !== "social") return;
      const t = e.event.t;
      if (t === "club" || t === "all") {
        const now = link.social.club?.id ?? null;
        if (now !== this.inClub) {
          this.inClub = now;
          this.viewing = undefined;
          turnPage(this.root, () => this.build());
          return;
        }
        this.build();
      } else if (
        t === "clubExp" ||
        t === "clubInvites" ||
        t === "applications" ||
        t === "applicants"
      ) {
        this.build();
      }
    });
    this.root.once(Phaser.GameObjects.Events.DESTROY, off);
    this.build();
    if (!link.social.club) void this.search("");
  }

  private build(): void {
    for (const o of [...this.root.list]) o.destroy();
    this.list = undefined;
    const club = this.link.social.club;
    if (club) this.buildClub(club);
    else if (this.viewing) this.buildView(this.viewing);
    else this.buildOutside();
  }

  // Outside a club ------------------------------------------------------------------------------

  private buildOutside(): void {
    const { ctx, link } = this;
    const scene = ctx.scene;
    const w = this.size.w - 16;
    const field = new TextField(ctx, 8, 0, {
      label: t("club.name"),
      w: w - 112,
      maxLength: 20,
      enterKeyHint: "send",
      onSubmit: () => void this.search(field.value.trim()),
    });
    field.value = this.query;
    let typing: Phaser.Time.TimerEvent | undefined;
    field.field.addEventListener("input", () => {
      typing?.remove();
      typing = scene.time.delayedCall(320, () => void this.search(field.value.trim()));
    });
    const level = hud.get().player?.level ?? 0;
    const create = new Button(ctx, 8 + w - 104, 13, {
      label: t("club.create"),
      kind: "ink",
      w: 104,
      h: 20,
      font: "galmuri9",
      sound: "confirm",
      onPress: () => openJacketEditor(scene, link, { kind: "create" }),
    });
    create.setEnabled(level >= CLUB_FOUND_LEVEL);
    this.root.add([field, create]);
    if (level < CLUB_FOUND_LEVEL) {
      const need = new Label(scene, 0, 0, t("social.level", { n: CLUB_FOUND_LEVEL }), {
        font: "galmuri9",
        color: "stone.dark",
      });
      need.at(8 + w - need.width, 36);
      this.root.add(need.obj);
    }

    const rows: ListRow[] = [];
    for (const inv of link.social.clubInvites) {
      if (link.isBlocked(inv.from.id)) continue;
      rows.push({
        draw: (into, rw, _h, row) => {
          into.add(into.scene.add.image(4, 1, "ui", "menu/club").setOrigin(0));
          const n = text(into, 24, 4, inv.club.name, "ink.dark", "galmuri11-bold");
          text(into, 28 + n.width, 5, inv.from.name, "stone.dark", "galmuri9");
          verbs(into, row, rw - 6, 5, [
            {
              label: t("social.accept"),
              strong: true,
              run: () => void ask(link, "club.accept", { id: inv.club.id }),
            },
            {
              label: t("social.decline"),
              run: () => void ask(link, "club.decline", { id: inv.club.id }),
            },
          ]);
        },
        activate: () => void ask(link, "club.accept", { id: inv.club.id }),
      });
    }
    for (const app of link.social.applications) {
      rows.push({
        draw: (into, rw, _h, row) => {
          into.add(into.scene.add.image(4, 1, "ui", "menu/club").setOrigin(0).setAlpha(0.5));
          text(into, 24, 4, app.club.name, "stone.dark");
          verbs(into, row, rw - 6, 5, [
            {
              label: t("club.withdraw"),
              run: () => void ask(link, "club.withdraw", { id: app.club.id }),
            },
          ]);
        },
      });
    }
    for (const c of this.found) rows.push(this.summaryRow(c));
    if (this.more) {
      rows.push({
        draw: (into, rw, _h, row) => {
          const l = text(
            into,
            0,
            5,
            t("board.next"),
            row.focused ? "navy.mid" : "stone.dark",
            "galmuri9",
          );
          l.at(Math.floor((rw - l.width) / 2), 5);
          row.zone(0, 0, rw, ROW, () => void this.search(this.query, true));
        },
        activate: () => void this.search(this.query, true),
      });
    }
    this.showList(rows, 44);
    const said = rows.length === 0 ? line("social.empty.clubs") : undefined;
    if (said) {
      this.root.add(
        new Label(scene, 16, 54, said, { font: "galmuri11", color: "stone.dark", width: w - 16 })
          .obj,
      );
    }
  }

  private summaryRow(c: ClubSummary): ListRow {
    return {
      draw: (into, rw, _h, row) => {
        into.add(into.scene.add.image(4, 3, emblemTexture(into.scene, c.emblem, "s")).setOrigin(0));
        const n = text(into, 20, 4, c.name, "ink.dark");
        text(into, 24 + n.width, 5, t("social.level", { n: c.level }), "stone.dark", "galmuri9");
        const right = text(into, 0, 5, `${c.members}/${CLUB_SIZE}`, "stone.dark", "galmuri9");
        right.at(rw - 6 - right.width, 5);
        const rule = text(into, 0, 5, t(`club.rule.${c.joinRule}`), "stone.light", "galmuri9");
        rule.at(rw - 6 - right.width - 10 - rule.width, 5);
        row.zone(0, 0, rw, ROW, () => this.open(c));
      },
      activate: () => this.open(c),
    };
  }

  private open(c: ClubSummary): void {
    this.viewing = c;
    turnPage(this.root, () => this.build());
    // The summary may be old: read it again.
    void this.link.request("club.view", { id: c.id }).then((r) => {
      if (r.ok && r.data.club && this.viewing?.id === c.id) {
        this.viewing = r.data.club;
        this.build();
      }
    });
  }

  private async search(q: string, next = false): Promise<void> {
    const after = next ? this.found.at(-1)?.name : undefined;
    const r = await this.link.request("club.search", {
      ...(q ? { q } : {}),
      ...(after ? { after } : {}),
    });
    if (!r.ok || this.link.social.club || !this.root.active) return;
    this.query = q;
    this.found = next ? [...this.found, ...r.data.clubs] : r.data.clubs;
    this.more = r.data.more;
    if (!this.viewing) this.build();
  }

  /** A club's card: its emblem doubled, name, level, 짱, size and how to join. */
  private buildView(c: ClubSummary): void {
    const { ctx, link } = this;
    const scene = ctx.scene;
    const w = this.size.w - 16;
    const back = new Button(ctx, 8, 0, {
      label: t("club.back"),
      kind: "text",
      onPress: () => {
        this.viewing = undefined;
        turnPage(this.root, () => this.build());
      },
    });
    const jacket = scene.add.image(8, 20, jacketTexture(scene, c.jacket)).setOrigin(0).setScale(2);
    const badge = scene.add
      .image(8 + 24, 20 + 28, emblemTexture(scene, c.emblem, "l"))
      .setOrigin(0)
      .setScale(2);
    this.root.add([back, jacket, badge]);
    const x = 118;
    const name = new Label(scene, x, 26, c.name, { font: "galmuri11-bold", color: "ink.dark" });
    this.root.add(name.obj);
    const rows: [string, string][] = [
      [t("social.level", { n: c.level }), `${c.members}/${CLUB_SIZE}`],
      [t("club.rank.leader"), c.leader.name],
      [t("club.rule"), t(`club.rule.${c.joinRule}`)],
    ];
    rows.forEach(([k, v], i) => {
      const y = 46 + i * 16;
      this.root.add(new Label(scene, x, y, k, { font: "galmuri9", color: "stone.dark" }).obj);
      this.root.add(new Label(scene, x + 60, y, v, { font: "galmuri11", color: "ink.dark" }).obj);
    });
    const applied = link.social.applications.some((a) => a.club.id === c.id);
    if (c.joinRule !== "invite") {
      const join = new Button(ctx, 8 + w - 96, this.size.h - 24 - 18, {
        label: applied
          ? t("club.withdraw")
          : c.joinRule === "open"
            ? t("club.join")
            : t("club.apply"),
        kind: applied ? "paper" : "ink",
        w: 96,
        sound: "confirm",
        onPress: () =>
          void (applied
            ? ask(link, "club.withdraw", { id: c.id })
            : ask(link, "club.join", { id: c.id })),
      });
      this.root.add(join);
    }
  }

  // Inside a club -------------------------------------------------------------------------------

  private rank(club: ClubView): ClubRank {
    return club.members.find((m) => m.id === this.link.me)?.rank ?? "member";
  }

  private buildClub(club: ClubView): void {
    const { ctx } = this;
    const scene = ctx.scene;
    const w = this.size.w - 16;
    const rank = this.rank(club);
    // The head: emblem, name, level and how far to the next, members.
    const badge = scene.add.image(8, 0, emblemTexture(scene, club.emblem, "l")).setOrigin(0);
    const name = new Label(scene, 38, 2, club.name, { font: "galmuri11-bold", color: "ink.dark" });
    const lv = new Label(scene, 42 + name.width, 3, t("social.level", { n: club.level }), {
      font: "galmuri9",
      color: "stone.dark",
    });
    const count = new Label(scene, 0, 3, `${club.members.length}/${CLUB_SIZE}`, {
      font: "galmuri9",
      color: "stone.dark",
    });
    count.at(8 + w - count.width, 3);
    const [bl, br, bt, bb] = sliceOf("bar-thin");
    const groove = scene.add
      .nineslice(38, 16, "ui", "bar-thin/idle", 120, 5, bl, br, bt, bb)
      .setOrigin(0);
    const from = clubLevelExp(club.level);
    const to = clubLevelExp(club.level + 1);
    const k = to > from ? Phaser.Math.Clamp((club.exp - from) / (to - from), 0, 1) : 1;
    const [fl, fr, ft, fb] = sliceOf("fill-thin");
    const fill = scene.add
      .nineslice(39, 17, "ui", "fill-thin/exp", Math.max(3, Math.round(118 * k)), 3, fl, fr, ft, fb)
      .setOrigin(0);
    this.root.add([badge, name.obj, lv.obj, count.obj, groove, fill]);
    const sections: { id: Section; label: string }[] = [
      { id: "members", label: t("club.members") },
      { id: "notices", label: t("club.notices") },
      { id: "jacket", label: t("club.jacket") },
      ...(rank !== "member" ? [{ id: "manage" as const, label: t("club.manage") }] : []),
    ];
    if (!sections.some((s) => s.id === this.section)) this.section = "members";
    const seg = new Segments(ctx, 9, 30, {
      items: sections,
      selected: this.section,
      onChange: (id) => {
        this.section = id as Section;
        lastSection = this.section;
        const body = this.body;
        if (body) turnPage(body, () => this.buildSection(club));
      },
    });
    const rule = scene.add.rectangle(8, 46, w, 1, paint("stone.light")).setOrigin(0);
    this.body = scene.add.container(0, 50);
    this.root.add([seg, rule, this.body]);
    this.buildSection(club);
  }

  private buildSection(club: ClubView): void {
    const body = this.body;
    if (!body) return;
    for (const o of [...body.list]) o.destroy();
    this.list = undefined;
    switch (this.section) {
      case "members":
        return this.members(club, body);
      case "notices":
        return this.notices(club, body);
      case "jacket":
        return this.jacket(club, body);
      case "manage":
        return this.manage(club, body);
    }
  }

  private members(club: ClubView, body: Phaser.GameObjects.Container): void {
    const link = this.link;
    const mine = this.rank(club);
    const order: Readonly<Record<ClubRank, number>> = { leader: 0, vice: 1, member: 2 };
    const members = [...club.members].sort(
      (a, b) =>
        order[a.rank] - order[b.rank] ||
        Number(link.presence.has(b.id)) - Number(link.presence.has(a.id)) ||
        a.name.localeCompare(b.name, "ko"),
    );
    const rows = members.map((m) => this.memberRow(m, mine));
    this.showList(rows, 0, body);
  }

  private memberRow(m: ClubMember, mine: ClubRank): ListRow {
    const link = this.link;
    const me = m.id === link.me;
    const may = (action: "kick" | "rank" | "handover") => !me && clubMay(mine, action, m.rank);
    return {
      draw: (into, rw, _h, row) => {
        const online = link.presence.has(m.id);
        presencePin(into, 5, 6, online);
        const r = text(into, 14, 5, t(`club.rank.${m.rank}`), RANK_COLOR[m.rank], "galmuri9");
        majorIcon(into, 18 + Math.max(18, r.width), 1, m.major);
        const nx = 38 + Math.max(18, r.width);
        const n = text(into, nx, 4, m.name, online ? "ink.dark" : "stone.dark");
        text(
          into,
          nx + 4 + n.width,
          5,
          t("social.level", { n: m.level }),
          "stone.dark",
          "galmuri9",
        );
        if (!row.focused) {
          if (!me) row.zone(0, 0, nx + n.width, ROW, () => this.actions.card(m));
          return;
        }
        const list: { label: string; run: () => void; strong?: boolean }[] = [];
        if (may("rank")) {
          list.push(
            m.rank === "member"
              ? {
                  label: t("club.promote"),
                  run: () => void ask(link, "club.rank", { id: m.id, rank: "vice" }),
                }
              : {
                  label: t("club.demote"),
                  run: () => void ask(link, "club.rank", { id: m.id, rank: "member" }),
                },
          );
        }
        if (may("handover")) {
          list.push({ label: t("club.handover"), run: () => this.handover(m) });
        }
        if (may("kick")) {
          list.push({
            label: t("club.kick"),
            strong: true,
            run: () => void ask(link, "club.kick", { id: m.id }),
          });
        }
        if (me && mine !== "leader") {
          list.push({
            label: t("club.leave"),
            strong: true,
            run: () => void ask(link, "club.leave", {}),
          });
        }
        verbs(into, row, rw - 6, 5, list);
        if (!me) row.zone(0, 0, nx + n.width, ROW, () => this.actions.card(m));
      },
      ...(me ? {} : { activate: () => this.actions.card(m) }),
    };
  }

  /** Handing over the club is final: a sheet asks once more, with the member's name. */
  private handover(m: ClubMember): void {
    openSheet(this.ctx.scene, {
      title: t("club.handover"),
      w: 220,
      h: 96,
      build: (sheet) => {
        const { ctx, panel, page } = sheet;
        panel.add(
          new Label(ctx.scene, page.x + 8, page.y + 10, m.name, {
            font: "galmuri11-bold",
            color: "ink.dark",
          }).obj,
        );
        panel.add(
          new Button(ctx, page.x + page.w - 8 - 84, page.y + page.h - 8 - 21, {
            label: t("club.handover"),
            kind: "ink",
            w: 84,
            sound: "confirm",
            onPress: () =>
              void ask(this.link, "club.handover", { id: m.id }).then((r) => {
                if (r.ok) sheet.close();
              }),
          }),
        );
      },
    });
  }

  private notices(club: ClubView, body: Phaser.GameObjects.Container): void {
    const { ctx, link } = this;
    const w = this.size.w - 16;
    const officer = this.rank(club) !== "member";
    let top = 0;
    if (officer) {
      const field = new TextField(ctx, 8, 0, {
        w: w - 64,
        maxLength: CLUB_NOTICE_LENGTH,
        enterKeyHint: "send",
        onSubmit: () => void post(),
      });
      const go = new Button(ctx, 8 + w - 58, 0, {
        label: t("club.post"),
        kind: "ink",
        w: 58,
        h: 20,
        sound: "confirm",
        onPress: () => void post(),
      });
      body.add([field, go]);
      top = 26;
      const post = async () => {
        const text = field.value.trim();
        if (!text) return field.reject();
        const r = await ask(link, "club.notice", { text });
        if (r.ok) field.value = "";
        else field.reject();
      };
    }
    const notices = [...club.notices].sort((a, b) => b.at - a.at);
    const rows: ListRow[] = notices.map((n) => ({
      draw: (into, rw, _h, row) => {
        const first = n.text.length > 26 ? `${[...n.text].slice(0, 25).join("")}…` : n.text;
        text(into, 6, 4, first, "ink.dark", "galmuri9");
        const right = text(into, 0, 5, n.author.name, "stone.dark", "galmuri9");
        right.at(rw - 6 - right.width, 5);
        row.zone(0, 0, rw - 60, ROW, () => this.readNotice(club, n));
        if (row.focused && officer) {
          verbs(into, row, rw - 12 - right.width, 5, [
            {
              label: t("club.unpost"),
              strong: true,
              run: () => void ask(link, "club.unnotice", { id: n.id }),
            },
          ]);
        }
      },
      activate: () => this.readNotice(club, n),
    }));
    this.showList(rows, top, body);
  }

  private readNotice(club: ClubView, n: ClubView["notices"][number]): void {
    openSheet(this.ctx.scene, {
      title: club.name,
      w: 260,
      h: 130,
      build: (sheet) => {
        const { panel, page } = sheet;
        const scene = this.ctx.scene;
        panel.add(
          new Label(scene, page.x + 8, page.y + 8, n.text, {
            font: "galmuri11",
            color: "ink.dark",
            width: page.w - 16,
            leading: 2,
          }).obj,
        );
        const by = new Label(scene, 0, 0, `${n.author.name}`, {
          font: "galmuri9",
          color: "stone.dark",
        });
        by.at(page.x + page.w - 8 - by.width, page.y + page.h - 14);
        panel.add(by.obj);
      },
    });
  }

  private jacket(club: ClubView, body: Phaser.GameObjects.Container): void {
    const { ctx, link } = this;
    const scene = ctx.scene;
    const x = Math.floor((this.size.w - 96) / 2) - 40;
    const jacket = scene.add
      .image(x, 2, jacketTexture(scene, club.jacket))
      .setOrigin(0)
      .setScale(2);
    const badge = scene.add
      .image(x + 24, 2 + 28, emblemTexture(scene, club.emblem, "l"))
      .setOrigin(0)
      .setScale(2);
    body.add([jacket, badge]);
    if (clubMay(this.rank(club), "settings")) {
      body.add(
        new Button(ctx, x + 116, 82, {
          label: t("club.design"),
          kind: "ink",
          w: 84,
          sound: "confirm",
          onPress: () => openJacketEditor(scene, link, { kind: "edit", club }),
        }),
      );
    }
  }

  private manage(club: ClubView, body: Phaser.GameObjects.Container): void {
    const { ctx, link } = this;
    const scene = ctx.scene;
    const w = this.size.w - 16;
    const rank = this.rank(club);
    const field = new TextField(ctx, 8, 0, {
      w: w - 64,
      maxLength: 16,
      enterKeyHint: "send",
      onSubmit: () => void invite(),
    });
    const go = new Button(ctx, 8 + w - 58, 0, {
      label: t("social.invite"),
      kind: "ink",
      w: 58,
      h: 20,
      sound: "confirm",
      onPress: () => void invite(),
    });
    body.add([field, go]);
    const invite = async () => {
      const name = field.value.trim();
      if (!name) return field.reject();
      const r = await ask(link, "club.invite", { name });
      if (r.ok) field.value = "";
      else field.reject();
    };
    let y = 26;
    if (clubMay(rank, "settings")) {
      body.add(
        new Label(scene, 8, y + 3, t("club.rule"), { font: "galmuri9", color: "stone.dark" }).obj,
      );
      const rules = new Segments(ctx, 64, y, {
        items: JOIN_RULES.map((r) => ({ id: r, label: t(`club.rule.${r}`) })),
        selected: club.joinRule,
        onChange: (id) => void ask(link, "club.settings", { joinRule: id as JoinRule }),
      });
      const disband = new Button(ctx, 8 + w - 58, y - 2, {
        label: t("club.disband"),
        w: 58,
        h: 18,
        font: "galmuri9",
        onPress: () => this.disband(club),
      });
      body.add([rules, disband]);
      y += 22;
    }
    const rows: ListRow[] = link.social.applicants.map((a) => ({
      draw: (into, rw, _h, row) => {
        majorIcon(into, 4, 1, a.major);
        const n = text(into, 24, 4, a.name, "ink.dark");
        text(into, 28 + n.width, 5, t("social.level", { n: a.level }), "stone.dark", "galmuri9");
        verbs(into, row, rw - 6, 5, [
          {
            label: t("social.accept"),
            strong: true,
            run: () => void ask(link, "club.review", { id: a.id, accept: true }),
          },
          {
            label: t("social.decline"),
            run: () => void ask(link, "club.review", { id: a.id, accept: false }),
          },
        ]);
      },
      activate: () => void ask(link, "club.review", { id: a.id, accept: true }),
    }));
    this.showList(rows, y, body);
  }

  /** Disbanding needs the club's name typed exactly; 해체 waits until it matches. */
  private disband(club: ClubView): void {
    const link = this.link;
    openSheet(this.ctx.scene, {
      title: t("club.disband"),
      w: 240,
      h: 118,
      build: (sheet) => {
        const { ctx, panel, page } = sheet;
        const scene = ctx.scene;
        const said = line("social.club.disband", { name: club.name });
        const shown = new Label(scene, page.x + 8, page.y + 8, said ?? club.name, {
          font: said ? "galmuri11" : "galmuri11-bold",
          color: "ink.dark",
          width: page.w - 16,
        });
        panel.add(shown.obj);
        const go = new Button(ctx, page.x + page.w - 8 - 64, page.y + page.h - 8 - 21, {
          label: t("club.disband"),
          kind: "ink",
          w: 64,
          sound: "confirm",
          onPress: () =>
            void ask(link, "club.disband", { name: club.name }).then((r) => {
              if (r.ok) sheet.close();
            }),
        });
        go.setEnabled(false);
        const field = new TextField(ctx, page.x + 8, page.y + 26, {
          w: page.w - 16,
          maxLength: 20,
          onChange: (v) => go.setEnabled(v.trim() === club.name),
        });
        panel.add([field, go]);
      },
    });
  }

  private showList(rows: ListRow[], top: number, into = this.root): void {
    const bodyTop = into === this.root ? 0 : 50;
    const visible = Math.max(1, Math.floor((this.size.h - 5 - bodyTop - top - 4) / ROW));
    const list = new List(this.ctx, 8, top, {
      w: this.size.w - 16,
      visible,
      rowH: ROW,
      rows,
    });
    into.add(list);
    this.list = list;
  }
}
