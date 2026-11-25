/**
 * Static sheets for the fonts, the UI kit and the composed screens, drawn from the compiled
 * frames and the built font files, the same data the page and the game read.
 */
import { PNG } from "pngjs";
import type { Compiled } from "../build/compile.ts";
import type { Atlas } from "../build/emit.ts";
import type { BuiltFont } from "../fonts.ts";
import { colorIndex, INDEX_RGB, previewLut } from "../palette.ts";
import { CLEAR, type Indexed, Rgba } from "../raster.ts";
import type { CompiledRig } from "../rig.ts";
import { renderScene, type SceneAtlas, type SceneMeta } from "../scene.ts";
import { SCENES } from "../scenes/index.ts";
import type { CompiledSprite } from "../sprite.ts";
import { type BmFont, measure, parseBmFont, place } from "./bmfont.ts";
import { FONT_SAMPLES, KIT, NUMERAL_FONTS, SHEET } from "./ui-content.ts";
import { type Kit, type Op, type Screen, shadePixels, sliceRects, swept } from "./ui-ops.ts";
import { screens } from "./ui-screens.ts";

const rgb = (name: string) => INDEX_RGB[colorIndex(name)] as readonly number[];

interface LoadedFont {
  readonly bm: BmFont;
  readonly tint: boolean;
  readonly png: PNG;
}

export class StaticKit implements Kit {
  readonly fonts = new Map<string, BmFont>();
  readonly loaded = new Map<string, LoadedFont>();
  readonly sprites = new Map<string, CompiledSprite>();
  readonly rigs = new Map<string, CompiledRig>();
  readonly meta: SceneMeta;
  readonly pixels: Map<string, SceneAtlas>;

  constructor(
    art: readonly Compiled[],
    fonts: readonly BuiltFont[],
    meta: SceneMeta,
    atlases: readonly Atlas[],
  ) {
    this.meta = meta;
    this.pixels = new Map(
      atlases.map((a) => [a.name, { w: a.png.w, h: a.png.h, data: a.png.data, frames: a.frames }]),
    );
    for (const a of art) {
      if (a.kind === "sprite") this.sprites.set(a.name, a);
      if (a.kind === "rig") this.rigs.set(a.name, a);
    }
    for (const f of fonts) {
      const bm = parseBmFont(f.xml);
      this.fonts.set(f.name, bm);
      this.loaded.set(f.name, { bm, tint: f.meta.tint, png: PNG.sync.read(f.png) });
    }
  }

  size(sprite: string): readonly [number, number] | undefined {
    return this.sprites.get(sprite)?.size;
  }

  origin(sprite: string): readonly [number, number] | undefined {
    return this.sprites.get(sprite)?.origin;
  }

  frames(sprite: string): readonly string[] {
    return [...(this.sprites.get(sprite)?.frames.keys() ?? [])];
  }

  hasLook(rig: string, look: string): boolean {
    return this.rigs.get(rig)?.looks.some((l) => l.name === look) ?? false;
  }

  img(sprite: string, frame: string): Indexed {
    const img = this.sprites.get(sprite)?.frames.get(frame);
    if (!img) throw new Error(`no frame ${sprite}/${frame}`);
    return img;
  }
}

/**
 * Draws a source region stretched to a destination region, nearest neighbour, at a scale.
 * (ox, oy) is in output pixels; everything else is in game pixels.
 */
function region(
  c: Rgba,
  img: Indexed,
  r: {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  },
  ox: number,
  oy: number,
  scale: number,
): void {
  for (let j = 0; j < r.dh; j++) {
    const sy = r.sy + Math.floor((j * r.sh) / r.dh);
    for (let i = 0; i < r.dw; i++) {
      const v = img.px[sy * img.w + r.sx + Math.floor((i * r.sw) / r.dw)] as number;
      if (v === CLEAR) continue;
      c.rect(
        ox + (r.dx + i) * scale,
        oy + (r.dy + j) * scale,
        scale,
        scale,
        INDEX_RGB[v] as readonly number[],
      );
    }
  }
}

