/**
 * Static contact sheets: the same content as the page, written as PNGs for PRs and reviews.
 */
import { join } from "node:path";
import type { Compiled } from "../build/compile.ts";
import type { Atlas } from "../build/emit.ts";
import {
  COLORS,
  colorIndex,
  hexToRgb,
  INDEX_RGB,
  previewLut,
  RAMP_LIST,
  rampEntries,
  resolveRemap,
  SLOTS,
  type Step,
  THEMES,
  type Theme,
} from "../palette.ts";
import { crop, type Indexed, type Lut, Rgba, remap } from "../raster.ts";
import type { CompiledRig } from "../rig.ts";
import { renderScene, SCREEN, type SceneAtlas, type SceneMeta } from "../scene.ts";
import { SCENES } from "../scenes/index.ts";
import type { CompiledOverlay, CompiledTerrain } from "../terrain.ts";
import { type BitmapFont, drawText, galmuriDir, loadBdf, textWidth } from "./font.ts";
import { renderOverlayPatch, renderPatch } from "./sample.ts";

export const UI = {
  bg: hexToRgb(COLORS[colorIndex("ink.deep")] as string),
  edge: hexToRgb(COLORS[colorIndex("ink.mid")] as string),
  panel: hexToRgb(COLORS[colorIndex("ink.dark")] as string),
  dim: hexToRgb(COLORS[colorIndex("ink.light")] as string),
  text: hexToRgb(COLORS[colorIndex("stone.light")] as string),
  head: hexToRgb(COLORS[colorIndex("stone.bright")] as string),
  checkA: hexToRgb(COLORS[colorIndex("stone.mid")] as string),
  checkB: hexToRgb(COLORS[colorIndex("stone.light")] as string),
};

export interface Fonts {
  readonly label: BitmapFont;
  readonly head: BitmapFont;
}

export function loadFonts(): Fonts {
  const dir = galmuriDir();
  return {
    label: loadBdf(join(dir, "Galmuri9.bdf")),
    head: loadBdf(join(dir, "Galmuri11-Bold.bdf")),
  };
}

/** A tall scratch canvas that is cropped to what was drawn. */
class Sheet {
  readonly c: Rgba;
  bottom = 0;
  constructor(w: number, h = 12000) {
    this.c = new Rgba(w, h);
    this.c.rect(0, 0, w, this.c.h, UI.bg);
  }
  mark(y: number): void {
    this.bottom = Math.max(this.bottom, y);
  }
  done(): Rgba {
    const h = this.bottom + 24;
    const out = new Rgba(this.c.w, h);
    out.copy(this.c, 0, 0, this.c.w, h, 0, 0);
    return out;
  }
}

export function checker(c: Rgba, x: number, y: number, w: number, h: number, cell: number): void {
  for (let yy = 0; yy < h; yy += cell) {
    for (let xx = 0; xx < w; xx += cell) {
      const odd = (Math.floor(xx / cell) + Math.floor(yy / cell)) % 2 === 1;
      c.rect(
        x + xx,
        y + yy,
        Math.min(cell, w - xx),
        Math.min(cell, h - yy),
        odd ? UI.checkB : UI.checkA,
      );
    }
  }
}

