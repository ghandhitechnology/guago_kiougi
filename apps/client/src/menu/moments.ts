import { narrative } from "@guago/content";
import type { HelpNoticeView, LivePush } from "@guago/shared";
import type * as Phaser from "phaser";
import { spoken } from "../copy/lines.ts";
import { cue } from "../sound/audio.ts";
import { live } from "../state/live.ts";
import { fade, layDown, stamp } from "../ui/motion.ts";
import { toast } from "../ui/overlay.ts";
import { edges } from "../ui/screen.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import { noticeDone } from "./board.ts";
import { codexUnlocked } from "./codex.ts";

/**
 * What the living world hands the player in the middle of play, shown without stopping them: a
 * 도감 entry found, a notice on the board done, a 도움 notice taken, moved on or finished, and a
 * 상장 from the principal. Lines come from the narrative; the server already says its own lines
 * (a set finished, 숙면, 졸음, the award to everyone) in the chat.
 */

const N = narrative.NARRATIVE;
const awards = new Map(N.awards.map((a) => [a.id, a]));
/** Awards waiting to be shown, the first on screen now: one 상장 at a time. */
const awardQueue: string[] = [];

function nextAward(scene: Phaser.Scene): void {
  awardQueue.shift();
  const id = awardQueue[0];
  if (id) scene.time.delayedCall(250, () => certificate(scene, id));
}

/** Starts showing the moments; returns the stop. `me` is the player's character id. */
export function watchMoments(scene: Phaser.Scene, me: () => string | undefined): () => void {
  const help = new Map<string, HelpNoticeView>();
  return live.watch((_l, push) => {
    if (!push) return;
    moment(scene, push, help, me());
  });
}

function moment(
  scene: Phaser.Scene,
  push: LivePush,
  seen: Map<string, HelpNoticeView>,
  me: string | undefined,
): void {
  const e = edges();
  switch (push.t) {
    case "unlock":
      codexUnlocked(scene, push.entries);
      break;
    case "done":
      noticeDone(scene, push.quest, e.right - 150, e.top + 60);
      break;
    case "help": {
      const line = helpLine(push.notice, seen.get(push.notice.id), me);
      seen.set(push.notice.id, push.notice);
      if (line) toast(line);
      break;
    }
    case "award":
      awardQueue.push(push.award);
      if (awardQueue.length === 1) certificate(scene, push.award);
      break;
    default:
      break;
  }
}

/** The 도움 line for a change to a notice, from the poster's side or the helper's. */
function helpLine(
  n: HelpNoticeView,
  before: HelpNoticeView | undefined,
  me: string | undefined,
): string | undefined {
  const poster = n.poster.id === me;
  const side = poster ? "poster" : "helper";
  const other = poster ? (n.helper?.name ?? "") : n.poster.name;
  const params = { player: other, count: n.progress, total: n.count };
  let key: string | undefined;
  if (n.state === "taken" && before?.state !== "taken") key = `help.taken.${side}`;
  else if (n.state === "taken" && before && n.progress > before.progress)
    key = `help.progress.${side}`;
  else if (n.state === "done" && before?.state !== "done") key = `help.done.${side}`;
  else if (n.state === "cancelled" && before?.state !== "cancelled") {
    // Taken down by the poster, or come down at its deadline.
    const expired = live.serverNow() >= n.expiresAt;
    key = expired ? `help.expired.${side}` : `help.cancelled.${side}`;
  }
  if (!key) return undefined;
  return spoken(key, params)?.text;
}

/**
 * A 상장, as the principal's office prints them: the heading, the award, the player's name, the
 * citation and the signature. It is laid on the screen, stamped, and lifts off by itself.
 */
function certificate(scene: Phaser.Scene, id: string): void {
  const a = awards.get(id);
  if (!a) {
    nextAward(scene);
    return;
  }
  const e = edges();
  const W = 196;
  const c = scene.add.container(0, 0).setDepth(650);
  const g = scene.add.graphics();
  const heading = new Label(scene, 0, 10, N.ko[N.awardFrame.heading] ?? "", {
    font: "galmuri11-bold",
    color: "ink.dark",
    width: W,
    align: "center",
  });
  const title = new Label(scene, 0, 28, N.ko[a.title] ?? "", {
    font: "galmuri11-bold",
    color: "gold.deep",
    width: W,
    align: "center",
  });
  const citation = new Label(scene, 16, 46, N.ko[a.citation] ?? "", {
    font: "galmuri9",
    color: "ink.mid",
    width: W - 32,
    leading: 1,
  });
  const sy = 46 + citation.height + 8;
  const signature = new Label(scene, 0, sy, N.ko[N.awardFrame.signature] ?? "", {
    font: "galmuri9",
    color: "ink.dark",
    width: W - 34,
    align: "right",
  });
  const H = sy + 22;
  // Cream paper with a double gold rule round it.
  g.fillStyle(paint("stone.light")).fillRect(2, 2, W, H);
  g.fillStyle(paint("stone.bright")).fillRect(0, 0, W, H);
  g.lineStyle(2, paint("gold.mid")).strokeRect(4, 4, W - 8, H - 8);
  g.lineStyle(1, paint("gold.dark")).strokeRect(8.5, 8.5, W - 17, H - 17);
  c.add([g, heading.obj, title.obj, citation.obj, signature.obj]);
  // The school's seal pressed beside the signature.
  const seal = scene.add.container(W - 24, sy + 4);
  const sg = scene.add.graphics();
  sg.fillStyle(paint("red.mid")).fillRect(-7, -7, 14, 14);
  sg.fillStyle(paint("red.light")).fillRect(-5, -5, 10, 10);
  sg.fillStyle(paint("red.mid")).fillRect(-3, -3, 6, 6);
  seal.add(sg).setAlpha(0.85).setVisible(false);
  c.add(seal);
  // Centred, clear of the place banner along the top.
  const x = Math.round((e.left + e.right - W) / 2);
  const y = Math.max(e.top + 56, Math.round((e.top + e.bottom - H) / 2) - 16);
  layDown(c, { x, y });
  sound("open");
  cue("jingle.level-up", { volume: 0.6 });
  scene.time.delayedCall(420, () => {
    stamp(seal, { x: W - 24, y: sy + 4 });
    sound("stamp");
  });
  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    fade(c, 0, 300, () => {
      c.destroy();
      nextAward(scene);
    });
  };
  const timer = scene.time.delayedCall(5200, leave);
  // A tap on it puts it away sooner.
  const hit = scene.add.zone(0, 0, W, H).setOrigin(0).setInteractive({ useHandCursor: true });
  hit.once("pointerup", () => {
    timer.remove();
    leave();
  });
  c.add(hit);
}
