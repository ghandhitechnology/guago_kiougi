import type { Anim, BonePose, Dir, Look, PartDef, Poses, RigDef, Vec } from "./format.ts";
import { ArtError, checkLegend, parseGrid } from "./grid.ts";
import { drawOrder, stackLayers } from "./layer-order.ts";
import { DEEP_INDICES, slotOf } from "./palette.ts";
import { CLEAR, type Indexed, indexed, stamp } from "./raster.ts";
import { checkAnims, defaultOrigin } from "./sprite.ts";

/** A part rendered alone for every direction and frame. Keys are `down/walk0`. */
export interface RigPart {
  readonly layer: string;
  readonly name: string;
  readonly frames: ReadonlyMap<string, Indexed>;
  /** The layer it is drawn just below, when not its own (see `PartDef.under`). */
  readonly under?: string;
  /** Anchor name to its position per `down/walk0` key; keys where it is hidden are left out. */
  readonly anchors: ReadonlyMap<string, ReadonlyMap<string, Vec>>;
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
  /** Whether looks are stacked with the `clean` rule. */
  readonly clean: boolean;
  /**
   * Every part option worn on the first look in place of that look's own (and with `probe:
   * 'pairs'`, every two options of different layers together): a check-only set, so whatever a
   * player combines in the character creator has been checked on a neutral base. Composited one
   * at a time as they are read, since a pairs rig has hundreds.
   */
  readonly probes: () => Iterable<RigLook>;
}

interface ParsedPose {
  readonly img: Indexed;
  /** Set when the pose has its own position instead of the piece's. */
  readonly at?: Vec;
}

interface ParsedPiece {
  readonly at: ReadonlyMap<Dir, Vec>;
  /** Direction to pose name to grid. A null direction draws nothing. */
  readonly grids: ReadonlyMap<Dir, ReadonlyMap<string, ParsedPose> | null>;
}

/** Resolved position and pose of every bone for one direction and frame. */
export type Skeleton = ReadonlyMap<string, { readonly offset: Vec; readonly pose: string }>;

/** The darkest step of a ramp or slot: a colour allowed on the outline. */
function isOutlineIndex(v: number): boolean {
  return DEEP_INDICES.has(v) || slotOf(v)?.base === v;
}

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
    const grids = new Map<Dir, Map<string, ParsedPose> | null>();
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
      const poses = new Map<string, ParsedPose>();
      for (const [pose, src] of Object.entries(byPose)) {
        const grid = typeof src === "string" ? src : src.grid;
        const img = parseGrid(grid, def.palette, `${pw} › ${pose}`, {}, def.lone);
        poses.set(pose, typeof src === "string" ? { img } : { img, at: src.at });
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
    const pose = byPose.get(s.pose) ?? (byPose.get("rest") as ParsedPose);
    const at = pose.at ?? piece.at.get(dir) ?? [0, 0];
    stamp(img, pose.img, at[0] + s.offset[0], at[1] + s.offset[1]);
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
      const anchors = new Map<string, Map<string, Vec>>();
      for (const [anchor, a] of Object.entries(partDef.anchors ?? {})) {
        if (!(a.bone in def.bones)) {
          throw new ArtError(`${where} › ${layer}.${partName}`, `anchor ${anchor} on unknown bone`);
        }
        const at = new Map<string, Vec>();
        for (const [key, skeleton] of skeletons) {
          const dir = key.split("/")[0] as Dir;
          const s = skeleton.get(a.bone);
          const own = a.poses?.[dir]?.[s?.pose ?? "rest"];
          const p = own === undefined ? a.at[dir] : own;
          if (!s || !p) continue;
          at.set(key, [p[0] + s.offset[0], p[1] + s.offset[1]]);
        }
        anchors.set(anchor, at);
      }
      parts.push({
        layer,
        name: partName,
        frames,
        anchors,
        ...(partDef.under === undefined ? {} : { under: partDef.under }),
      });
    }
  }

  const compose = (lookName: string, look: Look): RigLook => {
    const lw = `${where} › look ${lookName}`;
    for (const [layer, partName] of Object.entries(look.parts)) {
      if (!parts.some((p) => p.layer === layer && p.name === partName)) {
        throw new ArtError(lw, `no part "${partName}" in layer "${layer}"`);
      }
    }
    const frames = new Map<string, Indexed>();
    const checked = new Map<string, Indexed>();
    const order = drawOrder(
      def.layers,
      look.parts,
      (l, n) => parts.find((q) => q.layer === l && q.name === n)?.under,
    );
    const worn = order.map((layer) =>
      parts.find((q) => q.layer === layer && q.name === look.parts[layer]),
    );
    const [w, h] = def.size;
    const shown = worn.filter((p): p is RigPart => p !== undefined);
    const below = shown.filter((p) => def.unchecked?.includes(p.layer));
    const stacked = shown.filter((p) => !def.unchecked?.includes(p.layer));
    for (const key of skeletons.keys()) {
      const imgs = stacked.map((p) => p.frames.get(key) as Indexed);
      const { px, owner } = stackLayers(
        imgs.map((img) => img.px),
        w,
        h,
        CLEAR,
        def.clean ?? false,
        isOutlineIndex,
      );
      const some = indexed(w, h);
      px.forEach((v, i) => {
        some.px[i] = v;
        const l = owner[i] as number;
        const own = imgs[l];
        if (own && own.px[i] === v) some.lone[i] = own.lone[i] as number;
      });
      const all = indexed(w, h);
      for (const p of below) stamp(all, p.frames.get(key) as Indexed, 0, 0);
      stamp(all, some, 0, 0);
      frames.set(key, all);
      checked.set(key, some);
    }
    return { name: lookName, parts: look.parts, slots: look.slots ?? {}, frames, checked };
  };
  const looks = Object.entries(def.looks).map(([lookName, look]) => compose(lookName, look));

  for (const p of parts) {
    if (p.under !== undefined && !def.layers.includes(p.under)) {
      throw new ArtError(`${where} › ${p.layer}.${p.name}`, `under unknown layer "${p.under}"`);
    }
  }
  const base = Object.values(def.looks)[0];
  const options = parts.filter(
    (p) => base && base.parts[p.layer] !== p.name && !def.unchecked?.includes(p.layer),
  );
  function* probes(): Generator<RigLook> {
    if (!base) return;
    for (const p of options) {
      yield compose(`${p.layer}.${p.name}`, {
        ...base,
        parts: { ...base.parts, [p.layer]: p.name },
      });
    }
    if (def.probe !== "pairs") return;
    for (const [i, p] of options.entries()) {
      for (const q of options.slice(i + 1)) {
        if (q.layer === p.layer) continue;
        yield compose(`${p.layer}.${p.name}+${q.layer}.${q.name}`, {
          ...base,
          parts: { ...base.parts, [p.layer]: p.name, [q.layer]: q.name },
        });
      }
    }
  }

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
    clean: def.clean ?? false,
    probes,
  };
}
