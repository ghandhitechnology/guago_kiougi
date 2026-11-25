/**
 * The contact sheet page. Runs in the browser and draws only from the built atlases and
 * art.json, the same files the game loads, so what shows here is what ships.
 */

import type { BuiltMap } from "@guago/content";
import { dualMask, pickTiles, pickTone, scatterDecals } from "../dualgrid.ts";
import { drawOrder, outlineColors, packRgba, stackLayers } from "../layer-order.ts";
import { renderScene, SCREEN, type SceneAtlas, type SceneMeta } from "../scene.ts";
import { SCENES } from "../scenes/index.ts";
import { CLUB, type Crest, randomLooks, type WornLook } from "./looks.ts";
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
      under?: Record<string, Record<string, string>>;
      clean?: boolean;
      anchors?: Record<string, Record<string, [number, number]>>;
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
const OUTLINES = outlineColors(meta);
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

/** A flat colour, the checkerboard, or a ground tile repeated at the drawing's scale. */
type Backdrop = "checker" | string | HTMLCanvasElement;

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: Backdrop,
  cell: number,
): void {
  if (typeof bg !== "string") {
    const scale = cell / 2;
    const tw = bg.width * scale;
    const th = bg.height * scale;
    for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) ctx.drawImage(bg, x, y, tw, th);
    return;
  }
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

// Combat effects ----------------------------------------------------------------------------

/**
 * Every combat effect playing at ×1 and ×3 on the two grounds it must read on: the field at
 * night and sunlit Greek dirt. Effects meant for additive blending say `add`; the sheet draws
 * them plainly, as the palette-locked art is.
 */
{
  const ground = (set: string, theme: string): HTMLCanvasElement | string => {
    const index = meta.tilesets[set]?.masks[0]?.[0];
    if (index === undefined || !atlases.has(`tiles-${theme}`)) return "checker";
    // Four tiles square, so the texture does not repeat every 16 pixels.
    const c = canvas(32, 32);
    const ctx = ctx2d(c);
    const list = meta.tilesets[set]?.masks[0] ?? [index];
    for (let k = 0; k < 4; k++) {
      ctx.drawImage(
        tileImage(theme, list[k % list.length] as number),
        (k % 2) * 16,
        Math.floor(k / 2) * 16,
      );
    }
    return c;
  };
  const grounds = [ground("lawn-field", "field-night"), ground("marble-dust", "greece")];
  for (const [group, title] of [
    ["combat", "combat effects"],
    ["combat-evolved", "evolved effects"],
  ] as const) {
    const s = section(`${group}-effects`, title);
    for (const [name, sp] of Object.entries(meta.sprites)) {
      if (sp.atlas !== group) continue;
      const box = el("article");
      box.id = name;
      box.append(el("h3", "name", (sp as { blend?: string }).blend ? `${name}  add` : name));
      const frames = sp.frames.map((f) => frameImage(sp.atlas, f));
      const many = Object.keys(sp.anims).length > 6;
      Object.entries(sp.anims).forEach(([anim, a], index) => {
        const imgs = a.frames.map((f) => frames[sp.frames.indexOf(f)] as HTMLCanvasElement);
        const r = row(box, `${anim} ${a.fps}fps`);
        for (const scale of many && index >= 3 ? [1] : [1, 3]) {
          for (const g of grounds) r.append(cell(player(imgs, a.fps, scale, g)));
        }
      });
      s.append(box);
    }
  }
}

// Portraits ---------------------------------------------------------------------------------

/**
 * The cast review: every portrait's neutral face at ×1, then ×3, with the speaker's name, and
 * every expression playing at ×3.
 */
{
  const s = section("portraits", "portraits");
  const names: Record<string, string> = await (await fetch("speakers.json")).json();
  const list = Object.entries(meta.sprites).filter(([, sp]) => sp.atlas === "portraits");
  for (const scale of [1, 3]) {
    const r = row(s, `×${scale}`);
    for (const [name, sp] of list) {
      const neutral = sp.frames.find((f) => f.endsWith("/neutral")) ?? (sp.frames[0] as string);
      r.append(
        cell(
          show(frameImage(sp.atlas, neutral), scale, meta.palette.ramps.ink?.dark ?? "checker"),
          names[name] ?? name,
        ),
      );
    }
  }
  const faces = row(s, "expressions");
  for (const [name, sp] of list) {
    for (const [anim, a] of Object.entries(sp.anims)) {
      const imgs = a.frames.map((f) => frameImage(sp.atlas, f));
      faces.append(
        cell(
          player(imgs, a.fps, 3, meta.palette.ramps.ink?.dark ?? "checker"),
          `${names[name] ?? name} ${anim}`,
        ),
      );
    }
  }
}

