import { clubMay, type Major, PARTY_MAX, TRADE } from "@guago/shared";
import * as Phaser from "phaser";
import { composeDoll, Doll, normalizeLook, releaseDoll } from "../doll.ts";
import { WORLD_SCENE } from "../entry.ts";
import { watchFight } from "../hud/fight.ts";
import { hud } from "../hud/store.ts";
import { t, tMaybe } from "../i18n/index.ts";
import { Button } from "../ui/button.ts";
import { FocusScope } from "../ui/focus.ts";
import { fade } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { sliceOf, uiArt } from "../ui/theme.ts";
import { clubDress, clubOf, worldPeople } from "../world/people.ts";
import { worldView } from "../world/view.ts";
import type { WorldLink } from "../world-link.ts";
import { ask } from "./act.ts";
import { emblemTexture } from "./emblem.ts";

/** Who a card is about: whatever the caller knows, at least the name. */
export interface CardTarget {
  readonly name: string;
  /** Character id. */
  readonly id?: string;
  /** Session id in this map room, when the player stands here. */
  readonly sid?: string;
  /** The chat line the card was opened from, attached to a report. */
  readonly line?: number;
  /** Where on screen to open beside, in game pixels. */
  readonly at?: { readonly x: number; readonly y: number };
}

/** What the card's buttons hand to other screens. */
export interface CardActions {
  whisper(name: string): void;
  report(target: { id: string; name: string; line?: number }): void;
  trade?(target: { id: string; name: string }): void;
}

const W = 150;
const BAND = 21;
/**
 * The card closes once the two walk apart: past this far, or past where they stood when it
 * opened with some room to spare, whichever is further.
 */
const FAR_PX = 140;
const SPARE_PX = 48;

/**
 * The player card (PLAN §12): a 학생증 that opens beside a player tapped, clicked or long-pressed,
 * with their look, name, level, major and club, and the actions that apply between the two of
 * them. It never takes the keyboard, so a player can keep walking and fighting with it open; it
 * closes on a tap elsewhere, on Escape, on walking away, or when a fight starts.
 */
export class PlayerCard {
  private readonly scene: Phaser.Scene;
  private readonly link: WorldLink;
  private readonly actions: CardActions;
  private root: Phaser.GameObjects.Container | undefined;
  private catcher: Phaser.GameObjects.Zone | undefined;
  private doll: { sprite: Doll; key: string } | undefined;
  private target: CardTarget | undefined;
  /** How far apart the two stood when the card opened, once both were seen. */
  private openDist: number | undefined;
  private readonly unfight: () => void;
  private readonly unsocial: () => void;

