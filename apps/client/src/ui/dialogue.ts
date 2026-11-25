import { narrative } from "@guago/content";
import * as Phaser from "phaser";
import { Button } from "./button.ts";
import { FocusScope, popScope, pushScope } from "./focus.ts";
import { layDown, pickUp } from "./motion.ts";
import { screen } from "./screen.ts";
import { sound } from "./sound.ts";
import { Label, wrap } from "./text.ts";
import { sliceOf } from "./theme.ts";

/**
 * The dialogue box from the kit: a notebook page across the bottom, the speaker's name on an
 * index tab, their portrait pasted into the margin, the line revealed at reading pace, and the
 * page-turn mark when it is done. Choices sit on a slip above it.
 *
 * ```ts
 * const pick = await dialogue.say([{ speaker: "entropy", text: "그거, 이제 무기야." }]);
 * ```
 */
export interface DialogueLine {
  /** A speaker id from the narrative's voice bible. */
  readonly speaker: string;
  /** The words, already in Korean; `{player}` is filled with the player's name. */
  readonly text: string;
  /** A portrait face, when the speaker has more than one. */
  readonly face?: string;
  /** The player's answers, shown when the line is done. */
  readonly choices?: readonly string[];
}

const BOX = { w: 464, h: 66 } as const;
/** Centred along the bottom of the screen, whatever its width. */
const boxAt = () => ({ x: Math.round((screen.w - BOX.w) / 2), y: screen.h - 6 - BOX.h });
/** Text starts past the margin line and stops before the caret (`DIALOGUE_BOX` in the narrative). */
const TEXT_X = 78;
const TEXT_W = narrative.DIALOGUE_BOX.px;
/** Characters a second: quick enough not to wait on, slow enough to see it written. */
const PACE = 38;

const speakers = new Map(narrative.NARRATIVE.speakers.map((s) => [s.id, s]));

export class DialogueBox {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly tab: Phaser.GameObjects.NineSlice;
  private readonly name: Label;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly slot: Phaser.GameObjects.Image;
  private readonly corners: Phaser.GameObjects.Image;
  private readonly margin: Phaser.GameObjects.NineSlice;
  private readonly rules: Phaser.GameObjects.NineSlice[];
  private readonly text: Label;
  private readonly caret: Phaser.GameObjects.Sprite;
  private readonly scope = new FocusScope();
  private choiceBox: Phaser.GameObjects.Container | undefined;
  private lines: readonly DialogueLine[] = [];
  private index = 0;
  private shown = 0;
  private full: string[] = [];
  private total = 0;
  private clock = 0;
  private lastType = 0;
  private resolve: ((choice: number | undefined) => void) | undefined;
  /** Fills `{player}` in lines. */
  playerName = "";
  /** Told when the box opens and closes, so the HUD and chat can step out of its way. */
  onOpenChange: ((open: boolean) => void) | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const [dl, dr, dt, db] = sliceOf("dialog");
    const page = scene.add
      .nineslice(0, 0, "ui", "dialog/idle", BOX.w, BOX.h, dl, dr, dt, db)
      .setOrigin(0);
    page.setInteractive().on("pointerup", () => this.advance());
    const [nl, nr, nt, nb] = sliceOf("nametab");
    this.tab = scene.add
      .nineslice(72, -16, "ui", "nametab/idle", 40, 18, nl, nr, nt, nb)
      .setOrigin(0);
    this.name = new Label(scene, 79, -12, "", { font: "galmuri11-bold", color: "stone.bright" });
    const slot = scene.add.image(10, 7, "ui", "portrait-slot/idle").setOrigin(0);
    this.slot = slot;
    this.portrait = scene.add.image(12, 9, "portraits", "portrait-entropy/neutral").setOrigin(0);
    const corners = scene.add.image(10, 7, "ui", "portrait-corners/idle").setOrigin(0);
    this.corners = corners;
    const [ml, mr, mt, mb] = sliceOf("margin");
    const margin = scene.add
      .nineslice(70, 5, "ui", "margin/idle", 1, BOX.h - 10, ml, mr, mt, mb)
      .setOrigin(0);
    this.margin = margin;
    const [rl, rr, rt, rb] = sliceOf("row");
    const rules = [0, 1, 2].map((i) =>
      scene.add
        .nineslice(71, 6 + i * 17, "ui", "row/idle", BOX.w - 76, 16, rl, rr, rt, rb)
        .setOrigin(0),
    );
    this.rules = rules;
    this.text = new Label(scene, TEXT_X, 9, "", {
      font: "galmuri11",
      color: "ink.dark",
      leading: 1,
    });
    this.caret = scene.add.sprite(BOX.w - 18, BOX.h - 16, "ui", "caret/up").setOrigin(0);
    if (!scene.anims.exists("ui-caret-bob")) {
      scene.anims.create({
        key: "ui-caret-bob",
        frames: [
          { key: "ui", frame: "caret/up" },
          { key: "ui", frame: "caret/down" },
        ],
        frameRate: 3,
        repeat: -1,
      });
    }
    this.caret.play("ui-caret-bob").setVisible(false);
    this.root = scene.add
      .container(boxAt().x, boxAt().y, [
        this.tab,
        this.name.obj,
        page,
        slot,
        this.portrait,
        corners,
        margin,
        ...rules,
        this.text.obj,
        this.caret,
      ])
      .setDepth(700)
      .setVisible(false);
    this.scope.onBack = () => this.advance();
    // Enter and Space turn the page; they reach the page through the scope's one item.
    this.scope.add({
      bounds: () => ({ ...boxAt(), w: BOX.w, h: BOX.h }),
      enabled: () => this.resolve !== undefined && !this.choiceBox,
      setFocus: () => undefined,
      activate: () => this.advance(),
    });
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  get open(): boolean {
    return this.resolve !== undefined;
  }

