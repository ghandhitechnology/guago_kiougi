/**
 * The UI sections of the contact sheet page: fonts, the kit, and the composed screens. Like
 * the rest of the page it draws only from the build output (atlases, art.json and the font
 * files), so what shows here is what the game will load.
 */

import { renderScene, type SceneAtlas, type SceneMeta } from "../scene.ts";
import { SCENES } from "../scenes/index.ts";
import { type BmFont, measure, parseBmFont, place } from "./bmfont.ts";
import { FONT_SAMPLES, KIT, NUMERAL_SAMPLES, SHEET } from "./ui-content.ts";
import { type Kit, type Op, type Screen, shadePixels, sliceRects, swept } from "./ui-ops.ts";
import { screens } from "./ui-screens.ts";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Frame {
  frame: Rect;
  spriteSourceSize: Rect;
  sourceSize: { w: number; h: number };
}
interface Meta {
  palette: { ramps: Record<string, Record<string, string>> };
  slots: Record<
    string,
    { keys: Record<string, string>; options: Record<string, Record<string, string>> }
  >;
  atlases: string[];
  sprites: Record<
    string,
    {
      atlas: string;
      size: [number, number];
      origin: [number, number];
      frames: string[];
      slice?: { left: number; right: number; top: number; bottom: number };
    }
  >;
  rigs: Record<
    string,
    {
      atlas: string;
      size: [number, number];
      layers: string[];
      looks: Record<string, { parts: Record<string, string>; slots: Record<string, string> }>;
    }
  >;
  fonts: Record<string, { image: string; data: string; tint: boolean }>;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function image(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

class PageKit implements Kit {
  readonly fonts = new Map<string, BmFont>();
  readonly meta: Meta;
  readonly atlases: Map<string, { img: HTMLImageElement; frames: Record<string, Frame> }>;
  readonly fontImages: Map<string, HTMLImageElement>;
  readonly tinted = new Map<string, HTMLCanvasElement>();
  readonly looks = new Map<string, HTMLCanvasElement>();
  readonly scenes = new Map<string, HTMLCanvasElement>();
  readonly pixels = new Map<string, SceneAtlas>();

  constructor(
    meta: Meta,
    atlases: Map<string, { img: HTMLImageElement; frames: Record<string, Frame> }>,
    fonts: Map<string, { bm: BmFont; img: HTMLImageElement }>,
  ) {
    this.meta = meta;
    this.atlases = atlases;
    this.fontImages = new Map();
    for (const [name, f] of fonts) {
      this.fonts.set(name, f.bm);
      this.fontImages.set(name, f.img);
    }
    for (const [name, a] of atlases) {
      const c = canvas(a.img.width, a.img.height);
      const ctx = ctx2d(c);
      ctx.drawImage(a.img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      this.pixels.set(name, { w: c.width, h: c.height, data, frames: a.frames });
    }
  }

  /** A scene at time zero, `shade` palette steps darker. */
  scene(name: string, shade: number): HTMLCanvasElement {
    const key = `${name}:${shade}`;
    const done = this.scenes.get(key);
    if (done) return done;
    const def = SCENES.find((d) => d.name === name);
    if (!def) throw new Error(`no scene ${name}`);
    const img = renderScene(def, this.meta as unknown as SceneMeta, this.pixels, 0);
    const data = new Uint8ClampedArray(img.data);
    shadePixels(data, (this.meta as unknown as SceneMeta).shade, shade);
    const c = canvas(img.w, img.h);
    ctx2d(c).putImageData(new ImageData(data, img.w, img.h), 0, 0);
    this.scenes.set(key, c);
    return c;
  }

  origin(sprite: string): readonly [number, number] | undefined {
    return this.meta.sprites[sprite]?.origin;
  }

  size(sprite: string): readonly [number, number] | undefined {
    return this.meta.sprites[sprite]?.size;
  }

  frames(sprite: string): readonly string[] {
    return (this.meta.sprites[sprite]?.frames ?? []).map((f) => f.slice(sprite.length + 1));
  }

  hasLook(rig: string, look: string): boolean {
    return Boolean(this.meta.rigs[rig]?.looks[look]);
  }

  color(name: string): string {
    const [ramp = "", step = ""] = name.split(".");
    const hex = this.meta.palette.ramps[ramp]?.[step];
    if (!hex) throw new Error(`unknown colour ${name}`);
    return hex;
  }

  frame(sprite: string, frame: string): { img: HTMLImageElement; f: Frame } {
    const sp = this.meta.sprites[sprite];
    const a = sp && this.atlases.get(sp.atlas);
    const f = a?.frames[`${sprite}/${frame}`];
    if (!a || !f) throw new Error(`missing frame ${sprite}/${frame}`);
    return { img: a.img, f };
  }

  /** The font atlas, recoloured for tinted fonts the way Phaser's tint does on white. */
  fontImage(font: string, color?: string): CanvasImageSource {
    const img = this.fontImages.get(font) as HTMLImageElement;
    if (!color || !this.meta.fonts[font]?.tint) return img;
    const key = `${font}:${color}`;
    let c = this.tinted.get(key);
    if (!c) {
      c = canvas(img.width, img.height);
      const ctx = ctx2d(c);
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = this.color(color);
      ctx.fillRect(0, 0, c.width, c.height);
      this.tinted.set(key, c);
    }
    return c;
  }

  /** A rig look's frame, layers stacked without the shadow, slot keys swapped. */
  look(rig: string, lookName: string, key: string): HTMLCanvasElement {
    const id = `${rig}:${lookName}/${key}`;
    const done = this.looks.get(id);
    if (done) return done;
    const r = this.meta.rigs[rig];
    const look = r?.looks[lookName];
    if (!r || !look) throw new Error(`no look ${id}`);
    const c = canvas(r.size[0], r.size[1]);
    const ctx = ctx2d(c);
    const a = this.atlases.get(r.atlas);
    for (const layer of r.layers) {
      const part = look.parts[layer];
      const f = part && a?.frames[`${rig}/${layer}/${part}/${key}`];
      if (layer === "shadow" || !a || !f) continue;
      ctx.drawImage(
        a.img,
        f.frame.x,
        f.frame.y,
        f.frame.w,
        f.frame.h,
        f.spriteSourceSize.x,
        f.spriteSourceSize.y,
        f.frame.w,
        f.frame.h,
      );
    }
    const swap = new Map<number, [number, number, number]>();
    for (const [slot, def] of Object.entries(this.meta.slots)) {
      const option = def.options[look.slots[slot] ?? Object.keys(def.options)[0] ?? ""];
      if (!option) continue;
      for (const [step, keyHex] of Object.entries(def.keys)) {
        const [kr, kg, kb] = hexRgb(keyHex);
        swap.set((kr << 16) | (kg << 8) | kb, hexRgb(option[step] as string));
      }
    }
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const to = swap.get(
        ((px[i] as number) << 16) | ((px[i + 1] as number) << 8) | (px[i + 2] as number),
      );
      if (to) [px[i], px[i + 1], px[i + 2]] = to;
    }
    ctx.putImageData(data, 0, 0);
    this.looks.set(id, c);
    return c;
  }

  draw(ctx: CanvasRenderingContext2D, op: Op): void {
    if (op.op === "scene") {
      ctx.drawImage(this.scene(op.name, op.shade ?? 0), 0, 0);
    } else if (op.op === "fill") {
      ctx.fillStyle = this.color(op.color);
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.op === "frame") {
      const { img, f } = this.frame(op.sprite, op.frame);
      const src = canvas(f.sourceSize.w, f.sourceSize.h);
      const sctx = ctx2d(src);
      sctx.drawImage(
        img,
        f.frame.x,
        f.frame.y,
        f.frame.w,
        f.frame.h,
        f.spriteSourceSize.x,
        f.spriteSourceSize.y,
        f.frame.w,
        f.frame.h,
      );
      const part = op.sweep;
      if (part !== undefined) {
        const data = sctx.getImageData(0, 0, src.width, src.height);
        for (let i = 0; i < src.width * src.height; i++) {
          if (!swept(i % src.width, Math.floor(i / src.width), src.width, src.height, part)) {
            data.data[i * 4 + 3] = 0;
          }
        }
        sctx.putImageData(data, 0, 0);
      }
      ctx.drawImage(src, op.x, op.y);
    } else if (op.op === "slice") {
      const s = this.meta.sprites[op.sprite]?.slice;
      if (!s) throw new Error(`${op.sprite} is not a nine-slice`);
      const { img, f } = this.frame(op.sprite, op.frame);
      const rects = sliceRects(
        [f.sourceSize.w, f.sourceSize.h],
        [s.left, s.right, s.top, s.bottom],
        op.w,
        op.h,
      );
      for (const r of rects) {
        ctx.drawImage(
          img,
          f.frame.x + r.sx,
          f.frame.y + r.sy,
          r.sw,
          r.sh,
          op.x + r.dx,
          op.y + r.dy,
          r.dw,
          r.dh,
        );
      }
    } else if (op.op === "rig") {
      ctx.drawImage(this.look(op.rig, op.look, op.key), op.x, op.y);
    } else {
      const bm = this.fonts.get(op.font);
      if (!bm) throw new Error(`no font ${op.font}`);
      const src = this.fontImage(op.font, op.color);
      for (const g of place(bm, op.text, op.x, op.y)) {
        ctx.drawImage(src, g.c.x, g.c.y, g.c.w, g.c.h, g.x, g.y, g.c.w, g.c.h);
      }
    }
  }

  render(w: number, h: number, ops: readonly Op[], bg?: string): HTMLCanvasElement {
    const c = canvas(w, h);
    const ctx = ctx2d(c);
    if (bg) {
      ctx.fillStyle = this.color(bg);
      ctx.fillRect(0, 0, w, h);
    }
    for (const op of ops) this.draw(ctx, op);
    return c;
  }
}

/** A nearest-neighbour enlargement. */
function scaled(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const c = canvas(src.width * scale, src.height * scale);
  ctx2d(c).drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function figure(child: HTMLElement, label?: string): HTMLElement {
  const fig = el("figure");
  fig.append(child);
  if (label) fig.append(el("figcaption", "", label));
  return fig;
}

function row(parent: HTMLElement, label?: string): HTMLElement {
  if (label) parent.append(el("h3", "", label));
  const r = el("div", "row");
  parent.append(r);
  return r;
}

function section(id: string, title: string): HTMLElement {
  const s = el("section");
  s.id = id;
  s.append(el("h2", "", title));
  document.body.append(s);
  return s;
}

function fontsSection(kit: PageKit): void {
  const s = section("fonts", "fonts");
  for (const face of FONT_SAMPLES) {
    const bm = kit.fonts.get(face.font);
    if (!bm) continue;
    const box = el("article");
    box.id = `font-${face.font}`;
    box.append(el("h3", "name", `${face.font} · ${bm.chars.size}`));
    const w = Math.max(...face.lines.map((l) => measure(bm, l))) + 16;
    const h = face.lines.length * bm.lineHeight + 8;
    const sample = (bg: string, fg: string) =>
      kit.render(
        w,
        h,
        face.lines.map(
          (text, i) =>
            ({
              op: "text",
              font: face.font,
              text,
              x: 8,
              y: 4 + i * bm.lineHeight,
              color: fg,
            }) as const,
        ),
        bg,
      );
    const night = sample(SHEET.night, SHEET.chalk);
    const paper = sample(SHEET.paper, SHEET.ink);
    const r = row(box);
    r.append(figure(night, "×1"), figure(paper, "×1"));
    row(box).append(figure(scaled(night, 3), "×3"));
    s.append(box);
  }
  const box = el("article");
  box.id = "font-numerals";
  box.append(el("h3", "name", "damage numerals"));
  const ones = row(box);
  const threes = row(box);
  for (const font of ["dmg-small", "dmg-small-crit", "dmg", "dmg-crit"]) {
    const bm = kit.fonts.get(font);
    if (!bm) continue;
    const w = Math.max(...NUMERAL_SAMPLES.map((t) => measure(bm, t))) + 8;
    const h = NUMERAL_SAMPLES.length * (bm.lineHeight + 2) + 8;
    const c = kit.render(
      w,
      h,
      NUMERAL_SAMPLES.map(
        (text, i) => ({ op: "text", font, text, x: 4, y: 4 + i * (bm.lineHeight + 2) }) as const,
      ),
      SHEET.ground,
    );
    ones.append(figure(c, font));
    threes.append(figure(scaled(c, 3)));
  }
  s.append(box);
}

function kitSection(kit: PageKit): void {
  const s = section("ui-kit", "ui kit");
  for (const group of KIT) {
    const box = el("article");
    box.id = `kit-${group.title.replace(/\s+/g, "-")}`;
    box.append(el("h3", "name", group.title));
    const bg = group.paper ? SHEET.paper : SHEET.ground;
    for (const name of group.sprites) {
      const sp = kit.meta.sprites[name];
      if (!sp) continue;
      const [w, h] = sp.size;
      const frames = kit.frames(name);
      const ones = row(box, name);
      for (const f of frames) {
        ones.append(
          figure(
            kit.render(w + 4, h + 4, [{ op: "frame", sprite: name, frame: f, x: 2, y: 2 }], bg),
          ),
        );
      }
      const big = row(box);
      for (const f of frames) {
        const c = kit.render(
          w + 2,
          h + 2,
          [{ op: "frame", sprite: name, frame: f, x: 1, y: 1 }],
          bg,
        );
        big.append(figure(scaled(c, 4), f));
      }
      const sizes = sp.slice ? (group.stretch?.[name] ?? []) : [];
      if (sizes.length === 0) continue;
      const stretched = row(box);
      for (const [sw, sh] of sizes) {
        for (const f of frames) {
          const c = kit.render(
            sw + 4,
            sh + 4,
            [{ op: "slice", sprite: name, frame: f, x: 2, y: 2, w: sw, h: sh }],
            bg,
          );
          stretched.append(figure(c, `${sw}×${sh}`));
        }
      }
      const twice = row(box);
      for (const [sw, sh] of sizes) {
        const f = frames[0] as string;
        const c = kit.render(
          sw + 4,
          sh + 4,
          [{ op: "slice", sprite: name, frame: f, x: 2, y: 2, w: sw, h: sh }],
          bg,
        );
        twice.append(figure(scaled(c, 2), "×2"));
      }
    }
    s.append(box);
  }
}

function screensSection(kit: PageKit): void {
  const s = section("screens", "screens");
  for (const screen of screens(kit) as Screen[]) {
    const box = el("article");
    box.id = `screen-${screen.name}`;
    box.append(el("h3", "name", screen.name));
    const c = kit.render(screen.w, screen.h, screen.ops);
    row(box).append(figure(c, "×1"));
    row(box).append(figure(scaled(c, 3), "×3"));
    s.append(box);
  }
}

/** Loads what the UI sections need and appends them to the page. */
export async function uiSections(): Promise<void> {
  const meta: Meta = await (await fetch("dist/art.json")).json();
  const atlases = new Map<string, { img: HTMLImageElement; frames: Record<string, Frame> }>();
  await Promise.all(
    meta.atlases.map(async (name) => {
      const [json, img] = await Promise.all([
        fetch(`dist/${name}.json`).then((r) => r.json()),
        image(`dist/${name}.png`),
      ]);
      atlases.set(name, { img, frames: json.frames });
    }),
  );
  const fonts = new Map<string, { bm: BmFont; img: HTMLImageElement }>();
  await Promise.all(
    Object.entries(meta.fonts).map(async ([name, f]) => {
      const [xml, img] = await Promise.all([
        fetch(`dist/${f.data}`).then((r) => r.text()),
        image(`dist/${f.image}`),
      ]);
      fonts.set(name, { bm: parseBmFont(xml), img });
    }),
  );
  const kit = new PageKit(meta, atlases, fonts);
  screensSection(kit);
  fontsSection(kit);
  kitSection(kit);
}
