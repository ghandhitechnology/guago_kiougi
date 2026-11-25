import { REPORT_CATEGORIES, REPORT_NOTE_LENGTH, type ReportCategory } from "@guago/shared";
import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { Button } from "../ui/button.ts";
import { List } from "../ui/list.ts";
import { toast } from "../ui/overlay.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import type { WorldLink } from "../world-link.ts";
import { openSheet } from "./sheet.ts";
import { line, refusal, term } from "./words.ts";

/**
 * 신고 (PLAN §12): the reported player's name, a category ringed in red pen, an optional note,
 * and 보내기. The server attaches the last twenty lines itself. Filing it is calm: the seal lands
 * on the form and it is put away, with the narrative's line when it has one.
 */
export function openReport(
  scene: Phaser.Scene,
  link: WorldLink,
  target: { id: string; name: string; line?: number },
): void {
  let cat: ReportCategory | undefined;
  let sending = false;
  openSheet(scene, {
    title: t("report.title"),
    w: 230,
    h: 240,
    build(sheet) {
      const { ctx, panel, page } = sheet;
      const x = page.x + 8;
      const w = page.w - 16;
      const name = new Label(scene, x, page.y + 8, target.name, {
        font: "galmuri11-bold",
        color: "ink.dark",
      });
      panel.add(name.obj);
      const send = new Button(ctx, page.x + page.w - 8 - 64, page.y + page.h - 8 - 21, {
        label: t("report.send"),
        kind: "ink",
        w: 64,
        sound: "confirm",
        onPress: () => void submit(),
      });
      send.setEnabled(false);
      const list = new List(ctx, x, page.y + 24, {
        w,
        visible: REPORT_CATEGORIES.length,
        rowH: 15,
        rows: REPORT_CATEGORIES.map((c, i) => ({
          draw: (into, _w, _h, row) => {
            const label = new Label(scene, 6, 3, term("report", c), {
              font: "galmuri11",
              color: "ink.dark",
            });
            into.add(label.obj);
            row.zone(0, 0, w, 15, () => pick(i));
          },
          activate: () => pick(i),
        })),
      });
      const note = new TextField(ctx, x, page.y + 24 + REPORT_CATEGORIES.length * 15 + 4, {
        label: t("report.note"),
        w,
        maxLength: REPORT_NOTE_LENGTH,
        enterKeyHint: "send",
        onSubmit: () => void submit(),
      });
      panel.add([list, note, send]);
      function pick(i: number): void {
        cat = REPORT_CATEGORIES[i];
        sound("select");
        list.choose(i);
        send.setEnabled(true);
      }
      async function submit(): Promise<void> {
        if (!cat || sending) {
          if (!cat) sound("error");
          return;
        }
        sending = true;
        const text = note.value.trim();
        const r = await link.request("report", {
          id: target.id,
          cat,
          ...(text ? { note: text } : {}),
          ...(target.line === undefined ? {} : { line: target.line }),
        });
        sending = false;
        if (!r.ok) {
          sound("error");
          {
            const said = refusal(r.code);
            if (said) toast(said);
          }
          return;
        }
        const said = line("social.report.received");
        if (said) toast(said);
        sheet.seal();
      }
    },
  });
}
