/**
 * The wardrobe sheets: the student rig judged as players will see it, in combinations rather
 * than part by part. Twelve hairstyles from every side, the six faces, twenty random looks from
 * the whole set, every animation, and a row of club members with their crests.
 */
import type { Compiled } from "../build/compile.ts";
import { drawOrder, stackLayers } from "../layer-order.ts";
import { DEEP_INDICES, previewLut, SLOTS, slotOf } from "../palette.ts";
import { CLEAR, crop, type Indexed, indexed, Rgba, stamp } from "../raster.ts";
import type { CompiledRig } from "../rig.ts";
import type { CompiledSprite } from "../sprite.ts";
import { type BitmapFont, drawText } from "./font.ts";
import { CLUB, randomLooks, type WornLook } from "./looks.ts";

export type { WornLook } from "./looks.ts";

interface Fonts {
  readonly label: BitmapFont;
  readonly head: BitmapFont;
}

const isOutline = (v: number) => DEEP_INDICES.has(v) || slotOf(v)?.base === v;

/**
 * Composites a look for one `dir/frame` the way the client is asked to: layers in `drawOrder`,
 * the crest stamped at the anchor as part of the jacket layer, stacked with the rig's `clean`.
 */
export function wear(
  rig: CompiledRig,
  crests: CompiledSprite | undefined,
  look: WornLook,
  key: string,
): Indexed {
  const [w, h] = rig.size;
  const order = drawOrder(
    rig.layers,
    look.parts,
    (l, n) => rig.parts.find((p) => p.layer === l && p.name === n)?.under,
  );
  const shadow = indexed(w, h);
  const layers: Indexed[] = [];
  for (const layer of order) {
    const p = rig.parts.find((q) => q.layer === layer && q.name === look.parts[layer]);
    if (!p) continue;
    const img = p.frames.get(key) as Indexed;
    if (layer === "shadow") {
      stamp(shadow, img, 0, 0);
      continue;
    }
    if (layer === "jacket" && look.crest && crests) {
      const at = p.anchors.get("emblem")?.get(key);
      const withCrest = indexed(w, h);
      stamp(withCrest, img, 0, 0);
      if (at) {
        const { shape, symbol } = look.crest;
        for (const f of [`shape/${shape}`, `symbol/${symbol}`]) {
          const part = f ? crests.frames.get(f) : undefined;
          if (part) stamp(withCrest, part, at[0], at[1]);
        }
      }
      layers.push(withCrest);
      continue;
    }
    layers.push(img);
  }
  const { px } = stackLayers(
    layers.map((l) => l.px),
    w,
    h,
    CLEAR,
    rig.clean,
    isOutline,
  );
  const out = indexed(w, h);
  stamp(out, shadow, 0, 0);
  px.forEach((v, i) => {
    if (v !== CLEAR) out.px[i] = v;
  });
  return out;
}

const optionsOf = (rig: CompiledRig, layer: string) =>
  rig.parts.filter((p) => p.layer === layer).map((p) => p.name);

const BG = [0x1a, 0x14, 0x27] as const;
const GROUND = [0xbd, 0xb2, 0xab] as const;
const TEXT = [0xbd, 0xb2, 0xab] as const;
const HEAD = [0xfa, 0xf2, 0xe1] as const;

class Board {
  readonly c: Rgba;
  y = 20;
  constructor(w: number, h: number) {
    this.c = new Rgba(w, h);
    this.c.rect(0, 0, w, h, BG);
  }
  done(): Rgba {
    const out = new Rgba(this.c.w, this.y + 16);
    out.copy(this.c, 0, 0, this.c.w, this.y + 16, 0, 0);
    return out;
  }
}

function cell(
  b: Board,
  img: Indexed,
  lut: ReturnType<typeof previewLut>,
  x: number,
  y: number,
  z: number,
) {
  b.c.rect(x, y, img.w * z, img.h * z, GROUND);
  b.c.draw(img, x, y, lut, z);
}

