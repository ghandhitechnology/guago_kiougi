import type * as Phaser from "phaser";
import { touchScreen } from "../controls/joystick.ts";
import { t } from "../i18n/index.ts";
import { PLAYER_BUSES, setVolume, volume } from "../sound/audio.ts";
import { Button } from "../ui/button.ts";
import { Modal } from "../ui/overlay.ts";
import { Slider } from "../ui/slider.ts";
import { Label } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import { session } from "../world/session.ts";
import { registerMenuTab } from "./notebook.ts";

/** The renderer's quality tiers, when the renderer offers a way to set them. */
export interface GraphicsControl {
  readonly tiers: readonly ("low" | "medium" | "high")[];
  get(): "low" | "medium" | "high";
  set(tier: "low" | "medium" | "high"): void;
}

let graphics: GraphicsControl | undefined;

/** The renderer calls this once it can switch quality; until then 설정 has no graphics row. */
export function provideGraphics(control: GraphicsControl | undefined): void {
  graphics = control;
}

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

/** 설정: graphics when the renderer offers it, the three volumes, the real controls, the account. */
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

      if (graphics) {
        const g = graphics;
        section(ctx, page, x, y, w, t("settings.graphics"));
        y += 15;
        let bx = x;
        for (const tier of g.tiers) {
          const b: Button = new Button(ctx, bx, y, {
            label: t(`settings.graphics.${tier}`),
            kind: g.get() === tier ? "ink" : "paper",
            font: "galmuri9",
            h: 17,
            onPress: () => {
              g.set(tier);
            },
          });
          page.add(b);
          bx += b.bounds().w + 4;
        }
        y += 24;
      }

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
        y += 18;
      }
      y += 6;

      section(ctx, page, x, y, w, t("settings.controls"));
      y += 15;
      const touch = touchScreen();
      const rows: [string, string[]][] = touch
        ? [[t("settings.move"), [t("settings.stick")]]]
        : [
            [t("settings.move"), ["W", "A", "S", "D", "←", "↑", "↓", "→"]],
            [t("settings.chat"), ["Enter"]],
            [t("settings.menu"), ["Esc"]],
          ];
      for (const [name, keys] of rows) {
        const label = new Label(ctx.scene, x, y + 3, name, {
          font: "galmuri11",
          color: "ink.dark",
        });
        page.add(label.obj);
        let kx = x + 64;
        for (const k of keys) {
          const cap = keycap(ctx, kx, y, k);
          page.add(cap.obj);
          kx += cap.w + 2;
        }
        y += 18;
      }
      y += 6;

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
      out.setX(x + w - out.bounds().w);
      page.add(out);
    },
  });
}
