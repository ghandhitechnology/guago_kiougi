import * as Phaser from "phaser";
import { emblemTexture } from "../social/emblem.ts";
import { Label, measure, wrap } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import { clubOf, worldPeople } from "./people.ts";
import { worldView } from "./view.ts";

/**
 * What floats over the world: nameplates under everyone's feet, speech bubbles over their heads,
 * and the prompt over whatever is in reach. Drawn by the world scene's own camera above every
 * entity, so a plate never slips a pixel from the feet it belongs to.
 */

export type PlateKind = "self" | "player" | "npc";

/** Above every Y-sorted entity. */
const DEPTH = 1_000_000;
/** From the feet to a bubble's tail tip: a 24 px student and a little air. */
const HEAD = 29;
const BUBBLE_MAX_W = 104;
/** Older lines from the same speaker that stay up above the newest. */
const STACK = 2;

interface Plate {
  readonly root: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.NineSlice;
  readonly label: Label;
  /** Another player's body, for taps and long presses on it. */
  body?: Phaser.GameObjects.Zone;
  /** The club line under the name: emblem and club name. */
  tag?: Phaser.GameObjects.Container | undefined;
  x: number;
  y: number;
}

interface Bubble {
  readonly root: Phaser.GameObjects.Container;
  readonly owner: string;
  readonly w: number;
  readonly h: number;
  /** Lift above the default spot, eased toward `lift`. */
  shown: number;
  lift: number;
  expires: number;
  leaving: boolean;
}

