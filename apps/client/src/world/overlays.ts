import * as Phaser from "phaser";
import { spriteAnim } from "../art.ts";
import { crestTexture } from "../social/emblem.ts";
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
/** A head as bubbles keep clear of it: the width of a student's hair, feet to crown. */
const HEAD_W = 14;
/** From the feet to the top of the nameplate. */
const PLATE_Y = 2;
const PLATE_H = 13;
/** The club line's height: a strip round 9 px letters and the 6×6 crest. */
const TAG_H = 11;
/** Plates and bubbles while a wheel or the like is open over them. */
const HUSHED = 0.25;
/** Rows between two plates stacked in a crowd. */
const PLATE_GAP = 1;
/** Feet this close keep the stacking order they had, so a crowd's plates do not swap back and forth. */
const ORDER_SLACK = 3;
/** How far a plate may slide sideways to clear another instead of stepping down below it. */
const PLATE_SLIDE = 28;
/** Rows a plate may step down below its owner's feet; past them it slides this far instead. */
const PLATE_ROWS = 2;
const PLATE_SLIDE_FAR = 64;
/** A plate in a crowd too thick to clear, faded under the rest rather than stacked in a tower. */
const CROWDED = 0.35;
/**
 * A plate keeps last frame's spot while it is free and at most this much farther than the best,
 * so feet that jitter a pixel at rest never flip it between two spots.
 */
const PLATE_STAY = 4;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

