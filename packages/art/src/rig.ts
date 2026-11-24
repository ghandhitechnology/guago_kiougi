import type { Anim, BonePose, Dir, PartDef, Poses, RigDef, Vec } from "./format.ts";
import { ArtError, checkLegend, parseGrid } from "./grid.ts";
import { type Indexed, indexed, stamp } from "./raster.ts";
import { checkAnims, defaultOrigin } from "./sprite.ts";

/** A part rendered alone for every direction and frame. Keys are `down/walk0`. */
export interface RigPart {
  readonly layer: string;
  readonly name: string;
  readonly frames: ReadonlyMap<string, Indexed>;
}

export interface RigLook {
  readonly name: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly slots: Readonly<Record<string, string>>;
  /** Composited look, and the same without unchecked layers. Keys are `down/walk0`. */
  readonly frames: ReadonlyMap<string, Indexed>;
  readonly checked: ReadonlyMap<string, Indexed>;
}

export interface CompiledRig {
  readonly kind: "rig";
  readonly name: string;
  readonly group: string;
  readonly size: Vec;
  readonly origin: Vec;
  readonly directions: readonly Dir[];
  readonly layers: readonly string[];
  readonly frameNames: readonly string[];
  readonly anim: Readonly<Record<string, Anim>>;
  readonly parts: readonly RigPart[];
  readonly looks: readonly RigLook[];
}

interface ParsedPiece {
  readonly at: ReadonlyMap<Dir, Vec>;
  /** Direction to pose name to grid. A null direction draws nothing. */
  readonly grids: ReadonlyMap<Dir, ReadonlyMap<string, Indexed> | null>;
}

/** Resolved position and pose of every bone for one direction and frame. */
export type Skeleton = ReadonlyMap<string, { readonly offset: Vec; readonly pose: string }>;

/** Resolves a frame's bone poses, adding offsets down the parent chain. */
export function resolveSkeleton(
  bones: Readonly<Record<string, string | null>>,
  poses: Poses,
  where: string,
): Skeleton {
  for (const bone of Object.keys(poses)) {
    if (!(bone in bones)) throw new ArtError(where, `unknown bone "${bone}"`);
  }
  const own = (bone: string): { offset: Vec; pose: string } => {
    const p: BonePose | undefined = poses[bone];
    if (p === undefined) return { offset: [0, 0], pose: "rest" };
    if (typeof p === "string") return { offset: [0, 0], pose: p };
    if (typeof p[0] === "string") return { offset: [p[1], p[2] as number], pose: p[0] };
    return { offset: [p[0], p[1]], pose: "rest" };
  };
  const out = new Map<string, { offset: Vec; pose: string }>();
  for (const bone of Object.keys(bones)) {
    let { offset, pose } = own(bone);
    const seen = new Set([bone]);
    for (let parent = bones[bone]; parent; parent = bones[parent]) {
      if (!(parent in bones))
        throw new ArtError(where, `bone "${bone}" has unknown parent "${parent}"`);
      if (seen.has(parent)) throw new ArtError(where, `bone "${bone}" has a parent loop`);
      seen.add(parent);
      const o = own(parent).offset;
      offset = [offset[0] + o[0], offset[1] + o[1]];
    }
    out.set(bone, { offset, pose });
  }
  return out;
}

function parsePart(def: PartDef, rig: RigDef, where: string): ReadonlyMap<string, ParsedPiece> {
  checkLegend(def.palette, where);
  const out = new Map<string, ParsedPiece>();
  for (const [bone, piece] of Object.entries(def.pieces)) {
    if (!(bone in rig.bones)) throw new ArtError(where, `unknown bone "${bone}"`);
    const grids = new Map<Dir, Map<string, Indexed> | null>();
    const at = new Map<Dir, Vec>();
    for (const dir of rig.directions) {
      const a = piece.at;
      at.set(
        dir,
        a === undefined
          ? [0, 0]
          : Array.isArray(a)
            ? (a as Vec)
            : ((a as Partial<Record<Dir, Vec>>)[dir] ?? [0, 0]),
      );
      const pw = `${where} › ${bone} › ${dir}`;
      const src = piece[dir];
      if (src === undefined) throw new ArtError(pw, "missing; use null if nothing shows");
      if (src === null) {
        grids.set(dir, null);
        continue;
      }
      const byPose = typeof src === "string" ? { rest: src } : src;
      if (!("rest" in byPose)) throw new ArtError(pw, 'a pose map needs a "rest" grid');
      const poses = new Map<string, Indexed>();
      let width: number | undefined;
      for (const [pose, grid] of Object.entries(byPose)) {
        const img = parseGrid(
          grid,
          def.palette,
          `${pw} › ${pose}`,
          width === undefined ? {} : { w: width },
          def.lone,
        );
        width ??= img.w;
        poses.set(pose, img);
      }
      grids.set(dir, poses);
    }
    out.set(bone, { at, grids });
  }
  return out;
}