export class WorldOverlays {
  private readonly scene: Phaser.Scene;
  private readonly plates = new Map<string, Plate>();
  private readonly bubbles: Bubble[] = [];
  private prompt: Phaser.GameObjects.Image | undefined;
  private promptAt = { x: 0, y: 0 };
  private clock = 0;
  private readonly unpeople: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.unpeople = worldPeople.on((sid) => this.clubTag(sid));
  }

  /** A nameplate for someone, created or renamed. */
  plate(id: string, name: string, kind: PlateKind): void {
    let p = this.plates.get(id);
    if (!p) {
      const [l, r, t, b] = sliceOf("nameplate");
      const back = this.scene.add.nineslice(0, 0, "ui", "nameplate/idle", 10, 13, l, r, t, b);
      back.setOrigin(0);
      const color = kind === "npc" ? "gold.light" : "stone.bright";
      const label = new Label(this.scene, 3, 2, "", { font: "galmuri9", color });
      const root = this.scene.add.container(0, 0, [back, label.obj]).setDepth(DEPTH);
      p = { root, back, label, x: 0, y: 0 };
      if (kind !== "self") {
        back.setInteractive({ useHandCursor: true });
        this.tappable(back, id, kind, "name");
      }
      if (kind === "player") {
        // The body: the student's 16×24 above the feet.
        p.body = this.scene.add.zone(0, 0, 16, 26).setOrigin(0.5, 1).setDepth(DEPTH);
        p.body.setInteractive({ useHandCursor: true });
        this.tappable(p.body, id, kind, "body");
      }
      this.plates.set(id, p);
    }
    p.label.set(name);
    const w = p.label.width + 7;
    p.back.setSize(w, 13);
    p.label.at(-Math.ceil(w / 2) + 3, 2);
    p.back.setX(-Math.ceil(w / 2));
    this.clubTag(id);
  }

  /** Where someone's feet are now. */
  move(id: string, x: number, y: number): void {
    const p = this.plates.get(id);
    if (!p) return;
    p.x = Math.round(x);
    p.y = Math.round(y);
    p.root.setPosition(p.x, p.y + 2);
    p.body?.setPosition(p.x, p.y + 1);
  }

  remove(id: string): void {
    const p = this.plates.get(id);
    p?.root.destroy();
    p?.body?.destroy();
    this.plates.delete(id);
    for (const b of this.bubbles) if (b.owner === id) b.expires = 0;
  }

  /**
   * A line said aloud over someone's head. It stays long enough to read, then goes; a newer line
   * from the same person pushes theirs up, and bubbles from people standing close step aside.
   */
  say(id: string, text: string): void {
    const p = this.plates.get(id);
    if (!p) return;
    const lines = wrap(this.scene, "galmuri9", text, BUBBLE_MAX_W - 10).slice(0, 4);
    // A word the filter took out is a strip of ink where it stood, as in the chat log.
    const parts: Phaser.GameObjects.GameObject[] = [];
    let textW = 0;
    lines.forEach((line, row) => {
      const y = 4 + row * 13;
      let x = 5;
      for (const run of line.match(/\*+|[^*]+/g) ?? []) {
        if (run.startsWith("*")) {
          const rw = measure(this.scene, "galmuri9", run);
          parts.push(this.scene.add.rectangle(x, y + 2, rw, 7, paint("ink.light")).setOrigin(0));
          x += rw + 1;
          continue;
        }
        const label = new Label(this.scene, x, y, run, { font: "galmuri9", color: "ink.dark" });
        parts.push(label.obj);
        x += label.width + 1;
      }
      textW = Math.max(textW, x - 1 - 5);
    });
    const w = textW + 11;
    const h = lines.length * 13 + 5;
    const [l, r, t, b] = sliceOf("bubble");
    const back = this.scene.add.nineslice(0, 0, "ui", "bubble/idle", w, h, l, r, t, b).setOrigin(0);
    const tail = this.scene.add
      .image(Math.floor(w / 2) - 2, h - 1, "ui", "bubble-tail/idle")
      .setOrigin(0);
    const chars = [...text].length;
    this.pushBubble(id, p, [back, tail, ...parts], w, h, Math.min(7000, 2600 + chars * 70));
  }

  /** A bubble of `w`×`h` over someone's head for `ms`, stacking over their older ones. */
  private pushBubble(
    id: string,
    p: Plate,
    parts: Phaser.GameObjects.GameObject[],
    w: number,
    h: number,
    ms: number,
  ): void {
    const root = this.scene.add.container(0, 0, parts).setDepth(DEPTH + 1);
    const bubble: Bubble = {
      root,
      owner: id,
      w,
      h,
      shown: 0,
      lift: 0,
      expires: this.clock + ms,
      leaving: false,
    };
    // Older lines from the same person rise above this one; the oldest beyond the stack goes.
    const mine = this.bubbles.filter((x) => x.owner === id && !x.leaving);
    for (const old of mine) old.lift += h + 2;
    mine.slice(0, Math.max(0, mine.length - (STACK - 1))).forEach((old) => {
      old.expires = Math.min(old.expires, this.clock + 400);
    });
    this.bubbles.push(bubble);
    root.setScale(0.6).setAlpha(0);
    this.scene.tweens.add({ targets: root, scale: 1, alpha: 1, duration: 120, ease: "Back.Out" });
    this.layoutBubble(bubble, p);
  }

  /**
   * An emote's icon in a small bubble over someone's head, by session id: it pops in, bobs once
   * and goes. A newer line or emote from the same person pushes it up like a speech bubble.
   */
  emote(id: string, emoteId: string): void {
    const p = this.plates.get(id);
    const frame = `emote-icon/${emoteId}`;
    if (!p || !this.scene.textures.getFrame("ui", frame)) return;
    const w = 18;
    const h = 17;
    const [l, r, t, b] = sliceOf("bubble");
    const back = this.scene.add.nineslice(0, 0, "ui", "bubble/idle", w, h, l, r, t, b).setOrigin(0);
    const tail = this.scene.add
      .image(Math.floor(w / 2) - 2, h - 1, "ui", "bubble-tail/idle")
      .setOrigin(0);
    const icon = this.scene.add.image(3, 3, "ui", frame).setOrigin(0);
    this.pushBubble(id, p, [back, tail, icon], w, h, 2400);
    this.scene.tweens.add({ targets: icon, y: 2, duration: 160, yoyo: true, delay: 140 });
  }

  /** Taps and long presses on a nameplate or a body ask the world view's listener. */
  private tappable(
    target: Phaser.GameObjects.GameObject,
    id: string,
    kind: PlateKind,
    part: "name" | "body",
  ): void {
    let downAt = 0;
    let held: Phaser.Time.TimerEvent | undefined;
    const fire = () => {
      const name = this.plates.get(id)?.label.obj.text ?? "";
      if (kind !== "self") worldView.onNameTap?.(id, name, kind, part);
    };
    target.on("pointerdown", () => {
      downAt = this.clock;
      held?.remove();
      // A long press opens at once on touch, without waiting for the finger to lift.
      held = this.scene.time.delayedCall(420, () => {
        held = undefined;
        downAt = -1;
        fire();
      });
    });
    target.on("pointerup", () => {
      held?.remove();
      held = undefined;
      if (downAt >= 0 && this.clock - downAt < 420) fire();
      downAt = -1;
    });
    target.on("pointerout", () => {
      held?.remove();
      held = undefined;
      downAt = -1;
    });
  }

  /** Puts the club line under a player's nameplate, or takes it away. */
  private clubTag(id: string): void {
    const p = this.plates.get(id);
    if (!p) return;
    const body = worldPeople.get(id);
    const club = body ? clubOf(body) : undefined;
    p.tag?.destroy();
    p.tag = undefined;
    if (!club) return;
    const label = new Label(this.scene, 15, 2, club.name, {
      font: "galmuri9",
      color: "grass.pale",
    });
    const w = label.width + 18;
    const [l, r, t, b] = sliceOf("nameplate");
    const back = this.scene.add.nineslice(0, 0, "ui", "nameplate/idle", w, 13, l, r, t, b);
    back.setOrigin(0);
    const emblem = this.scene.add
      .image(2, 1, emblemTexture(this.scene, club.emblem, "s"))
      .setOrigin(0);
    const tag = this.scene.add.container(-Math.ceil(w / 2), 14, [back, emblem, label.obj]);
    p.root.add(tag);
    p.tag = tag;
  }

  /** The prompt over the thing in reach, by kind (`talk`, `use`, `read`); `undefined` clears it. */
  showPrompt(at: { x: number; y: number; kind: "talk" | "use" | "read" } | undefined): void {
    if (!at) {
      const old = this.prompt;
      this.prompt = undefined;
      if (old)
        this.scene.tweens.add({
          targets: old,
          alpha: 0,
          y: old.y - 3,
          duration: 100,
          onComplete: () => old.destroy(),
        });
      return;
    }
    if (!this.prompt) {
      this.prompt = this.scene.add
        .image(0, 0, "ui", `prompt/${at.kind}`)
        .setOrigin(0.5, 1)
        .setDepth(DEPTH + 2);
      this.prompt.setScale(0.5).setAlpha(0);
      this.scene.tweens.add({
        targets: this.prompt,
        scale: 1,
        alpha: 1,
        duration: 120,
        ease: "Back.Out",
      });
    }
    this.prompt.setFrame(`prompt/${at.kind}`);
    this.promptAt = { x: Math.round(at.x), y: Math.round(at.y) };
  }

  private layoutBubble(b: Bubble, p: Plate): void {
    b.root.setPosition(p.x - Math.floor(b.w / 2), p.y - HEAD - b.h - Math.round(b.shown));
  }

  private tick(_time: number, delta: number): void {
    this.clock += delta;
    if (this.prompt) {
      const bob = Math.sin(this.clock / 260) > 0 ? 0 : 1;
      this.prompt.setPosition(this.promptAt.x, this.promptAt.y - bob);
    }
    // Bubbles from different people that would overlap: the later one steps up.
    const live = this.bubbles.filter((b) => !b.leaving);
    for (const b of live) {
      const p = this.plates.get(b.owner);
      if (!p) continue;
      b.shown += (b.lift - b.shown) * Math.min(1, delta / 80);
      this.layoutBubble(b, p);
    }
    for (let i = 0; i < live.length; i++) {
      const a = live[i] as Bubble;
      for (let j = i + 1; j < live.length; j++) {
        const c = live[j] as Bubble;
        if (a.owner === c.owner) continue;
        const ar = a.root;
        const cr = c.root;
        const overlap =
          ar.x < cr.x + c.w && cr.x < ar.x + a.w && ar.y < cr.y + c.h && cr.y < ar.y + a.h;
        if (overlap) cr.y = Math.min(cr.y, ar.y - c.h - 2);
      }
    }
    for (const b of [...this.bubbles]) {
      if (b.leaving || this.clock < b.expires) continue;
      b.leaving = true;
      this.scene.tweens.add({
        targets: b.root,
        alpha: 0,
        y: b.root.y - 4,
        duration: 260,
        onComplete: () => {
          b.root.destroy();
          const i = this.bubbles.indexOf(b);
          if (i >= 0) this.bubbles.splice(i, 1);
        },
      });
    }
  }

  destroy(): void {
    this.unpeople();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    for (const p of this.plates.values()) {
      p.root.destroy();
      p.body?.destroy();
    }
    this.plates.clear();
    for (const b of this.bubbles) b.root.destroy();
    this.bubbles.length = 0;
    this.prompt?.destroy();
  }
}
