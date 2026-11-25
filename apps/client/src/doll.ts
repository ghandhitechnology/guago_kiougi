import {
  type ArtMetadata,
  drawOrder,
  outlineColors,
  packRgba,
  type RigMeta,
  stackLayers,
} from "@guago/art";
import { LAUNCH_ACCESSORIES } from "@guago/content";
import { type Emblem, encodeEmblem } from "@guago/shared";
import * as Phaser from "phaser";
import { lookAnim, lookTexture } from "./art.ts";

/**
 * The student paper doll (PLAN §16 "Characters"): a look is composited once into its own
 * texture, every direction and frame with the rig's layers stacked back to front and the swap
 * slots' key colours replaced by the look's colours, so one set of grids serves every colour.
 * Textures are shared by every doll wearing the same look and freed when the last one goes.
 */

export const RIG = "student";
export const SHADOW_FRAME = "shadow";

/** What a student looks like. Ids are part and slot option names from the rig metadata. */
export interface DollLook {
  /** Skin tone: a `skin` slot option. */
  readonly body: string;
  readonly hair: string;
  /** A `hair` slot option. */
  readonly hairColor: string;
  readonly face: string;
  readonly uniform: string;
  /**
   * Parts worn over the uniform, at most one per layer: an `accessory` part (glasses, goggles)
   * and a `jacket` part (the 과잠), as the account API stores them.
   */
  readonly accessories: readonly string[];
  /** The 과잠's colour, a `jacket` slot option; the slot's first colour when absent. */
  readonly jacket?: string;
  /** A club's crest on the 과잠's back: shape and symbol, in the `emblem` and `mark` slots. */
  readonly emblem?: Emblem;
  readonly book?: string;
}

export interface LookOptions {
  readonly body: readonly string[];
  readonly hair: readonly string[];
  readonly hairColor: readonly string[];
  readonly face: readonly string[];
  readonly uniform: readonly string[];
  /** Parts of the `accessory` layer. */
  readonly accessories: readonly string[];
  /** Parts of the `jacket` layer. */
  readonly jackets: readonly string[];
  /** Colours of the `jacket` slot. */
  readonly jacket: readonly string[];
}

function rigOf(meta: ArtMetadata): RigMeta {
  const rig = meta.rigs[RIG];
  if (!rig) throw new Error(`art has no rig ${RIG}`);
  return rig;
}

/** Every choice the metadata offers, in its order. */
export function lookOptions(meta: ArtMetadata): LookOptions {
  const rig = rigOf(meta);
  const slot = (name: string) => Object.keys(meta.slots[name]?.options ?? {});
  return {
    body: slot("skin"),
    hair: rig.parts.hair ?? [],
    hairColor: slot("hair"),
    face: rig.parts.face ?? [],
    uniform: rig.parts.uniform ?? [],
    accessories: rig.parts.accessory ?? [],
    jackets: rig.parts.jacket ?? [],
    jacket: slot("jacket"),
  };
}

const pick = <T extends string>(have: readonly T[], want: string | undefined): T | undefined =>
  have.find((v) => v === want) ?? have[0];

/** A look with every id checked against the metadata; unknown ids fall back to the first. */
export function normalizeLook(meta: ArtMetadata, look: Partial<DollLook>): DollLook {
  const o = lookOptions(meta);
  const jacket = look.jacket === undefined ? undefined : pick(o.jacket, look.jacket);
  return {
    body: pick(o.body, look.body) ?? "",
    hair: pick(o.hair, look.hair) ?? "",
    hairColor: pick(o.hairColor, look.hairColor) ?? "",
    face: pick(o.face, look.face) ?? "",
    uniform: pick(o.uniform, look.uniform) ?? "",
    // One part per layer, the first of each kept.
    accessories: [
      ...(look.accessories ?? []).filter((a) => o.accessories.includes(a)).slice(0, 1),
      ...(look.accessories ?? []).filter((a) => o.jackets.includes(a)).slice(0, 1),
    ],
    ...(jacket === undefined ? {} : { jacket }),
    ...(look.emblem === undefined || jacket === undefined ? {} : { emblem: look.emblem }),
    ...(look.book === undefined ? {} : { book: look.book }),
  };
}

