import {
  CLUB_NAME_MAX,
  type ClubView,
  checkClubName,
  clubFee,
  type Emblem,
  JOIN_RULES,
  type JoinRule,
  normalizeClubName,
} from "@guago/shared";
import * as Phaser from "phaser";
import { composeDoll, Doll, normalizeLook, releaseDoll } from "../doll.ts";
import { t } from "../i18n/index.ts";
import { Button } from "../ui/button.ts";
import { Highlighter, RedPen } from "../ui/marks.ts";
import { nudge } from "../ui/motion.ts";
import { toast } from "../ui/overlay.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import { paint, sliceOf, uiArt } from "../ui/theme.ts";
import { type Ctx, Widget } from "../ui/widget.ts";
import { session } from "../world/session.ts";
import { newOpId, type WorldLink } from "../world-link.ts";
import {
  emblemParts,
  emblemTexture,
  firstEmblem,
  jacketColors,
  jacketSwatch,
  jacketTexture,
  rampSwatch,
  symbolTexture,
} from "./emblem.ts";
import { Segments } from "./segments.ts";
import { openSheet } from "./sheet.ts";
import { amount, line, refusal, term } from "./words.ts";

const CELL = 15;
const STEP = 17;

/** One square to pick from: a swatch, a shape or a symbol. Ringed in red pen when chosen. */
class Cell extends Widget {
  private readonly mark: Highlighter;
  private readonly pen: RedPen;
  private readonly onPick: () => void;
  private readonly locked: boolean;
  readonly content: Phaser.GameObjects.Container;

  constructor(ctx: Ctx, x: number, y: number, locked: boolean, onPick: () => void) {
    super(ctx, x, y, CELL, CELL, 1);
    this.onPick = onPick;
    this.locked = locked;
    const [l, r, tt, b] = sliceOf("inset");
    this.mark = new Highlighter(ctx.scene).box(-1, -1, CELL + 2, CELL + 2);
    const back = ctx.scene.add.nineslice(0, 0, "ui", "inset/idle", CELL, CELL, l, r, tt, b);
    back.setOrigin(0);
    this.content = ctx.scene.add.container(0, 0);
    this.pen = new RedPen(ctx.scene).box(-2, -2, CELL + 4, CELL + 4);
    this.add([this.mark.gfx, back, this.content, this.pen.gfx]);
    if (locked) {
      this.content.setAlpha(0.35);
      this.add(ctx.scene.add.image(4, 3, "ui", "lock/idle").setOrigin(0));
    }
  }

  setChosen(on: boolean, animate = true): void {
    if (on) this.pen.show(animate ? 140 : 0);
    else this.pen.hide(0);
  }

  protected fire(): void {
    if (this.locked) {
      sound("error");
      nudge(this, { x: this.x, y: this.y }, 1, 0);
      return;
    }
    this.onPick();
  }

  protected refresh(): void {
    if (this.focused) this.mark.show(80);
    else this.mark.hide(60);
  }
}

/**
 * The 과잠 editor (PLAN §12): the club's jacket hanging on the left with its emblem on the back,
 * the player's own character beside it from behind wearing it, and on the right the jacket colour,
 * the emblem's shape, symbol and their two colours. Every pick shows at once on both. Founding a
 * club adds the name, the join rule, the fee written next to the button, and 창립; a 짱 editing
 * the jacket saves with 저장.
 */
