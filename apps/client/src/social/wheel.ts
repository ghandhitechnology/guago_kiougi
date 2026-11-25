import { EMOTES } from "@guago/content";
import * as Phaser from "phaser";
import { WORLD_SCENE } from "../entry.ts";
import { uiHasKeyboard } from "../ui/focus.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { worldView } from "../world/view.ts";
import type { WorldLink } from "../world-link.ts";
import { ask } from "./act.ts";
import { term } from "./words.ts";

/** The desktop key held to open the wheel: a physical key, so it stays put on any layout. */
export const EMOTE_KEY = "KeyT";
const RADIUS = 36;
const SLOT = 24;

/**
 * The emote wheel (PLAN §12): eight emotes round a hub. On a desktop it opens while T is held
 * and the emote under the pointer plays on release; on a phone the HUD's button opens it and a
 * tap picks. The choice plays on the player's own body at once and goes to the server; nearby
 * players see it when the server passes it on.
 */
export class EmoteWheel {
  private readonly scene: Phaser.Scene;
  private readonly link: WorldLink;
  private root: Phaser.GameObjects.Container | undefined;
  private slots: { id: string; back: Phaser.GameObjects.Image; at: { x: number; y: number } }[] =
    [];
  private hot = -1;
  private name: Label | undefined;
  private shadow: Label | undefined;
  private catcher: Phaser.GameObjects.Zone | undefined;
  private held = false;
  /** The own emote last played here, so the server's echo of it does not play twice. */
  private mine: { id: string; at: number } | undefined;
  private readonly offKeys: () => void;
  private readonly offLink: () => void;