interface Plate {
  readonly root: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.NineSlice;
  readonly label: Label;
  /** Another player's body, for taps and long presses on it. */
  body?: Phaser.GameObjects.Zone;
  /** The club line under the name: crest and club name. */
  tag?: Phaser.GameObjects.Container | undefined;
  /** Half the block's width and its height, plate and club line together. */
  half: number;
  h: number;
  x: number;
  y: number;
  /** Offset from the spot under the feet, so a crowd's plates do not cover each other. */
  to: { x: number; y: number };
  /** The offset drawn now, eased toward `to`. */
  shown: { x: number; y: number };
  /** No free spot within reach: faded, under the others. */
  crowded: boolean;
  /** Its alpha, eased toward `CROWDED` or 1. */
  fade: number;
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
  /** Plates top to bottom as last stacked. */
  private order: string[] = [];
  private readonly bubbles: Bubble[] = [];
  private prompt: Phaser.GameObjects.Image | undefined;
  private promptAt = { x: 0, y: 0 };
  private clock = 0;
  private hushed = false;
  /** The plates' share of their alpha under a hush, eased. */
  private hushK = 1;
  private readonly unpeople: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // After the scene has moved everyone, so plates and bubbles stack on this frame's feet.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.tick, this);
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
      p = {
        root,
        back,
        label,
        half: 0,
        h: PLATE_H,
        x: 0,
        y: 0,
        to: { x: 0, y: 0 },
        shown: { x: 0, y: 0 },
        crowded: false,
        fade: 1,
      };
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
    p.root.setPosition(p.x + Math.round(p.shown.x), p.y + PLATE_Y + Math.round(p.shown.y));
    p.body?.setPosition(p.x, p.y + 1);
  }

  remove(id: string): void {
    const p = this.plates.get(id);
    p?.root.destroy();
    p?.body?.destroy();
    this.plates.delete(id);
    this.order = this.order.filter((o) => o !== id);
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
    const alpha = this.hushed ? HUSHED : 1;
    this.scene.tweens.add({ targets: root, scale: 1, alpha, duration: 120, ease: "Back.Out" });
    this.layoutBubble(bubble, p);
  }

  /**
   * An emote's icon in a small bubble over someone's head, by session id: it pops in, bobs once
   * and goes. A newer line or emote from the same person pushes it up like a speech bubble.
   */
  emote(id: string, emoteId: string): void {
    const p = this.plates.get(id);
    const frame = `emote-bubble/${emoteId}0`;
    if (!p || !this.scene.textures.getFrame("ui", frame)) return;
    const w = 18;
    const h = 17;
    const [l, r, t, b] = sliceOf("bubble");
    const back = this.scene.add.nineslice(0, 0, "ui", "bubble/idle", w, h, l, r, t, b).setOrigin(0);
    const tail = this.scene.add
      .image(Math.floor(w / 2) - 2, h - 1, "ui", "bubble-tail/idle")
      .setOrigin(0);
    const icon = this.scene.add.sprite(3, 3, "ui", frame).setOrigin(0);
    const anim = spriteAnim("emote-bubble", emoteId);
    if (this.scene.anims.exists(anim)) icon.play(anim);
    this.pushBubble(id, p, [back, tail, icon], w, h, 2400);
  }

  /**
   * Whether a point on screen, in game pixels, lands on something that takes a tap here: another
   * player's nameplate, or their body outside a hunting field. The thumb sticks let those through.
   */
  tappableAt(sx: number, sy: number): boolean {
    const at = this.scene.cameras.main.getWorldPoint(sx, sy);
    const inside = (o: Phaser.GameObjects.Components.GetBounds) =>
      o.getBounds().contains(at.x, at.y);
    for (const p of this.plates.values()) {
      if (p.back.input?.enabled && inside(p.back)) return true;
      if (p.body?.input?.enabled && !worldView.map?.field && inside(p.body)) return true;
    }
    return false;
  }

  /** Fades every plate and bubble back while something is opened over them, and up again. */
  hush(on: boolean): void {
    if (on === this.hushed) return;
    this.hushed = on;
    // Plates ease there in the frame's placing; bubbles fade here.
    const roots = this.bubbles.filter((b) => !b.leaving).map((b) => b.root);
    if (roots.length)
      this.scene.tweens.add({ targets: roots, alpha: on ? HUSHED : 1, duration: 100 });
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

  /**
   * Puts the club line under a player's nameplate, or takes it away: the worn crest and the
   * club's name in small letters on a thin strip of ink, so they hold on paving and grass alike.
   */
  private clubTag(id: string): void {
    const p = this.plates.get(id);
    if (!p) return;
    const body = worldPeople.get(id);
    const club = body ? clubOf(body) : undefined;
    p.tag?.destroy();
    p.tag = undefined;
    const plateW = p.back.width;
    p.half = Math.ceil(plateW / 2);
    p.h = PLATE_H;
    if (!club) return;
    const label = new Label(this.scene, 10, 1, club.name, {
      font: "galmuri9",
      color: "stone.pale",
    });
    const w = 10 + label.width + 2;
    const strip = this.scene.add.rectangle(0, 0, w, TAG_H, paint("ink.deep"), 0.6).setOrigin(0);
    const crest = this.scene.add.image(2, 3, crestTexture(this.scene, club.emblem)).setOrigin(0);
    const parts: Phaser.GameObjects.GameObject[] = [strip, crest, label.obj];
    const tag = this.scene.add.container(-Math.ceil(w / 2), PLATE_H, parts);
    p.root.add(tag);
    p.tag = tag;
    p.half = Math.max(p.half, Math.ceil(w / 2) + 1);
    p.h = PLATE_H + TAG_H;
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

  /**
   * Keeps nameplates from covering each other. Top to bottom by where the feet stand, each plate
   * takes the free spot nearest its own: its own when there is room, else a short slide sideways
   * or a step down below the plates in the way. Plates glide to their spots and keep the one they
   * have while it stays free, so a crowd settles rather than flickers.
   */
  private placePlates(delta: number): void {
    const feet = (id: string) => this.plates.get(id)?.y ?? 0;
    const known = new Set(this.order);
    const fresh = [...this.plates.keys()].filter((id) => !known.has(id));
    fresh.sort((a, b) => feet(a) - feet(b) || (a < b ? -1 : 1));
    this.order.push(...fresh);
    // Insertion sort over last frame's order: two plates swap only once their feet are clearly
    // apart, so feet a pixel or two from level never trade places frame to frame.
    const order = this.order;
    for (let i = 1; i < order.length; i++) {
      const id = order[i] as string;
      let j = i - 1;
      while (j >= 0 && feet(order[j] as string) - feet(id) > ORDER_SLACK) {
        order[j + 1] = order[j] as string;
        j--;
      }
      order[j + 1] = id;
    }
    const placed: Box[] = [];
    const glide = Math.min(1, delta / 80);
    const ease = (from: number, to: number, k = glide) =>
      Math.abs(to - from) < 0.01 ? to : from + (to - from) * k;
    this.hushK = ease(this.hushK, this.hushed ? HUSHED : 1, Math.min(1, delta / 60));
    for (const id of order) {
      const p = this.plates.get(id);
      if (!p) continue;
      const home: Box = { x: p.x - p.half, y: p.y + PLATE_Y, w: p.half * 2, h: p.h + PLATE_GAP };
      const at = (dx: number, dy: number): Box => ({ ...home, x: home.x + dx, y: home.y + dy });
      const free = (dx: number, dy: number) => !placed.some((r) => overlaps(at(dx, dy), r));
      const cost = (o: { x: number; y: number }) => Math.abs(o.x) + o.y;
      /** Two rows below the feet at most; past that a plate only slides. */
      const drop = home.h * PLATE_ROWS;
      /** The cheapest free spot beside or below the plates within `slide` sideways. */
      const spot = (slide: number): { x: number; y: number } | undefined => {
        const near = placed.filter(
          (r) => r.x < home.x + home.w + slide && home.x - slide < r.x + r.w && r.y + r.h > home.y,
        );
        const xs = [0];
        for (const r of near) {
          const left = r.x - home.w - home.x;
          const right = r.x + r.w - home.x;
          if (Math.abs(left) <= slide) xs.push(left);
          if (Math.abs(right) <= slide) xs.push(right);
        }
        const ys = [0, ...near.map((r) => r.y + r.h - home.y)].filter((dy) => dy <= drop);
        let found: { x: number; y: number } | undefined;
        for (const dy of ys) {
          for (const dx of xs) {
            const o = { x: dx, y: dy };
            const c = cost(o);
            const bc = found ? cost(found) : Number.POSITIVE_INFINITY;
            // Ties go down rather than sideways, then right rather than left.
            const better =
              c < bc || (found && c === bc && (dy < found.y || (dy === found.y && dx > found.x)));
            if (better && free(dx, dy)) found = o;
          }
        }
        return found;
      };
      let best = { x: 0, y: 0 };
      let crowded = false;
      if (!free(0, 0)) {
        const found = spot(PLATE_SLIDE) ?? spot(PLATE_SLIDE_FAR);
        const was = p.to;
        const keep = !p.crowded && was.y <= drop && free(was.x, was.y);
        if (found && !(keep && cost(was) <= cost(found) + PLATE_STAY)) best = found;
        else if (keep) best = was;
        else crowded = true;
      }
      // A plate with no room left stays by its owner's feet, faded and under the others.
      if (crowded !== p.crowded) {
        p.crowded = crowded;
        p.root.setDepth(crowded ? DEPTH - 1 : DEPTH);
      }
      if (!crowded) placed.push(at(best.x, best.y));
      p.to = best;
      p.fade = ease(p.fade, crowded ? CROWDED : 1, Math.min(1, delta / 120));
      p.root.setAlpha(p.fade * this.hushK);
      const slideTo = (from: number, to: number) =>
        Math.abs(to - from) < 0.5 ? to : from + (to - from) * glide;
      p.shown = { x: slideTo(p.shown.x, best.x), y: slideTo(p.shown.y, best.y) };
      p.root.setPosition(p.x + Math.round(p.shown.x), home.y + Math.round(p.shown.y));
    }
  }

  /** Where every plate is drawn now, for bubbles to keep clear of. */
  private plateBoxes(): Box[] {
    return [...this.plates.values()].map((p) => ({
      x: p.root.x - p.half,
      y: p.root.y,
      w: p.half * 2,
      h: p.h,
    }));
  }

  /**
   * Puts every bubble over its speaker so that none covers another person's head or another
   * bubble: oldest first, each newer one steps up above whatever it would cover. It glides to
   * its new height rather than jumping, so a crowd's bubbles settle instead of flickering.
   */
  private placeBubbles(delta: number): void {
    const heads = [...this.plates.entries()].map(([id, p]) => ({
      id,
      x: p.x - HEAD_W / 2,
      y: p.y - HEAD,
      w: HEAD_W,
      h: HEAD - 2,
    }));
    const placed: Box[] = this.plateBoxes();
    const glide = Math.min(1, delta / 70);
    for (const b of this.bubbles) {
      if (b.leaving) continue;
      const p = this.plates.get(b.owner);
      if (!p) continue;
      b.shown += (b.lift - b.shown) * Math.min(1, delta / 80);
      const x = p.x - Math.floor(b.w / 2);
      let y = p.y - HEAD - b.h - Math.round(b.shown);
      const box = () => ({ x, y, w: b.w, h: b.h });
      for (let tries = 0; tries < 24; tries++) {
        const hit =
          heads.find((h) => h.id !== b.owner && overlaps(box(), h)) ??
          placed.find((r) => overlaps(box(), r));
        if (!hit) break;
        y = hit.y - b.h - 2;
      }
      placed.push(box());
      const settled = Math.abs(b.root.y - y) < 0.5 || b.root.alpha === 0;
      b.root.setPosition(x, settled ? y : b.root.y + (y - b.root.y) * glide);
    }
  }

  private tick(_time: number, delta: number): void {
    this.clock += delta;
    if (this.prompt) {
      const bob = Math.sin(this.clock / 260) > 0 ? 0 : 1;
      this.prompt.setPosition(this.promptAt.x, this.promptAt.y - bob);
    }
    this.placePlates(delta);
    this.placeBubbles(delta);
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
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.tick, this);
    for (const p of this.plates.values()) {
      p.root.destroy();
      p.body?.destroy();
    }
    this.plates.clear();
    this.order.length = 0;
    for (const b of this.bubbles) b.root.destroy();
    this.bubbles.length = 0;
    this.prompt?.destroy();
  }
}