// Sprites -----------------------------------------------------------------------------------

{
  const s = section("sprites", "sprites");
  for (const [name, sp] of Object.entries(meta.sprites)) {
    if (sp.atlas === "ui" || sp.atlas.startsWith("combat")) continue;
    const box = el("article");
    box.id = name;
    box.append(el("h3", "name", name));
    const frames = sp.frames.map((f) => frameImage(sp.atlas, f));
    // Large art (an era boss's 160 px parts) at ×2 and on one ground: at ×4 on every theme's
    // ground it would be thousands of 640 px canvases.
    const large = frames.some((fr) => fr.width > 96 || fr.height > 96);
    const z = large ? 2 : 4;
    const ones = row(box);
    sp.frames.forEach((_, i) => {
      ones.append(cell(show(frames[i] as HTMLCanvasElement, 1, "checker")));
    });
    const big = row(box);
    sp.frames.forEach((f, i) => {
      big.append(cell(show(frames[i] as HTMLCanvasElement, z, "checker"), f.split("/")[1]));
    });
    for (const b of large ? backdrops.slice(0, 1) : backdrops) {
      const r = row(box);
      for (const fr of frames) r.append(cell(show(fr, z, b.color)));
    }
    const anims = row(box);
    for (const [anim, a] of Object.entries(sp.anims)) {
      const imgs = a.frames.map((f) => frames[sp.frames.indexOf(f)] as HTMLCanvasElement);
      const pair = el("div", "pair");
      pair.append(
        player(imgs, a.fps, z, "checker"),
        player(imgs, a.fps, z, backdrops[0]?.color ?? "checker"),
      );
      anims.append(cell(pair, `${anim} ${a.fps}fps`));
    }
    s.append(box);
  }
}

// Rigs --------------------------------------------------------------------------------------