export function randomLook(meta: ArtMetadata, rand: () => number = Math.random): DollLook {
  const o = lookOptions(meta);
  const any = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  return {
    body: any(o.body),
    hair: any(o.hair),
    hairColor: any(o.hairColor),
    face: any(o.face),
    uniform: any(o.uniform),
    // Most students wear nothing on their face; some wear one thing anyone may pick.
    accessories:
      rand() < 0.4 ? [any(o.accessories.filter((a) => LAUNCH_ACCESSORIES.includes(a)))] : [],
  };
}

/** The texture key of a look: the same look always maps to the same key. */
/**
 * The look's id: the same look always gets the same id. Its texture is `lookTexture(RIG, id)` and
 * its animations `lookAnim(RIG, id, dir, anim)`, the names the world's actors already play.
 */
export function dollLook(look: DollLook): string {
  return [
    "doll",
    look.body,
    look.hair,
    look.hairColor,
    look.face,
    look.uniform,
    look.accessories.join("+") || "-",
    look.jacket ?? "-",
    look.emblem ? encodeEmblem(look.emblem) : "-",
    look.book ?? "-",
  ].join("~");
}

/** The texture key of a look. */
export function dollKey(look: DollLook): string {
  return lookTexture(RIG, dollLook(look));
}

const users = new Map<string, number>();
/** Animation keys made for each look texture, removed with it. */
const animsOf = new Map<string, string[]>();

function hex(c: string): number {
  return Number.parseInt(c.slice(1), 16);
}

/** An atlas's pixels as packed colours, read once per texture. */
interface Pixels {
  readonly px: Int32Array;
  readonly width: number;
}
const sheets = new WeakMap<object, Pixels>();

function pixelsOf(scene: Phaser.Scene, key: string): Pixels {
  const texture = scene.textures.get(key);
  const image = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const known = sheets.get(image);
  if (known) return known;
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const cx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  cx.drawImage(image, 0, 0);
  const made = { px: packRgba(cx.getImageData(0, 0, c.width, c.height).data), width: c.width };
  sheets.set(image, made);
  return made;
}

/** Copies an atlas frame's opaque pixels into a `w`-wide layer at (x, y), frame trim included. */
function blit(
  sheet: Pixels,
  f: Phaser.Textures.Frame,
  out: Int32Array,
  w: number,
  x: number,
  y: number,
) {
  const h = out.length / w;
  for (let v = 0; v < f.cutHeight; v++) {
    const ty = y + f.y + v;
    if (ty < 0 || ty >= h) continue;
    for (let u = 0; u < f.cutWidth; u++) {
      const tx = x + f.x + u;
      if (tx < 0 || tx >= w) continue;
      const c = sheet.px[(f.cutY + v) * sheet.width + f.cutX + u] as number;
      if (c >= 0) out[ty * w + tx] = c;
    }
  }
}

/**
 * The texture for a look, composited on first use. Each call holds the texture once; hand it
 * back with `releaseDoll` when the doll wearing it goes.
 */