/** Background colours of a theme: the most common colour of each terrain's two fills. */
export function themeBackdrops(theme: Theme, terrains: readonly CompiledTerrain[]): number[] {
  const map = resolveRemap(theme.remap);
  const out: number[] = [];
  for (const t of terrains) {
    if (t.themes && !t.themes.includes(theme.name)) continue;
    for (const mask of [15, 0]) {
      const tile = t.tiles[t.masks[mask]?.[0] as number];
      if (!tile) continue;
      const counts = new Map<number, number>();
      for (const v of remap(tile, map).px) counts.set(v, (counts.get(v) ?? 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (top && !out.includes(top[0])) out.push(top[0]);
    }
  }
  return out;
}

export function paletteSheet(f: Fonts): Rgba {
  const sw = 32;
  const left = 96;
  const cols = Math.max(...RAMP_LIST.map((r) => rampEntries(r).length));
  const cell = sw + 12;
  const s = new Sheet(left + cols * cell + 24);
  let y = 20;
  drawText(s.c, f.head, "해솔 64", 20, y, UI.head);
  y += 32;
  for (const ramp of RAMP_LIST) {
    drawText(s.c, f.label, ramp.name, 20, y + 10, UI.text);
    rampEntries(ramp).forEach(([step, ix], i) => {
      const x = left + i * cell;
      s.c.rect(x, y, sw, sw, UI.edge);
      s.c.rect(x + 1, y + 1, sw - 2, sw - 2, INDEX_RGB[ix] as readonly number[]);
      const extra = !ramp.steps.includes(step as Step);
      drawText(s.c, f.label, step, x, y + sw + 2, extra ? UI.head : UI.dim);
    });
    y += sw + 18;
  }
  y += 16;
  drawText(s.c, f.head, "slots", 20, y, UI.head);
  y += 28;
  for (const slot of SLOTS) {
    drawText(s.c, f.label, slot.name, 20, y, UI.text);
    y += 18;
    let x = 20;
    for (const [option, names] of Object.entries(slot.options)) {
      const w = Math.max(4 * 10, textWidth(f.label, option));
      if (x + w > s.c.w - 20) {
        x = 20;
        y += 40;
      }
      s.c.rect(x - 1, y - 1, names.length * 10 + 2, 18, UI.edge);
      names.forEach((n, i) => {
        s.c.rect(x + i * 10, y, 10, 16, INDEX_RGB[colorIndex(n)] as readonly number[]);
      });
      drawText(s.c, f.label, option, x, y + 20, UI.dim);
      x += w + 16;
    }
    y += 44;
  }
  s.mark(y);
  return s.done();
}

function frameStrip(
  s: Sheet,
  f: Fonts,
  frames: readonly (readonly [string, Indexed])[],
  lut: Lut,
  y: number,
  backdrops: readonly (readonly number[] | null)[],
): number {
  const fw = Math.max(...frames.map(([, i]) => i.w));
  const fh = Math.max(...frames.map(([, i]) => i.h));
  const gap = 8;
  let x = 20;
  // ×1 on a checkerboard.
  for (const [, img] of frames) {
    checker(s.c, x, y, fw, fh, 4);
    s.c.draw(img, x, y, lut, 1);
    x += fw + gap;
  }
  y += fh + 10;
  for (const bg of backdrops) {
    x = 20;
    let maxX = x;
    for (const [name, img] of frames) {
      if (x + fw * 4 > s.c.w - 20) {
        x = 20;
        y += fh * 4 + 26;
      }
      if (bg) s.c.rect(x, y, fw * 4, fh * 4, bg);
      else checker(s.c, x, y, fw * 4, fh * 4, 8);
      s.c.draw(img, x, y, lut, 4);
      if (bg === backdrops[0]) drawText(s.c, f.label, name, x, y + fh * 4 + 4, UI.dim);
      x += fw * 4 + gap;
      maxX = Math.max(maxX, x);
    }
    y += fh * 4 + (bg === backdrops[0] ? 24 : gap);
  }
  s.mark(y);
  return y;
}

export function spriteSheet(f: Fonts, art: readonly Compiled[]): Rgba {
  const terrains = art.filter((a): a is CompiledTerrain => a.kind === "terrain");
  const backdrops: (readonly number[] | null)[] = [null];
  for (const theme of THEMES) {
    for (const ix of themeBackdrops(theme, terrains))
      backdrops.push(INDEX_RGB[ix] as readonly number[]);
  }
  const s = new Sheet(1200);
  let y = 20;
  for (const a of art) {
    if (a.kind !== "sprite" || a.group === "ui" || a.group === "combat") continue;
    drawText(s.c, f.head, a.name, 20, y, UI.head);
    y += 26;
    y = frameStrip(s, f, [...a.frames], INDEX_RGB, y, backdrops);
    for (const [name, anim] of Object.entries(a.anim)) {
      drawText(s.c, f.label, `${name}  ${anim.fps} fps`, 20, y, UI.text);
      y += 16;
      let x = 20;
      for (const fr of anim.frames) {
        const img = a.frames.get(fr) as Indexed;
        checker(s.c, x, y, img.w * 2, img.h * 2, 4);
        s.c.draw(img, x, y, INDEX_RGB, 2);
        x += img.w * 2 + 4;
      }
      y += a.size[1] * 2 + 10;
    }
    y += 16;
    s.mark(y);
  }
  return s.done();
}

export function rigSheet(f: Fonts, art: readonly Compiled[]): Rgba {
  const s = new Sheet(1200);
  let y = 20;
  for (const r of art) {
    if (r.kind !== "rig") continue;
    y = drawRig(s, f, r, y);
  }
  s.mark(y);
  return s.done();
}

function drawRig(s: Sheet, f: Fonts, r: CompiledRig, y0: number): number {
  let y = y0;
  for (const look of r.looks) {
    const lut = previewLut(look.slots);
    drawText(s.c, f.head, `${r.name} ${look.name}`, 20, y, UI.head);
    y += 26;
    for (const dir of r.directions) {
      drawText(s.c, f.label, dir, 20, y, UI.text);
      y += 16;
      const frames = r.frameNames.map(
        (fr) => [fr, look.frames.get(`${dir}/${fr}`) as Indexed] as const,
      );
      y = frameStrip(s, f, frames, lut, y, [null]);
    }
    y += 12;
  }
  return y;
}

export function terrainSheet(f: Fonts, art: readonly Compiled[]): Rgba {
  const s = new Sheet(1200);
  let y = 20;
  const inThemes = (names: readonly string[] | null) =>
    THEMES.filter((th) => !names || names.includes(th.name));
  for (const t of art) {
    if (t.kind !== "terrain") continue;
    for (const theme of inThemes(t.themes)) {
      drawText(s.c, f.head, `${t.name} · ${theme.name}`, 20, y, UI.head);
      y += 26;
      const patch = renderPatch(t, theme);
      s.c.draw(patch, 20, y, INDEX_RGB, 1);
      s.c.draw(patch, 20 + patch.w + 24, y, INDEX_RGB, 3);
      y += patch.h * 3 + 20;
      const map = resolveRemap(theme.remap);
      for (let m = 0; m < 16; m++) {
        const x0 = 20 + (m % 8) * 140;
        const yy = y + Math.floor(m / 8) * 100;
        drawText(s.c, f.label, String(m), x0, yy, UI.dim);
        (t.masks[m] ?? []).slice(0, 3).forEach((ti, k) => {
          s.c.draw(remap(t.tiles[ti] as Indexed, map), x0 + k * 42, yy + 16, INDEX_RGB, 2);
        });
      }
      y += 200;
      for (const tone of t.tones) {
        drawText(s.c, f.label, tone.name, 20, y, UI.dim);
        let tx = 20;
        tone.masks.forEach((list) => {
          const ti = list[0];
          if (ti === undefined) return;
          checker(s.c, tx, y + 16, 32, 32, 4);
          s.c.draw(remap(t.tiles[ti] as Indexed, map), tx, y + 16, INDEX_RGB, 2);
          tx += 38;
        });
        y += 60;
      }
      let x = 20;
      for (const d of t.decals) {
        checker(s.c, x, y, d.img.w * 4, d.img.h * 4, 4);
        s.c.draw(remap(d.img, map), x, y, INDEX_RGB, 4);
        drawText(s.c, f.label, d.name, x, y + d.img.h * 4 + 4, UI.dim);
        x += Math.max(d.img.w * 4, textWidth(f.label, d.name)) + 20;
      }
      y += 80;
    }
  }
  const under = art.find((a): a is CompiledTerrain => a.kind === "terrain");
  for (const o of art) {
    if (o.kind !== "overlay" || !under) continue;
    for (const theme of inThemes(o.themes)) {
      drawText(s.c, f.head, `${o.name} · ${theme.name}`, 20, y, UI.head);
      y += 26;
      const patch = renderOverlayPatch(o as CompiledOverlay, under, theme);
      s.c.draw(patch, 20, y, INDEX_RGB, 1);
      s.c.draw(patch, 20 + patch.w + 24, y, INDEX_RGB, 3);
      y += patch.h * 3 + 24;
    }
  }
  s.mark(y);
  return s.done();
}

/** Every scene at ×1 and ×3, drawn from the built atlases at time zero. */
export function sceneSheet(f: Fonts, meta: SceneMeta, atlases: readonly Atlas[]): Rgba {
  const pixels = new Map<string, SceneAtlas>(
    atlases.map((a) => [a.name, { w: a.png.w, h: a.png.h, data: a.png.data, frames: a.frames }]),
  );
  const s = new Sheet(SCREEN.w * 3 + 40);
  let y = 20;
  for (const def of SCENES) {
    const img = renderScene(def, meta, pixels, 0);
    for (const w of img.warnings) console.warn(`${def.name}: ${w}`);
    const one = new Rgba(img.w, img.h);
    one.data.set(img.data);
    drawText(s.c, f.head, def.name, 20, y, UI.head);
    y += 26;
    s.c.copy(one, 0, 0, one.w, one.h, 20, y);
    y += one.h + 16;
    for (let yy = 0; yy < one.h; yy++) {
      for (let xx = 0; xx < one.w; xx++) {
        const o = (yy * one.w + xx) * 4;
        s.c.rect(20 + xx * 3, y + yy * 3, 3, 3, [
          one.data[o] as number,
          one.data[o + 1] as number,
          one.data[o + 2] as number,
        ]);
      }
    }
    y += one.h * 3 + 32;
  }
  s.mark(y);
  return s.done();
}

/** One PNG per scene at ×1, exactly one game screen. */
export function sceneScreens(meta: SceneMeta, atlases: readonly Atlas[]): Map<string, Rgba> {
  const pixels = new Map<string, SceneAtlas>(
    atlases.map((a) => [a.name, { w: a.png.w, h: a.png.h, data: a.png.data, frames: a.frames }]),
  );
  const out = new Map<string, Rgba>();
  for (const def of SCENES) {
    const img = renderScene(def, meta, pixels, 0);
    const one = new Rgba(img.w, img.h);
    one.data.set(img.data);
    out.set(def.name, one);
  }
  return out;
}

/** The two grounds every combat effect must read on: the field at night and Greek dirt. */
export function combatGrounds(art: readonly Compiled[]): { name: string; patch: Indexed }[] {
  const terrain = (name: string) =>
    art.find((a): a is CompiledTerrain => a.kind === "terrain" && a.name === name);
  const theme = (name: string) => THEMES.find((t) => t.name === name) as Theme;
  const lower = { w: 30, h: 12, cells: new Array(30 * 12).fill(0) };
  const out: { name: string; patch: Indexed }[] = [];
  const field = terrain("lawn-field");
  const greek = terrain("marble-dust");
  if (field)
    out.push({ name: "field-night", patch: renderPatch(field, theme("field-night"), lower) });
  if (greek) out.push({ name: "greece", patch: renderPatch(greek, theme("greece"), lower) });
  return out;
}

/**
 * Every combat effect (the `combat` atlas), each animation's frames at ×1 and ×3 on the dark
 * field and on Greek ground. Light meant for additive blending is marked `add`.
 */
export function combatSheet(f: Fonts, art: readonly Compiled[]): Rgba {
  const grounds = combatGrounds(art);
  const s = new Sheet(1600, 40000);
  let y = 20;
  const gap = 6;
  let gx = 0;
  const ground = (g: Indexed, x: number, y0: number, w: number, h: number, scale: number) => {
    gx = (gx + 37) % Math.max(1, g.w - w);
    s.c.draw(crop(g, gx, (gx * 7) % Math.max(1, g.h - h), w, h), x, y0, INDEX_RGB, scale);
  };
  for (const a of art) {
    if (a.kind !== "sprite" || a.group !== "combat") continue;
    drawText(s.c, f.head, a.blend ? `${a.name}  add` : a.name, 20, y, UI.head);
    y += 26;
    const [w, h] = a.size;
    for (const [name, anim] of Object.entries(a.anim)) {
      drawText(
        s.c,
        f.label,
        `${name}  ${anim.fps} fps${anim.loop === false ? "" : "  loop"}`,
        20,
        y,
        UI.text,
      );
      y += 16;
      const imgs = anim.frames.map((fr) => a.frames.get(fr) as Indexed);
      let x = 20;
      for (const g of grounds) {
        for (const img of imgs) {
          ground(g.patch, x, y, w, h, 1);
          s.c.draw(img, x, y, INDEX_RGB, 1);
          x += w + 2;
        }
        x += 16;
      }
      y += h + 8;
      for (const g of grounds) {
        x = 20;
        for (const img of imgs) {
          if (x + w * 3 > s.c.w - 20) {
            x = 20;
            y += h * 3 + gap;
          }
          ground(g.patch, x, y, w, h, 3);
          s.c.draw(img, x, y, INDEX_RGB, 3);
          x += w * 3 + gap;
        }
        y += h * 3 + gap;
      }
      y += 8;
    }
    y += 12;
    s.mark(y);
  }
  return s.done();
}
