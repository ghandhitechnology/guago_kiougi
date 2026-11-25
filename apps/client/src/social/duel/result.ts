import type { DuelResultView } from "@guago/shared";
import type * as Phaser from "phaser";
import { FocusScope } from "../../ui/focus.ts";
import { stamp } from "../../ui/motion.ts";
import { Panel } from "../../ui/panel.ts";
import { screen } from "../../ui/screen.ts";
import { sound } from "../../ui/sound.ts";
import { Label, measure } from "../../ui/text.ts";
import { paint } from "../../ui/theme.ts";
import { amount, term } from "../words.ts";
import { BANNER_BOTTOM, minutes, SIDE_CHIP } from "./banner.ts";

const W = 236;
const ROW = 13;
/** Right edges of the number columns, on the page. */
const COLS = { damage: 148, hits: 178, downs: 204 } as const;
/** The card stays this long unless closed first. */
const HOLD_MS = 12_000;

/**
 * A decided match, on a page: the winning side's names on the cover with the red seal stamped
 * beside them (무승부 and no seal for a draw), each round as the chip of the side that took it,
 * how it ended and how long it ran, then every fighter's 피해량, 적중 and 기절, with 기권 by
 * whoever left. No reward, no level, nothing healed or lost: a duel's only outcome is this page
 * and the record.
 */
export class ResultCard {
  readonly match: number;
  private readonly panel: Panel;
  private readonly onClosed: () => void;
  private closed = false;

  constructor(
    scene: Phaser.Scene,
    match: number,
    result: DuelResultView,
    me: string | undefined,
    onClosed: () => void,
  ) {
    this.match = match;
    this.onClosed = onClosed;
    const ctx = { scene, scope: new FocusScope() };
    const fighters = [...result.fighters].sort((a, b) => a.team - b.team || b.damage - a.damage);
    const winners = fighters.filter((f) => f.team === result.winner);
    const title =
      result.winner === 0 ? term("label", "duel-draw") : winners.map((f) => f.name).join(" · ");
    const page = { top: 19 };
    const roundsY = 6;
    const ruleY = roundsY + 14;
    const headY = ruleY + 5;
    const rowsY = headY + 13;
    const h = page.top + rowsY + fighters.length * ROW + 8;
    const x = Math.round((screen.w - W) / 2);
    // Under the floor's bar, which keeps the final score above it.
    const y = Math.max(BANNER_BOTTOM + 5, Math.round((screen.h - h) / 2) - 8);
    const panel = new Panel(ctx, x, y, W, h, { title, onClose: () => this.close() }).setDepth(720);
    this.panel = panel;
    const at = (px: number, py: number) => ({ x: 7 + px, y: page.top + py });

    // The rounds: who took each (an empty socket for a draw), how it ended, how long it ran.
    // However many were played fit the page: the gaps close up first, then the times go.
    const room = W - 11 - 12;
    const times = result.rounds.map((r) => minutes(r.seconds));
    const timed = times.reduce((sum, m) => sum + 20 + measure(scene, "galmuri9", m), 0);
    const n = result.rounds.length;
    const withTimes = timed + 6 * (n - 1) <= room;
    const gap =
      n > 1 ? Math.min(10, Math.floor((room - (withTimes ? timed : 18 * n)) / (n - 1))) : 0;
    let rx = 6;
    const ry = roundsY;
    result.rounds.forEach((r, i) => {
      const p = at(rx, ry);
      const side = r.winner > 0 ? SIDE_CHIP[(r.winner - 1) as 0 | 1] : "duel-pip/off";
      panel.add(scene.add.image(p.x, p.y + 1, "ui", side).setOrigin(0));
      const end = r.end === "ko" ? "burst" : r.end === "time" ? "clock" : "flag";
      panel.add(scene.add.image(p.x + 8, p.y, "ui", `duel-icon/${end}`).setOrigin(0));
      rx += 18 + gap;
      if (!withTimes) return;
      const secs = new Label(scene, p.x + 20, p.y + 1, times[i] ?? "", {
        font: "galmuri9",
        color: "stone.dark",
      });
      panel.add(secs.obj);
      rx += 2 + secs.width;
    });

    const rule = at(4, ruleY);
    panel.add(
      scene.add.rectangle(rule.x, rule.y, W - 11 - 8, 1, paint("stone.light")).setOrigin(0),
    );
    const heads: [keyof typeof COLS, string][] = [
      ["damage", "duel-damage"],
      ["hits", "duel-hits"],
      ["downs", "duel-downs"],
    ];
    for (const [col, id] of heads) {
      const p = at(COLS[col] - 50, headY);
      const l = new Label(scene, 0, 0, term("label", id), {
        font: "galmuri9",
        color: "stone.dark",
        width: 50,
        align: "right",
      });
      l.at(p.x, p.y);
      panel.add(l.obj);
    }

    fighters.forEach((f, i) => {
      const p = at(0, rowsY + i * ROW);
      const mine = f.id === me;
      if (mine) {
        panel.add(
          scene.add
            .rectangle(p.x + 2, p.y - 2, W - 11 - 4, ROW - 1, paint("gold.pale"))
            .setOrigin(0),
        );
      }
      panel.add(scene.add.image(p.x + 4, p.y, "ui", SIDE_CHIP[(f.team - 1) as 0 | 1]).setOrigin(0));
      const name = new Label(scene, p.x + 14, p.y, f.name, {
        font: "galmuri9",
        color: f.forfeited ? "stone.dark" : "ink.dark",
      });
      panel.add(name.obj);
      if (f.forfeited) {
        const gave = new Label(
          scene,
          p.x + 14 + name.width + 4,
          p.y,
          term("label", "duel-forfeited"),
          {
            font: "galmuri9",
            color: "red.mid",
          },
        );
        panel.add(gave.obj);
      }
      const num = (col: keyof typeof COLS, n: number) => {
        const l = new Label(scene, 0, p.y, amount(n), {
          font: "galmuri9",
          color: "ink.dark",
          width: 40,
          align: "right",
        });
        l.at(p.x + COLS[col] - 40, p.y);
        panel.add(l.obj);
      };
      num("damage", f.damage);
      num("hits", f.hits);
      num("downs", f.downs);
    });

    panel.open(() => {
      if (this.closed || result.winner === 0) return;
      // The winners' seal, pressed onto the cover beside their names.
      const seal = scene.add.image(0, 0, "ui", "seal/on").setOrigin(0);
      panel.add(seal);
      const tag = 10 + measure(scene, "galmuri11-bold", title) + 12;
      stamp(seal, { x: Math.min(tag + 3, W - 21 - 22), y: -3 });
      sound("stamp");
    });
    scene.time.delayedCall(HOLD_MS, () => this.close());
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const panel = this.panel;
    panel.hide(() => panel.destroy());
    this.onClosed();
  }
}
