import { mealById, narrative } from "@guago/content";
import { STAT_IDS, type StatId, statResetCost, TIERS } from "@guago/shared";
import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { amount, termName } from "../items/catalog.ts";
import { inventory } from "../state/inventory.ts";
import { live } from "../state/live.ts";
import { Button } from "../ui/button.ts";
import { CostRow } from "../ui/cost-row.ts";
import { stamp } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import { session } from "../world/session.ts";
import { onGone, opRefusal, rightLabel, SaidLine } from "./common.ts";
import { registerMenuTab } from "./notebook.ts";

/**
 * 캐릭터 (PLAN §7, §9, §11): who the player is on one page. Level, EXP and class at the top; the
 * six stats with their points, drafted with + and placed with one press, and the reset with its
 * cost in plain sight; on the right the 상벌점 ledger, the titles from the principal and whatever
 * is working on the player now, with the time it has left.
 */

const N = narrative.NARRATIVE;
const STAT_ICONS: Readonly<Record<StatId, string>> = {
  understanding: "icon/insight",
  memory: "icon/memory",
  focus: "icon/focus",
  vitality: "icon/stamina",
  agility: "icon/agility",
  luck: "icon/luck",
};
const awards = new Map(N.awards.map((a) => [a.id, a]));

class CharacterPage {
  private readonly ctx: Ctx;
  private readonly root: Phaser.GameObjects.Container;
  private readonly size: { w: number; h: number };
  private readonly draft: Record<StatId, number> = {
    understanding: 0,
    memory: 0,
    focus: 0,
    vitality: 0,
    agility: 0,
    luck: 0,
  };
  private readonly body: Phaser.GameObjects.Container;
  private readonly said: SaidLine;
  private readonly reset: CostRow;
  private readonly apply: Button;
  private pending = false;

  constructor(ctx: Ctx, parent: Phaser.GameObjects.Container, size: { w: number; h: number }) {
    this.ctx = ctx;
    this.size = size;
    const s = ctx.scene;
    this.root = s.add.container(0, 0);
    parent.add(this.root);
    this.body = s.add.container(0, 0);
    this.root.add(this.body);
    this.said = new SaidLine(s, this.root, 8, size.h - 46, 200);
    this.apply = new Button(ctx, 150, 0, {
      label: t("character.apply"),
      kind: "ink",
      font: "galmuri9",
      h: 17,
      sound: "confirm",
      onPress: () => void this.allocate(),
    });
    this.reset = new CostRow(ctx, 8, size.h - 26, 200, {
      label: t("character.reset"),
      kind: "paper",
      onPress: () => void this.resetStats(),
    });
    this.root.add([this.apply, this.reset.root]);
    const off1 = inventory.watch(() => this.draw());
    const off2 = live.watch(() => this.draw());
    // Buffs count down while the page is open.
    const tick = s.time.addEvent({ delay: 1000, loop: true, callback: () => this.draw() });
    onGone(this.root, () => {
      off1();
      off2();
      tick.remove();
    });
    void live.read("rules");
    this.draw();
  }

