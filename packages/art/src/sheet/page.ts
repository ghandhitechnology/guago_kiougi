/**
 * The contact sheet page. Runs in the browser and draws only from the built atlases and
 * art.json, the same files the game loads, so what shows here is what ships.
 */

import type { BuiltMap } from "@guago/content";
import { dualMask, pickTiles, pickTone, scatterDecals } from "../dualgrid.ts";
import { renderScene, SCREEN, type SceneAtlas, type SceneMeta } from "../scene.ts";
import { SCENES } from "../scenes/index.ts";
import { mapViews, overlay } from "./map-view.ts";
import { sampleGrid } from "./sample-grid.ts";
import { uiSections } from "./ui-page.ts";

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
interface Anim {
  frames: string[];
  fps: number;
  loop: boolean;
}
interface Meta {
  palette: { colors: string[]; ramps: Record<string, Record<string, string>> };
  slots: Record<
    string,
    { keys: Record<string, string>; options: Record<string, Record<string, string>> }
  >;
  atlases: string[];
  themes: string[];
  sprites: Record<
    string,
    {
      atlas: string;
      size: [number, number];
      shadow: string | null;
      frames: string[];
      anims: Record<string, Anim>;
    }
  >;
  rigs: Record<
    string,
    {
      atlas: string;
      size: [number, number];
      directions: string[];
      layers: string[];
      parts: Record<string, string[]>;
      frames: string[];
      anims: Record<string, Anim>;
      looks: Record<string, { parts: Record<string, string>; slots: Record<string, string> }>;
    }
  >;
  tileGrid: { tile: number; margin: number; spacing: number; columns: number };
  tilesets: Record<
    string,
    {
      themes: string[] | null;
      masks: number[][];
      tones: { name: string; on: "upper" | "lower"; band: [number, number]; masks: number[][] }[];
      decals: {
        name: string;
        on: "upper" | "lower";
        density: number;
        w: number;
        h: number;
        frame: string;
      }[];
    }
  >;
}
interface Atlas {
  img: HTMLImageElement;
  frames: Record<string, Frame>;
}
type FullMeta = Meta & SceneMeta & { overlays: Record<string, { themes: string[] | null }> };

const css = getComputedStyle(document.documentElement);
const CHECK_A = css.getPropertyValue("--check-a").trim();
const CHECK_B = css.getPropertyValue("--check-b").trim();

