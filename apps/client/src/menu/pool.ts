import type { PoolView } from "@guago/shared";
import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { amount } from "../items/catalog.ts";
import { cue } from "../sound/audio.ts";
import { inventory } from "../state/inventory.ts";
import { Button } from "../ui/button.ts";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { fade, shake, slide } from "../ui/motion.ts";
import { Panel } from "../ui/panel.ts";
import { edges, screen } from "../ui/screen.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import { opRefusal, rightLabel, SaidLine } from "./common.ts";

/**
 * The 자습 pool (PLAN §9) waiting on arrival after time away: where it filled, how long against
 * its cap, what it holds, and one button that takes it. It opens by itself once per arrival
 * with something in it, and again from the HUD's pool plate. Taking it sends the amounts up to
 * the HUD and folds the page away.
 */

const W = 216;
const H = 118;

/** `6시간 12분`, `45분`. */
function span(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h === 0) return t("pool.minutes", { m });
  if (m % 60 === 0) return t("pool.hours", { h });
  return t("pool.hoursMinutes", { h, m: m % 60 });
}

function holds(p: PoolView): boolean {
  return p.fill.exp + p.fill.pinecone + p.fill.sheets + p.fill.ink > 0;
}

export class PoolCard {
  private readonly scene: Phaser.Scene;
  private readonly onShown: () => void;
  private readonly onHidden: () => void;
  private panel: Panel | undefined;
  private scope: FocusScope | undefined;
  private dim: Phaser.GameObjects.Rectangle | undefined;
  private pending = false;
  private offered = false;
  private readonly unwatch: () => void;

  constructor(scene: Phaser.Scene, onShown: () => void, onHidden: () => void) {
    this.scene = scene;
    this.onShown = onShown;
    this.onHidden = onHidden;
    // Once per arrival: the first snapshot that holds a pool offers it, after the place banner.
    this.unwatch = inventory.watch((inv) => {
      const p = inv.snap?.progression.pool;
      if (this.offered || !p) return;
      this.offered = true;
      if (holds(p)) scene.time.delayedCall(1600, () => this.open());
    });
  }

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  open(): void {
    const pool = inventory.snap?.progression.pool;
    if (this.panel || !pool || !holds(pool)) return;
    const s = this.scene;
    const scope = new FocusScope();
    const ctx = { scene: s, scope };
    const dim = s.add
      .rectangle(0, 0, screen.w, screen.h, paint("ink.deep"))
      .setOrigin(0)
      .setAlpha(0)
      .setDepth(899)
      .setInteractive();
    dim.on("pointerup", () => this.close());
    fade(dim, 0.35, 160);
    const panel = new Panel(
      ctx,
      Math.round((screen.w - W) / 2),
      Math.round((screen.h - H) / 2),
      W,
      H,
      {
        title: t("pool.title"),
        onClose: () => this.close(),
      },
    ).setDepth(900);
    const { page } = panel;
    const x0 = page.x + 8;
    const w = page.w - 16;
    let y = page.y + 7;
    // Where it filled and for how long, against the cap.
    panel.add(s.add.image(x0, y - 1, "ui", "icon/pool").setOrigin(0));
    panel.add(
      new Label(s, x0 + 14, y, t(`pool.place.${pool.place}`), {
        font: "galmuri9",
        color: "ink.dark",
      }).obj,
    );
    panel.add(
      rightLabel(s, x0 + w, y, `${span(pool.fill.seconds)} / ${span(pool.cap)}`, {
        font: "galmuri9",
        color: "stone.dark",
      }).obj,
    );
    y += 13;
    const [bl, br, bt, bb] = sliceOf("bar-thin");
    const [fl, fr, ft, fb] = sliceOf("fill-thin");
    panel.add(s.add.nineslice(x0, y, "ui", "bar-thin/idle", w, 5, bl, br, bt, bb).setOrigin(0));
    const fillW = Math.max(3, Math.round(((w - 2) * pool.fill.seconds) / Math.max(1, pool.cap)));
    const fill = s.add
      .nineslice(x0 + 1, y + 1, "ui", "fill-thin/pool", 3, 3, fl, fr, ft, fb)
      .setOrigin(0);
    panel.add(fill);
    s.tweens.addCounter({
      from: 3,
      to: fillW,
      duration: 500,
      delay: 180,
      ease: "Cubic.Out",
      onUpdate: (tw) => fill.setSize(Math.round(tw.getValue() ?? 3), 3),
    });
    y += 14;
    // What it holds: EXP, 솔방울, 낱장 and 잉크, each with its mark.
    const goods: { icon?: string; word?: string; n: number }[] = [
      { word: "EXP", n: pool.fill.exp },
      { icon: "icon/pinecone", n: pool.fill.pinecone },
      { icon: "icon/page", n: pool.fill.sheets },
      { icon: "icon/ink", n: pool.fill.ink },
    ].filter((g) => g.n > 0);
    const cellW = Math.floor(w / 2);
    const flyers: Phaser.GameObjects.Container[] = [];
    goods.forEach((g, i) => {
      const c = s.add.container(x0 + (i % 2) * cellW, y + Math.floor(i / 2) * 15);
      let gx = 0;
      if (g.icon) {
        c.add(s.add.image(0, 0, "ui", g.icon).setOrigin(0));
        gx = 14;
      } else {
        const word = new Label(s, 0, 2, g.word ?? "", { font: "galmuri9", color: "sea.dark" });
        c.add(word.obj);
        gx = word.width + 3;
      }
      const n = new Label(s, gx, 2, "0", { font: "galmuri11-bold", color: "ink.dark" });
      c.add(n.obj);
      // The amounts count up as the page settles.
      s.tweens.addCounter({
        from: 0,
        to: g.n,
        duration: 600,
        delay: 260 + i * 90,
        ease: "Quad.Out",
        onUpdate: (tw) => n.set(amount(Math.round(tw.getValue() ?? 0))),
      });
      panel.add(c);
      flyers.push(c);
    });
    const said = new SaidLine(s, panel, x0, page.y + page.h - 8 - 15, w - 64);
    const take = new Button(ctx, 0, page.y + page.h - 8 - 21, {
      kind: "ink",
      label: t("pool.claim"),
      sound: "confirm",
      onPress: () => void this.claim(take, said, flyers),
    });
    take.setX(page.x + page.w - 8 - take.bounds().w);
    panel.add(take);
    scope.onBack = () => this.close();
    pushScope(scope);
    panel.open();
    scope.focus(take, "key");
    this.panel = panel;
    this.scope = scope;
    this.dim = dim;
    this.onShown();
  }

