import type { BanNotice, SystemLine } from "@guago/shared";
import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { Button } from "../ui/button.ts";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { fade, layDown } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import type { WorldLink } from "../world-link.ts";
import { line } from "./words.ts";

const KICKED = "moderation.kicked";
const BANNED = "moderation.banned";
const KEYS = [KICKED, BANNED, "moderation.banned-permanent"];

/** A ban's end: the clock time today, the date and time on another day. */
function when(ms: number): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  const same =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return same ? hm : `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}

/** The 운영진's line, filled with what the server sent; a sentence it cannot fill is left out. */
function moderationText(
  l: Pick<SystemLine, "key" | "params"> | undefined,
  fallback: string,
): string | undefined {
  const key = l?.key ?? fallback;
  const params: Record<string, string | number> = {};
  if (typeof l?.params?.until === "number") params.time = when(l.params.until);
  if (l?.params?.reason !== undefined) params.reason = String(l.params.reason);
  const text = line(key, params);
  if (!text) return undefined;
  return text
    .split(/(?<=\.)\s+/)
    .filter((s) => !/\{\w+(\|[^}]*)?\}/.test(s))
    .join(" ");
}

/**
 * A kick or a ban (PLAN §12 moderation) as the player meets it: the game stops under a dark
 * screen, the 운영진's notice says what happened, why and until when, and one button goes back
 * to the title. Never a reconnect spinner: these ends are final.
 */
export function watchModeration(
  scene: Phaser.Scene,
  link: WorldLink,
  toTitle: () => void,
): () => void {
  let held: SystemLine | undefined;
  let shown = false;
  const off = link.on((e) => {
    if (e.type === "system" && KEYS.includes(e.line.key)) held = e.line;
    if (e.type === "status" && (e.status === "kicked" || e.status === "banned") && !shown) {
      shown = true;
      notice(scene, moderationText(held, e.status === "kicked" ? KICKED : BANNED), toTitle);
    }
  });
  return off;
}

/** The ban notice for a login the server refused for a ban, with the ban's reason and end. */
export function showBan(scene: Phaser.Scene, ban: BanNotice, toTitle: () => void): void {
  const params: Record<string, string | number> = { reason: ban.reason };
  if (ban.until !== undefined) params.until = ban.until;
  notice(scene, moderationText({ key: ban.key, params }, BANNED), toTitle);
}

function notice(scene: Phaser.Scene, text: string | undefined, toTitle: () => void): void {
  const sw = scene.scale.width;
  const sh = scene.scale.height;
  const scope = new FocusScope();
  const ctx = { scene, scope };
  const dim = scene.add
    .rectangle(0, 0, sw, sh, paint("ink.deep"))
    .setOrigin(0)
    .setAlpha(0)
    .setDepth(3000)
    .setInteractive();
  fade(dim, 0.92, 260);
  const w = 260;
  const body = text
    ? new Label(scene, 14, 14, text, {
        font: "galmuri11",
        color: "ink.dark",
        width: w - 28,
        leading: 3,
      })
    : undefined;
  const h = 14 + (body?.height ?? 0) + 16 + 21 + 12;
  const [l, r, tt, b] = sliceOf("notice-paper");
  const paper = scene.add.nineslice(0, 0, "ui", "notice-paper/idle", w, h, l, r, tt, b);
  paper.setOrigin(0);
  const x = Math.round((sw - w) / 2);
  const y = Math.round((sh - h) / 2);
  const root = scene.add.container(x, y, [paper]).setDepth(3001);
  if (body) root.add(body.obj);
  const back = new Button(ctx, Math.round((w - 96) / 2), h - 12 - 21, {
    label: t("moderation.back"),
    kind: "ink",
    w: 96,
    sound: "close",
    onPress: () => {
      popScope(scope);
      // After the press has finished with its own button: then the notice goes and the title comes.
      scene.time.delayedCall(0, () => {
        root.destroy();
        dim.destroy();
        toTitle();
      });
    },
  });
  root.add(back);
  pushScope(scope);
  sound("error");
  layDown(root, { x, y }, () => scope.focus(back, "key"));
}
