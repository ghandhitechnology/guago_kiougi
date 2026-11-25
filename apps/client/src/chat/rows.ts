import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { Label, measure, wrap } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import type { LogLine, Tone } from "./log.ts";

/**
 * Chat lines as drawn rows: the speaker's name in their channel's colour, the words, and masked
 * words as a strip of ink. Chat is text and only text: every piece is the bitmap font, so nothing
 * in it can be a link or markup (PLAN §12, §22).
 */

export const FONT = "galmuri9" as const;
export const ROW = 12;

export const NAME_COLOR: Readonly<Record<Tone, string>> = {
  world: "navy.pale",
  near: "stone.bright",
  whisper: "plum.pale",
  party: "sea.pale",
  club: "grass.pale",
  system: "gold.light",
  refusal: "red.light",
};
const TEXT_COLOR: Readonly<Record<Tone, string>> = {
  world: "stone.pale",
  near: "stone.pale",
  whisper: "plum.pale",
  party: "sea.pale",
  club: "grass.pale",
  system: "gold.light",
  refusal: "red.light",
};

/** One visual row: pieces of text, masked runs and a clickable name, left to right. */
interface Piece {
  readonly kind: "text" | "name" | "mask";
  readonly text: string;
  readonly color: string;
}
export interface Row {
  readonly pieces: readonly Piece[];
  readonly line: LogLine;
}

/** A log line as rows of pieces, wrapped to `width`. */
export function toRows(scene: Phaser.Scene, line: LogLine, width: number): Row[] {
  const name = line.from
    ? line.mine && line.to
      ? t("chat.to", { name: line.to })
      : line.from.name
    : undefined;
  const head = name ? `${name} ` : "";
  const full = head + line.text;
  const wrapped = wrap(scene, FONT, full, width);
  const rows: Row[] = [];
  let at = 0;
  for (const text of wrapped) {
    // Find where this wrapped row sits in the full line (wrapping drops the spaces it breaks on).
    const start = full.indexOf(text, at);
    const from = start < 0 ? at : start;
    at = from + text.length;
    const pieces: Piece[] = [];
    let i = from;
    while (i < at) {
      if (i < head.length) {
        const end = Math.min(at, head.length);
        pieces.push({
          kind: "name",
          text: full.slice(i, end).trimEnd(),
          color: NAME_COLOR[line.mine ? "system" : line.tone],
        });
        i = end;
        continue;
      }
      const star = full[i] === "*";
      let j = i;
      while (j < at && (full[j] === "*") === star) j++;
      pieces.push({
        kind: star ? "mask" : "text",
        text: full.slice(i, j),
        color: TEXT_COLOR[line.tone],
      });
      i = j;
    }
    rows.push({ pieces, line });
  }
  return rows;
}

export interface DrawRowOptions {
  /** Over the world, with no card: every piece gets an ink shadow a pixel down and right. */
  readonly shadow?: boolean;
  /** A name was clicked: whisper to them. */
  readonly onName?: (name: string) => void;
}

/** Draws one row into `into` with its top left at (x, y). */
export function drawRow(
  scene: Phaser.Scene,
  into: Phaser.GameObjects.Container,
  row: Row,
  x: number,
  y: number,
  opts: DrawRowOptions = {},
): void {
  for (const piece of row.pieces) {
    if (piece.kind === "mask") {
      // A word the filter took out: a strip of ink over where it was, not asterisks.
      const w = measure(scene, FONT, piece.text);
      if (opts.shadow) {
        into.add(scene.add.rectangle(x + 1, y + 4, w, 7, paint("ink.deep")).setOrigin(0));
      }
      into.add(scene.add.rectangle(x, y + 3, w, 7, paint("ink.light")).setOrigin(0));
      x += w + 1;
      continue;
    }
    if (opts.shadow) {
      into.add(new Label(scene, x + 1, y + 3, piece.text, { font: FONT, color: "ink.deep" }).obj);
    }
    const label = new Label(scene, x, y + 2, piece.text, { font: FONT, color: piece.color });
    into.add(label.obj);
    const onName = opts.onName;
    if (piece.kind === "name" && row.line.from && !row.line.mine && onName) {
      const name = row.line.from.name;
      const zone = scene.add
        .zone(x - 1, y, label.width + 2, ROW)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerup", () => onName(name));
      into.add(zone);
    }
    x += label.width + (piece.kind === "name" ? 5 : 1);
  }
}