  /** Plays the lines in order; resolves with the choice picked on the last, if it had any. */
  say(lines: readonly DialogueLine[]): Promise<number | undefined> {
    const reopened = this.resolve !== undefined;
    this.resolve?.(undefined);
    this.lines = lines;
    this.index = 0;
    const done = new Promise<number | undefined>((r) => {
      this.resolve = r;
    });
    if (!reopened) {
      pushScope(this.scope);
      this.onOpenChange?.(true);
    }
    this.scope.focus(this.scope.first(), "key");
    if (!this.root.visible) layDown(this.root, boxAt());
    sound("open");
    this.show();
    return done;
  }

  private show(): void {
    const line = this.lines[this.index];
    if (!line) {
      this.finish(undefined);
      return;
    }
    const speaker = speakers.get(line.speaker);
    const name = speaker ? (narrative.NARRATIVE.ko[speaker.name] ?? line.speaker) : line.speaker;
    this.name.set(name);
    this.tab.setSize(this.name.width + 14, 18);
    const frame = portraitFrame(this.scene, line.speaker, line.face ?? speaker?.faces[0]);
    this.portrait.setVisible(frame !== undefined);
    // Portrait frames carry their own pivot; the slot wants the top-left corner.
    if (frame) this.portrait.setFrame(frame).setOrigin(0);
    this.layoutFor(frame !== undefined);
    const text = line.text.replaceAll("{player}", this.playerName);
    this.full = wrap(this.scene, "galmuri11", text, TEXT_W).slice(0, 3);
    this.total = this.full.join("").length;
    this.shown = 0;
    this.clock = 0;
    this.text.set("");
    this.caret.setVisible(false);
  }

  /**
   * With a portrait the page has its pasted photo and a margin beside it. A voice with no face
   * (the narrator, the broadcast, the 자판기) gets the page without the slot: no empty frame.
   */
  private layoutFor(portrait: boolean): void {
    const left = portrait ? 70 : 8;
    this.slot.setVisible(portrait);
    this.corners.setVisible(portrait);
    this.margin.setX(left);
    for (const r of this.rules) r.setX(left + 1).setSize(BOX.w - left - 6, 16);
    this.text.at(portrait ? TEXT_X : left + 8, 9);
    this.tab.setX(portrait ? 72 : 10);
    this.name.at(portrait ? 79 : 17, -12);
  }

  private tick(_time: number, delta: number): void {
    if (!this.root.visible || this.shown >= this.total) return;
    this.clock += delta;
    const next = Math.min(this.total, Math.floor((this.clock / 1000) * PACE));
    if (next === this.shown) return;
    this.shown = next;
    this.render();
    if (this.clock - this.lastType > 55) {
      this.lastType = this.clock;
      sound("type");
    }
    if (this.shown >= this.total) this.done();
  }

  private render(): void {
    let left = this.shown;
    const rows = this.full.map((row) => {
      const part = row.slice(0, Math.max(0, left));
      left -= row.length;
      return part;
    });
    // Each row on its ruled line: 16 px lines and one between.
    this.text.set(rows.join("\n"));
  }

  private done(): void {
    const line = this.lines[this.index];
    if (line?.choices && line.choices.length > 0) this.offer(line.choices);
    else this.caret.setVisible(true);
  }

  private advance(): void {
    if (!this.root.visible || this.choiceBox) return;
    if (this.shown < this.total) {
      this.shown = this.total;
      this.render();
      this.done();
      return;
    }
    sound("page");
    this.index++;
    if (this.index >= this.lines.length) this.finish(undefined);
    else this.show();
  }

  private offer(choices: readonly string[]): void {
    const ctx = { scene: this.scene, scope: this.scope };
    const box = this.scene.add.container(0, 0).setDepth(701);
    const buttons = choices.map((c, i) => {
      const b = new Button(ctx, 0, 0, {
        label: c,
        font: "galmuri11",
        h: 19,
        onPress: () => {
          box.destroy();
          this.choiceBox = undefined;
          this.finish(i);
        },
      });
      return b;
    });
    const w = Math.max(...buttons.map((b) => b.bounds().w)) + 12;
    const h = buttons.length * 22 + 8;
    const [l, r, t, b] = sliceOf("dialog");
    const x = boxAt().x + BOX.w - w;
    const y = boxAt().y - h - 18;
    box.add(this.scene.add.nineslice(0, 0, "ui", "dialog/idle", w, h, l, r, t, b).setOrigin(0));
    buttons.forEach((btn, i) => {
      btn.setPosition(6, 5 + i * 22);
      box.add(btn);
    });
    box.setPosition(x, y);
    this.choiceBox = box;
    layDown(box, { x, y });
    this.scope.focus(buttons[0], "key");
  }

  private finish(choice: number | undefined): void {
    popScope(this.scope);
    const r = this.resolve;
    this.resolve = undefined;
    sound("close");
    pickUp(this.root, boxAt());
    this.onOpenChange?.(false);
    r?.(choice);
  }
}

/**
 * A speaker's portrait frame: `portrait-<speaker id>/<face>`, the face asked for or else the
 * neutral one; undefined for a speaker the art has no portrait of.
 */
function portraitFrame(scene: Phaser.Scene, speaker: string, face?: string): string | undefined {
  const atlas = scene.textures.get("portraits");
  for (const f of [face, "neutral"]) {
    if (!f) continue;
    const frame = `portrait-${speaker}/${f}`;
    if (atlas.has(frame)) return frame;
  }
  return undefined;
}
