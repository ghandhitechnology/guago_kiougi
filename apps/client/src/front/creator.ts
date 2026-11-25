import type { ArtMetadata } from "@guago/art";
import { checkName } from "@guago/shared";
import * as Phaser from "phaser";
import {
  type Backend,
  type Character,
  errorCode,
  errorText,
  type Look,
  MAJORS,
  type Major,
} from "../backend/index.ts";
import {
  composeDoll,
  Doll,
  type DollLook,
  type Facing,
  lookOptions,
  randomLook,
  releaseDoll,
  SHADOW_FRAME,
} from "../doll.ts";
import { type TextKey, t, tMaybe } from "../i18n/index.ts";
import { Button } from "../ui/button.ts";
import { List, type ListRow, type RowCtx } from "../ui/list.ts";
import { nudge, turnPage } from "../ui/motion.ts";
import { Modal, Tooltip } from "../ui/overlay.ts";
import { Panel } from "../ui/panel.ts";
import { sound } from "../ui/sound.ts";
import { TabRow } from "../ui/tabs.ts";
import { ink, Label } from "../ui/text.ts";
import { FIELD_LABEL_H, TextField } from "../ui/textfield.ts";
import { sliceOf } from "../ui/theme.ts";
import { type Ctx, Widget } from "../ui/widget.ts";
import { Screen } from "./screen.ts";

export interface CreatorHooks {
  readonly api: Backend;
  /** Gives up on the creator: signs out, back to the title. */
  leave(): void;
  done(character: Character): void;
  /** Darkens the backdrop behind the creator. */
  dim(alpha: number): void;
  /** Tilts the backdrop so the character stands on the promenade. */
  look?(up: number): void;
}

const SCALE = 4;
const CX = 240;
/** The student's feet: high enough that two lines of name error fit above 등교. */
const FEET = 158;
const NAME_MAX = 8;
const NONE = "none";

/** A row that flips through a list of values with arrows either side. */
class Stepper implements ListRow {
  private readonly label: string;
  private readonly values: readonly string[];
  private readonly text: (v: string) => string;
  private readonly swatch: ((v: string) => readonly [number, number, number]) | undefined;
  private readonly onChange: (v: string, dir: 1 | -1) => void;
  value: string;
  private slideFrom = 0;

  constructor(opts: {
    label: string;
    values: readonly string[];
    value: string;
    text: (v: string) => string;
    swatch?: (v: string) => readonly [number, number, number];
    onChange: (v: string, dir: 1 | -1) => void;
  }) {
    this.label = opts.label;
    this.values = opts.values;
    this.value = opts.value;
    this.text = opts.text;
    this.swatch = opts.swatch;
    this.onChange = opts.onChange;
  }

  left(): void {
    this.step(-1);
  }

  right(): void {
    this.step(1);
  }

  activate(): void {
    this.step(1);
  }

  private step(dir: 1 | -1): void {
    const i = this.values.indexOf(this.value);
    const next = this.values[(i + dir + this.values.length) % this.values.length];
    if (next === undefined) return;
    this.value = next;
    this.slideFrom = dir * 6;
    sound("select");
    this.onChange(next, dir);
  }

  draw(into: Phaser.GameObjects.Container, w: number, h: number, ctx: RowCtx): void {
    const scene = ctx.scene;
    const m9 = ink("galmuri9");
    const label = new Label(scene, 6, Math.floor((h - m9.height) / 2), this.label, {
      font: "galmuri9",
      color: ctx.focused ? "ink.dark" : "stone.dark",
    });
    const valueW = 66;
    const right = w - 4 - 5;
    const valueX = right - 4 - valueW;
    const left = valueX - 4 - 5;
    const ay = Math.floor((h - 7) / 2);
    const lit = ctx.focused ? "-hover" : "";
    const la = scene.add.image(left, ay, "ui", `arrow/left${lit}`).setOrigin(0);
    const ra = scene.add.image(right, ay, "ui", `arrow/right${lit}`).setOrigin(0);

    const value = scene.add.container(valueX, 0);
    const m11 = ink("galmuri11");
    const text = new Label(scene, 0, Math.floor((h - m11.height) / 2), this.text(this.value), {
      font: "galmuri11",
      color: "ink.dark",
    });
    const sw = this.swatch?.(this.value);
    const inner = text.width + (sw ? 14 : 0);
    let x = Math.floor((valueW - inner) / 2);
    if (sw) {
      const sy = Math.floor((h - 10) / 2);
      value.add([
        scene.add.rectangle(x, sy, 10, 10, sw[2]).setOrigin(0),
        scene.add.rectangle(x + 1, sy + 1, 8, 4, sw[0]).setOrigin(0),
        scene.add.rectangle(x + 1, sy + 5, 8, 4, sw[1]).setOrigin(0),
      ]);
      x += 14;
    }
    text.at(x, Math.floor((h - m11.height) / 2));
    value.add(text.obj);
    into.add([label.obj, la, ra, value]);
    if (this.slideFrom !== 0) {
      value.x += this.slideFrom;
      scene.tweens.add({ targets: value, x: valueX, duration: 110, ease: "Quad.Out" });
      const arrow = this.slideFrom > 0 ? ra : la;
      scene.tweens.add({
        targets: arrow,
        x: arrow.x + Math.sign(this.slideFrom) * 2,
        duration: 60,
        yoyo: true,
      });
      this.slideFrom = 0;
    }
    ctx.zone(left - 6, 0, 17, h, () => this.left());
    ctx.zone(right - 6, 0, 17, h, () => this.right());
    ctx.zone(valueX, 0, valueW, h, () => this.right());
  }
}

