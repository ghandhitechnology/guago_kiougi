import type * as Phaser from "phaser";
import { type FontKey, fontMeta, paint } from "./theme.ts";

interface Glyph {
  readonly xAdvance: number;
}

function glyphs(scene: Phaser.Scene, font: FontKey): Readonly<Record<number, Glyph>> {
  const entry = scene.cache.bitmapFont.get(font) as
    | { data: { chars: Record<number, Glyph> } }
    | undefined;
  if (!entry) throw new Error(`font ${font} is not loaded`);
  return entry.data.chars;
}

/** Width of `text` in pixels: the sum of advances, without the trailing gap of the last glyph. */
export function measure(scene: Phaser.Scene, font: FontKey, text: string): number {
  const chars = glyphs(scene, font);
  let w = 0;
  for (const ch of text) w += chars[ch.codePointAt(0) ?? 0]?.xAdvance ?? 0;
  return Math.max(0, w - 1);
}

/** Rows from a line's top to the top of a Hangul syllable, and the syllable's height. */
export function ink(font: FontKey): { top: number; height: number; line: number } {
  const m = fontMeta(font);
  return { top: m.ink.top, height: m.ink.height, line: m.lineHeight };
}

/** Punctuation that may not start a line. */
const CLOSERS = new Set([..."., !?)]」』…·:;%"]);

/**
 * Breaks Korean text into lines no wider than `width`: between words where it can, inside a
 * word only when one word is wider than the line, and never with punctuation leading a line.
 */
export function wrap(scene: Phaser.Scene, font: FontKey, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (measure(scene, font, next) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      // A word longer than the line: break between syllables.
      let part = "";
      for (const ch of word) {
        const grown = part + ch;
        if (measure(scene, font, grown) > width && part && !CLOSERS.has(ch)) {
          lines.push(part);
          part = ch;
        } else part = grown;
      }
      line = part;
    }
    lines.push(line);
  }
  return lines;
}

export interface LabelStyle {
  readonly font?: FontKey;
  readonly color?: string;
  /** Wraps at this width. */
  readonly width?: number;
  readonly align?: "left" | "center" | "right";
  /** Extra pixels between wrapped lines. */
  readonly leading?: number;
}

/**
 * Bitmap text on whole pixels, tinted a palette colour. `y` is where the top of a Hangul
 * syllable's ink sits, so labels in different fonts line up by what the eye sees.
 */
export class Label {
  readonly obj: Phaser.GameObjects.BitmapText;
  private readonly font: FontKey;
  private readonly style: LabelStyle;
  private inkY: number;
  private x: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, style: LabelStyle = {}) {
    this.font = style.font ?? "galmuri11";
    this.style = style;
    this.x = Math.round(x);
    this.inkY = Math.round(y);
    this.obj = scene.add.bitmapText(0, 0, this.font, "").setOrigin(0);
    this.color(style.color ?? "ink.dark");
    this.set(text);
  }

  get scene(): Phaser.Scene {
    return this.obj.scene;
  }

  /** Width of the widest line. */
  get width(): number {
    return Math.max(0, ...this.lines().map((l) => measure(this.scene, this.font, l)));
  }

  get height(): number {
    const { line } = ink(this.font);
    return this.lines().length * (line + (this.style.leading ?? 0));
  }

  private lines(): string[] {
    return this.obj.text.split("\n");
  }

  set(text: string): this {
    const lines =
      this.style.width === undefined ? [text] : wrap(this.scene, this.font, text, this.style.width);
    this.obj.setText(lines.join("\n"));
    if (this.style.leading) this.obj.setLineSpacing(this.style.leading);
    const align = this.style.align ?? "left";
    this.obj.align = align === "left" ? 0 : align === "center" ? 1 : 2;
    this.place();
    return this;
  }

  color(name: string): this {
    this.obj.setTint(paint(name));
    return this;
  }

  at(x: number, y: number): this {
    this.x = Math.round(x);
    this.inkY = Math.round(y);
    this.place();
    return this;
  }

  /** Places by the left edge, or the centre or right edge when aligned that way with a width. */
  private place(): void {
    const { top } = ink(this.font);
    const w = this.style.width;
    let x = this.x;
    if (w !== undefined && this.style.align === "center") x += Math.floor((w - this.width) / 2);
    if (w !== undefined && this.style.align === "right") x += w - this.width;
    this.obj.setPosition(x, this.inkY - top);
  }
}
