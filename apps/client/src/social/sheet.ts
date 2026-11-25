import type * as Phaser from "phaser";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { fade, stamp } from "../ui/motion.ts";
import { holdToasts } from "../ui/overlay.ts";
import { Panel } from "../ui/panel.ts";
import { sound } from "../ui/sound.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";

export interface Sheet {
  readonly ctx: Ctx;
  readonly panel: Panel;
  /** The page inside the cover, in the panel's coordinates. */
  readonly page: { x: number; y: number; w: number; h: number };
  close(done?: () => void): void;
  /** The red seal lands on the sheet, then it closes: something was filed. */
  seal(at?: { x: number; y: number }): void;
}

/**
 * A notebook page over a dimmed screen that holds the keyboard while open: the frame every
 * social form is built in (신고, 동아리 만들기, 대자보 쓰기, a listing). `build` lays the content
 * on the page; Escape and the cross close it.
 */
export function openSheet(
  scene: Phaser.Scene,
  opts: {
    title: string;
    w: number;
    h: number;
    depth?: number;
    build(sheet: Sheet): void;
    onClosed?: () => void;
  },
): Sheet {
  const scope = new FocusScope();
  const ctx: Ctx = { scene, scope };
  const depth = opts.depth ?? 900;
  const sw = scene.scale.width;
  const sh = scene.scale.height;
  const dim = scene.add
    .rectangle(0, 0, sw, sh, paint("ink.deep"))
    .setOrigin(0)
    .setAlpha(0)
    .setDepth(depth)
    .setInteractive();
  fade(dim, 0.6, 140);
  let closing = false;
  let unhold = () => {};
  const panel = new Panel(
    ctx,
    Math.round((sw - opts.w) / 2),
    Math.round((sh - opts.h) / 2),
    opts.w,
    opts.h,
    {
      title: opts.title,
      onClose: () => sheet.close(),
    },
  ).setDepth(depth + 1);
  const sheet: Sheet = {
    ctx,
    panel,
    page: panel.page,
    close(done) {
      if (closing) return;
      closing = true;
      popScope(scope);
      unhold();
      opts.onClosed?.();
      fade(dim, 0, 120, () => dim.destroy());
      panel.hide(() => {
        panel.destroy();
        done?.();
      });
    },
    seal(at) {
      const p = at ?? { x: panel.page.x + panel.page.w - 34, y: panel.page.y + 4 };
      const mark = scene.add.image(0, 0, "ui", "seal/on").setOrigin(0);
      panel.add(mark);
      sound("stamp");
      stamp(mark, p, () => scene.time.delayedCall(420, () => sheet.close()));
    },
  };
  scope.onBack = () => sheet.close();
  pushScope(scope);
  unhold = holdToasts(() => panel.toastSpot());
  opts.build(sheet);
  panel.open();
  scope.focus(scope.first(), "key");
  return sheet;
}
