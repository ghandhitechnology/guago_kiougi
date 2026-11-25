import { MODES, narrative } from "@guago/content";
import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { fade, slide } from "../ui/motion.ts";
import { edges } from "../ui/screen.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import { worldView } from "../world/view.ts";
import { MINIMAP, Minimap } from "./minimap.ts";
import { type BookSlot, type HudData, hud } from "./store.ts";

/**
 * The HUD (PLAN §18), laid out as the kit's composed `hud` screen: dark card so the field stays
 * the brightest thing on screen. Each element comes in with its first live value and leaves when
 * its source does; nothing here invents a number.
 */

const PLATE = "hud-plate";
/** From the thumb cluster's centre to the screen's bottom right corner. */
const CLUSTER = 34;

/** What the HUD's buttons ask of whoever is listening. */
export interface HudActions {
  openMenu(): void;
  openChat(): void;
  cycleMode?(): void;
  interact?(): void;
  /** The 자습 pool's plate pressed: the pool and its claim. */
  openPool?(): void;
  dodge?(): void;
  /** A book slot pressed, by index. */
  cast?(slot: number): void;
  mentor?(): void;
}

function plate(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  const [l, r, tt, b] = sliceOf(PLATE);
  return scene.add.nineslice(x, y, "ui", `${PLATE}/idle`, w, h, l, r, tt, b).setOrigin(0);
}

/** Text on the field: an ink shadow one pixel down and right. */
class Lifted {
  readonly shadow: Label;
  readonly face: Label;

  constructor(scene: Phaser.Scene, font: "galmuri9" | "galmuri11-bold", color = "stone.bright") {
    this.shadow = new Label(scene, 0, 0, "", { font, color: "ink.deep" });
    this.face = new Label(scene, 0, 0, "", { font, color });
  }

  get objs() {
    return [this.shadow.obj, this.face.obj];
  }

  get width(): number {
    return this.face.width;
  }

  set(text: string, x: number, y: number): void {
    this.shadow.set(text).at(x + 1, y + 1);
    this.face.set(text).at(x, y);
  }
}

/** Something that slides in from an edge with its first value and back out when it goes. */
class Piece {
  readonly root: Phaser.GameObjects.Container;
  private readonly rest: { x: number; y: number };
  private readonly from: { dx: number; dy: number };
  live = false;

  constructor(scene: Phaser.Scene, x: number, y: number, from: { dx: number; dy: number }) {
    this.root = scene.add.container(x, y).setVisible(false).setAlpha(0);
    this.rest = { x, y };
    this.from = from;
  }

  private get away(): { x: number; y: number } {
    return { x: this.rest.x + this.from.dx, y: this.rest.y + this.from.dy };
  }

  moveTo(x: number, y: number): void {
    this.rest.x = x;
    this.rest.y = y;
    if (this.live) slide(this.root, this.rest, 140);
    else this.root.setPosition(x, y);
  }

  show(on: boolean): void {
    if (on === this.live) return;
    this.live = on;
    if (on) {
      this.root.setPosition(this.away.x, this.away.y);
      slide(this.root, this.rest, 170);
      fade(this.root, 1, 170);
    } else {
      slide(this.root, this.away, 130);
      fade(this.root, 0, 130);
    }
  }
}

const num = (n: number) => Math.round(n).toLocaleString("en-US");