export function wardrobeSheets(f: Fonts, art: readonly Compiled[]): Record<string, Rgba> {
  const rig = art.find((a): a is CompiledRig => a.kind === "rig" && a.name === "student");
  const crests = art.find((a): a is CompiledSprite => a.kind === "sprite" && a.name === "crest");
  if (!rig) return {};
  const [w, h] = rig.size;
  const slotNames = Object.fromEntries(SLOTS.map((slot) => [slot.name, Object.keys(slot.options)]));

  const base: WornLook = {
    parts: {
      shadow: "blob",
      body: "base",
      uniform: "blazer",
      face: "bright",
      hair: "crop",
      book: "textbook",
    },
    slots: { skin: "fair", hair: "brown" },
  };
  const dirs = ["down", "up", "side"] as const;
  const out: Record<string, Rgba> = {};

  // Hairstyles: twelve across, back, front and profile, ×4, then ×1.
  {
    const hairs = optionsOf(rig, "hair");
    const z = 4;
    const b = new Board(
      20 + hairs.length * (w * z + 8),
      20 + 3 * (h * z + 8) + 40 + 3 * (h + 6) + 40,
    );
    drawText(b.c, f.head, "hair · back, front, profile", 20, b.y, HEAD);
    b.y += 28;
    hairs.forEach((hair, i) => {
      drawText(b.c, f.label, hair, 20 + i * (w * z + 8), b.y, TEXT);
    });
    b.y += 16;
    for (const dir of ["up", "down", "side"]) {
      hairs.forEach((hair, i) => {
        const look = { ...base, parts: { ...base.parts, hair } };
        cell(
          b,
          wear(rig, crests, look, `${dir}/idle0`),
          previewLut(look.slots),
          20 + i * (w * z + 8),
          b.y,
          z,
        );
      });
      b.y += h * z + 8;
    }
    b.y += 8;
    for (const dir of ["up", "down", "side"]) {
      hairs.forEach((hair, i) => {
        const look = { ...base, parts: { ...base.parts, hair } };
        cell(
          b,
          wear(rig, crests, look, `${dir}/idle0`),
          previewLut(look.slots),
          20 + i * (w + 6),
          b.y,
          1,
        );
      });
      b.y += h + 6;
    }
    out["wardrobe-hair"] = b.done();
  }

  // Faces: six temperaments, each expression they share, front and profile.
  {
    const faces = optionsOf(rig, "face");
    const poses = ["idle0", "attack1", "page0", "hit", "yawn0", "clap0", "sleepy0", "meltdown0"];
    const z = 6;
    const cw = 18 * z + 6;
    const b = new Board(20 + 2 * poses.length * cw + 40, 40 + faces.length * (10 * z + 30));
    drawText(
      b.c,
      f.head,
      "faces · rest, shout, read, hurt, yawn, laugh, doze, panic",
      20,
      b.y,
      HEAD,
    );
    b.y += 28;
    for (const face of faces) {
      drawText(b.c, f.label, face, 20, b.y, TEXT);
      b.y += 14;
      const look = { ...base, parts: { ...base.parts, face } };
      let x = 20;
      for (const dir of ["down", "side"]) {
        for (const p of poses) {
          const img = crop(wear(rig, crests, look, `${dir}/${p}`), 3, 2, 18, 10);
          cell(b, img, previewLut(look.slots), x, b.y, z);
          x += cw;
        }
        x += 20;
      }
      b.y += 10 * z + 16;
    }
    out["wardrobe-faces"] = b.done();
  }

  // Twenty random looks from the whole set.
  {
    const kinds = (k: string) => [
      ...new Set(
        [...(crests?.frames.keys() ?? [])]
          .filter((fr) => fr.startsWith(`${k}/`))
          .map((fr) => fr.split("/")[1] as string),
      ),
    ];
    const looks = randomLooks({
      parts: Object.fromEntries(rig.layers.map((l) => [l, optionsOf(rig, l)])),
      slots: slotNames,
      crests: { shape: kinds("shape"), symbol: kinds("symbol") },
    });
    const z = 3;
    const per = 10;
    const b = new Board(20 + per * (3 * w * z + 20), 60 + 2 * (h * z + 16 + 3 * (h + 4)) * 1 + 200);
    drawText(b.c, f.head, "twenty random looks · front, back, profile", 20, b.y, HEAD);
    b.y += 28;
    for (let row = 0; row < looks.length / per; row++) {
      const set = looks.slice(row * per, row * per + per);
      set.forEach((look, i) => {
        dirs.forEach((dir, k) => {
          cell(
            b,
            wear(rig, crests, look, `${dir}/idle0`),
            previewLut(look.slots),
            20 + i * (3 * w * z + 20) + k * w * z,
            b.y,
            z,
          );
        });
      });
      b.y += h * z + 8;
      set.forEach((look, i) => {
        dirs.forEach((dir, k) => {
          cell(
            b,
            wear(rig, crests, look, `${dir}/walk0`),
            previewLut(look.slots),
            20 + i * (3 * w * z + 20) + k * (w + 4),
            b.y,
            1,
          );
        });
      });
      b.y += h + 20;
    }
    out["wardrobe-looks"] = b.done();
  }

  // Every animation, frame by frame, on three looks.
  {
    const looks: WornLook[] = [
      base,
      {
        parts: {
          ...base.parts,
          hair: "twintails",
          face: "goofy",
          uniform: "gym",
          accessory: "headphones",
        },
        slots: { skin: "warm", hair: "blond", cohort: "rose" },
      },
      {
        parts: {
          ...base.parts,
          hair: "undercut",
          face: "cool",
          uniform: "shirt",
          jacket: "varsity",
        },
        slots: { skin: "deep", hair: "black", jacket: "crimson", emblem: "stone", mark: "red" },
        crest: { shape: "shield", symbol: "flame" },
      },
    ];
    const anims = Object.entries(rig.anim);
    const z = 2;
    const maxFrames = Math.max(...anims.map(([, a]) => new Set(a.frames).size));
    const b = new Board(
      140 + looks.length * 3 * maxFrames * (w * z + 2) + 60,
      40 + anims.length * (h * z + 24),
    );
    drawText(b.c, f.head, "animations · each frame once, front, back, profile", 20, b.y, HEAD);
    b.y += 28;
    for (const [name, a] of anims) {
      drawText(b.c, f.label, `${name} ${a.fps}fps`, 20, b.y + 8, TEXT);
      const frames = [...new Set(a.frames)];
      let x = 140;
      for (const look of looks) {
        for (const dir of ["down", "up", "side"]) {
          for (const fr of frames) {
            cell(b, wear(rig, crests, look, `${dir}/${fr}`), previewLut(look.slots), x, b.y, z);
            x += w * z + 2;
          }
          x += 6;
        }
        x += 14;
      }
      b.y += h * z + 10;
    }
    out["wardrobe-animations"] = b.done();
  }

  // A club row: five members, five crests, front and back.
  {
    const members = CLUB;
    const z = 5;
    const b = new Board(20 + members.length * (2 * w * z + 24), 60 + h * z + 16 + h + 40);
    drawText(b.c, f.head, "a club · front and back, crests at the 과잠 anchor", 20, b.y, HEAD);
    b.y += 28;
    members.forEach((look, i) => {
      ["down", "up"].forEach((dir, k) => {
        cell(
          b,
          wear(rig, crests, look, `${dir}/idle0`),
          previewLut(look.slots),
          20 + i * (2 * w * z + 24) + k * w * z,
          b.y,
          z,
        );
        cell(
          b,
          wear(rig, crests, look, `${dir}/walk1`),
          previewLut(look.slots),
          20 + i * (2 * w * z + 24) + k * (w + 4),
          b.y + h * z + 12,
          1,
        );
      });
    });
    b.y += h * z + 16 + h + 8;
    out["wardrobe-club"] = b.done();
  }

  // Every part on the base look: uniforms with each jacket, accessories, jacket colours.
  {
    const z = 3;
    const rows: { title: string; looks: WornLook[] }[] = [
      {
        title: "uniforms and jackets",
        looks: optionsOf(rig, "uniform").flatMap((uniform) =>
          ["", ...optionsOf(rig, "jacket")].map((jacket) => ({
            ...base,
            parts: { ...base.parts, uniform, ...(jacket ? { jacket } : {}) },
          })),
        ),
      },
      {
        title: "accessories",
        looks: optionsOf(rig, "accessory").map((accessory) => ({
          ...base,
          parts: { ...base.parts, hair: "bob", accessory },
        })),
      },
      {
        title: "과잠 colours",
        looks: (slotNames.jacket ?? []).map((jacket) => ({
          parts: { ...base.parts, jacket: "varsity" },
          slots: { ...base.slots, jacket, emblem: "stone", mark: "wood" },
          crest: { shape: "circle", symbol: "pinecone" },
        })),
      },
    ];
    const most = Math.max(...rows.map((r) => r.looks.length));
    const b = new Board(20 + most * (3 * w * z + 12), 40 + rows.length * (h * z + 40));
    for (const r of rows) {
      drawText(b.c, f.head, r.title, 20, b.y, HEAD);
      b.y += 24;
      r.looks.forEach((look, i) => {
        dirs.forEach((dir, k) => {
          cell(
            b,
            wear(rig, crests, look, `${dir}/idle0`),
            previewLut(look.slots),
            20 + i * (3 * w * z + 12) + k * w * z,
            b.y,
            z,
          );
        });
      });
      b.y += h * z + 16;
    }
    out["wardrobe-parts"] = b.done();
  }
  return out;
}
