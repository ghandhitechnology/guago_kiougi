import type { PartyMember, PartyView } from "@guago/shared";
import type * as Phaser from "phaser";
import { fade, slide } from "../ui/motion.ts";
import { Label } from "../ui/text.ts";
import { sliceOf } from "../ui/theme.ts";
import type { WorldLink } from "../world-link.ts";

const W = 86;
const H = 24;
const GAP = 3;
/** Health under this share of the bar burns brighter. */
const LOW = 30;

interface Frame {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;
  readonly fill: Phaser.GameObjects.NineSlice;
  readonly groove: Phaser.GameObjects.NineSlice;
  readonly pip: Phaser.GameObjects.Image;
  readonly away: Phaser.GameObjects.Image;
  readonly name: Label;
  readonly crown: Phaser.GameObjects.Image;
  readonly emblem: Phaser.GameObjects.Image;
  shown: number;
}

/**
 * Party frames (PLAN §12): the other members, up to three, small at the left edge under the
 * player's own card, out of the fight's way. Each shows the member's major, name, health and
 * control mode; a member whose session ended is greyed with the power mark until they return
 * or drop out. Health slides to each new value; a tap opens the member's card.
 */
export class PartyFrames {
  private readonly scene: Phaser.Scene;
  private readonly link: WorldLink;
  private readonly onTap: (m: { id: string; name: string }) => void;
  private readonly frames = new Map<string, Frame>();
  private top = 70;
  private visible = true;
  private readonly off: () => void;

  constructor(
    scene: Phaser.Scene,
    link: WorldLink,
    onTap: (m: { id: string; name: string }) => void,
  ) {
    this.scene = scene;
    this.link = link;
    this.onTap = onTap;
    this.off = link.on((e) => {
      if (e.type !== "social") return;
      if (e.event.t === "all" || e.event.t === "party") this.sync(link.social.party);
      else if (e.event.t === "vitals") this.vitals();
    });
    this.sync(link.social.party);
  }

  /** Where the frames start: just under the HUD's left column. */
  setTop(y: number): void {
    if (y === this.top) return;
    this.top = y;
    this.layout(true);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    for (const f of this.frames.values()) fade(f.root, on ? 1 : 0, 120);
  }

  destroy(): void {
    this.off();
    for (const f of this.frames.values()) f.root.destroy();
    this.frames.clear();
  }

  private others(party: PartyView | null): PartyMember[] {
    return party ? party.members.filter((m) => m.id !== this.link.me).slice(0, 3) : [];
  }

  private sync(party: PartyView | null): void {
    const members = this.others(party);
    const keep = new Set(members.map((m) => m.id));
    for (const [id, f] of this.frames) {
      if (keep.has(id)) continue;
      this.frames.delete(id);
      slide(f.root, { x: -W - 4, y: f.root.y }, 140);
      fade(f.root, 0, 140, () => f.root.destroy());
    }
    for (const m of members) {
      const f = this.frames.get(m.id) ?? this.make(m);
      this.paint(f, m, party?.leader === m.id);
    }
    this.layout(false);
  }

  private make(m: PartyMember): Frame {
    const scene = this.scene;
    const [l, r, t, b] = sliceOf("hud-plate");
    const back = scene.add.nineslice(0, 0, "ui", "hud-plate/idle", W, H, l, r, t, b).setOrigin(0);
    const emblem = scene.add.image(3, 4, "ui", `emblem/${m.major}`).setOrigin(0);
    const crown = scene.add.image(7, -1, "ui", "crown/idle").setOrigin(0);
    const name = new Label(scene, 22, 4, m.name, { font: "galmuri9", color: "stone.bright" });
    const pip = scene.add.image(W - 9, 5, "ui", "mode-pip/auto").setOrigin(0);
    const [gl, gr, gt, gb] = sliceOf("bar-thin");
    const groove = scene.add
      .nineslice(21, 15, "ui", "bar-thin/idle", W - 25, 5, gl, gr, gt, gb)
      .setOrigin(0);
    const [fl, fr, ft, fb] = sliceOf("party-fill");
    const fill = scene.add
      .nineslice(22, 16, "ui", "party-fill/hp", W - 27, 3, fl, fr, ft, fb)
      .setOrigin(0);
    const away = scene.add.image(W - 11, 14, "ui", "offline/idle").setOrigin(0);
    const zone = scene.add
      .zone(-2, -2, W + 4, H + 4)
      .setOrigin(0)
      .setInteractive({
        useHandCursor: true,
      });
    zone.on("pointerup", () => this.onTap({ id: m.id, name: m.name }));
    const root = scene.add
      .container(-W - 4, this.top, [back, emblem, crown, name.obj, pip, groove, fill, away, zone])
      .setDepth(100)
      .setAlpha(0);
    const f: Frame = { id: m.id, root, fill, groove, pip, away, name, crown, emblem, shown: -1 };
    this.frames.set(m.id, f);
    fade(root, this.visible ? 1 : 0, 160);
    return f;
  }

  private paint(f: Frame, m: PartyMember, leader: boolean): void {
    f.crown.setVisible(leader);
    f.name.set(m.name).color(m.online ? "stone.bright" : "stone.dark");
    f.emblem.setAlpha(m.online ? 1 : 0.4);
    f.away.setVisible(!m.online);
    f.pip.setVisible(m.online && m.mode !== "");
    if (m.mode) f.pip.setFrame(`mode-pip/${m.mode}`);
    // Health unknown until combat reports it, and meaningless while away: the bar steps aside.
    const known = m.online && m.hp >= 0;
    // Without a health bar the name sits in the middle of the frame.
    f.name.at(22, known ? 4 : 8);
    f.groove.setVisible(known);
    f.fill.setVisible(known && m.hp > 0);
    if (!known) return;
    const full = W - 27;
    const w = Math.max(3, Math.round((full * m.hp) / 100));
    f.fill.setFrame(m.hp < LOW ? "party-fill/low" : "party-fill/hp");
    if (f.shown < 0) f.fill.setSize(w, 3);
    else if (w !== f.shown) {
      this.scene.tweens.killTweensOf(f.fill);
      this.scene.tweens.add({ targets: f.fill, width: w, duration: 220, ease: "Quad.Out" });
    }
    f.shown = w;
  }

  private vitals(): void {
    const party = this.link.social.party;
    for (const m of this.others(party)) {
      const f = this.frames.get(m.id);
      if (f) this.paint(f, m, party?.leader === m.id);
    }
  }

  private layout(animate: boolean): void {
    let y = this.top;
    for (const m of this.others(this.link.social.party)) {
      const f = this.frames.get(m.id);
      if (!f) continue;
      const to = { x: 6, y };
      if (animate || f.root.x !== 6) slide(f.root, to, 160);
      else f.root.setPosition(to.x, to.y);
      y += H + GAP;
    }
  }
}