/** Draws one part for one direction and skeleton. */
export function drawPart(
  pieces: ReadonlyMap<string, ParsedPiece>,
  bones: readonly string[],
  dir: Dir,
  skeleton: Skeleton,
  size: Vec,
): Indexed {
  const img = indexed(size[0], size[1]);
  for (const bone of bones) {
    const piece = pieces.get(bone);
    const byPose = piece?.grids.get(dir);
    if (!piece || !byPose) continue;
    const s = skeleton.get(bone);
    if (!s) continue;
    const grid = byPose.get(s.pose) ?? (byPose.get("rest") as Indexed);
    const at = piece.at.get(dir) ?? [0, 0];
    stamp(img, grid, at[0] + s.offset[0], at[1] + s.offset[1]);
  }
  return img;
}

export function compileRig(def: RigDef, name: string, where: string): CompiledRig {
  const bones = Object.keys(def.bones);
  for (const dir of def.directions) {
    if (dir in def.bones) throw new ArtError(where, `bone "${dir}" clashes with a direction`);
  }
  for (const layer of Object.keys(def.parts)) {
    if (!def.layers.includes(layer))
      throw new ArtError(where, `parts for unknown layer "${layer}"`);
  }

  const skeletons = new Map<string, Skeleton>();
  for (const dir of def.directions) {
    for (const [frame, pose] of Object.entries(def.frames)) {
      const poses = typeof pose === "function" ? pose(dir) : pose;
      skeletons.set(
        `${dir}/${frame}`,
        resolveSkeleton(def.bones, poses, `${where} › ${dir}/${frame}`),
      );
    }
  }

  const parts: RigPart[] = [];
  for (const layer of def.layers) {
    for (const [partName, partDef] of Object.entries(def.parts[layer] ?? {})) {
      const pieces = parsePart(partDef, def, `${where} › ${layer}.${partName}`);
      const frames = new Map<string, Indexed>();
      for (const [key, skeleton] of skeletons) {
        const dir = key.split("/")[0] as Dir;
        frames.set(key, drawPart(pieces, bones, dir, skeleton, def.size));
      }
      parts.push({ layer, name: partName, frames });
    }
  }

  const looks: RigLook[] = Object.entries(def.looks).map(([lookName, look]) => {
    const lw = `${where} › look ${lookName}`;
    for (const [layer, partName] of Object.entries(look.parts)) {
      if (!parts.some((p) => p.layer === layer && p.name === partName)) {
        throw new ArtError(lw, `no part "${partName}" in layer "${layer}"`);
      }
    }
    const frames = new Map<string, Indexed>();
    const checked = new Map<string, Indexed>();
    for (const key of skeletons.keys()) {
      const all = indexed(def.size[0], def.size[1]);
      const some = indexed(def.size[0], def.size[1]);
      for (const layer of def.layers) {
        const p = parts.find((q) => q.layer === layer && q.name === look.parts[layer]);
        if (!p) continue;
        const img = p.frames.get(key) as Indexed;
        stamp(all, img, 0, 0);
        if (!def.unchecked?.includes(layer)) stamp(some, img, 0, 0);
      }
      frames.set(key, all);
      checked.set(key, some);
    }
    return { name: lookName, parts: look.parts, slots: look.slots ?? {}, frames, checked };
  });

  checkAnims(def.anim, new Set(Object.keys(def.frames)), where);
  return {
    kind: "rig",
    name,
    group: def.group ?? "core",
    size: def.size,
    origin: def.origin ?? defaultOrigin(def.size),
    directions: def.directions,
    layers: def.layers,
    frameNames: Object.keys(def.frames),
    anim: def.anim,
    parts,
    looks,
  };
}