export function composeDoll(scene: Phaser.Scene, meta: ArtMetadata, look: DollLook): string {
  const key = dollKey(look);
  users.set(key, (users.get(key) ?? 0) + 1);
  if (scene.textures.exists(key)) return key;

  const rig = rigOf(meta);
  const atlas = scene.textures.get(rig.atlas);
  const [w, h] = rig.size;
  const canvas = document.createElement("canvas");
  canvas.width = rig.frames.length * w;
  canvas.height = (rig.directions.length + 1) * h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const sheet = pixelsOf(scene, rig.atlas);
  const ui = look.emblem ? pixelsOf(scene, "ui") : undefined;

  const partsOf = (layer: string): readonly string[] => {
    const first = rig.parts[layer]?.[0];
    switch (layer) {
      case "uniform":
        return [look.uniform];
      case "face":
        return [look.face];
      case "hair":
        return [look.hair];
      case "accessory":
      case "jacket":
        return look.accessories.filter((a) => rig.parts[layer]?.includes(a));
      case "book":
        return [look.book ?? first ?? ""];
      default:
        return first ? [first] : [];
    }
  };
  // Parts drawn under another layer (glasses, headphones under the hair) move in the order.
  const chosen: Record<string, string> = {};
  for (const layer of rig.layers) {
    const part = partsOf(layer)[0];
    if (part !== undefined) chosen[layer] = part;
  }
  const order = drawOrder(
    rig.layers.filter((l) => l !== "shadow"),
    chosen,
    (layer, part) => rig.under?.[layer]?.[part],
  );
  const outline = outlineColors(meta);
  const jacketPart = partsOf("jacket")[0];

  /** One layer of one frame as packed colours, `-1` clear. */
  const layerOf = (layer: string, dir: string, frame: string): Int32Array => {
    const out = new Int32Array(w * h).fill(-1);
    for (const part of partsOf(layer)) {
      const name = rig.frameKey
        .replace("{layer}", layer)
        .replace("{part}", part)
        .replace("{dir}", dir)
        .replace("{frame}", frame);
      if (atlas.has(name)) blit(sheet, atlas.get(name), out, w, 0, 0);
    }
    // The crest goes on the 과잠's back panel, inside the jacket layer, before stacking.
    if (layer === "jacket" && ui && look.emblem && jacketPart) {
      const at = rig.anchors?.[`jacket/${jacketPart}/emblem`]?.[`${dir}/${frame}`];
      const uiTexture = scene.textures.get("ui");
      if (at) {
        for (const crest of [
          `crest/shape/${look.emblem.shape}`,
          `crest/symbol/${look.emblem.symbol}`,
        ]) {
          if (uiTexture.has(crest)) blit(ui, uiTexture.get(crest), out, w, at[0], at[1]);
        }
      }
    }
    return out;
  };

  const cell = ctx.createImageData(w, h);
  const paint = (px: Int32Array, cx: number, cy: number) => {
    const d = cell.data;
    for (let i = 0; i < w * h; i++) {
      const c = px[i] as number;
      if (c < 0) {
        d[i * 4 + 3] = 0;
        continue;
      }
      d[i * 4] = c >> 16;
      d[i * 4 + 1] = (c >> 8) & 0xff;
      d[i * 4 + 2] = c & 0xff;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(cell, cx, cy);
  };
  rig.directions.forEach((dir, row) => {
    rig.frames.forEach((frame, col) => {
      const layers = order.map((layer) => layerOf(layer, dir, frame));
      const { px } = stackLayers(layers, w, h, -1, rig.clean ?? false, (c) => outline.has(c));
      paint(px, col * w, row * h);
    });
  });
  const shadowRow = rig.directions.length;
  paint(layerOf("shadow", rig.directions[0] ?? "down", rig.frames[0] ?? ""), 0, shadowRow * h);

  // Slot key colours to the look's colours.
  const picked: Readonly<Record<string, string | undefined>> = {
    skin: look.body,
    hair: look.hairColor,
    jacket: look.jacket,
    emblem: look.emblem?.shapeColor,
    mark: look.emblem?.symbolColor,
  };
  const swap = new Map<number, number>();
  for (const [slotName, slot] of Object.entries(meta.slots)) {
    const option = picked[slotName] ?? Object.keys(slot.options)[0];
    const colors = option === undefined ? undefined : slot.options[option];
    if (!colors) continue;
    for (const [step, keyColor] of Object.entries(slot.keys)) {
      const to = colors[step];
      if (to) swap.set(hex(keyColor), hex(to));
    }
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const to = swap.get(
      ((d[i] as number) << 16) | ((d[i + 1] as number) << 8) | (d[i + 2] as number),
    );
    if (to === undefined) continue;
    d[i] = to >> 16;
    d[i + 1] = (to >> 8) & 0xff;
    d[i + 2] = to & 0xff;
  }
  ctx.putImageData(pixels, 0, 0);

  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) throw new Error(`could not create texture ${key}`);
  const pivot = (f: Phaser.Textures.Frame | null): void => {
    if (!f) return;
    f.customPivot = true;
    f.pivotX = rig.origin[0] / w;
    f.pivotY = rig.origin[1] / h;
  };
  rig.directions.forEach((dir, row) => {
    rig.frames.forEach((frame, col) => {
      pivot(texture.add(`${dir}/${frame}`, 0, col * w, row * h, w, h));
    });
  });
  pivot(texture.add(SHADOW_FRAME, 0, 0, shadowRow * h, w, h));
  // Phaser animations under the shared names, for actors that play looks by animation key.
  const id = dollLook(look);
  const made: string[] = [];
  animsOf.set(key, made);
  for (const dir of rig.directions) {
    for (const [anim, a] of Object.entries(rig.anims)) {
      const animKey = lookAnim(RIG, id, dir, anim);
      if (scene.anims.exists(animKey)) continue;
      made.push(animKey);
      scene.anims.create({
        key: animKey,
        frames: a.frames.map((frame) => ({ key, frame: `${dir}/${frame}` })),
        frameRate: a.fps,
        repeat: a.loop ? -1 : 0,
      });
    }
  }
  return key;
}

