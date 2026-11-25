import {
  BOARD_CATEGORIES,
  BOARD_POST_LENGTH,
  type BoardCategory,
  type BoardPost,
} from "@guago/shared";
import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { Button } from "../ui/button.ts";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { fade, slide } from "../ui/motion.ts";
import { holdToasts, toast } from "../ui/overlay.ts";
import { sound } from "../ui/sound.ts";
import { Label, measure, wrap } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import type { WorldLink } from "../world-link.ts";
import { ask } from "./act.ts";
import { openSheet } from "./sheet.ts";
import { line, refusal, term, timeLeft } from "./words.ts";

/** Paper for each category: 파티 모집 on blue, 거래 on yellow, 동아리 홍보 on pink, 잡담 on white. */
const PAPER: Readonly<Record<BoardCategory, string>> = {
  party: "note-blue",
  trade: "note-yellow",
  club: "note-pink",
  chat: "note-white",
};
const TACKS = ["tack-red", "tack-blue", "tack-gold", "tack-green"] as const;
/** Pen colours a note may be written in: ink, a blue pen, pencil. */
const PENS = ["ink.dark", "navy.dark", "stone.deep"] as const;

const NOTE_W = 100;
const NOTE_H = 74;
/** Rows of writing a note holds above its foot. */
const NOTE_LINES = 4;
const ROWS = 2;
/** The 층장's notice frame, a notice and its lip; the column it hangs in down the left. */
const FRAME_W = 112;
const FRAME_H = 86;
const SIDE = 120;