export function openJacketEditor(
  scene: Phaser.Scene,
  link: WorldLink,
  mode: { kind: "create" } | { kind: "edit"; club: ClubView },
): void {
  const club = mode.kind === "edit" ? mode.club : undefined;
  let jacket = club?.jacket ?? jacketColors()[0] ?? "navy";
  let emblem: Emblem = club ? { ...club.emblem } : firstEmblem();
  let joinRule: JoinRule = club?.joinRule ?? "open";
  let name = "";
  /** One founding attempt's operation id, reused while the answer is lost in the post. */
  let op = newOpId();
  let busy = false;
  const level = club?.level ?? 1;
  const parts = emblemParts(level);

  openSheet(scene, {
    title: club ? club.name : t("club.create"),
    w: 466,
    h: 262,
    build(sheet) {
      const { ctx, panel, page } = sheet;
      const meta = uiArt();

      // The closet: the jacket on its hanger, the emblem on its back panel, both doubled.
      const hangX = page.x + 6;
      const hangY = page.y + 6;
      const hang = scene.add.image(hangX, hangY, jacketTexture(scene, jacket)).setOrigin(0);
      hang.setScale(2);
      const badge = scene.add
        .image(hangX + 12 * 2, hangY + 14 * 2, emblemTexture(scene, emblem, "l"))
        .setOrigin(0)
        .setScale(2);
      panel.add([hang, badge]);
      const tag = new Label(scene, hangX, hangY + 112, "", {
        font: "galmuri11-bold",
        color: "ink.dark",
        width: 96,
        align: "center",
      });
      panel.add(tag.obj);

      // The player from behind, wearing it.
      let doll: { sprite: Doll; key: string } | undefined;
      const dressDoll = () => {
        const look = session.entry?.character.look;
        if (!look) return;
        const dressed = normalizeLook(meta, {
          ...look,
          accessories: [...look.accessories.filter((a) => a !== "varsity"), "varsity"],
          jacket,
        });
        const key = composeDoll(scene, meta, dressed);
        if (doll) {
          doll.sprite.wear(key);
          releaseDoll(scene, doll.key);
          doll.key = key;
          return;
        }
        const sprite = new Doll(scene, meta, page.x + 132, hangY + 104, key).face("up");
        sprite.setScale(3);
        panel.add(sprite);
        doll = { sprite, key };
      };
      dressDoll();
      panel.once(Phaser.GameObjects.Events.DESTROY, () => {
        if (doll) releaseDoll(scene, doll.key);
      });

      const refresh = () => {
        hang.setTexture(jacketTexture(scene, jacket));
        badge.setTexture(emblemTexture(scene, emblem, "l"));
        nudge(badge, { x: badge.x, y: badge.y }, 0, -1);
        dressDoll();
        for (const c of shapeCells) {
          c.cell.content.removeAll(true);
          c.cell.content.add(
            scene.add
              .image(2, 2, emblemTexture(scene, { ...emblem, shape: c.id }, "s"))
              .setOrigin(0),
          );
        }
        for (const c of symbolCells) {
          c.cell.content.removeAll(true);
          c.cell.content.add(
            scene.add.image(2, 2, symbolTexture(scene, c.id, emblem.symbolColor)).setOrigin(0),
          );
        }
      };

      // The controls.
      const x0 = page.x + 172;
      let y = page.y + 1;
      const row = (label: string) => {
        const l = new Label(scene, x0, y, label, { font: "galmuri9", color: "stone.dark" });
        panel.add(l.obj);
        y += 11;
      };
      const cells = <T extends string>(
        ids: readonly { id: T; open: boolean }[],
        current: () => T,
        pick: (id: T) => void,
        draw: (into: Phaser.GameObjects.Container, id: T) => void,
      ) => {
        const made = ids.map((p, i) => {
          const cell = new Cell(ctx, x0 + i * STEP, y, !p.open, () => {
            pick(p.id);
            sound("select");
            for (const m of made) m.cell.setChosen(m.id === current());
            refresh();
          });
          draw(cell.content, p.id);
          cell.setChosen(p.id === current(), false);
          panel.add(cell);
          return { id: p.id, cell };
        });
        y += STEP + 1;
        return made;
      };
      const swatch = (into: Phaser.GameObjects.Container, color: number) => {
        const g = scene.add.graphics();
        g.fillStyle(color);
        g.fillRect(2, 2, CELL - 4, CELL - 4);
        g.fillStyle(paint("ink.deep"));
        g.fillRect(2, CELL - 3, CELL - 4, 1);
        into.add(g);
      };

      let field: TextField | undefined;
      let found: Button | undefined;
      if (!club) {
        field = new TextField(ctx, x0, y, {
          label: t("club.name"),
          w: 150,
          maxLength: CLUB_NAME_MAX * 2,
          onChange: (v) => {
            name = normalizeClubName(v);
            tag.set(name);
            found?.setEnabled(checkClubName(name) === null);
          },
          onSubmit: () => void submit(),
        });
        panel.add(field);
        y += 36;
        row(t("club.rule"));
        const rules = new Segments(ctx, x0, y, {
          items: JOIN_RULES.map((r) => ({ id: r, label: term("join", r) })),
          selected: joinRule,
          onChange: (id) => {
            joinRule = id as JoinRule;
          },
        });
        panel.add(rules);
        y += 18;
      }

      row(t("jacket.color"));
      cells(
        jacketColors().map((id) => ({ id, open: true })),
        () => jacket,
        (id) => {
          jacket = id;
        },
        (into, id) => swatch(into, jacketSwatch(id)),
      );
      row(t("jacket.shape"));
      const shapeCells = cells(
        parts.shapes,
        () => emblem.shape,
        (id) => {
          emblem = { ...emblem, shape: id };
        },
        () => {},
      );
      row(t("jacket.symbol"));
      const symbolCells = cells(
        parts.symbols,
        () => emblem.symbol,
        (id) => {
          emblem = { ...emblem, symbol: id };
        },
        () => {},
      );
      row(t("jacket.shapeColor"));
      cells(
        parts.colors,
        () => emblem.shapeColor,
        (id) => {
          emblem = { ...emblem, shapeColor: id };
        },
        (into, id) => swatch(into, rampSwatch(id)),
      );
      row(t("jacket.symbolColor"));
      cells(
        parts.colors,
        () => emblem.symbolColor,
        (id) => {
          emblem = { ...emblem, symbolColor: id };
        },
        (into, id) => swatch(into, rampSwatch(id)),
      );
      refresh();

      // The press: 창립 with the fee written beside it, or 저장.
      const by = page.y + page.h - 24;
      const bx = page.x + page.w - 6 - 74;
      if (!club) {
        const fee = clubFee(1);
        const coin = scene.add.image(0, by + 5, "ui", "icon/pinecone").setOrigin(0);
        const price = new Label(scene, 0, by + 6, amount(fee), {
          font: "galmuri11-bold",
          color: "ink.dark",
        });
        price.at(bx - 8 - price.width, by + 6);
        coin.setX(price.obj.x - 15);
        panel.add([coin, price.obj]);
      }
      found = new Button(ctx, bx, by, {
        label: club ? t("club.save") : t("club.found"),
        kind: "ink",
        w: 74,
        sound: "confirm",
        onPress: () => void submit(),
      });
      if (!club) found.setEnabled(false);
      panel.add(found);

      async function submit(): Promise<void> {
        if (busy) return;
        if (!club && checkClubName(name) !== null) {
          field?.reject();
          sound("error");
          return;
        }
        busy = true;
        found?.setEnabled(false);
        const r = club
          ? await link.request("club.settings", {
              ...(jacket !== club.jacket ? { jacket } : {}),
              emblem,
            })
          : await link.request("club.create", { op, name, joinRule, jacket, emblem });
        busy = false;
        found?.setEnabled(true);
        if (!r.ok) {
          // A lost answer is retried under the same id; any real answer starts a fresh attempt.
          if (r.code !== "offline" && r.code !== "timeout") op = newOpId();
          sound("error");
          toast(refusal(r.code));
          if (r.code === "name_taken" || r.code === "name_invalid" || r.code === "name_banned") {
            field?.reject();
          }
          return;
        }
        const said = club ? undefined : line("social.club.created", { club: name });
        if (said) toast(said);
        sheet.seal({ x: hangX + 64, y: hangY + 6 });
      }
    },
  });
}