/** A small paper key beside the student that turns them round. */
class TurnButton extends Widget {
  private readonly cap: Phaser.GameObjects.NineSlice;
  private readonly img: Phaser.GameObjects.Image;
  private readonly side: "left" | "right";
  private readonly onPress: () => void;

  constructor(ctx: Ctx, x: number, y: number, side: "left" | "right", onPress: () => void) {
    super(ctx, x, y, 15, 17, 5);
    this.side = side;
    this.onPress = onPress;
    const [l, r, t, b] = sliceOf("btn");
    this.cap = ctx.scene.add.nineslice(0, 0, "ui", "btn/idle", 15, 17, l, r, t, b).setOrigin(0);
    this.img = ctx.scene.add.image(5, 4, "ui", `arrow/${side}`).setOrigin(0);
    this.add([this.cap, this.img]);
  }

  protected override down(): void {
    this.cap.setFrame("btn/pressed");
    this.img.setY(6);
  }

  protected override up(): void {
    this.img.setY(4);
    this.refresh();
  }

  protected fire(): void {
    sound("select");
    this.onPress();
  }

  protected refresh(): void {
    if (!this.pressed) this.cap.setFrame(this.focused ? "btn/hover" : "btn/idle");
    this.img.setFrame(`arrow/${this.side}${this.focused ? "-hover" : ""}`);
  }
}

const TURN: readonly Facing[] = ["down", "right", "up", "left"];

/**
 * The character creator: the student large in the middle, turning slowly and reacting to every
 * choice; looks on the left page, the five majors on the right, the name and 등교 below.
 */
export class CreatorScreen extends Screen {
  private readonly meta: ArtMetadata;
  private readonly hooks: CreatorHooks;
  private look: DollLook;
  private major: Major = "math";
  private lookKey: string;
  private readonly doll: Doll;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly lookPanel: Panel;
  private readonly majorPanel: Panel;
  private readonly center: Phaser.GameObjects.Container;
  private readonly list: List;
  private readonly steppers: Stepper[];
  private readonly name: TextField;
  private readonly nameNote: Label;
  private readonly nameTick: Phaser.GameObjects.Image;
  private readonly plate: Phaser.GameObjects.Container;
  private readonly plateText: Label;
  private readonly plateBack: Phaser.GameObjects.NineSlice;
  private readonly submit: Button;
  private readonly tips: Tooltip;
  private readonly majorPage: Phaser.GameObjects.Container;
  private readonly majorName: Label;
  private readonly majorMechanic: Label;
  private readonly majorLine: Label;
  private readonly majorEmblem: Phaser.GameObjects.Image;
  private facing = 0;
  private idleFor = 0;
  private nameState: "empty" | "checking" | "ok" | "bad" | "unknown" = "empty";
  private nameTimer: Phaser.Time.TimerEvent | undefined;
  private nameAsked = "";
  private busy = false;
  private modal: Modal | undefined;