/** A small whole-number hash of a post id, so each note keeps its look between visits. */
function hash(n: number, salt: number): number {
  let h = Math.imul(n ^ (salt * 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** `text` cut to `width` in galmuri9, ending in an ellipsis when anything was cut. */
function fit(scene: Phaser.Scene, text: string, width: number): string {
  if (measure(scene, "galmuri9", text) <= width) return text;
  const chars = [...text.replace(/…$/, "")];
  while (chars.length > 0 && measure(scene, "galmuri9", `${chars.join("").trimEnd()}…`) > width) {
    chars.pop();
  }
  return `${chars.join("").trimEnd()}…`;
}

let lastCat: BoardCategory = "party";

/**
 * The 대자보 (PLAN §12): a cork board in a wooden frame filling the screen. Four category cards
 * along the top; notes pinned in rows, each on its category's paper, held by a thumbtack or a
 * strip of tape, some with a folded or torn corner, written in ink, blue pen or pencil; the
 * 층장's notice ruled in red on top. Each note says how long it has left and who wrote it, and
 * the player's own carries 떼기. 쓰기 pins a new one. Round the notes is what years in a
 * corridor left: the 층장's frame (holding the pinned notice, or the scraps of the last one), a
 * faded 시간표, a 분실물 slip, a torn poster corner, empty tacks and old tape.
 */
export class Board {
  private readonly scene: Phaser.Scene;
  private readonly link: WorldLink;
  private readonly scope = new FocusScope();
  private readonly root: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly cork: { x: number; y: number; w: number; h: number };
  /** Where the notes go, right of the furniture column. */
  private readonly area: { x: number; y: number; w: number; h: number };
  private readonly cols: number;
  private readonly frameAt: { x: number; y: number };
  private readonly unhold: () => void;
  private readonly notes: Phaser.GameObjects.Container;
  private readonly cats: { cat: BoardCategory; root: Phaser.GameObjects.Container }[] = [];
  private cat: BoardCategory = lastCat;
  private posts: BoardPost[] = [];
  private pinned: BoardPost[] = [];
  private more = false;
  private view = 0;
  private closing = false;
  private readonly onClosed: () => void;
  private readonly pager: { next: Button; first: Button };

  constructor(scene: Phaser.Scene, link: WorldLink, onClosed: () => void) {
    this.scene = scene;
    this.link = link;
    this.onClosed = onClosed;
    const sw = scene.scale.width;
    const sh = scene.scale.height;
    const ctx: Ctx = { scene, scope: this.scope };
    this.dim = scene.add
      .rectangle(0, 0, sw, sh, paint("ink.deep"))
      .setOrigin(0)
      .setAlpha(0)
      .setDepth(850)
      .setInteractive();
    fade(this.dim, 0.5, 160);
    const fx = 6;
    const fy = 22;
    const fw = sw - 12;
    const fh = sh - fy - 4;
    this.cork = { x: fx + 4, y: fy + 4, w: fw - 8, h: fh - 8 };
    this.area = {
      x: this.cork.x + SIDE,
      y: this.cork.y,
      w: this.cork.w - SIDE - 2,
      h: this.cork.h,
    };
    this.cols = Math.max(1, Math.floor((this.area.w - 8) / (NOTE_W + 8)));
    this.frameAt = { x: this.cork.x + 5, y: this.cork.y + 9 };
    const corkTile = scene.add
      .tileSprite(this.cork.x, this.cork.y, this.cork.w, this.cork.h, "ui", "cork/idle")
      .setOrigin(0);
    const [l, r, tt, b] = sliceOf("board-frame");
    const frame = scene.add
      .nineslice(fx, fy, "ui", "board-frame/idle", fw, fh, l, r, tt, b)
      .setOrigin(0);
    frame.setInteractive();
    this.notes = scene.add.container(0, 0);
    this.root = scene.add
      .container(0, 0, [frame, corkTile, this.furnish(), this.notes])
      .setDepth(851);

    // The category cards, taped along the top edge of the frame.
    let cx = fx + 10;
    for (const cat of BOARD_CATEGORIES) {
      const label = new Label(scene, 0, 0, term("board", cat), {
        font: "galmuri11-bold",
        color: "ink.dark",
      });
      const w = label.width + 14;
      const [nl, nr, nt, nb] = sliceOf(PAPER[cat]);
      const paper = scene.add
        .nineslice(0, 0, "ui", `${PAPER[cat]}/plain`, w, 20, nl, nr, nt, nb)
        .setOrigin(0);
      label.at(7, 5);
      const tape = scene.add.image(Math.floor(w / 2) - 7, -3, "ui", "tape/idle").setOrigin(0);
      const zone = scene.add
        .zone(0, -4, w, 26)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerup", () => this.pick(cat));
      const root = scene.add.container(cx, 4, [paper, label.obj, tape, zone]);
      this.root.add(root);
      this.cats.push({ cat, root });
      cx += w + 6;
    }

    // Writing and paging, in the frame's bottom right.
    const right = fx + fw - 22;
    const write = new Button(ctx, right - 58, 1, {
      label: t("board.write"),
      kind: "ink",
      w: 58,
      h: 19,
      font: "galmuri9",
      sound: "confirm",
      onPress: () => this.write(),
    });
    const next = new Button(ctx, right - 58 - 5 - 54, 1, {
      label: t("board.next"),
      w: 54,
      h: 19,
      font: "galmuri9",
      onPress: () => void this.page(this.view + 1),
    });
    const first = new Button(ctx, right - 58 - 5 - 54 - 5 - 46, 1, {
      label: t("board.first"),
      w: 46,
      h: 19,
      font: "galmuri9",
      onPress: () => void this.page(0),
    });
    this.pager = { next, first };
    const close = scene.add.image(sw - 16, 5, "ui", "close/idle").setOrigin(0);
    const closeZone = scene.add
      .zone(sw - 21, 0, 21, 21)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    closeZone.on("pointerover", () => close.setFrame("close/hover"));
    closeZone.on("pointerout", () => close.setFrame("close/idle"));
    closeZone.on("pointerup", () => {
      sound("close");
      this.close();
    });
    this.root.add([first, next, write, close, closeZone]);

    this.scope.onBack = () => this.close();
    pushScope(this.scope);
    // Toasts hang from the cork's top edge over the notes, clear of the cards and buttons.
    this.unhold = holdToasts(() => ({
      x: this.area.x + this.area.w / 2,
      w: Math.min(313, this.area.w - 8),
      top: this.cork.y + 3,
    }));
    // The board drops into place from above.
    this.root.setY(-sh);
    sound("open");
    slide(this.root, { x: 0, y: 0 }, 220);
    this.paintCats();
    void this.load();
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    popScope(this.scope);
    this.unhold();
    fade(this.dim, 0, 140, () => this.dim.destroy());
    slide(this.root, { x: 0, y: -this.scene.scale.height }, 160, () => {
      this.root.destroy();
      this.onClosed();
    });
  }

  private pick(cat: BoardCategory): void {
    if (cat === this.cat) return;
    sound("page");
    this.cat = cat;
    lastCat = cat;
    this.paintCats();
    this.posts = [];
    this.view = 0;
    void this.load();
  }

  private paintCats(): void {
    for (const c of this.cats) {
      const on = c.cat === this.cat;
      // The open category stands proud of the frame; the others sit lower and fade.
      this.scene.tweens.add({ targets: c.root, y: on ? 1 : 6, duration: 120, ease: "Quad.Out" });
    }
  }

  private async load(before?: number): Promise<void> {
    const cat = this.cat;
    const r = await this.link.request("board.list", {
      cat,
      ...(before === undefined ? {} : { before }),
    });
    if (this.closing || cat !== this.cat) return;
    if (!r.ok) {
      {
        const said = refusal(r.code);
        if (said) toast(said);
      }
      return;
    }
    if (before === undefined) {
      this.posts = r.data.posts;
      this.pinned = r.data.pinned;
    } else this.posts = [...this.posts, ...r.data.posts];
    this.more = r.data.more;
    this.draw();
  }

  private get perView(): number {
    return this.cols * ROWS;
  }

  private async page(view: number): Promise<void> {
    if (view < 0) return;
    const start = view * this.perView;
    if (start >= this.posts.length && this.more) {
      await this.load(this.posts.at(-1)?.id);
    }
    if (start >= this.posts.length && view > 0) return;
    sound("page");
    this.view = view;
    this.draw();
  }

  private draw(): void {
    for (const o of [...this.notes.list]) o.destroy();
    this.drawNotice();
    const start = this.view * this.perView;
    const shown = this.posts.slice(start, start + this.perView);
    const { area, cols } = this;
    const gx = (area.w - cols * NOTE_W) / (cols + 1);
    const gy = (area.h - ROWS * NOTE_H) / (ROWS + 1);
    shown.forEach((post, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // A little out of line, as notes are pinned by hand.
      const jx = (hash(post.id, 1) % 5) - 2;
      const jy = (hash(post.id, 2) % 7) - 3;
      const x = Math.round(area.x + gx + col * (NOTE_W + gx) + jx);
      const y = Math.round(area.y + gy + row * (NOTE_H + gy) + jy);
      const note = this.note(post, false);
      note.setPosition(x, y - 6).setAlpha(0);
      this.notes.add(note);
      this.scene.tweens.add({
        targets: note,
        y,
        alpha: 1,
        duration: 140,
        delay: i * 35,
        ease: "Back.Out",
      });
    });
    this.pager.next.setEnabled(start + this.perView < this.posts.length || this.more);
    this.pager.first.setEnabled(this.view > 0);
  }

  /** The 층장's frame: the pinned notice, or what was left of the last one when none is. */
  private drawNotice(): void {
    const scene = this.scene;
    const { x, y } = this.frameAt;
    const pinned = this.pinned[0];
    if (pinned) {
      const notice = this.note(pinned, true).setPosition(x + 6, y + 6);
      this.notes.add(notice);
      return;
    }
    this.notes.add([
      scene.add.image(x + 6, y + 7, "ui", "board-scrap/white").setOrigin(0),
      scene.add
        .image(x + FRAME_W - 17, y + 8, "ui", "board-scrap/white")
        .setOrigin(0)
        .setFlipX(true),
      scene.add.image(x + 7, y + 5, "ui", "tack-red/idle").setOrigin(0),
      scene.add.image(x + FRAME_W - 16, y + 5, "ui", "tack-red/idle").setOrigin(0),
    ]);
  }

  /**
   * What has been on the board for years, round the edges of the cork where no note goes: the
   * 층장's frame and rosette, the 시간표 and the 분실물 slip down the left, a torn poster corner
   * in the top right, scraps, tacks and tape between the rows.
   */
  private furnish(): Phaser.GameObjects.Container {
    const scene = this.scene;
    const { cork, area, frameAt } = this;
    const at = (x: number, y: number, frame: string) =>
      scene.add.image(Math.round(x), Math.round(y), "ui", frame).setOrigin(0);
    const [l, r, t, b] = sliceOf("notice-frame");
    const fx = frameAt.x;
    const fy = frameAt.y;
    const shade = paint("wood.mid");
    const parts: Phaser.GameObjects.GameObject[] = [
      scene.add.rectangle(fx + FRAME_W, fy + 1, 1, FRAME_H, shade).setOrigin(0),
      scene.add.rectangle(fx + 1, fy + FRAME_H, FRAME_W, 1, shade).setOrigin(0),
      scene.add
        .nineslice(fx, fy, "ui", "notice-frame/idle", FRAME_W, FRAME_H, l, r, t, b)
        .setOrigin(0),
      at(fx + FRAME_W / 2 - 4, fy - 5, "floor-rosette/idle"),
    ];
    // Down the left under the frame: the 시간표, taped, with the 분실물 slip pinned over its
    // corner; below them, a scrap under a tack and a strip of tape from something long gone.
    const tx = cork.x + 7;
    const ty = fy + FRAME_H + 13;
    parts.push(
      at(tx, ty, "board-timetable/idle"),
      at(tx + 25, ty - 3, "board-tape/long"),
      at(tx + 48, ty + 40, "board-lost/idle"),
      at(tx + 60, ty + 37, "board-tape/stub"),
    );
    const low = Math.max(ty + 90, cork.y + cork.h - 26);
    parts.push(
      at(tx + 4, low, "board-scrap/yellow"),
      at(tx + 5, low - 1, "tack-blue/idle"),
      at(tx + 30, low + 9, "board-tape/stub"),
    );
    // The top right corner: what is left of a 축제 poster, still held by its tack.
    parts.push(
      at(cork.x + cork.w - 31, cork.y, "board-poster/idle"),
      at(cork.x + cork.w - 10, cork.y + 1, "tack-gold/idle"),
    );
    // Between the rows of notes, where nothing new is pinned: an empty tack, a scrap, tape.
    const gy = (area.h - ROWS * NOTE_H) / (ROWS + 1);
    const mid = area.y + gy + NOTE_H + gy / 2;
    const bottom = area.y + area.h - gy / 2;
    parts.push(
      at(area.x + area.w * 0.27, mid - 4, "board-scrap/white"),
      at(area.x + area.w * 0.27 + 1, mid - 5, "tack-green/idle"),
      at(area.x + area.w * 0.71, mid - 2, "tack-red/idle"),
      at(area.x + area.w * 0.48, bottom - 4, "board-tape/long"),
      at(area.x + area.w * 0.86, bottom - 5, "tack-blue/idle"),
      at(area.x + area.w * 0.12, area.y + gy / 2 - 4, "board-tape/stub"),
    );
    return scene.add.container(0, 0, parts);
  }

  /** One note: paper, a tack or tape, the words in a pen, time left and who wrote it. */
  private note(post: BoardPost, pinned: boolean): Phaser.GameObjects.Container {
    const scene = this.scene;
    const h1 = hash(post.id, 3);
    const paper = pinned
      ? "notice-paper"
      : PAPER[post.section === "notice" ? "chat" : post.section];
    const style = pinned ? "idle" : (["plain", "plain", "fold", "torn"] as const)[h1 % 4];
    const [l, r, tt, b] = sliceOf(paper);
    const shadow = scene.add.rectangle(2, 2, NOTE_W, NOTE_H, paint("wood.dark")).setOrigin(0);
    const sheet = scene.add
      .nineslice(0, 0, "ui", `${paper}/${style}`, NOTE_W, NOTE_H, l, r, tt, b)
      .setOrigin(0);
    const parts: Phaser.GameObjects.GameObject[] = [shadow, sheet];
    // 잡담 is written on ruled paper.
    if (post.section === "chat" && !pinned) {
      const g = scene.add.graphics();
      g.fillStyle(paint("navy.pale"));
      for (let y = 17; y < NOTE_H - 14; y += 11) g.fillRect(4, y, NOTE_W - 8, 1);
      g.fillStyle(paint("rose.light"));
      g.fillRect(10, 2, 1, NOTE_H - 6);
      parts.push(g);
    }
    const pen = pinned ? "red.dark" : (PENS[hash(post.id, 4) % PENS.length] ?? "ink.dark");
    const pad = pinned ? 8 : 6;
    const room = NOTE_W - pad * 2 - (post.section === "chat" && !pinned ? 6 : 0);
    const all = wrap(scene, "galmuri9", post.text, room);
    const lines = all.slice(0, NOTE_LINES);
    // A note longer than the paper ends its last row in an ellipsis, in the same pen.
    if (all.length > NOTE_LINES) lines[NOTE_LINES - 1] = fit(scene, `${lines.at(-1)}…`, room);
    lines.forEach((text, i) => {
      parts.push(
        new Label(scene, pad + (post.section === "chat" && !pinned ? 6 : 0), 8 + i * 11, text, {
          font: "galmuri9",
          color: pen,
        }).obj,
      );
    });
    // The foot: time left on the left; on the right who wrote it, or 떼기 on the player's own.
    const left = new Label(scene, pad, NOTE_H - 13, timeLeft(post.expiresAt), {
      font: "galmuri9",
      color: "stone.dark",
    });
    parts.push(left.obj);
    const mine = post.author.id === this.link.me;
    if (!mine) {
      const name = fit(scene, post.author.name, NOTE_W - pad * 2 - left.width - 6);
      const who = new Label(scene, 0, 0, name, { font: "galmuri9", color: "stone.dark" });
      who.at(NOTE_W - pad - who.width, NOTE_H - 13);
      parts.push(who.obj);
    }
    // Held up by a thumbtack, or by tape across the top.
    if (pinned) {
      parts.push(scene.add.image(4, -2, "ui", "tack-red/idle").setOrigin(0));
      parts.push(scene.add.image(NOTE_W - 11, -2, "ui", "tack-red/idle").setOrigin(0));
    } else if (h1 % 3 === 0) {
      parts.push(scene.add.image(Math.floor(NOTE_W / 2) - 7, -3, "ui", "tape/idle").setOrigin(0));
    } else {
      const tack = TACKS[hash(post.id, 5) % TACKS.length];
      parts.push(
        scene.add.image(Math.floor(NOTE_W / 2) - 3, -2, "ui", `${tack}/idle`).setOrigin(0),
      );
    }
    const root = scene.add.container(0, 0, parts);
    if (mine) {
      const take = new Label(scene, 0, 0, t("board.remove"), {
        font: "galmuri9",
        color: "red.mid",
      });
      take.at(NOTE_W - pad - take.width, NOTE_H - 13);
      const zone = scene.add
        .zone(take.obj.x - 4, NOTE_H - 16, take.width + 8, 16)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerup", () => void this.remove(post));
      root.add([take.obj, zone]);
    }
    return root;
  }

  private async remove(post: BoardPost): Promise<void> {
    const r = await ask(this.link, "board.delete", { id: post.id });
    if (!r.ok) return;
    this.posts = this.posts.filter((p) => p.id !== post.id);
    this.pinned = this.pinned.filter((p) => p.id !== post.id);
    this.draw();
  }

  /** 쓰기: a sheet with the category's paper colour as its title, 200 characters, 붙이기. */
  private write(): void {
    const cat = this.cat;
    openSheet(this.scene, {
      title: term("board", cat),
      w: 360,
      h: 198,
      depth: 920,
      build: (sheet) => {
        const { ctx, panel, page } = sheet;
        const scene = this.scene;
        const count = new Label(scene, 0, 0, `0/${BOARD_POST_LENGTH}`, {
          font: "galmuri9",
          color: "stone.dark",
        });
        const place = () => count.at(page.x + page.w - 8 - count.width, page.y + 8);
        place();
        const field = new TextField(ctx, page.x + 8, page.y + 20, {
          w: page.w - 16,
          h: 118,
          lines: 8,
          maxLength: BOARD_POST_LENGTH,
          enterKeyHint: "send",
          onChange: (v) => {
            count.set(`${[...v].length}/${BOARD_POST_LENGTH}`);
            place();
          },
          onSubmit: () => void post(),
        });
        const go = new Button(ctx, page.x + page.w - 8 - 64, page.y + page.h - 8 - 21, {
          label: t("board.post"),
          kind: "ink",
          w: 64,
          sound: "confirm",
          onPress: () => void post(),
        });
        panel.add([count.obj, field, go]);
        const post = async () => {
          const text = field.value.trim();
          if (!text) {
            field.reject();
            return;
          }
          const r = await this.link.request("board.post", { cat, text });
          if (!r.ok) {
            sound("error");
            {
              const said = refusal(r.code);
              if (said) toast(said);
            }
            field.reject();
            return;
          }
          sound("stamp");
          const said = line("social.board.posted");
          if (said) toast(said);
          sheet.close();
          if (this.cat === cat) {
            this.posts = [r.data.post, ...this.posts.filter((p) => p.id !== r.data.post.id)];
            this.view = 0;
            this.draw();
          }
        };
      },
    });
  }
}