function composite(
  rigName: string,
  look: { parts: Record<string, string>; slots: Record<string, string>; crest?: Crest },
  key: string,
): HTMLCanvasElement {
  const rig = meta.rigs[rigName];
  if (!rig) throw new Error(rigName);
  const [w, h] = rig.size;
  const c = canvas(w, h);
  const ctx = ctx2d(c);
  const order = drawOrder(rig.layers, look.parts, (l, p) => rig.under?.[l]?.[p]);
  const shadow = look.parts.shadow;
  if (order.includes("shadow") && shadow) {
    ctx.drawImage(frameImage(rig.atlas, `${rigName}/shadow/${shadow}/${key}`), 0, 0);
  }
  const layers = order
    .filter((layer) => layer !== "shadow" && look.parts[layer])
    .map((layer) => {
      const img = frameImage(rig.atlas, `${rigName}/${layer}/${look.parts[layer]}/${key}`);
      // A club's crest goes on the 과잠's back at its anchor, as part of the jacket layer.
      const at = rig.anchors?.[`${layer}/${look.parts[layer]}/emblem`]?.[key];
      if (layer === "jacket" && look.crest && at) {
        const ictx = ctx2d(img);
        for (const f of [`shape/${look.crest.shape}`, `symbol/${look.crest.symbol}`]) {
          ictx.drawImage(frameImage("ui", `crest/${f}`), at[0], at[1]);
        }
      }
      return packRgba(ctx2d(img).getImageData(0, 0, w, h).data);
    });
  const { px } = stackLayers(layers, w, h, -1, rig.clean ?? false, (v) => OUTLINES.has(v));
  const data = ctx.getImageData(0, 0, w, h);
  px.forEach((v, i) => {
    if (v >= 0) data.data.set([v >> 16, (v >> 8) & 255, v & 255, 255], i * 4);
  });
  ctx.putImageData(data, 0, 0);
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

// Wardrobe ----------------------------------------------------------------------------------
// The student rig as players will see it: twelve hairstyles from every side, the six faces,
// twenty random looks from the whole set, every animation, and a club in its crests.

{
  const rig = meta.rigs.student;
  const first = rig ? Object.values(rig.looks)[0] : undefined;
  if (rig && first) {
    const s = section("wardrobe", "wardrobe");
    const base: WornLook = { parts: first.parts, slots: { ...first.slots, hair: "brown" } };
    const dirs = rig.directions;
    const frameOf = (look: WornLook, dir: string, f: string) =>
      composite("student", look as never, `${dir}/${f}`);
    const anim = (look: WornLook, dir: string, name: string, z: number) => {
      const a = rig.anims[name];
      if (!a) return el("div");
      return player(
        a.frames.map((f) => frameOf(look, dir, f)),
        a.fps,
        z,
        "checker",
      );
    };

    const hairs = rig.parts.hair ?? [];
    const hairBox = el("article");
    hairBox.append(el("h3", "name", "hair"));
    for (const dir of ["up", "down", "side"]) {
      const r = row(hairBox, dir);
      for (const hair of hairs) {
        const look = { ...base, parts: { ...base.parts, hair } };
        r.append(cell(show(frameOf(look, dir, "idle0"), 4, "checker"), hair));
      }
      const ones = row(hairBox);
      for (const hair of hairs) {
        ones.append(
          show(frameOf({ ...base, parts: { ...base.parts, hair } }, dir, "idle0"), 1, "checker"),
        );
      }
    }
    s.append(hairBox);

    const faceBox = el("article");
    faceBox.append(el("h3", "name", "faces"));
    for (const face of rig.parts.face ?? []) {
      const look = { ...base, parts: { ...base.parts, face } };
      const r = row(faceBox, face);
      for (const f of [
        "idle0",
        "attack1",
        "page0",
        "hit",
        "yawn0",
        "clap0",
        "sleepy0",
        "meltdown0",
      ]) {
        for (const dir of ["down", "side"]) r.append(show(frameOf(look, dir, f), 4, "checker"));
      }
    }
    s.append(faceBox);

    const slotsOf = (name: string) => Object.keys(meta.slots[name]?.options ?? {});
    const crestKinds = (k: string) => [
      ...new Set(
        (meta.sprites.crest?.frames ?? [])
          .map((f) => f.slice("crest/".length))
          .filter((f) => f.startsWith(`${k}/`))
          .map((f) => f.split("/")[1] as string),
      ),
    ];
    const looks = randomLooks({
      parts: rig.parts,
      slots: Object.fromEntries(Object.keys(meta.slots).map((n) => [n, slotsOf(n)])),
      crests: { shape: crestKinds("shape"), symbol: crestKinds("symbol") },
    });
    const lookBox = el("article");
    lookBox.append(el("h3", "name", "twenty random looks"));
    const lr = row(lookBox);
    for (const look of looks) {
      const pair = el("div", "pair");
      for (const dir of dirs) pair.append(anim(look, dir, "walk", 3));
      lr.append(cell(pair));
    }
    s.append(lookBox);

    const animBox = el("article");
    animBox.append(el("h3", "name", "animations"));
    const who: WornLook[] = [base, looks[3] ?? base, CLUB[1] ?? base];
    for (const name of Object.keys(rig.anims)) {
      const r = row(animBox, name);
      for (const look of who) {
        const pair = el("div", "pair");
        for (const dir of dirs) pair.append(anim(look, dir, name, 3));
        r.append(cell(pair));
      }
    }
    s.append(animBox);

    const clubBox = el("article");
    clubBox.append(el("h3", "name", "a club"));
    const cr = row(clubBox);
    for (const look of CLUB) {
      const pair = el("div", "pair");
      for (const dir of ["down", "up"]) pair.append(anim(look, dir, "idle", 5));
      cr.append(cell(pair));
    }
    s.append(clubBox);
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