/** Lets go of a look's texture; the last doll to let go frees it. */
export function releaseDoll(scene: Phaser.Scene, key: string): void {
  const n = (users.get(key) ?? 0) - 1;
  if (n > 0) {
    users.set(key, n);
    return;
  }
  users.delete(key);
  // Freed on the next frame, after anything still drawing it this frame.
  scene.time.delayedCall(0, () => {
    if (users.has(key) || !scene.textures.exists(key)) return;
    for (const anim of animsOf.get(key) ?? []) scene.anims.remove(anim);
    animsOf.delete(key);
    scene.textures.remove(key);
  });
}

export type Facing = "down" | "up" | "left" | "right";

/**
 * A student on screen. It plays the rig's animations from its own clock rather than through
 * Phaser animations, so changing its look mid-step keeps the step going.
 */
export class Doll extends Phaser.GameObjects.Sprite {
  private readonly rig: RigMeta;
  private lookKey: string;
  private facing: Facing = "down";
  private anim = "idle";
  private clock = 0;
  private frameIndex = 0;
  private done: (() => void) | undefined;

  constructor(scene: Phaser.Scene, meta: ArtMetadata, x: number, y: number, key: string) {
    const rig = rigOf(meta);
    super(scene, x, y, key, `${rig.directions[0]}/${rig.frames[0]}`);
    this.rig = rig;
    this.lookKey = key;
    scene.add.existing(this);
  }

  get direction(): Facing {
    return this.facing;
  }

  get playing(): string {
    return this.anim;
  }

  /** Wears another look's texture. */
  wear(key: string): this {
    this.lookKey = key;
    this.show();
    return this;
  }

  face(facing: Facing): this {
    this.facing = facing;
    this.show();
    return this;
  }

  /** Plays a rig animation from its start; a one-shot calls `done` and returns to idle. */
  act(anim: string, done?: () => void): this {
    if (!this.rig.anims[anim]) return this;
    this.anim = anim;
    this.clock = 0;
    this.frameIndex = 0;
    this.done = done;
    this.show();
    return this;
  }

  /** Keeps a looping animation running if it already is. */
  loop(anim: string): this {
    return this.anim === anim ? this : this.act(anim);
  }

  override preUpdate(_time: number, delta: number): void {
    const a = this.rig.anims[this.anim];
    if (!a) return;
    this.clock += delta;
    const step = 1000 / a.fps;
    while (this.clock >= step) {
      this.clock -= step;
      this.frameIndex++;
      if (this.frameIndex >= a.frames.length) {
        if (a.loop) this.frameIndex = 0;
        else {
          const done = this.done;
          this.done = undefined;
          this.anim = "idle";
          this.frameIndex = 0;
          this.clock = 0;
          done?.();
          break;
        }
      }
    }
    this.show();
  }

  private show(): void {
    const a = this.rig.anims[this.anim];
    const frame = a?.frames[this.frameIndex] ?? this.rig.frames[0] ?? "";
    const left = this.facing === "left";
    const dir =
      this.facing === "left" || this.facing === "right" ? this.rig.flipForLeft : this.facing;
    const name = `${dir}/${frame}`;
    if (this.texture.key !== this.lookKey || this.frame.name !== name) {
      if (!this.scene.textures.exists(this.lookKey)) return;
      this.setTexture(this.lookKey, name);
    }
    this.setFlipX(left);
  }
}