  constructor(scene: Phaser.Scene, link: WorldLink) {
    this.scene = scene;
    this.link = link;
    const down = (e: KeyboardEvent) => {
      if (e.code !== EMOTE_KEY || e.repeat || uiHasKeyboard() || e.ctrlKey || e.metaKey) return;
      if (this.root) return;
      this.held = true;
      this.open();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== EMOTE_KEY || !this.held) return;
      this.held = false;
      const pick = this.slots[this.hot];
      if (pick) this.play(pick.id);
      this.close();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    this.offKeys = () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // Others' emotes: the icon over their heads, unless they are blocked.
    this.offLink = link.on((e) => {
      if (e.type !== "social" || e.event.t !== "emote") return;
      const { id, sid, e: emote } = e.event;
      if (link.isBlocked(id)) return;
      const echo = id === link.me && this.mine?.id === emote && Date.now() - this.mine.at < 2500;
      if (!echo) worldView.overlays?.emote(sid, emote);
    });
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.track, this);
  }

  get isOpen(): boolean {
    return this.root !== undefined;
  }

  /** The phone's button: opens the wheel, or closes it. */
  toggle(): void {
    if (this.root) this.close();
    else this.open();
  }

  destroy(): void {
    this.close(true);
    this.offKeys();
    this.offLink();
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.track, this);
  }

  /** Plays an emote on the own body and sends it. */
  play(id: string): void {
    const sid = worldView.selfSid;
    if (sid) worldView.overlays?.emote(sid, id);
    worldView.onSelfEmote?.(id);
    this.mine = { id, at: Date.now() };
    sound("select");
    void ask(this.link, "emote", { e: id });
  }

  private centre(): { x: number; y: number } {
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    const me = worldView.self;
    const cam = this.scene.scene.get(WORLD_SCENE)?.cameras?.main;
    const at =
      me && cam
        ? { x: me.x - cam.worldView.x, y: me.y - 12 - cam.worldView.y }
        : { x: sw / 2, y: sh / 2 };
    const m = RADIUS + SLOT / 2 + 4;
    return {
      x: Math.round(Phaser.Math.Clamp(at.x, m, sw - m)),
      y: Math.round(Phaser.Math.Clamp(at.y, m, sh - m - 14)),
    };
  }

  private open(): void {
    const scene = this.scene;
    const c = this.centre();
    const root = scene.add.container(c.x, c.y).setDepth(780);
    this.root = root;
    // A tap off the wheel closes it.
    const catcher = scene.add
      .zone(0, 0, scene.scale.width, scene.scale.height)
      .setOrigin(0)
      .setDepth(779)
      .setInteractive();
    catcher.on("pointerdown", () => this.close());
    this.catcher = catcher;
    // The UI atlas pins frames at their top left; the wheel turns about centres.
    const hub = scene.add.image(0, 0, "ui", "wheel-hub/idle").setOrigin(0.5);
    root.add(hub);
    const wheel = EMOTES.filter((e) => e.wheel).slice(0, 8);
    this.slots = wheel.map((e, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / wheel.length;
      const at = { x: Math.round(Math.cos(a) * RADIUS), y: Math.round(Math.sin(a) * RADIUS) };
      const back = scene.add.image(0, 0, "ui", "wheel-slot/idle").setOrigin(0.5);
      const icon = scene.add.image(0, 0, "ui", `emote-bubble/${e.id}0`).setOrigin(0.5);
      const slot = scene.add.container(0, 0, [back, icon]).setScale(0.3).setAlpha(0);
      const zone = scene.add
        .zone(-SLOT / 2, -SLOT / 2, SLOT, SLOT)
        .setOrigin(0)
        .setInteractive({
          useHandCursor: true,
        });
      zone.on("pointerover", () => this.light(i));
      zone.on("pointerup", () => {
        this.play(e.id);
        this.close();
      });
      slot.add(zone);
      root.add(slot);
      // The slots fan out from the hub one after another.
      scene.tweens.add({
        targets: slot,
        x: at.x,
        y: at.y,
        scale: 1,
        alpha: 1,
        duration: 140,
        delay: i * 14,
        ease: "Back.Out",
      });
      return { id: e.id, back, at };
    });
    this.shadow = new Label(scene, 0, 0, "", { font: "galmuri11-bold", color: "ink.deep" });
    this.name = new Label(scene, 0, 0, "", { font: "galmuri11-bold", color: "stone.bright" });
    root.add([this.shadow.obj, this.name.obj]);
    this.hot = -1;
    // The world's plates and bubbles step back under the wheel.
    worldView.overlays?.hush(true);
    sound("open");
  }

  private close(now = false): void {
    const root = this.root;
    if (!root) return;
    this.root = undefined;
    this.catcher?.destroy();
    this.catcher = undefined;
    this.slots = [];
    this.hot = -1;
    worldView.overlays?.hush(false);
    if (now) {
      root.destroy();
      return;
    }
    sound("close");
    this.scene.tweens.add({
      targets: root,
      scale: 0.6,
      alpha: 0,
      duration: 100,
      ease: "Quad.In",
      onComplete: () => root.destroy(),
    });
  }

  /** While T is held, the pointer's direction from the hub picks a slot. */
  private track(pointer: Phaser.Input.Pointer): void {
    const root = this.root;
    if (!root || !this.held) return;
    const dx = pointer.x - root.x;
    const dy = pointer.y - root.y;
    if (Math.hypot(dx, dy) < 10) {
      this.light(-1);
      return;
    }
    const n = this.slots.length;
    const a = Math.atan2(dy, dx) + Math.PI / 2;
    const i = Math.round((a / (2 * Math.PI)) * n + n) % n;
    this.light(i);
  }

  private light(i: number): void {
    if (i === this.hot) return;
    this.slots[this.hot]?.back.setFrame("wheel-slot/idle");
    this.hot = i;
    const slot = this.slots[i];
    const word = slot ? term("emote", slot.id) : "";
    slot?.back.setFrame("wheel-slot/hot");
    if (slot) sound("hover");
    const y = RADIUS + SLOT / 2 + 4;
    this.shadow?.set(word);
    this.name?.set(word);
    const w = this.name?.width ?? 0;
    this.shadow?.at(-Math.floor(w / 2) + 1, y + 1);
    this.name?.at(-Math.floor(w / 2), y);
  }
}
