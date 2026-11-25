import * as Phaser from "phaser";
import { touchScreen } from "../controls/joystick.ts";
import { t } from "../i18n/index.ts";
import { onQualityTier, qualityTier, setQualityTier, TIERS, type Tier } from "../render/tiers.ts";
import { PLAYER_BUSES, setVolume, volume } from "../sound/audio.ts";
import { Button } from "../ui/button.ts";
import { RedPen } from "../ui/marks.ts";
import { Modal } from "../ui/overlay.ts";
import { Slider } from "../ui/slider.ts";
import { Label } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import { session } from "../world/session.ts";
import { registerMenuTab } from "./notebook.ts";

/** Signs out: provided by the UI layer, which knows how to go back to the title. */
let signOut: (() => void) | undefined;

export function onSignOut(fn: () => void): void {
  signOut = fn;
}

const SECTION = "galmuri9";

/** A key as a small paper keycap. */
function keycap(
  ctx: Ctx,
  x: number,
  y: number,
  text: string,
): { obj: Phaser.GameObjects.GameObject[]; w: number } {
  const label = new Label(ctx.scene, 0, 0, text, { font: "galmuri9", color: "ink.dark" });
  const w = Math.max(13, label.width + 8);
  const [l, r, tt, b] = sliceOf("btn");
  const cap = ctx.scene.add.nineslice(x, y, "ui", "btn/idle", w, 15, l, r, tt, b).setOrigin(0);
  label.at(x + Math.floor((w - label.width) / 2), y + 3);
  return { obj: [cap, label.obj], w };
}

function section(
  ctx: Ctx,
  page: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  title: string,
): void {
  const label = new Label(ctx.scene, x, y, title, { font: SECTION, color: "stone.dark" });
  const rule = ctx.scene.add
    .rectangle(x + label.width + 4, y + 5, w - label.width - 4, 1, paint("stone.light"))
    .setOrigin(0);
  page.add([label.obj, rule]);
}

/** 설정: the renderer's quality tier, the three volumes, the real controls, the account. */
export function registerSettings(): void {
  registerMenuTab({
    id: "settings",
    label: t("menu.settings"),
    icon: "menu/settings",
    order: 100,
    build(ctx, page, size) {
      const x = 12;
      const w = size.w - 24;
      let y = 8;

      // Quality tiers from the renderer: the one in use is ringed in red pen.
      section(ctx, page, x, y, w, t("settings.graphics"));
      y += 15;
      const pen = new RedPen(ctx.scene);
      const choices: { tier: Tier; button: Button }[] = [];
      let bx = x;
      for (const tier of TIERS) {
        const button: Button = new Button(ctx, bx, y, {
          label: t(`settings.graphics.${tier}`),
          font: "galmuri9",
          h: 17,
          onPress: () => setQualityTier(tier),
        });
        page.add(button);
        choices.push({ tier, button });
        bx += button.size().w + 6;
      }
      page.add(pen.gfx);
      const ring = (tier: Tier | null, draw: boolean) => {
        const c = choices.find((ch) => ch.tier === tier);
        if (!c) {
          pen.hide(0);
          return;
        }
        pen.box(c.button.x - 2, c.button.y - 2, c.button.size().w + 4, 17 + 3);
        if (draw) {
          pen.hide(0);
          pen.show(140);
        } else pen.show(0);
      };
      ring(qualityTier(), false);
      const stop = onQualityTier((tier) => ring(tier, true));
      page.once(Phaser.GameObjects.Events.DESTROY, stop);
      y += 24;

      section(ctx, page, x, y, w, t("settings.sound"));
      y += 14;
      for (const bus of PLAYER_BUSES) {
        const s = new Slider(ctx, x, y, {
          label: t(`settings.${bus}`),
          labelW: 64,
          w: w - 70,
          value: volume(bus),
          onChange: (v) => setVolume(bus, v),
        });
        page.add(s);
        y += 17;
      }
      y += 4;

      section(ctx, page, x, y, w, t("settings.controls"));
      y += 15;
      const touch = touchScreen();
      // Each line holds one or two bindings, the second starting halfway across.
      const lines: [string, string[]][][] = touch
        ? [[[t("settings.move"), [t("settings.stick")]]]]
        : [
            [[t("settings.move"), ["W", "A", "S", "D", "←", "↑", "↓", "→"]]],
            [
              [t("settings.chat"), ["Enter"]],
              [t("settings.menu"), ["Esc"]],
            ],
          ];
      for (const line of lines) {
        line.forEach(([name, keys], i) => {
          const lx = x + i * Math.floor(w / 2);
          const label = new Label(ctx.scene, lx, y + 3, name, {
            font: "galmuri11",
            color: "ink.dark",
          });
          page.add(label.obj);
          let kx = i === 0 ? lx + 64 : lx + label.width + 8;
          for (const k of keys) {
            const cap = keycap(ctx, kx, y, k);
            page.add(cap.obj);
            kx += cap.w + 2;
          }
        });
        y += 18;
      }
      y += 4;

      section(ctx, page, x, y, w, t("settings.account"));
      y += 14;
      const id = session.entry?.account.loginId ?? "";
      const idLabel = new Label(ctx.scene, x, y + 5, id, { font: "galmuri11", color: "ink.dark" });
      page.add(idLabel.obj);
      const out = new Button(ctx, 0, y, {
        label: t("settings.logout"),
        font: "galmuri9",
        h: 19,
        onPress: () => {
          const modal: Modal = new Modal(ctx.scene, {
            title: t("logout.title"),
            body: t("logout.body"),
            actions: [
              { label: t("logout.yes"), onPress: () => modal.close(() => signOut?.()) },
              { label: t("logout.no"), kind: "ink", onPress: () => modal.close() },
            ],
          });
        },
      });
      out.setX(x + w - out.size().w);
      page.add(out);
    },
  });
}