const meta: FullMeta = await (await fetch("dist/art.json")).json();
const atlases = new Map<string, Atlas>();
await Promise.all(
  meta.atlases.map(async (name) => {
    const img = new Image();
    img.src = `dist/${name}.png`;
    const [json] = await Promise.all([(await fetch(`dist/${name}.json`)).json(), img.decode()]);
    atlases.set(name, { img, frames: json.frames });
  }),
);

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

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = el("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** One atlas frame restored to its full source size. */
function frameImage(atlas: string, key: string): HTMLCanvasElement {
  const a = atlases.get(atlas);
  const f = a?.frames[key];
  if (!a || !f) throw new Error(`missing frame ${atlas}:${key}`);
  const c = canvas(f.sourceSize.w, f.sourceSize.h);
  ctx2d(c).drawImage(
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
  return c;
}

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Swaps slot key colours for the chosen options, as the game's composite step will. */
function recolor(c: HTMLCanvasElement, choice: Record<string, string>): void {
  const map = new Map<number, [number, number, number]>();
  for (const [slot, def] of Object.entries(meta.slots)) {
    const option = def.options[choice[slot] ?? Object.keys(def.options)[0] ?? ""];
    if (!option) continue;
    for (const [step, key] of Object.entries(def.keys)) {
      const [r, g, b] = hexRgb(key);
      map.set((r << 16) | (g << 8) | b, hexRgb(option[step] as string));
    }
  }
  const ctx = ctx2d(c);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const to = map.get(
      ((px[i] as number) << 16) | ((px[i + 1] as number) << 8) | (px[i + 2] as number),
    );
    if (to) [px[i], px[i + 1], px[i + 2]] = to;
  }
  ctx.putImageData(data, 0, 0);
}

type Backdrop = "checker" | string;

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: Backdrop,
  cell: number,
): void {
  if (bg !== "checker") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      ctx.fillStyle = ((x + y) / cell) % 2 === 0 ? CHECK_A : CHECK_B;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

/** A scaled copy on a backdrop. Nearest neighbour only. */
function show(src: HTMLCanvasElement, scale: number, bg: Backdrop): HTMLCanvasElement {
  const c = canvas(src.width * scale, src.height * scale);
  const ctx = ctx2d(c);
  paintBackdrop(ctx, c.width, c.height, bg, 2 * scale);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const players: {
  c: HTMLCanvasElement;
  frames: HTMLCanvasElement[];
  fps: number;
  scale: number;
  bg: Backdrop;
}[] = [];

function player(
  frames: HTMLCanvasElement[],
  fps: number,
  scale: number,
  bg: Backdrop,
): HTMLCanvasElement {
  const first = frames[0] as HTMLCanvasElement;
  const c = canvas(first.width * scale, first.height * scale);
  players.push({ c, frames, fps, scale, bg });
  return c;
}

function tick(now: number): void {
  for (const p of players) {
    const f = p.frames[Math.floor((now / 1000) * p.fps) % p.frames.length] as HTMLCanvasElement;
    const ctx = ctx2d(p.c);
    paintBackdrop(ctx, p.c.width, p.c.height, p.bg, 2 * p.scale);
    ctx.drawImage(f, 0, 0, p.c.width, p.c.height);
  }
  requestAnimationFrame(tick);
}

function cell(child: HTMLElement, label?: string): HTMLElement {
  const fig = el("figure");
  fig.append(child);
  if (label) fig.append(el("figcaption", "", label));
  return fig;
}

function section(id: string, title: string): HTMLElement {
  const s = el("section");
  s.id = id;
  s.append(el("h2", "", title));
  document.body.append(s);
  return s;
}

function row(parent: HTMLElement, label?: string): HTMLElement {
  if (label) parent.append(el("h3", "", label));
  const r = el("div", "row");
  parent.append(r);
  return r;
}

// Theme backdrops: the dominant colour of each terrain's two fill tiles, per theme.
function dominant(c: HTMLCanvasElement): string {
  const px = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
  const counts = new Map<string, number>();
  for (let i = 0; i < px.length; i += 4) {
    const k = `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#000";
}

function tileImage(theme: string, index: number): HTMLCanvasElement {
  const a = atlases.get(`tiles-${theme}`) as Atlas;
  const { tile, margin, spacing, columns } = meta.tileGrid;
  const c = canvas(tile, tile);
  const x = margin + (index % columns) * (tile + spacing);
  const y = margin + Math.floor(index / columns) * (tile + spacing);
  ctx2d(c).drawImage(a.img, x, y, tile, tile, 0, 0, tile, tile);
  return c;
}

const backdrops: { theme: string; color: string }[] = [];
for (const theme of meta.themes) {
  for (const set of Object.values(meta.tilesets)) {
    if (set.themes && !set.themes.includes(theme)) continue;
    for (const mask of [15, 0]) {
      const index = set.masks[mask]?.[0];
      if (index === undefined) continue;
      const color = dominant(tileImage(theme, index));
      if (!backdrops.some((b) => b.color === color)) backdrops.push({ theme, color });
    }
  }
}

// Atlas pixels for scenes and maps ------------------------------------------------------------

const pixels = new Map<string, SceneAtlas>();
for (const [name, a] of atlases) {
  const c = canvas(a.img.width, a.img.height);
  const ctx = ctx2d(c);
  ctx.drawImage(a.img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  pixels.set(name, { w: c.width, h: c.height, data, frames: a.frames as SceneAtlas["frames"] });
}

function put(target: HTMLCanvasElement, img: { w: number; h: number; data: ArrayLike<number> }) {
  ctx2d(target).putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
}

// Maps --------------------------------------------------------------------------------------

/**
 * Each built map whole at ×1, a screen at ×3 around every spawn and the landmark (playing), and
 * the overlay of what the server sees: collision, portals, spawns, interactables and zones.
 */
{
  const s = section("maps", "maps");
  const ids: string[] = await (await fetch("dist/maps/index.json")).json();
  const maps: BuiltMap[] = await Promise.all(
    ids.map(async (id) => (await fetch(`dist/maps/${id}.json`)).json()),
  );
  const views = maps.map((map) => {
    const box = el("article");
    box.id = `map-${map.id}`;
    box.append(el("h3", "name", `${map.name} · ${map.id} · ${map.time.clock}`));
    const whole = renderScene(map.scene, meta, pixels, 0);
    if (whole.warnings.length > 0) console.warn(map.id, whole.warnings);
    const one = canvas(whole.w, whole.h);
    put(one, whole);
    box.append(cell(one, "×1"));
    const o = overlay(map, whole, 2, meta.palette.ramps);
    const over = canvas(o.w, o.h);
    put(over, o);
    const octx = ctx2d(over);
    octx.font = "12px Galmuri9";
    octx.textBaseline = "top";
    for (const l of o.labels) {
      octx.fillStyle = css.getPropertyValue("--bg").trim();
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const)
        octx.fillText(l.text, l.x + dx, l.y + dy);
      octx.fillStyle = `rgb(${l.color.join(",")})`;
      octx.fillText(l.text, l.x, l.y);
    }
    const crops = mapViews(map).map((v) => {
      const c = canvas(v.rect.w * 3, v.rect.h * 3);
      box.append(cell(c, `${v.name} ×3`));
      return { v, c, small: canvas(v.rect.w, v.rect.h) };
    });
    box.append(cell(over, "collision, portals, spawns, places ×2"));
    s.append(box);
    return { map, crops };
  });
  let last = -1;
  const paint = (now: number): void => {
    const step = Math.floor(now / 100);
    if (step !== last) {
      last = step;
      for (const { map, crops } of views) {
        for (const { v, c, small } of crops) {
          put(small, renderScene(map.scene, meta, pixels, step / 10, v.rect));
          ctx2d(c).drawImage(small, 0, 0, c.width, c.height);
        }
      }
    }
    requestAnimationFrame(paint);
  };
  paint(0);
}

// Scenes ------------------------------------------------------------------------------------

{
  const s = section("scenes", "scenes");
  const views = SCENES.map((def) => {
    const box = el("article");
    box.id = def.name;
    box.append(el("h3", "name", def.name));
    const one = canvas(SCREEN.w, SCREEN.h);
    const three = canvas(SCREEN.w * 3, SCREEN.h * 3);
    const r = row(box);
    r.append(cell(one, "×1"));
    box.append(cell(three, "×3"));
    s.append(box);
    return { def, one, three };
  });
  let last = -1;
  const paint = (now: number): void => {
    // Ten steps a second: every environment animation runs at a multiple of it.
    const step = Math.floor(now / 100);
    if (step !== last) {
      last = step;
      for (const v of views) {
        const img = renderScene(v.def, meta, pixels, step / 10);
        if (step === 0 && img.warnings.length > 0) console.warn(v.def.name, img.warnings);
        put(v.one, img);
        ctx2d(v.three).drawImage(v.one, 0, 0, v.three.width, v.three.height);
      }
    }
    requestAnimationFrame(paint);
  };
  paint(0);
}

// Palette -----------------------------------------------------------------------------------

{
  const s = section("palette", "해솔 64");
  for (const [name, ramp] of Object.entries(meta.palette.ramps)) {
    const r = row(s);
    r.append(el("span", "ramp", name));
    for (const [step, hex] of Object.entries(ramp)) {
      const sw = el("i", "swatch");
      sw.style.background = hex;
      sw.title = `${name}.${step} ${hex}`;
      r.append(cell(sw, step));
    }
  }
  for (const [name, slot] of Object.entries(meta.slots)) {
    const r = row(s, name);
    for (const [option, colors] of Object.entries(slot.options)) {
      const strip = el("div", "strip");
      for (const hex of Object.values(colors)) {
        const sw = el("i", "chip");
        sw.style.background = hex;
        strip.append(sw);
      }
      r.append(cell(strip, option));
    }
  }
}

// Sprites -----------------------------------------------------------------------------------

{
  const s = section("sprites", "sprites");
  for (const [name, sp] of Object.entries(meta.sprites)) {
    if (sp.atlas === "ui") continue;
    const box = el("article");
    box.id = name;
    box.append(el("h3", "name", name));
    const frames = sp.frames.map((f) => frameImage(sp.atlas, f));
    const ones = row(box);
    sp.frames.forEach((_, i) => {
      ones.append(cell(show(frames[i] as HTMLCanvasElement, 1, "checker")));
    });
    const big = row(box);
    sp.frames.forEach((f, i) => {
      big.append(cell(show(frames[i] as HTMLCanvasElement, 4, "checker"), f.split("/")[1]));
    });
    for (const b of backdrops) {
      const r = row(box);
      for (const fr of frames) r.append(cell(show(fr, 4, b.color)));
    }
    const anims = row(box);
    for (const [anim, a] of Object.entries(sp.anims)) {
      const imgs = a.frames.map((f) => frames[sp.frames.indexOf(f)] as HTMLCanvasElement);
      const pair = el("div", "pair");
      pair.append(
        player(imgs, a.fps, 4, "checker"),
        player(imgs, a.fps, 4, backdrops[0]?.color ?? "checker"),
      );
      anims.append(cell(pair, `${anim} ${a.fps}fps`));
    }
    s.append(box);
  }
}

// Rigs --------------------------------------------------------------------------------------

function composite(
  rigName: string,
  look: { parts: Record<string, string>; slots: Record<string, string> },
  key: string,
): HTMLCanvasElement {
  const rig = meta.rigs[rigName];
  if (!rig) throw new Error(rigName);
  const c = canvas(rig.size[0], rig.size[1]);
  const ctx = ctx2d(c);
  for (const layer of rig.layers) {
    const part = look.parts[layer];
    if (part) ctx.drawImage(frameImage(rig.atlas, `${rigName}/${layer}/${part}/${key}`), 0, 0);
  }
  recolor(c, look.slots);
  return c;
}

{
  const s = section("rigs", "rigs");
  for (const [rigName, rig] of Object.entries(meta.rigs)) {
    for (const [lookName, look] of Object.entries(rig.looks)) {
      const box = el("article");
      box.append(el("h3", "name", `${rigName} ${lookName}`));
      for (const dir of rig.directions) {
        const frames = rig.frames.map((f) => composite(rigName, look, `${dir}/${f}`));
        const anims = row(box, dir);
        for (const [anim, a] of Object.entries(rig.anims)) {
          const imgs = a.frames.map((f) => frames[rig.frames.indexOf(f)] as HTMLCanvasElement);
          anims.append(cell(player(imgs, a.fps, 4, "checker"), `${anim} ${a.fps}fps`));
        }
        const ones = row(box);
        for (const f of frames) ones.append(cell(show(f, 1, "checker")));
        const big = row(box);
        frames.forEach((f, i) => {
          big.append(cell(show(f, 4, backdrops[0]?.color ?? "checker"), rig.frames[i]));
        });
      }
      s.append(box);
    }
    // Every option of every slot on one look, walking.
    const base = Object.values(rig.looks).at(-1);
    if (!base) continue;
    const box = el("article");
    box.append(el("h3", "name", `${rigName} slots`));
    for (const [slot, def] of Object.entries(meta.slots)) {
      const r = row(box, slot);
      for (const option of Object.keys(def.options)) {
        const look = { parts: base.parts, slots: { ...base.slots, [slot]: option } };
        const walk = rig.anims.walk ?? Object.values(rig.anims)[0];
        if (!walk) continue;
        const imgs = walk.frames.map((f) => composite(rigName, look, `down/${f}`));
        r.append(cell(player(imgs, walk.fps, 3, "checker"), option));
      }
    }
    s.append(box);
  }
}

// Terrain -----------------------------------------------------------------------------------

{
  const s = section("terrain", "terrain");
  const grid = sampleGrid();
  const { tile } = meta.tileGrid;
  for (const [name, set] of Object.entries(meta.tilesets)) {
    for (const theme of set.themes ?? meta.themes) {
      const box = el("article");
      box.id = `${name}-${theme}`;
      box.append(el("h3", "name", `${name} · ${theme}`));
      const patch = canvas(grid.w * tile, grid.h * tile);
      const ctx = ctx2d(patch);
      const picks = pickTiles(grid, 1, set.masks, 7);
      for (let j = 0; j <= grid.h; j++) {
        for (let i = 0; i <= grid.w; i++) {
          ctx.drawImage(
            tileImage(theme, picks[j * (grid.w + 1) + i] as number),
            i * tile - tile / 2,
            j * tile - tile / 2,
          );
        }
      }
      for (const tone of set.tones) {
        const tonePicks = pickTone(grid, 1, tone, 7);
        tonePicks.forEach((index, k) => {
          if (index < 0) return;
          const i = k % (grid.w + 1);
          const j = Math.floor(k / (grid.w + 1));
          ctx.drawImage(tileImage(theme, index), i * tile - tile / 2, j * tile - tile / 2);
        });
      }
      const rules = set.decals.map((d) => ({ on: d.on, density: d.density, w: d.w, h: d.h }));
      for (const p of scatterDecals(grid, 1, rules, 7)) {
        const d = set.decals[p.decal];
        if (d) ctx.drawImage(frameImage(`tiles-${theme}`, d.frame), p.x, p.y);
      }
      const r = row(box);
      r.append(cell(show(patch, 1, "checker"), "×1"), cell(show(patch, 3, "checker"), "×3"));
      const masks = row(box);
      set.masks.forEach((list, m) => {
        const strip = el("div", "pair");
        for (const index of list) strip.append(show(tileImage(theme, index), 3, "checker"));
        masks.append(cell(strip, String(m)));
      });
      for (const tone of set.tones) {
        const tones = row(box);
        tone.masks.forEach((list, m) => {
          if (list.length === 0) return;
          const strip = el("div", "pair");
          for (const index of list) strip.append(show(tileImage(theme, index), 3, "checker"));
          tones.append(cell(strip, `${tone.name} ${m}`));
        });
      }
      const decals = row(box);
      for (const d of set.decals)
        decals.append(cell(show(frameImage(`tiles-${theme}`, d.frame), 4, "checker"), d.name));
      s.append(box);
    }
  }
  // Overlays over the first theme's lawn fill, on the sample grid.
  for (const [name, o] of Object.entries(meta.overlays)) {
    for (const theme of o.themes ?? meta.themes) {
      const box = el("article");
      box.id = `${name}-${theme}`;
      box.append(el("h3", "name", `${name} · ${theme}`));
      const patch = canvas(grid.w * tile, grid.h * tile);
      const ctx = ctx2d(patch);
      const under = Object.values(meta.tilesets)[0];
      for (let j = 0; j <= grid.h; j++) {
        for (let i = 0; i <= grid.w; i++) {
          const fill = under?.masks[15]?.[0];
          if (fill !== undefined) ctx.drawImage(tileImage(theme, fill), i * tile - 8, j * tile - 8);
          const index = o.masks[dualMask(grid, 0, i, j)]?.[0];
          if (index !== undefined)
            ctx.drawImage(tileImage(theme, index), i * tile - 8, j * tile - 8);
        }
      }
      const r = row(box);
      r.append(cell(show(patch, 1, "checker"), "×1"), cell(show(patch, 3, "checker"), "×3"));
      s.append(box);
    }
  }
}

await uiSections();
requestAnimationFrame(tick);
document.body.dataset.ready = "1";