  private draw(): void {
    const s = this.ctx.scene;
    const prog = inventory.snap?.progression;
    const entry = session.entry;
    if (!prog || !entry) return;
    this.body.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.body.add(o);
      return o;
    };
    // Who: name, level, class and tier, the EXP to the next level.
    const name = new Label(s, 8, 4, entry.character.name, {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    add(name.obj);
    const lv = new Label(s, 8 + name.width + 8, 5, `Lv ${prog.level}`, {
      font: "galmuri11",
      color: "red.dark",
    });
    add(lv.obj);
    const tier = TIERS[prog.tier];
    add(
      new Label(
        s,
        8,
        20,
        [
          termName("class", entry.character.major),
          tier ? termName("tier", tier.id) : "",
          entry.character.cohort ? t("character.cohort", { n: entry.character.cohort }) : "",
        ]
          .filter(Boolean)
          .join(" · "),
        {
          font: "galmuri9",
          color: "ink.mid",
        },
      ).obj,
    );
    const W = 196;
    add(s.add.rectangle(8, 34, W, 5, paint("stone.light")).setOrigin(0));
    add(
      s.add
        .rectangle(
          8,
          34,
          Math.round((W * prog.exp) / Math.max(1, prog.expToNext)),
          5,
          paint("sea.mid"),
        )
        .setOrigin(0),
    );
    add(
      new Label(s, 8, 42, `${amount(prog.exp)} / ${amount(prog.expToNext)}`, {
        font: "galmuri9",
        color: "stone.dark",
      }).obj,
    );

    // The stats: the points placed, the draft on top in red pen, and + while points remain.
    const drafted = STAT_IDS.reduce((n, id) => n + this.draft[id], 0);
    const left = prog.unspent - drafted;
    STAT_IDS.forEach((id, i) => {
      const y = 58 + i * 17;
      add(s.add.image(8, y, "ui", STAT_ICONS[id]).setOrigin(0));
      add(
        new Label(s, 24, y + 2, termName("stat", id), { font: "galmuri9", color: "ink.dark" }).obj,
      );
      const v = new Label(s, 100, y + 2, String(prog.stats[id]), {
        font: "galmuri11",
        color: "ink.dark",
      });
      add(v.obj);
      if (this.draft[id] > 0) {
        add(
          new Label(s, 100 + v.width + 4, y + 2, `+${this.draft[id]}`, {
            font: "galmuri11",
            color: "red.mid",
          }).obj,
        );
      }
      if (left > 0) {
        add(
          new Button(this.ctx, 150, y - 1, {
            label: "+",
            font: "galmuri11-bold",
            w: 17,
            h: 15,
            onPress: () => {
              this.draft[id]++;
              sound("select");
              this.draw();
            },
          }),
        );
      }
    });
    const pts = new Label(s, 8, 162, t("character.points", { n: left }), {
      font: "galmuri9",
      color: left > 0 ? "red.dark" : "stone.dark",
    });
    add(pts.obj);
    this.apply
      .setPosition(150, 159)
      .setVisible(drafted > 0)
      .setEnabled(drafted > 0 && !this.pending);
    const cost = statResetCost(prog.level);
    this.reset.setCosts([
      { icon: "icon/pinecone", need: cost, have: inventory.money("pinecone"), text: amount(cost) },
    ]);
    this.reset.setPending(this.pending);

    // The right page: the ledger, the titles, what is working on the player now.
    const rx = 226;
    const rules = live.rules;
    add(s.add.rectangle(rx - 10, 4, 1, this.size.h - 12, paint("stone.light")).setOrigin(0));
    add(s.add.image(rx, 4, "ui", "icon/whistle").setOrigin(0));
    add(
      new Label(s, rx + 16, 6, `${t("character.demerits")} ${rules?.demerits ?? prog.demerits}`, {
        font: "galmuri11",
        color: "red.dark",
      }).obj,
    );
    add(s.add.image(rx + 90, 4, "ui", "icon/merit").setOrigin(0));
    add(
      new Label(s, rx + 106, 6, `${t("character.merits")} ${rules?.merits ?? prog.merits}`, {
        font: "galmuri11",
        color: "ink.dark",
      }).obj,
    );
    let y = 26;
    if (rules?.floorLeader) {
      add(
        new Label(s, rx, y, termName("badge", "floor-leader"), {
          font: "galmuri9",
          color: "gold.deep",
        }).obj,
      );
      y += 14;
    }
    // Titles: each a little 상장, gold-edged.
    for (const id of rules?.titles ?? []) {
      const a = awards.get(id);
      if (!a) continue;
      const title = N.ko[a.title] ?? id;
      const l = new Label(s, rx + 4, y + 3, title, { font: "galmuri9", color: "ink.dark" });
      add(
        s.add
          .rectangle(rx, y, l.width + 9, 14, paint("gold.pale"))
          .setOrigin(0)
          .setStrokeStyle(1, paint("gold.dark")),
      );
      add(l.obj);
      y += 18;
    }
    // What works on the player now, each with its time left.
    const buffs: { icon: string; name: string; until: number | null }[] = [];
    if (rules?.meal) {
      const m = mealById(rules.meal.id);
      const d = N.descriptions.find((x) => x.id === `meal:${rules.meal?.id}`);
      buffs.push({
        icon: "icon/stamina",
        name: d ? (N.ko[d.name] ?? "") : (m?.id ?? ""),
        until: rules.meal.until,
      });
    }
    if (rules?.restedUntil && live.realMsUntil(rules.restedUntil) > 0) {
      buffs.push({ icon: "icon/pool", name: t("character.rested"), until: rules.restedUntil });
    }
    if (rules?.drowsy) buffs.push({ icon: "icon/focus", name: t("character.drowsy"), until: null });
    y = Math.max(y + 6, 96);
    for (const b of buffs) {
      add(s.add.image(rx, y, "ui", b.icon).setOrigin(0));
      add(
        new Label(s, rx + 16, y + 2, b.name, {
          font: "galmuri9",
          color: b.until === null ? "red.dark" : "ink.dark",
        }).obj,
      );
      if (b.until !== null) {
        const ms = Math.max(0, live.realMsUntil(b.until));
        add(
          new Label(s, rx + 150, y + 2, clockLeft(ms), { font: "galmuri9", color: "stone.dark" })
            .obj,
        );
      }
      y += 16;
    }
    this.ladder(rx, this.size.h - 6, prog.tier);
  }

  /**
   * The 전직 ladder at the foot of the right page, earliest at the bottom: each tier at its
   * level, those passed in ink, the current one ringed in red pen, the ones ahead in pencil.
   */
  private ladder(x: number, bottom: number, current: number): void {
    const s = this.ctx.scene;
    const row = 13;
    const g = s.add.graphics();
    this.body.add(g);
    TIERS.forEach((tier, i) => {
      const y = bottom - (i + 1) * row;
      const passed = i < current;
      const here = i === current;
      const color = here ? "red.dark" : passed ? "ink.dark" : "stone.mid";
      // The rung: a short rule joining this tier to the next.
      g.fillStyle(paint(passed ? "ink.mid" : "stone.light")).fillRect(x + 4, y - 3, 1, row - 6);
      g.fillStyle(paint(here ? "red.mid" : passed ? "ink.mid" : "stone.light")).fillRect(
        x + 2,
        y + 3,
        5,
        5,
      );
      const lv = rightLabel(s, x + 40, y + 2, `${tier.level}`, {
        font: "galmuri9",
        color: "stone.mid",
      });
      const name = new Label(s, x + 46, y + 2, termName("tier", tier.id), {
        font: "galmuri9",
        color,
      });
      this.body.add([lv.obj, name.obj]);
      if (here) g.lineStyle(1, paint("red.mid")).strokeRect(x + 43.5, y - 0.5, name.width + 6, 12);
    });
  }

  private async allocate(): Promise<void> {
    const add = Object.fromEntries(
      STAT_IDS.filter((id) => this.draft[id] > 0).map((id) => [id, this.draft[id]]),
    );
    if (Object.keys(add).length === 0 || this.pending) return;
    this.pending = true;
    this.draw();
    const r = await inventory.op("stats.allocate", { add });
    this.pending = false;
    if (r.ok) {
      for (const id of STAT_IDS) this.draft[id] = 0;
      sound("stamp");
      stamp(this.body, { x: 0, y: 0 });
    } else {
      sound("error");
      this.said.say(opRefusal(r));
    }
    this.draw();
  }

  private async resetStats(): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    this.draw();
    const r = await inventory.op("stats.reset", {});
    this.pending = false;
    if (r.ok) {
      for (const id of STAT_IDS) this.draft[id] = 0;
      sound("page");
    } else {
      sound("error");
      this.reset.refuse();
      this.said.say(opRefusal(r));
    }
    this.draw();
  }
}

/** Time left as a clock: 4:05 or 1:02:30. */
export function clockLeft(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function registerCharacter(): void {
  registerMenuTab({
    id: "character",
    label: t("menu.character"),
    icon: "menu/card",
    order: 20,
    build(ctx, page, size) {
      new CharacterPage(ctx, page, size);
    },
  });
}