export function drawOp(c: Rgba, kit: StaticKit, op: Op, scale: number, ox = 0, oy = 0): void {
  if (op.op === "scene") {
    const def = SCENES.find((d) => d.name === op.name);
    if (!def) throw new Error(`no scene ${op.name}`);
    const img = renderScene(def, kit.meta, kit.pixels, 0);
    const data = new Uint8Array(img.data);
    shadePixels(data, kit.meta.shade, op.shade ?? 0);
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const o = (y * img.w + x) * 4;
        c.rect(ox + x * scale, oy + y * scale, scale, scale, [
          data[o] as number,
          data[o + 1] as number,
          data[o + 2] as number,
        ]);
      }
    }
  } else if (op.op === "fill") {
    c.rect(ox + op.x * scale, oy + op.y * scale, op.w * scale, op.h * scale, rgb(op.color));
  } else if (op.op === "frame") {
    let img = kit.img(op.sprite, op.frame);
    const f = op.sweep;
    if (f !== undefined) {
      img = {
        ...img,
        px: img.px.map((v, i) =>
          swept(i % img.w, Math.floor(i / img.w), img.w, img.h, f) ? v : CLEAR,
        ),
      };
    }
    const r = { sx: 0, sy: 0, sw: img.w, sh: img.h, dx: op.x, dy: op.y, dw: img.w, dh: img.h };
    region(c, img, r, ox, oy, scale);
  } else if (op.op === "rig") {
    const look = kit.rigs.get(op.rig)?.looks.find((l) => l.name === op.look);
    const img = look?.checked.get(op.key);
    if (!look || !img) throw new Error(`no rig frame ${op.rig}:${op.look}/${op.key}`);
    const lut = previewLut(look.slots);
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const v = img.px[y * img.w + x] as number;
        if (v === CLEAR) continue;
        c.rect(
          ox + (op.x + x) * scale,
          oy + (op.y + y) * scale,
          scale,
          scale,
          lut[v] as readonly number[],
        );
      }
    }
  } else if (op.op === "slice") {
    const s = kit.sprites.get(op.sprite);
    if (!s?.slice) throw new Error(`${op.sprite} is not a nine-slice`);
    const img = kit.img(op.sprite, op.frame);
    for (const r of sliceRects(s.size, s.slice, op.w, op.h)) {
      region(c, img, { ...r, dx: r.dx + op.x, dy: r.dy + op.y }, ox, oy, scale);
    }
  } else {
    const f = kit.loaded.get(op.font);
    if (!f) throw new Error(`no font ${op.font}`);
    const tint = op.color ? rgb(op.color) : null;
    for (const g of place(f.bm, op.text, op.x, op.y)) {
      for (let y = 0; y < g.c.h; y++) {
        for (let x = 0; x < g.c.w; x++) {
          const o = ((g.c.y + y) * f.png.width + g.c.x + x) * 4;
          if ((f.png.data[o + 3] as number) === 0) continue;
          const col = f.tint && tint ? tint : [...f.png.data.subarray(o, o + 3)];
          c.rect(ox + (g.x + x) * scale, oy + (g.y + y) * scale, scale, scale, col);
        }
      }
    }
  }
}

export function renderScreen(kit: StaticKit, screen: Screen, scale: number): Rgba {
  const c = new Rgba(screen.w * scale, screen.h * scale);
  for (const op of screen.ops) drawOp(c, kit, op, scale);
  return c;
}

/** A tall canvas cropped to what was drawn. */
class Sheet {
  readonly c: Rgba;
  readonly w: number;
  y = 24;
  constructor(w: number) {
    this.w = w;
    this.c = new Rgba(w, 16000);
    this.c.rect(0, 0, w, this.c.h, rgb(SHEET.bg));
  }
  done(): Rgba {
    const out = new Rgba(this.w, this.y + 24);
    out.copy(this.c, 0, 0, this.w, this.y + 24, 0, 0);
    return out;
  }
}

function text(
  s: Sheet,
  kit: StaticKit,
  font: string,
  t: string,
  x: number,
  y: number,
  color: string,
) {
  drawOp(s.c, kit, { op: "text", font, text: t, x, y, color }, 1);
}

function head(s: Sheet, kit: StaticKit, t: string): void {
  text(s, kit, "galmuri11-bold", t, 24, s.y, SHEET.head);
  s.y += 24;
}

export function fontSheet(kit: StaticKit): Rgba {
  const s = new Sheet(1600);
  for (const face of FONT_SAMPLES) {
    const bm = kit.fonts.get(face.font);
    if (!bm) continue;
    head(s, kit, `${face.font}  ${bm.chars.size}`);
    for (const scale of [1, 3]) {
      for (const bg of [SHEET.night, SHEET.paper]) {
        const fg = bg === SHEET.paper ? SHEET.ink : SHEET.chalk;
        const h = (face.lines.length * bm.lineHeight + 8) * scale;
        const w = Math.max(...face.lines.map((l) => measure(bm, l))) + 16;
        s.c.rect(24, s.y, w * scale, h, rgb(bg));
        face.lines.forEach((l, i) => {
          drawOp(
            s.c,
            kit,
            { op: "text", font: face.font, text: l, x: 8, y: 4 + i * bm.lineHeight, color: fg },
            scale,
            24,
            s.y,
          );
        });
        s.y += h + 8;
        if (scale === 3) break;
      }
    }
    s.y += 16;
  }
  head(s, kit, "numerals");
  for (const scale of [1, 3]) {
    let x = 24;
    let rowH = 0;
    for (const [font, samples] of NUMERAL_FONTS) {
      const bm = kit.fonts.get(font);
      if (!bm) continue;
      const w = Math.max(...samples.map((t) => measure(bm, t))) + 8;
      const h = samples.length * (bm.lineHeight + 2) + 8;
      if (x + w * scale > s.w - 24) {
        x = 24;
        s.y += rowH + 8;
        rowH = 0;
      }
      s.c.rect(x, s.y, w * scale, h * scale, rgb(SHEET.ground));
      samples.forEach((t, i) => {
        drawOp(
          s.c,
          kit,
          { op: "text", font, text: t, x: 4, y: 4 + i * (bm.lineHeight + 2) },
          scale,
          x,
          s.y,
        );
      });
      x += w * scale + 16;
      rowH = Math.max(rowH, h * scale);
    }
    s.y += rowH + 16;
  }
  return s.done();
}

