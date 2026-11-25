/**
 * Full-screen pieces of a scene, drawn in the UI scene above the world: a written page (the
 * 자습실 log book, the notebook, a notice) and the title card. Both come in with motion and
 * sound and go when the player turns the page.
 */
import type { narrative } from "@guago/content";
import type * as Phaser from "phaser";
import { layDown, pickUp } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { sliceOf } from "../ui/theme.ts";

type Doc = narrative.Doc;
type Hand = NonNullable<narrative.DocRow["hand"]>;

const W = 480;
const H = 270;
/** Each hand its ink: print and the student's pen, 서하's neat blue, the stranger's red. */
const INK: Readonly<
  Record<Hand, { color: string; font: "galmuri11" | "galmuri11-bold" | "galmuri9" }>
> = {
  print: { color: "ink.dark", font: "galmuri11" },
  student: { color: "navy.dark", font: "galmuri11" },
  seoha: { color: "sea.dark", font: "galmuri9" },
  stranger: { color: "red.dark", font: "galmuri11-bold" },
};

/** Waits for the page to be turned: a key, a click or a tap, after a moment to read. */
function turned(ui: Phaser.Scene, after: number): Promise<void> {
  return new Promise((resolve) => {
    let ready = false;
    ui.time.delayedCall(after, () => {
      ready = true;
    });
    const keys = ["E", "SPACE", "ENTER"].map((k) => ui.input.keyboard?.addKey(k));
    const done = () => {
      if (!ready) return;
      for (const k of keys) k?.off("down", done);
      ui.input.off("pointerup", done);
      resolve();
    };
    for (const k of keys) k?.on("down", done);
    ui.input.on("pointerup", done);
  });
}

/** Shows a written page; resolves once it is put away. */
export async function showDoc(
  ui: Phaser.Scene,
  doc: Doc,
  text: (key: string) => string,
): Promise<void> {
  const rows = doc.rows.map((r) => ({ text: text(r.text), ink: INK[r.hand ?? "print"] }));
  const title = doc.title ? text(doc.title) : undefined;
  const pw = 300;
  const ph = 30 + (title ? 20 : 0) + rows.length * 17 + 12;
  const x = Math.round((W - pw) / 2);
  const y = Math.round((H - ph) / 2) - 6;
  const root = ui.add.container(x, y).setDepth(820);
  const [l, r, t, b] = sliceOf("dialog");
  root.add(ui.add.nineslice(0, 0, "ui", "dialog/idle", pw, ph, l, r, t, b).setOrigin(0));
  const [ml, mr, mt, mb] = sliceOf("margin");
  root.add(ui.add.nineslice(34, 6, "ui", "margin/idle", 1, ph - 12, ml, mr, mt, mb).setOrigin(0));
  let cy = 14;
  if (title) {
    const head = new Label(ui, 42, cy, title, { font: "galmuri11-bold", color: "ink.dark" });
    root.add(head.obj);
    cy += 20;
  }
  const [rl, rr, rt, rb] = sliceOf("row");
  for (const row of rows) {
    root.add(
      ui.add.nineslice(35, cy - 4, "ui", "row/idle", pw - 44, 16, rl, rr, rt, rb).setOrigin(0),
    );
    const label = new Label(ui, 42, cy, row.text, { font: row.ink.font, color: row.ink.color });
    root.add(label.obj);
    cy += 17;
  }
  sound("page");
  layDown(root, { x, y });
  await turned(ui, 900);
  sound("page");
  await new Promise<void>((resolve) => pickUp(root, { x, y }, () => resolve()));
  root.destroy();
}

/**
 * The title card: the game's logo for its first line (the logo is that name, drawn), the rest set
 * under it, held long enough to read and gone with the music still playing.
 */
export async function showTitle(
  ui: Phaser.Scene,
  lines: readonly string[],
  hold = 5200,
): Promise<void> {
  const root = ui.add.container(0, 0).setDepth(900).setAlpha(0);
  const logo = ui.textures.get("ui").has("logo/idle")
    ? ui.add.image(W / 2, H / 2 - 22, "ui", "logo/idle").setOrigin(0.5)
    : undefined;
  if (logo) root.add(logo);
  const rest = logo ? lines.slice(1) : lines;
  rest.forEach((line, i) => {
    const label = new Label(ui, 0, H / 2 + 18 + i * 16, line, {
      font: "galmuri11",
      color: "gold.pale",
      width: W,
      align: "center",
    });
    root.add(label.obj);
  });
  sound("stamp");
  await new Promise<void>((r) =>
    ui.tweens.add({
      targets: root,
      alpha: 1,
      duration: 900,
      ease: "Sine.Out",
      onComplete: () => r(),
    }),
  );
  if (logo) {
    ui.tweens.add({
      targets: logo,
      y: logo.y - 2,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }
  await new Promise<void>((r) => ui.time.delayedCall(hold, () => r()));
  await new Promise<void>((r) =>
    ui.tweens.add({
      targets: root,
      alpha: 0,
      duration: 1100,
      ease: "Sine.In",
      onComplete: () => r(),
    }),
  );
  root.destroy();
}

/** The tutorial prompt kinds as icons from the UI atlas; none of them is a sentence. */
const PROMPT_ICON: Readonly<Record<narrative.Prompt, readonly [string, string]>> = {
  move: ["caret", "caret/down"],
  interact: ["prompt", "prompt/use"],
  dodge: ["touch-icon", "touch-icon/dodge"],
  mode: ["mode-icon", "mode-icon/cycle"],
  book: ["book-slot", "book-slot/idle"],
};

/**
 * A prompt at a point in the world: the icon of what to do, bobbing over the spot. Comes in with a
 * pop, goes with a fade. `move` is the page-turn caret pointing down at where to walk.
 */
export class WorldPrompt {
  private readonly img: Phaser.GameObjects.Image | undefined;
  private readonly bob: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene, kind: narrative.Prompt, x: number, y: number, depth: number) {
    const [, frame] = PROMPT_ICON[kind];
    if (!scene.textures.get("ui").has(frame)) return;
    const img = scene.add.image(Math.round(x), Math.round(y), "ui", frame).setOrigin(0.5, 1);
    img.setDepth(depth).setScale(0.4).setAlpha(0);
    this.img = img;
    scene.tweens.add({ targets: img, scale: 1, alpha: 1, duration: 160, ease: "Back.Out" });
    this.bob = scene.tweens.add({
      targets: img,
      y: img.y - 3,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
      delay: 160,
    });
  }

  moveTo(x: number, y: number): void {
    if (!this.img) return;
    this.bob?.updateTo("y", Math.round(y) - 3, true);
    this.img.x = Math.round(x);
  }

  destroy(): void {
    const img = this.img;
    if (!img) return;
    this.bob?.stop();
    img.scene.tweens.add({
      targets: img,
      alpha: 0,
      y: img.y - 4,
      duration: 120,
      onComplete: () => img.destroy(),
    });
  }
}