  private async claim(
    take: Button,
    said: SaidLine,
    flyers: Phaser.GameObjects.Container[],
  ): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    take.setEnabled(false);
    const r = await inventory.op("claimPool", {});
    this.pending = false;
    if (!this.panel) return;
    if (!r.ok) {
      take.setEnabled(true);
      sound("error");
      shake(this.panel, this.panel.rest);
      said.say(opRefusal(r));
      return;
    }
    // The page folds away and everything it held rises to the player's plate on the HUD.
    const s = this.scene;
    const e = edges();
    const panel = this.panel;
    const at = flyers.map((f) => ({ x: panel.x + f.x, y: panel.y + f.y }));
    for (const f of flyers) panel.remove(f);
    this.close();
    flyers.forEach((f, i) => {
      const from = at[i] ?? { x: 0, y: 0 };
      f.setPosition(from.x, from.y).setDepth(950);
      s.add.existing(f);
      s.time.delayedCall(80 + i * 70, () => {
        slide(f, { x: e.left + 24 + i * 4, y: e.top + 6 }, 380);
        fade(f, 0, 420, () => f.destroy());
      });
    });
    cue("sfx.pickup.cone");
    s.time.delayedCall(160, () => cue("sfx.pickup.page", { volume: 0.7 }));
  }

  close(): void {
    const panel = this.panel;
    if (!panel) return;
    this.panel = undefined;
    if (this.scope) popScope(this.scope);
    this.scope = undefined;
    const dim = this.dim;
    this.dim = undefined;
    if (dim) fade(dim, 0, 120, () => dim.destroy());
    panel.hide(() => panel.destroy());
    this.onHidden();
  }

  destroy(): void {
    this.unwatch();
    this.close();
  }
}