  constructor(scene: Phaser.Scene, link: WorldLink, actions: CardActions) {
    this.scene = scene;
    this.link = link;
    this.actions = actions;
    this.unfight = watchFight((live) => {
      if (live) this.close();
    });
    // Friend, party, club and block changes redraw the buttons that apply.
    this.unsocial = link.on((e) => {
      if (e.type === "social" && e.event.t !== "vitals" && e.event.t !== "emote" && this.target) {
        this.draw(this.target, false);
      }
    });
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  get isOpen(): boolean {
    return this.root !== undefined;
  }

  open(target: CardTarget): void {
    if (target.name === hud.get().player?.name) return;
    this.openDist = undefined;
    this.draw(target, true);
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = undefined;
    this.target = undefined;
    this.catcher?.destroy();
    this.catcher = undefined;
    const doll = this.doll;
    this.doll = undefined;
    sound("close");
    fade(root, 0, 100, () => {
      root.destroy();
      if (doll) releaseDoll(this.scene, doll.key);
    });
  }

  destroy(): void {
    this.close();
    this.unfight();
    this.unsocial();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  /** Who the target is now: presence for id, level and major; the map room for look and club. */
  private resolve(target: CardTarget) {
    const entry =
      (target.id ? this.link.presence.get(target.id) : undefined) ??
      [...this.link.presence.values()].find((p) => p.name === target.name);
    const sid = target.sid ?? worldPeople.sidOf(target.name);
    const body = sid ? worldPeople.get(sid) : undefined;
    return {
      id: entry?.id ?? target.id,
      name: entry?.name ?? target.name,
      online: entry !== undefined,
      level: entry?.level,
      major: (entry?.major ?? body?.major) as Major | undefined,
      sid,
      body,
      club: body ? clubOf(body) : undefined,
    };
  }

  private draw(target: CardTarget, fresh: boolean): void {
    const scene = this.scene;
    const who = this.resolve(target);
    const wasAt = this.root ? { x: this.root.x, y: this.root.y } : undefined;
    this.root?.destroy();
    if (this.doll) releaseDoll(scene, this.doll.key);
    this.doll = undefined;
    this.target = target;

    const scope = new FocusScope();
    const ctx = { scene, scope };
    const root = scene.add.container(0, 0).setDepth(760);
    this.root = root;

    // The band: name and level on navy.
    const buttons = this.buttons(who);
    const rows = Math.ceil(buttons.length / 2);
    const look = who.body?.look;
    const info = look ? 44 : who.club ? 34 : 24;
    const h = BAND + info + rows * 21 + 5;
    const [l, r, tt, b] = sliceOf("idcard");
    const card = scene.add.nineslice(0, 0, "ui", "idcard/idle", W, h, l, r, tt, b).setOrigin(0);
    card.setInteractive();
    root.add(card);
    const name = new Label(scene, 7, 6, who.name, {
      font: "galmuri11-bold",
      color: "stone.bright",
    });
    root.add(name.obj);
    if (who.level !== undefined) {
      const lv = new Label(scene, 0, 7, t("social.level", { n: who.level }), {
        font: "galmuri9",
        color: "navy.pale",
        width: W - 14,
        align: "right",
      });
      lv.at(7, 7);
      root.add(lv.obj);
    }

    // The photo: the student as they look today, breathing.
    const left = look ? 42 : 7;
    if (look) {
      const [il, ir, it, ib] = sliceOf("inset");
      root.add(
        scene.add.nineslice(6, BAND + 3, "ui", "inset/idle", 30, 38, il, ir, it, ib).setOrigin(0),
      );
      const meta = uiArt();
      const dressed = normalizeLook(
        meta,
        clubDress(
          {
            body: look.body,
            hair: look.hair,
            hairColor: look.hairColor,
            face: look.face,
            uniform: look.uniform,
            accessories: [...look.accessories],
          },
          who.body ?? { clubId: 0, jacket: "", emblem: "" },
        ),
      );
      const key = composeDoll(scene, meta, dressed);
      const sprite = new Doll(scene, meta, 21, BAND + 36, key);
      root.add(sprite);
      this.doll = { sprite, key };
    }

    // Major and club.
    let y = BAND + 4;
    if (who.major) {
      root.add(scene.add.image(left, y, "ui", `emblem/${who.major}`).setOrigin(0));
      const major = new Label(scene, left + 19, y + 4, tMaybe(`major.${who.major}`) ?? "", {
        font: "galmuri11",
        color: "ink.dark",
      });
      root.add(major.obj);
    }
    y += 20;
    if (who.club) {
      root.add(
        scene.add.image(left + 2, y, emblemTexture(scene, who.club.emblem, "s")).setOrigin(0),
      );
      const club = new Label(scene, left + 17, y + 2, who.club.name, {
        font: "galmuri9",
        color: "ink.dark",
      });
      root.add(club.obj);
    }

    // What the two of them can do.
    const bw = Math.floor((W - 12 - 4) / 2);
    buttons.forEach((btn, i) => {
      const bx = 6 + (i % 2) * (bw + 4);
      const by = BAND + info + Math.floor(i / 2) * 21;
      const key = new Button(ctx, bx, by, {
        label: btn.label,
        w: bw,
        h: 19,
        font: "galmuri9",
        onPress: () => {
          btn.run();
          if (btn.closes) this.close();
        },
      });
      if (btn.off) key.setEnabled(false);
      root.add(key);
    });

    // Beside the player on screen, or where it was, kept on screen.
    const at = wasAt ?? this.anchor(target, who.sid, h);
    root.setPosition(at.x, at.y);
    if (fresh) {
      sound("open");
      root.setAlpha(0).setScale(0.92);
      scene.tweens.add({ targets: root, alpha: 1, scale: 1, duration: 120, ease: "Back.Out" });
      this.catchOutside();
    }
  }

  /** A tap anywhere else closes the card; that tap does nothing else. */
  private catchOutside(): void {
    this.catcher?.destroy();
    const z = this.scene.add
      .zone(0, 0, this.scene.scale.width, this.scene.scale.height)
      .setOrigin(0)
      .setDepth(759)
      .setInteractive();
    z.on("pointerdown", () => this.close());
    this.catcher = z;
  }

  private anchor(target: CardTarget, sid: string | undefined, h: number): { x: number; y: number } {
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    let x = (sw - W) / 2;
    let y = (sh - h) / 2;
    const feet = sid ? worldView.others.get(sid) : undefined;
    const cam = this.scene.scene.get(WORLD_SCENE)?.cameras?.main;
    const at =
      target.at ??
      (feet && cam ? { x: feet.x - cam.worldView.x, y: feet.y - cam.worldView.y } : undefined);
    if (at) {
      // To the right of the player, unless that runs off screen.
      x = at.x + 14 + W <= sw - 4 ? at.x + 14 : at.x - 14 - W;
      y = at.y - h / 2 - 12;
    }
    return {
      x: Math.round(Phaser.Math.Clamp(x, 4, sw - W - 4)),
      y: Math.round(Phaser.Math.Clamp(y, 4, sh - h - 4)),
    };
  }

  private buttons(who: ReturnType<PlayerCard["resolve"]>) {
    const link = this.link;
    const s = link.social;
    const out: { label: string; run: () => void; closes: boolean; off?: boolean }[] = [];
    const id = who.id;
    const name = who.name;
    const blocked = id !== undefined && link.isBlocked(id);
    const me = link.me;
    if (!blocked && who.online) {
      out.push({ label: t("social.whisper"), run: () => this.actions.whisper(name), closes: true });
    }
    const friend = id !== undefined && s.friends.has(id);
    const asked = s.requests.out.some((r) => r.id === id || r.name === name);
    if (!blocked && !friend && !asked) {
      out.push({
        label: t("social.friend"),
        run: () =>
          void ask(
            link,
            "friend.request",
            { name },
            {
              id: "social.friend.request-sent",
              params: { player: name },
            },
          ),
        closes: false,
      });
    }
    const party = s.party;
    const inMine =
      (party?.members.some((m) => m.id === id) ?? false) ||
      (party?.invited.some((p) => p.id === id || p.name === name) ?? false);
    const leads = !party || party.leader === me;
    if (!blocked && who.online && !inMine && leads && (party?.members.length ?? 1) < PARTY_MAX) {
      out.push({
        label: t("social.party"),
        run: () =>
          void ask(
            link,
            "party.invite",
            { name },
            {
              id: "social.party.invite-sent",
              params: { player: name },
            },
          ),
        closes: false,
      });
    }
    const rank = s.club?.members.find((m) => m.id === me)?.rank;
    if (!blocked && rank && clubMay(rank, "invite") && !who.club) {
      out.push({
        label: t("social.club"),
        run: () =>
          void ask(
            link,
            "club.invite",
            { name },
            {
              id: "social.club.invite-sent",
              params: { player: name },
            },
          ),
        closes: false,
      });
    }
    const myLevel = hud.get().player?.level ?? 0;
    const trade = this.actions.trade;
    if (
      trade &&
      id &&
      !blocked &&
      who.sid &&
      myLevel >= TRADE.level &&
      (who.level ?? 0) >= TRADE.level
    ) {
      out.push({ label: t("social.trade"), run: () => trade({ id, name }), closes: true });
    }
    // 결투 waits for the arena's challenge messages: the key is there, and does nothing yet.
    if (id && !blocked && who.online) {
      out.push({ label: t("social.duel"), run: () => {}, closes: false, off: true });
    }
    if (id) {
      out.push(
        blocked
          ? {
              label: t("social.unblock"),
              run: () => void ask(link, "block.remove", { id }),
              closes: false,
            }
          : {
              label: t("social.block"),
              run: () => void ask(link, "block.add", { id }),
              closes: false,
            },
      );
      const line = this.target?.line;
      out.push({
        label: t("social.report"),
        run: () => this.actions.report({ id, name, ...(line === undefined ? {} : { line }) }),
        closes: true,
      });
    }
    return out;
  }

  /** Walking away from whoever the card is about, or them leaving the map, closes it. */
  private tick(): void {
    const target = this.target;
    if (!target || !this.root) return;
    const sid = target.sid ?? worldPeople.sidOf(target.name);
    if (!sid) return;
    const them = worldView.others.get(sid);
    const me = worldView.self;
    if (!them) {
      if (target.sid) this.close();
      return;
    }
    if (!me) return;
    const d = Math.hypot(them.x - me.x, them.y - me.y);
    this.openDist ??= d;
    if (d > Math.max(FAR_PX, this.openDist + SPARE_PX)) this.close();
  }
}