/** One piece of the kit: name, frames at ×1 and ×4, then any stretched sizes at ×1 and ×2. */
function kitBlock(
  kit: StaticKit,
  name: string,
  bg: string,
  sizes: readonly (readonly [number, number])[],
): Rgba | null {
  const sp = kit.sprites.get(name);
  if (!sp) return null;
  const [w, h] = sp.size;
  const frames = [...sp.frames.keys()];
  const maxW = 560;
  // Lay out first, then draw: each item is a box at a scale.
  const items: {
    x: number;
    y: number;
    draw: (c: Rgba, x: number, y: number) => void;
    w: number;
    h: number;
  }[] = [];
  let x = 0;
  let y = 14;
  let rowH = 0;
  const put = (bw: number, bh: number, draw: (c: Rgba, x: number, y: number) => void) => {
    if (x > 0 && x + bw > maxW) {
      x = 0;
      y += rowH + 4;
      rowH = 0;
    }
    items.push({ x, y, w: bw, h: bh, draw });
    x += bw + 4;
    rowH = Math.max(rowH, bh);
  };
  const newline = () => {
    if (x === 0) return;
    x = 0;
    y += rowH + 6;
    rowH = 0;
  };
  for (const f of frames) {
    put(w + 4, h + 4, (c, cx, cy) =>
      drawOp(c, kit, { op: "frame", sprite: name, frame: f, x: 2, y: 2 }, 1, cx, cy),
    );
  }
  newline();
  for (const f of frames) {
    put((w + 2) * 4, (h + 2) * 4, (c, cx, cy) =>
      drawOp(c, kit, { op: "frame", sprite: name, frame: f, x: 1, y: 1 }, 4, cx, cy),
    );
  }
  newline();
  for (const scale of [1, 2]) {
    for (const [sw, sh] of sp.slice ? sizes : []) {
      for (const f of scale === 1 ? frames : frames.slice(0, 1)) {
        put((sw + 4) * scale, (sh + 4) * scale, (c, cx, cy) =>
          drawOp(
            c,
            kit,
            { op: "slice", sprite: name, frame: f, x: 2, y: 2, w: sw, h: sh },
            scale,
            cx,
            cy,
          ),
        );
      }
    }
    newline();
  }
  const bw = Math.max(textWidthOf(kit, name) + 4, ...items.map((i) => i.x + i.w));
  const bh = Math.max(...items.map((i) => i.y + i.h));
  const c = new Rgba(bw, bh);
  c.rect(0, 0, bw, bh, rgb(SHEET.bg));
  drawOp(c, kit, { op: "text", font: "galmuri9", text: name, x: 0, y: 0, color: SHEET.dim }, 1);
  for (const i of items) {
    c.rect(i.x, i.y, i.w, i.h, rgb(bg));
    i.draw(c, i.x, i.y);
  }
  return c;
}

function textWidthOf(kit: StaticKit, t: string): number {
  const f = kit.fonts.get("galmuri9");
  return f ? measure(f, t) : 0;
}

export function kitSheet(kit: StaticKit): Rgba {
  const s = new Sheet(1600);
  for (const group of KIT) {
    head(s, kit, group.title);
    let x = 24;
    let rowH = 0;
    for (const name of group.sprites) {
      const block = kitBlock(
        kit,
        name,
        group.paper ? SHEET.paper : SHEET.ground,
        group.stretch?.[name] ?? [],
      );
      if (!block) continue;
      if (x > 24 && x + block.w > s.w - 24) {
        x = 24;
        s.y += rowH + 16;
        rowH = 0;
      }
      s.c.copy(block, 0, 0, block.w, block.h, x, s.y);
      x += block.w + 24;
      rowH = Math.max(rowH, block.h);
    }
    s.y += rowH + 24;
  }
  return s.done();
}

/** Every static UI sheet by file name. */
export function uiSheets(
  art: readonly Compiled[],
  fonts: readonly BuiltFont[],
  meta: SceneMeta,
  atlases: readonly Atlas[],
): Record<string, Rgba> {
  const kit = new StaticKit(art, fonts, meta, atlases);
  const out: Record<string, Rgba> = { fonts: fontSheet(kit), "ui-kit": kitSheet(kit) };
  for (const screen of screens(kit)) {
    out[`screen-${screen.name}`] = renderScreen(kit, screen, 1);
    out[`screen-${screen.name}@3`] = renderScreen(kit, screen, 3);
  }
  return out;
}
