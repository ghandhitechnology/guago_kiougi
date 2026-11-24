import type { Anim, SpriteDef, Vec } from "./format.ts";
import { ArtError, checkLegend, parseGrid } from "./grid.ts";
import { resolveRemap } from "./palette.ts";
import { type Indexed, indexed, remap, stamp } from "./raster.ts";

export interface CompiledSprite {
  readonly kind: "sprite";
  readonly name: string;
  readonly group: string;
  readonly size: Vec;
  readonly origin: Vec;
  readonly outline: boolean;
  readonly frames: ReadonlyMap<string, Indexed>;
  readonly anim: Readonly<Record<string, Anim>>;
}

export function defaultOrigin([w, h]: Vec): Vec {
  return [Math.floor(w / 2), h - 1];
}

export function checkAnims(
  anim: Readonly<Record<string, Anim>>,
  frames: ReadonlySet<string>,
  where: string,
): void {
  for (const [name, a] of Object.entries(anim)) {
    if (!(a.fps > 0)) throw new ArtError(`${where} › anim ${name}`, "fps must be positive");
    if (a.frames.length === 0) throw new ArtError(`${where} › anim ${name}`, "has no frames");
    for (const f of a.frames) {
      if (!frames.has(f)) throw new ArtError(`${where} › anim ${name}`, `unknown frame "${f}"`);
    }
  }
}

export function compileSprite(def: SpriteDef, name: string, where: string): CompiledSprite {
  const [w, h] = def.size;
  checkLegend(def.palette, where);
  const lone = def.lone ?? "";

  const parts = new Map<string, { img: Indexed; at: Vec }>();
  for (const [key, src] of Object.entries(def.parts ?? {})) {
    const grid = typeof src === "string" ? src : src.grid;
    const at: Vec = typeof src === "string" ? [0, 0] : src.at;
    parts.set(key, { img: parseGrid(grid, def.palette, `${where} › part ${key}`, {}, lone), at });
  }

  const frames = new Map<string, Indexed>();
  const building = new Set<string>();
  const build = (frame: string, trail: string): Indexed => {
    const done = frames.get(frame);
    if (done) return done;
    const src = def.frames[frame];
    if (src === undefined) throw new ArtError(trail, `unknown part or frame "${frame}"`);
    if (building.has(frame)) throw new ArtError(trail, `frame "${frame}" includes itself`);
    building.add(frame);
    const fw = `${where} › ${frame}`;
    let img: Indexed;
    if (typeof src === "string") {
      img = parseGrid(src, def.palette, fw, { w, h }, lone);
    } else {
      img = indexed(w, h);
      for (const p of src) {
        const [ref, dx, dy] = typeof p === "string" ? [p, 0, 0] : p;
        const part = parts.get(ref);
        if (part) stamp(img, part.img, part.at[0] + dx, part.at[1] + dy);
        else stamp(img, build(ref, fw), dx, dy);
      }
    }
    building.delete(frame);
    frames.set(frame, img);
    return img;
  };
  for (const frame of Object.keys(def.frames)) {
    if (parts.has(frame)) throw new ArtError(where, `"${frame}" is both a part and a frame`);
    build(frame, where);
  }

  const map = resolveRemap(def.recolor ?? {});
  const out = new Map<string, Indexed>();
  for (const key of Object.keys(def.frames)) {
    const img = frames.get(key) as Indexed;
    out.set(key, map.size > 0 ? remap(img, map) : img);
  }
  checkAnims(def.anim, new Set(out.keys()), where);

  return {
    kind: "sprite",
    name,
    group: def.group ?? "core",
    size: def.size,
    origin: def.origin ?? defaultOrigin(def.size),
    outline: def.outline ?? true,
    frames: out,
    anim: def.anim,
  };
}