  constructor(scene: Phaser.Scene, meta: ArtMetadata, hooks: CreatorHooks) {
    super(scene);
    this.meta = meta;
    this.hooks = hooks;
    this.look = randomLook(meta);
    this.tips = new Tooltip(scene);

    // The student, on a stage container so hops and squashes do not move the doll's anchor.
    this.lookKey = composeDoll(scene, meta, this.look);
    this.shadow = scene.add.image(0, 0, this.lookKey, SHADOW_FRAME).setScale(SCALE).setAlpha(0.35);
    this.doll = new Doll(scene, meta, 0, 0, this.lookKey).setScale(SCALE);
    this.stage = scene.add.container(CX, FEET, [this.shadow, this.doll]);
    this.plateText = new Label(scene, 0, 0, "", { font: "galmuri9", color: "stone.bright" });
    const [pl, pr, pt, pb] = sliceOf("nameplate");
    this.plateBack = scene.add
      .nineslice(0, 0, "ui", "nameplate/idle", 20, 13, pl, pr, pt, pb)
      .setOrigin(0);
    this.plate = scene.add.container(CX, FEET + 4, [this.plateBack, this.plateText.obj]);
    this.placePlate("");

    // Poke the student, or drag them round.
    const poke = scene.add
      .zone(CX - 30, FEET - 92, 60, 96)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true, draggable: true });
    let dragged = 0;
    poke.on("dragstart", () => {
      dragged = 0;
    });
    poke.on("drag", (p: Phaser.Input.Pointer) => {
      const dx = p.x - p.downX;
      const steps = Math.trunc(dx / 18);
      if (steps !== dragged) {
        this.turn(steps > dragged ? -1 : 1);
        dragged = steps;
      }
    });
    poke.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.x - p.downX) < 4) this.react("poke");
    });

    // Looks.
    const o = lookOptions(meta);
    const swatch = (slot: string) => (v: string) => {
      const c = meta.slots[slot]?.options[v];
      const n = (k: string) => Number.parseInt((c?.[k] ?? "#000000").slice(1), 16);
      return [n("light"), n("mid"), n("deep")] as const;
    };
    const named = (prefix: string) => (v: string) => tMaybe(`${prefix}.${v}`) ?? v;
    const set = (key: keyof DollLook, react: Reaction) => (v: string) => {
      this.look = { ...this.look, [key]: v };
      this.recompose();
      this.react(react);
    };
    this.steppers = [
      new Stepper({
        label: t("look.body"),
        values: o.body,
        value: this.look.body,
        text: named("skin"),
        swatch: swatch("skin"),
        onChange: set("body", "hop"),
      }),
      new Stepper({
        label: t("look.hair"),
        values: o.hair,
        value: this.look.hair,
        text: named("hair"),
        onChange: set("hair", "fidget"),
      }),
      new Stepper({
        label: t("look.hairColor"),
        values: o.hairColor,
        value: this.look.hairColor,
        text: named("hairColor"),
        swatch: swatch("hair"),
        onChange: set("hairColor", "hop"),
      }),
      new Stepper({
        label: t("look.face"),
        values: o.face,
        value: this.look.face,
        text: named("face"),
        onChange: (v) => {
          this.look = { ...this.look, face: v };
          this.recompose();
          this.react(v === "sleepy" ? "yawn" : "hop");
        },
      }),
      new Stepper({
        label: t("look.uniform"),
        values: o.uniform,
        value: this.look.uniform,
        text: named("uniform"),
        onChange: set("uniform", "spin"),
      }),
      // One thing on the face at a time: the account API keeps one part per layer.
      new Stepper({
        label: t("look.accessory"),
        values: [NONE, ...o.accessories],
        value: this.wornAccessory(),
        text: named("accessory"),
        onChange: (v) => {
          const others = this.look.accessories.filter((a) => !o.accessories.includes(a));
          this.look = { ...this.look, accessories: v === NONE ? others : [v, ...others] };
          this.recompose();
          this.react("page");
        },
      }),
    ];

    this.lookPanel = new Panel(this.ctx, 6, 8, 150, 254, {
      title: t("creator.look"),
      onClose: () => this.askLeave(),
    });
    const lp = this.lookPanel.page;
    this.list = new List(this.ctx, lp.x + 4, lp.y + 6, {
      w: lp.w - 8,
      visible: this.steppers.length,
      rowH: 26,
      rows: this.steppers,
    });
    const random = new Button(this.ctx, lp.x + 8, lp.y + lp.h - 9 - 23, {
      label: t("creator.random"),
      icon: "book/probability",
      w: lp.w - 16,
      h: 23,
      onPress: () => this.randomize(),
    });
    this.lookPanel.add([this.list, random]);

    // Majors.
    this.majorPanel = new Panel(this.ctx, 324, 8, 150, 254, { title: t("creator.major") });
    const mp = this.majorPanel.page;
    const tabs = new TabRow(this.ctx, mp.x + 4, mp.y + 6, {
      tabs: MAJORS.map((m) => ({ id: m, icon: `emblem/${m}` })),
      selected: this.major,
      tabW: 25,
      h: 22,
      onChange: (id) => this.pickMajor(id as Major),
      // Emblem tabs carry no words, so each names its major on a sticky note.
      onHover: (id, at) => {
        if (id && at) this.tips.show(t(`major.${id}` as TextKey), at);
        else this.tips.hide();
      },
    });
    const wellY = mp.y + 6 + 20;
    const wellH = mp.h - 6 - 20 - 8;
    const [il, ir, it, ib] = sliceOf("inset");
    const well = scene.add
      .nineslice(mp.x + 4, wellY, "ui", "inset/idle", mp.w - 8, wellH, il, ir, it, ib)
      .setOrigin(0);
    this.majorPage = scene.add.container(mp.x + 4, wellY);
    const cardW = mp.w - 8;
    this.majorEmblem = scene.add.image(
      Math.floor((cardW - 48) / 2),
      12,
      "ui",
      `emblem/${this.major}`,
    );
    this.majorEmblem.setOrigin(0).setScale(3);
    this.majorName = new Label(scene, 4, 70, "", {
      font: "galmuri11-bold",
      color: "ink.dark",
      width: cardW - 8,
      align: "center",
    });
    this.majorMechanic = new Label(scene, 4, 86, "", {
      font: "galmuri9",
      color: "navy.mid",
      width: cardW - 8,
      align: "center",
    });
    const [rl, rr, rt, rb] = sliceOf("row");
    const rule = scene.add
      .nineslice(8, 86, "ui", "row/idle", cardW - 16, 16, rl, rr, rt, rb)
      .setOrigin(0);
    this.majorLine = new Label(scene, 8, 112, "", {
      font: "galmuri11",
      color: "ink.dark",
      width: cardW - 16,
      align: "center",
      leading: 5,
    });
    this.majorPage.add([
      this.majorEmblem,
      this.majorName.obj,
      this.majorMechanic.obj,
      rule,
      this.majorLine.obj,
    ]);
    this.majorPanel.add([well, this.majorPage, tabs]);
    this.printMajor();
    // Name and 등교, under the student.
    const fx = CX - 66;
    this.center = scene.add.container(0, 0);
    const turnL = new TurnButton(this.ctx, CX - 58, FEET - 14, "left", () => this.turn(1));
    const turnR = new TurnButton(this.ctx, CX + 43, FEET - 14, "right", () => this.turn(-1));
    this.name = new TextField(this.ctx, fx, FEET + 21, {
      label: t("creator.name"),
      w: 132,
      maxLength: NAME_MAX,
      enterKeyHint: "go",
      onChange: (v) => this.nameChanged(v),
      onSubmit: () => void this.confirm(),
    });
    this.nameTick = scene.add
      .image(fx + 132 - 16, FEET + 21 + FIELD_LABEL_H + 4, "ui", "check/on")
      .setOrigin(0)
      .setVisible(false);
    this.nameNote = new Label(scene, fx, FEET + 21 + FIELD_LABEL_H + 20 + 3, "", {
      font: "galmuri9",
      color: "red.mid",
      width: 132,
    });
    this.submit = new Button(this.ctx, fx, 0, {
      label: t("creator.submit"),
      kind: "ink",
      w: 132,
      h: 23,
      sound: "confirm",
      onPress: () => void this.confirm(),
    });
    this.submit.setY(270 - 6 - 23);
    this.center.add([turnL, turnR, this.name, this.nameTick, this.nameNote.obj, this.submit]);
    this.refreshSubmit();

    this.scope.onBack = () => this.askLeave();
    for (const o of [this.stage, this.plate, this.lookPanel, this.majorPanel, this.center])
      o.setVisible(false);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
      releaseDoll(scene, this.lookKey);
    });
  }

  protected enter(): void {
    this.hooks.dim(0.45);
    this.hooks.look?.(-52);
    this.lookPanel.open();
    this.majorPanel.open();
    this.center.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.center, alpha: 1, duration: 160, delay: 60 });
    // The student drops in from above and lands with a squash.
    this.stage.setVisible(true).setAlpha(1);
    this.plate.setVisible(true);
    this.doll.y = -120;
    this.shadow.setScale(SCALE * 0.4).setAlpha(0);
    this.scene.tweens.add({
      targets: this.shadow,
      scaleX: SCALE,
      scaleY: SCALE,
      alpha: 0.35,
      duration: 260,
      ease: "Quad.In",
    });
    this.scene.tweens.add({
      targets: this.doll,
      y: 0,
      duration: 260,
      ease: "Quad.In",
      onComplete: () => this.squash(),
    });
  }

  protected leave(done?: () => void): void {
    this.hooks.dim(0);
    this.tips.hide();
    this.lookPanel.hide();
    this.majorPanel.hide(done);
    this.scene.tweens.add({
      targets: [this.center, this.stage, this.plate],
      alpha: 0,
      duration: 120,
    });
  }

  protected override firstFocus() {
    return this.list;
  }

  /** The look as the API stores it. */
  private apiLook(): Look {
    const { body, hair, hairColor, face, uniform, accessories } = this.look;
    return { body, hair, hairColor, face, uniform, accessories: [...accessories] };
  }

  private recompose(): void {
    const old = this.lookKey;
    this.lookKey = composeDoll(this.scene, this.meta, this.look);
    this.doll.wear(this.lookKey);
    this.shadow.setTexture(this.lookKey, SHADOW_FRAME);
    releaseDoll(this.scene, old);
  }

  private randomize(): void {
    this.look = randomLook(this.meta);
    const { body, hair, hairColor, face, uniform } = this.look;
    [body, hair, hairColor, face, uniform, this.wornAccessory()].forEach((v, i) => {
      const row = this.steppers[i];
      if (row) row.value = v;
    });
    this.list.setRows(this.steppers);
    this.recompose();
    this.react("spin");
  }

  /** The accessory-layer part being worn, or none. */
  private wornAccessory(): string {
    const o = lookOptions(this.meta);
    return this.look.accessories.find((a) => o.accessories.includes(a)) ?? NONE;
  }

  private pickMajor(m: Major): void {
    this.major = m;
    turnPage(this.majorPage, () => this.printMajor());
    this.idleFor = 0;
    this.facing = 1;
    this.doll.face("right").act("attack", () => this.doll.act("attack"));
  }

  private printMajor(): void {
    const m = this.major;
    this.majorEmblem.setFrame(`emblem/${m}`);
    this.majorName.set(t(`major.${m}` as TextKey));
    this.majorMechanic.set(t(`major.${m}.mechanic` as TextKey));
    this.majorLine.set(t(`major.${m}.line` as TextKey));
  }

  private turn(by: number): void {
    this.facing = (this.facing + by + TURN.length) % TURN.length;
    this.doll.face(TURN[this.facing] as Facing);
    this.idleFor = -2500;
  }

  private tick(_time: number, delta: number): void {
    if (!this.stage.visible) return;
    this.idleFor += delta;
    // Turns on the spot now and then, to show the back and the side.
    if (this.idleFor > 2600) {
      this.idleFor = 0;
      if (this.doll.playing === "idle") this.turn(1);
      this.idleFor = 0;
    }
  }

  private squash(): void {
    this.scene.tweens.killTweensOf(this.stage);
    this.stage.setScale(1.12, 0.86);
    this.scene.tweens.add({
      targets: this.stage,
      scaleX: 1,
      scaleY: 1,
      duration: 160,
      ease: "Back.Out",
    });
  }

  private hop(height: number, done?: () => void): void {
    this.scene.tweens.killTweensOf(this.doll);
    this.scene.tweens.chain({
      targets: this.doll,
      tweens: [
        { y: -height, duration: 110, ease: "Quad.Out" },
        { y: 0, duration: 110, ease: "Quad.In" },
      ],
      onComplete: () => {
        this.squash();
        done?.();
      },
    });
  }

  private react(kind: Reaction): void {
    this.idleFor = -2000;
    switch (kind) {
      case "hop":
        this.hop(8);
        break;
      case "fidget":
        // A new haircut: a hop and a shake of the head, left and right.
        this.hop(10);
        this.scene.time.delayedCall(240, () => this.doll.face("left"));
        this.scene.time.delayedCall(360, () => this.doll.face("right"));
        this.scene.time.delayedCall(480, () => this.doll.face(TURN[this.facing] as Facing));
        break;
      case "yawn":
        this.doll.face("down").act("yawn");
        this.facing = 0;
        break;
      case "page":
        this.doll.face("down").act("page");
        this.facing = 0;
        break;
      case "poke":
        sound("select");
        this.doll.act("hit");
        nudge(this.stage, { x: CX, y: FEET }, 0, 2);
        break;
      case "spin":
        TURN.forEach((_, i) => {
          this.scene.time.delayedCall(i * 70, () =>
            this.doll.face(TURN[(this.facing + i + 1) % 4] as Facing),
          );
        });
        this.scene.time.delayedCall(4 * 70, () => {
          this.facing = 0;
          this.doll.face("down");
          this.hop(6);
        });
        break;
    }
  }

  private placePlate(name: string): void {
    this.plateText.set(name);
    const w = Math.max(14, this.plateText.width + 7);
    this.plateBack.setSize(w, 13);
    this.plateBack.setX(-Math.ceil(w / 2));
    this.plateText.at(-Math.ceil(w / 2) + 3 + 1, 2);
    this.plate.setAlpha(name ? 1 : 0);
  }

  private nameChanged(value: string): void {
    const name = value.trim();
    this.placePlate(name);
    this.nameTimer?.remove();
    this.nameNote.set("");
    this.nameTick.setVisible(false);
    if (!name) {
      this.nameState = "empty";
      this.refreshSubmit();
      return;
    }
    // The shared rule answers at once; only a well-formed name is worth asking the server about.
    const bad = checkName(name);
    if (bad) {
      // One syllable in is a name being written, not a wrong one.
      const writing = [...name].length < 2 && /^[가-힣A-Za-z0-9]*$/.test(name);
      this.nameState = writing ? "empty" : "bad";
      if (!writing) this.nameNote.set(t(`error.${bad}` as TextKey));
      this.refreshSubmit();
      return;
    }
    this.nameState = "checking";
    this.refreshSubmit();
    this.nameTimer = this.scene.time.delayedCall(350, () => void this.checkName(name));
  }

  private async checkName(name: string): Promise<void> {
    this.nameAsked = name;
    try {
      const res = await this.hooks.api.nameAvailable(name);
      if (this.nameAsked !== name || this.name.value.trim() !== name) return;
      if (res.available) {
        this.nameState = "ok";
        this.nameTick.setVisible(true).setScale(1.6).setAlpha(0);
        this.scene.tweens.add({
          targets: this.nameTick,
          scale: 1,
          alpha: 1,
          duration: 120,
          ease: "Quad.In",
        });
      } else {
        this.nameState = "bad";
        this.nameNote.set(t(`error.${res.reason ?? "name_taken"}` as TextKey));
      }
    } catch {
      if (this.nameAsked === name) this.nameState = "unknown";
    }
    this.refreshSubmit();
  }

  private refreshSubmit(): void {
    const ready = this.nameState === "ok" || this.nameState === "unknown";
    this.submit.setEnabled(ready && !this.busy);
  }

  private async confirm(): Promise<void> {
    const name = this.name.value.trim();
    if (!name) {
      sound("error");
      this.nameNote.set(t("error.name_required"));
      this.name.reject();
      this.scope.focus(this.name);
      return;
    }
    if (this.busy || this.nameState === "bad" || this.nameState === "checking") {
      if (this.nameState === "bad") this.name.reject();
      return;
    }
    this.busy = true;
    this.refreshSubmit();
    try {
      const character = await this.hooks.api.createCharacter(name, this.major, this.apiLook());
      // Accepted: a happy double hop with the book raised, then off to school.
      this.doll.face("down");
      this.hop(12, () => this.hop(8, () => this.doll.act("attack")));
      this.scene.time.delayedCall(900, () => this.hooks.done(character));
    } catch (e) {
      this.busy = false;
      sound("error");
      this.nameNote.set(errorText(e));
      const code = errorCode(e);
      if (code === "name_taken" || code === "name_invalid") {
        this.nameState = "bad";
        this.name.reject();
      }
      this.refreshSubmit();
    }
  }

  private askLeave(): void {
    if (this.modal) return;
    const modal = new Modal(this.scene, {
      title: t("creator.leave.title"),
      body: t("creator.leave.body"),
      actions: [
        { label: t("creator.leave.yes"), onPress: () => modal.close(() => this.hooks.leave()) },
        { label: t("creator.leave.no"), kind: "ink", onPress: () => modal.close() },
      ],
      onClosed: () => {
        this.modal = undefined;
      },
    });
    this.modal = modal;
  }
}

type Reaction = "hop" | "fidget" | "yawn" | "page" | "poke" | "spin";