export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly actions: HudActions;
  private readonly card: Piece;
  private readonly cardBack: Phaser.GameObjects.NineSlice;
  private readonly level: Label;
  private readonly name: Label;
  private readonly vitals: Piece;
  private readonly hpLag: Phaser.GameObjects.NineSlice;
  private readonly hpFill: Phaser.GameObjects.NineSlice;
  private readonly hpText: Lifted;
  private readonly expFill: Phaser.GameObjects.NineSlice;
  private readonly mode: Piece;
  private readonly modeBack: Phaser.GameObjects.NineSlice;
  private readonly modeText: Label;
  private readonly minimapPiece: Piece;
  private readonly minimap: Minimap;
  private readonly menu: Piece;
  private readonly demerits: Piece;
  private readonly demeritText: Label;
  private readonly pool: Piece;
  private readonly poolFill: Phaser.GameObjects.NineSlice;
  private readonly books: Piece;
  private readonly bookSlots: {
    back: Phaser.GameObjects.Image;
    book: Phaser.GameObjects.Image;
    dim: Phaser.GameObjects.Image;
    cd: Phaser.GameObjects.Image;
    lock: Phaser.GameObjects.Image;
  }[] = [];
  /**
   * Each slot's cooldown as last told and how fast it is coming back, so the sweep moves every
   * frame between the fight's updates instead of stepping when they arrive.
   */
  private readonly sweeps: {
    book: string;
    value: number;
    at: number;
    start: { value: number; at: number } | undefined;
    rate: number;
    readyAt?: number;
    span?: number;
    shown: number;
  }[] = [];
  private readonly dodge: Piece;
  private readonly mentor: Piece;
  private readonly mentorIcon: Phaser.GameObjects.Image;
  private mentorReady = false;
  private readonly interact: Piece;
  private readonly chat: Piece;
  private lagTimer: Phaser.Time.TimerEvent | undefined;
  private cluster = { x: 0, y: 0 };
  private lastHp: number | undefined;
  private readonly unwatch: () => void;
  private readonly unmap: () => void;
  readonly touch: boolean;

  constructor(scene: Phaser.Scene, actions: HudActions, touch: boolean) {
    this.scene = scene;
    this.actions = actions;
    this.touch = touch;

    // You: level, then name, on one card.
    this.card = new Piece(scene, 6, 6, { dx: -60, dy: 0 });
    this.cardBack = plate(scene, 0, 0, 60, 19);
    this.level = new Label(scene, 0, 4, "", { font: "galmuri11-bold", color: "stone.bright" });
    this.name = new Label(scene, 0, 5, "", { font: "galmuri9", color: "stone.bright" });
    const rule = scene.add.rectangle(26, 3, 1, 13, paint("ink.mid")).setOrigin(0);
    this.card.root.add([this.cardBack, rule, this.level.obj, this.name.obj]);

    // HP with the chunk just lost trailing behind, and EXP underneath.
    this.vitals = new Piece(scene, 6, 27, { dx: -110, dy: 0 });
    const [bl, br, bt, bb] = sliceOf("bar");
    const [fl, fr, ft, fb] = sliceOf("fill");
    const groove = scene.add.nineslice(0, 0, "ui", "bar/idle", 98, 13, bl, br, bt, bb).setOrigin(0);
    this.hpLag = scene.add.nineslice(1, 1, "ui", "fill/lag", 96, 11, fl, fr, ft, fb).setOrigin(0);
    this.hpFill = scene.add.nineslice(1, 1, "ui", "fill/hp", 96, 11, fl, fr, ft, fb).setOrigin(0);
    this.hpText = new Lifted(scene, "galmuri9");
    const [tl, tr, tt, tb] = sliceOf("bar-thin");
    const [el, er, et, eb] = sliceOf("fill-thin");
    const thin = scene.add
      .nineslice(0, 14, "ui", "bar-thin/idle", 98, 5, tl, tr, tt, tb)
      .setOrigin(0);
    this.expFill = scene.add
      .nineslice(1, 15, "ui", "fill-thin/exp", 96, 3, el, er, et, eb)
      .setOrigin(0);
    this.vitals.root.add([
      groove,
      this.hpLag,
      this.hpFill,
      ...this.hpText.objs,
      thin,
      this.expFill,
    ]);

    // Control mode: tap to cycle.
    this.mode = new Piece(scene, 6, 27, { dx: -70, dy: 0 });
    const [ml, mr, mt, mb] = sliceOf("mode");
    this.modeBack = scene.add
      .nineslice(0, 0, "ui", "mode/semi", 40, 13, ml, mr, mt, mb)
      .setOrigin(0);
    const cycle = scene.add.image(4, 3, "ui", "mode-icon/cycle").setOrigin(0);
    this.modeText = new Label(scene, 14, 2, "", { font: "galmuri9", color: "stone.bright" });
    this.mode.root.add([this.modeBack, cycle, this.modeText.obj]);
    this.tappable(
      this.mode.root,
      0,
      0,
      () => ({ w: this.modeBack.width, h: 13 }),
      () => {
        sound("select");
        this.actions.cycleMode?.();
      },
    );

    // The map, top right, and the notebook beside it.
    this.minimapPiece = new Piece(scene, 0, 0, { dx: 70, dy: 0 });
    this.minimap = new Minimap(scene);
    this.minimapPiece.root.add(this.minimap.root);
    this.menu = new Piece(scene, 0, 0, { dx: 0, dy: -30 });
    this.menu.root.add([
      plate(scene, 0, 0, 22, 22),
      scene.add.image(3, 3, "ui", "menu/notebook").setOrigin(0),
    ]);
    this.tappable(
      this.menu.root,
      0,
      0,
      () => ({ w: 22, h: 22 }),
      () => this.actions.openMenu(),
    );

    // 벌점 and the 자습 pool, left of the notebook.
    this.demerits = new Piece(scene, 0, 0, { dx: 0, dy: -30 });
    this.demeritText = new Label(scene, 18, 4, "", { font: "galmuri9", color: "stone.bright" });
    this.demerits.root.add([
      plate(scene, 0, 0, 62, 16),
      scene.add.image(3, 2, "ui", "icon/whistle").setOrigin(0),
      this.demeritText.obj,
    ]);
    this.pool = new Piece(scene, 0, 0, { dx: 0, dy: -50 });
    const [pl, pr, pt, pb] = sliceOf("fill-thin");
    this.poolFill = scene.add
      .nineslice(19, 6, "ui", "fill-thin/pool", 38, 3, pl, pr, pt, pb)
      .setOrigin(0);
    this.pool.root.add([
      plate(scene, 0, 0, 62, 16),
      scene.add.image(3, 2, "ui", "icon/pool").setOrigin(0),
      scene.add.nineslice(18, 5, "ui", "bar-thin/idle", 40, 5, tl, tr, tt, tb).setOrigin(0),
      this.poolFill,
    ]);
    this.tappable(
      this.pool.root,
      0,
      0,
      () => ({ w: 62, h: 16 }),
      () => this.actions.openPool?.(),
    );

    // The right thumb's cluster: the dodge in the corner, books around it, interact below.
    this.books = new Piece(scene, 0, 0, { dx: 60, dy: 30 });
    this.dodge = new Piece(scene, 0, 0, { dx: 60, dy: 0 });
    this.dodge.root.add([
      scene.add.image(0, 0, "ui", "touch-main/idle").setOrigin(0),
      scene.add.image(10, 10, "ui", "touch-icon/dodge").setOrigin(0),
    ]);
    this.tappable(
      this.dodge.root,
      0,
      0,
      () => ({ w: 34, h: 34 }),
      () => this.actions.dodge?.(),
    );
    this.buildBooks();
    // 멘토 찬스: the big gold button above the fan; it lights and pops when the call comes back.
    this.mentor = new Piece(scene, 0, 0, { dx: 60, dy: 0 });
    this.mentorIcon = scene.add.image(10, 10, "ui", "touch-icon/mentor").setOrigin(0);
    this.mentor.root.add([
      scene.add.image(0, 0, "ui", "touch-main/mentor").setOrigin(0),
      this.mentorIcon,
    ]);
    this.tappable(
      this.mentor.root,
      0,
      0,
      () => ({ w: 34, h: 34 }),
      () => {
        if (this.mentorReady) this.actions.mentor?.();
        else sound("error");
      },
    );
    this.interact = new Piece(scene, 0, 0, { dx: 60, dy: 0 });
    this.interact.root.add([
      scene.add.image(0, 0, "ui", "touch-btn/idle").setOrigin(0),
      scene.add.image(7, 7, "ui", "touch-icon/interact").setOrigin(0),
    ]);
    this.tappable(
      this.interact.root,
      0,
      0,
      () => ({ w: 28, h: 28 }),
      () => this.actions.interact?.(),
    );

    // Phones open chat from a button under the card; desktops press Enter.
    this.chat = new Piece(scene, 6, 27, { dx: -40, dy: 0 });
    this.chat.root.add([
      scene.add.image(0, 0, "ui", "touch-btn/idle").setOrigin(0),
      scene.add.image(8, 8, "ui", "icon/chat").setOrigin(0),
    ]);
    this.tappable(
      this.chat.root,
      0,
      0,
      () => ({ w: 28, h: 28 }),
      () => this.actions.openChat(),
    );

    for (const p of [
      this.card,
      this.vitals,
      this.mode,
      this.minimapPiece,
      this.menu,
      this.demerits,
      this.pool,
      this.books,
      this.dodge,
      this.mentor,
      this.interact,
      this.chat,
    ]) {
      p.root.setDepth(100);
    }
    this.layout();
    this.unwatch = hud.watch((data, changed) => this.apply(data, changed));
    this.unmap = worldView.onMap((map) => {
      this.minimap.setMap(map);
      this.minimapPiece.show(map !== undefined);
      this.menu.show(map !== undefined);
      this.chat.show(map !== undefined && this.touch);
      this.layoutLeft();
    });
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  destroy(): void {
    this.unwatch();
    this.unmap();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  /**
   * Puts every piece against the real screen edges, inside the safe area: the card and its column
   * top left, the map and its neighbours top right, the thumb's cluster bottom right.
   */
  layout(): void {
    const e = edges();
    this.card.moveTo(e.left, e.top);
    const mapX = e.right - MINIMAP.size;
    this.minimapPiece.moveTo(mapX, e.top);
    this.menu.moveTo(mapX - 24, e.top);
    this.demerits.moveTo(mapX - 24 - 4 - 62, e.top);
    this.pool.moveTo(mapX - 24 - 4 - 62, e.top + 18);
    const cx = e.right - CLUSTER;
    const cy = e.bottom - CLUSTER;
    this.cluster = { x: cx, y: cy };
    // Phones: the fan sits around the cluster's centre. Desktops: the row ends at the corner.
    this.books.moveTo(this.touch ? cx : e.right, this.touch ? cy : e.bottom);
    this.dodge.moveTo(cx - 17, cy - 17);
    this.mentor.moveTo(cx - 17, cy - 64 - 12 - 8 - 34);
    this.layoutLeft();
    this.applyInteract(hud.get());
  }

  /** Hides or shows the whole HUD, as when the notebook opens over it. */
  setVisible(on: boolean): void {
    for (const p of [
      this.card,
      this.vitals,
      this.mode,
      this.minimapPiece,
      this.menu,
      this.demerits,
      this.pool,
      this.books,
      this.dodge,
      this.mentor,
      this.interact,
      this.chat,
    ]) {
      fade(p.root, on && p.live ? 1 : 0, 120);
    }
  }

  /** The phone's chat button hides while the chat panel it opens is out. */
  setChatOpen(open: boolean): void {
    fade(this.chat.root, !open && this.chat.live ? 1 : 0, 100);
  }

  /** While a dialogue box covers the bottom of the screen, the thumb's buttons step aside. */
  setDialogue(open: boolean): void {
    for (const p of [this.books, this.dodge, this.mentor, this.interact, this.chat]) {
      fade(p.root, !open && p.live ? 1 : 0, 120);
    }
  }

  private tick(): void {
    if (this.minimapPiece.live) this.minimap.update();
    if (this.books.live) this.runSweeps(performance.now());
  }

  /** Moves every cooling slot's sweep on to where it is now. */
  private runSweeps(now: number): void {
    this.sweeps.forEach((w, i) => {
      if (!w.book) return;
      let cd = 0;
      if (w.readyAt !== undefined && w.span)
        cd = Math.max(0, Math.min(1, (w.readyAt - now) / w.span));
      else if (w.value > 0)
        // On from the last value at the rate it has been falling, never far past the next one.
        cd = Math.max(0, w.value - w.rate * Math.min(250, now - w.at));
      if (Math.abs(cd - w.shown) < 1 / 64 && !(cd === 0 && w.shown > 0)) return;
      w.shown = cd;
      const s = this.bookSlots[i];
      if (s) this.paintSlot(s, w.book, cd);
    });
  }

  private paintSlot(s: (typeof this.bookSlots)[number], book: string, cooldown: number): void {
    s.back.setFrame(cooldown <= 0 ? "book-slot/ready" : "book-slot/idle");
    s.dim.setVisible(cooldown > 0);
    s.cd.setVisible(cooldown > 0);
    s.book.setFrame(`book/${book}`);
    s.dim.setFrame(`book-dim/${book}`);
    // The cooldown sweeps back clockwise; the bright book is cropped to what has come back.
    const step = Math.min(15, Math.max(0, Math.round(cooldown * 15)));
    s.cd.setFrame(`cooldown/cd${String(step).padStart(2, "0")}`);
    const shown = Math.round(16 * (1 - cooldown));
    s.book.setCrop(0, 16 - shown, 16, shown);
  }

  /** A hit area that never lets a tap through to the world, with a press dip. */
  private tappable(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    size: () => { w: number; h: number },
    onTap: () => void,
  ): void {
    const s = size();
    const pad = 4;
    const zone = this.scene.add.zone(x - pad, y - pad, s.w + pad * 2, s.h + pad * 2).setOrigin(0);
    zone.setInteractive({ useHandCursor: true });
    let down = false;
    const up = (fire: boolean) => {
      root.y = Math.round(root.y) - 1;
      if (fire) onTap();
    };
    zone.on("pointerdown", () => {
      down = true;
      root.y = Math.round(root.y) + 1;
    });
    zone.on("pointerup", () => {
      if (down) up(true);
      down = false;
    });
    zone.on("pointerout", () => {
      if (down) up(false);
      down = false;
    });
    root.add(zone);
    root.once(Phaser.GameObjects.Events.DESTROY, () => zone.destroy());
  }

  private buildBooks(): void {
    // Phones: a fan around the dodge under the right thumb. Desktops: a row in the corner,
    // each slot marked with the number key that casts it. Both relative to the books' anchor.
    const cx = 0;
    const cy = 0;
    const at = (r: number, deg: number) => [
      Math.round(cx + r * Math.cos((deg * Math.PI) / 180)) - 12,
      Math.round(cy + r * Math.sin((deg * Math.PI) / 180)) - 12,
    ];
    const ring: [number, number][] = [
      [38, 180],
      [38, 225],
      [38, 270],
      [64, 202.5],
      [64, 247.5],
      [64, 292.5],
    ];
    const spots = this.touch
      ? ring.map(([r, deg]) => at(r, deg) as [number, number])
      : ring.map((_, i): [number, number] => [-(6 * 24 + 5 * 3) + i * 27, -24]);
    spots.forEach(([x, y], i) => {
      const back = this.scene.add.image(x, y, "ui", "book-slot/idle").setOrigin(0);
      const dim = this.scene.add.image(x + 4, y + 4, "ui", "book-dim/wangdo").setOrigin(0);
      const book = this.scene.add.image(x + 4, y + 4, "ui", "book/wangdo").setOrigin(0);
      const cd = this.scene.add.image(x, y, "ui", "cooldown/cd00").setOrigin(0);
      const lock = this.scene.add.image(x + 8, y + 7, "ui", "lock/idle").setOrigin(0);
      this.books.root.add([back, dim, book, cd, lock]);
      this.tappable(
        this.books.root,
        x,
        y,
        () => ({ w: 24, h: 24 }),
        () => this.actions.cast?.(i),
      );
      this.bookSlots.push({ back, book, dim, cd, lock });
      if (!this.touch) {
        const key = new Lifted(this.scene, "galmuri9");
        key.set(String(i + 1), x + 1, y - 2);
        this.books.root.add(key.objs);
      }
    });
  }

  /** The left column stacks what is live: card, vitals, mode, chat button. */
  private layoutLeft(): void {
    const e = edges();
    let y = e.top + 21;
    if (this.vitals.live) {
      this.vitals.moveTo(e.left, y);
      y += 22;
    }
    if (this.mode.live) {
      this.mode.moveTo(e.left, y);
      y += 17;
    }
    this.chat.moveTo(e.left, y);
  }

  private apply(data: Partial<HudData>, changed: ReadonlySet<keyof HudData>): void {
    if (changed.has("player")) this.applyPlayer(data.player);
    if (changed.has("hp") || changed.has("exp")) this.applyVitals(data);
    if (changed.has("mode")) this.applyMode(data.mode);
    if (changed.has("place")) {
      const p = data.place;
      this.minimap.setName(p ? (p.room ?? p.name) : "");
    }
    if (changed.has("demerits")) {
      const d = data.demerits;
      if (d !== undefined) this.demeritText.set(t("hud.demerits", { n: d }));
      this.demerits.show(d !== undefined);
    }
    if (changed.has("pool")) {
      const p = data.pool;
      if (p) this.poolFill.setSize(Math.max(0, Math.round((38 * p.now) / Math.max(1, p.max))), 3);
      this.pool.show(p !== undefined);
    }
    if (changed.has("books")) this.applyBooks(data.books);
    if (changed.has("dodge")) this.dodge.show(this.touch && data.dodge !== undefined);
    if (changed.has("mentor")) this.applyMentor(data.mentor);
    if (changed.has("interact") || changed.has("books")) this.applyInteract(data);
    if (changed.has("hp") || changed.has("exp") || changed.has("mode")) this.layoutLeft();
  }

  private applyPlayer(p: HudData["player"] | undefined): void {
    if (p) {
      this.level.set(String(p.level));
      this.level.at(13 - Math.ceil(this.level.width / 2), 4);
      this.name.set(p.name);
      this.name.at(31, 5);
      this.cardBack.setSize(31 + this.name.width + 6, 19);
    }
    this.card.show(p !== undefined);
  }

  private applyVitals(data: Partial<HudData>): void {
    const hp = data.hp;
    const exp = data.exp;
    if (hp) {
      const w = Math.round((96 * Math.max(0, hp.now)) / Math.max(1, hp.max));
      const lost = this.lastHp !== undefined && hp.now < this.lastHp;
      this.hpFill.setSize(Math.max(0, w), 11).setVisible(w > 0);
      if (lost) {
        // The lost chunk holds for a beat, then drains to the new value.
        this.lagTimer?.remove();
        this.lagTimer = this.scene.time.delayedCall(380, () => {
          this.scene.tweens.add({ targets: this.hpLag, width: w, duration: 260, ease: "Quad.In" });
        });
      } else this.hpLag.setSize(Math.max(w, 0), 11);
      this.lastHp = hp.now;
      const text = `${num(hp.now)} / ${num(hp.max)}`;
      this.hpText.set(text, 0, 2);
      this.hpText.set(text, 49 - Math.floor(this.hpText.width / 2), 2);
    }
    if (exp) {
      const w = Math.round((96 * exp.now) / Math.max(1, exp.max));
      this.expFill.setSize(Math.max(0, w), 3).setVisible(w > 0);
    }
    this.vitals.show(hp !== undefined);
  }

  private applyMode(mode: HudData["mode"] | undefined): void {
    if (mode) {
      const def = MODES.find((m) => m.id === mode);
      const name = def ? (narrative.NARRATIVE.ko[def.name] ?? mode) : mode;
      this.modeText.set(name);
      this.modeBack.setFrame(`mode/${mode}`).setSize(14 + this.modeText.width + 5, 13);
    }
    this.mode.show(mode !== undefined);
  }

  private applyBooks(books: readonly (BookSlot | null)[] | undefined): void {
    const now = performance.now();
    this.bookSlots.forEach((s, i) => {
      const b = books?.[i];
      const has = b !== undefined && b !== null;
      s.lock.setVisible(!has);
      s.book.setVisible(has);
      const prev = this.sweeps[i];
      if (!has) {
        s.back.setFrame("book-slot/locked");
        s.dim.setVisible(false);
        s.cd.setVisible(false);
        this.sweeps[i] = { book: "", value: 0, at: now, start: undefined, rate: 0, shown: 0 };
        return;
      }
      // A cast, or another book in the slot, starts a new sweep; its rate is measured from there.
      const fresh =
        !prev || prev.book !== b.book || prev.value <= 0 || b.cooldown > prev.value + 1 / 16;
      const start =
        b.cooldown <= 0 ? undefined : fresh ? { value: b.cooldown, at: now } : prev.start;
      const rate =
        start && now - start.at > 30 && start.value > b.cooldown
          ? (start.value - b.cooldown) / (now - start.at)
          : fresh
            ? 0
            : (prev?.rate ?? 0);
      // A value a little behind where the sweep has run to is the feed's rounding: never sweep back.
      const v =
        !fresh && prev && prev.shown < b.cooldown && b.cooldown - prev.shown < 1 / 16
          ? prev.shown
          : b.cooldown;
      this.sweeps[i] = {
        book: b.book,
        value: v,
        at: now,
        start,
        rate,
        ...(b.readyAt !== undefined ? { readyAt: b.readyAt } : {}),
        ...(b.span !== undefined ? { span: b.span } : {}),
        shown: v,
      };
      this.paintSlot(s, b.book, v);
    });
    this.books.show(books !== undefined);
  }

  private applyMentor(m: HudData["mentor"] | undefined): void {
    if (m) {
      const ready = m.cooldown <= 0;
      this.mentorIcon.setAlpha(ready ? 1 : 0.35);
      if (ready && !this.mentorReady && this.mentor.live) {
        this.scene.tweens.add({
          targets: this.mentorIcon,
          scale: { from: 1.6, to: 1 },
          x: { from: 10 - 4, to: 10 },
          y: { from: 10 - 4, to: 10 },
          duration: 220,
          ease: "Back.Out",
        });
        sound("stamp");
      }
      this.mentorReady = ready;
    }
    this.mentor.show(this.touch && m !== undefined);
  }

  private applyInteract(data: Partial<HudData>): void {
    // The interact button sits below the cluster, or alone in the corner without books.
    const withBooks = data.books !== undefined;
    const { x: cx, y: cy } = this.cluster;
    const x = withBooks ? cx + Math.round(64 * Math.cos((157.5 * Math.PI) / 180)) - 14 : cx - 14;
    const y = withBooks ? cy + Math.round(64 * Math.sin((157.5 * Math.PI) / 180)) - 14 : cy - 14;
    this.interact.moveTo(x, y);
    this.interact.show(this.touch && data.interact !== undefined);
  }
}
