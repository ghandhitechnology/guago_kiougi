import { readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  checkJumps,
  checkOrphans,
  checkOutline,
  checkPalette,
  checkSlice,
  opaqueCount,
} from "../checks.ts";
import type { Art } from "../format.ts";
import { type CompiledGlyphs, compileGlyphs } from "../glyphs.ts";
import { ArtError } from "../grid.ts";
import { type CompiledRig, compileRig } from "../rig.ts";
import { type CompiledSprite, compileSprite } from "../sprite.ts";
import {
  type CompiledOverlay,
  type CompiledTerrain,
  compileOverlay,
  compileTerrain,
} from "../terrain.ts";

export const ART_ROOT = new URL("../..", import.meta.url).pathname;
export const SOURCES = join(ART_ROOT, "src/sprites");

export type Compiled =
  | CompiledSprite
  | CompiledRig
  | CompiledTerrain
  | CompiledOverlay
  | CompiledGlyphs;

export interface CompileResult {
  readonly art: readonly Compiled[];
  readonly problems: readonly string[];
}

/** Every `.ts` file under `src/sprites`, sorted, without tests. */
export function sourceFiles(dir = SOURCES): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f))
    .sort();
}

function compileOne(art: Art, name: string, where: string): Compiled {
  if (art.kind === "sprite") return compileSprite(art, name, where);
  if (art.kind === "rig") return compileRig(art, name, where);
  if (art.kind === "overlay") return compileOverlay(art, name, where);
  if (art.kind === "glyphs") return compileGlyphs(art, name, where);
  return compileTerrain(art, name, where);
}

/** Loads and compiles every source, then runs the checks. Never throws for art problems. */
export async function compileAll(files = sourceFiles()): Promise<CompileResult> {
  const art: Compiled[] = [];
  const problems: string[] = [];
  const names = new Map<string, string>();
  for (const file of files) {
    const label = relative(join(ART_ROOT, "src/sprites"), file);
    let exported: unknown;
    try {
      exported = (await import(pathToFileURL(file).href)).default;
    } catch (e) {
      problems.push(`${label}: ${(e as Error).message}`);
      continue;
    }
    const list = (Array.isArray(exported) ? exported : [exported]) as Art[];
    for (const item of list) {
      if (!item || typeof item !== "object" || !("kind" in item)) {
        problems.push(`${label}: default export must be art or a list of art`);
        continue;
      }
      const name = item.name ?? (list.length === 1 ? basename(file, ".ts") : undefined);
      if (!name) {
        problems.push(`${label}: every piece of art in a list needs a name`);
        continue;
      }
      const other = names.get(name);
      if (other) {
        problems.push(`${label}: name "${name}" is already used in ${other}`);
        continue;
      }
      names.set(name, label);
      try {
        const compiled = compileOne(item, name, `${label} › ${name}`);
        art.push(compiled);
        problems.push(...checkArt(compiled, `${label} › ${name}`));
      } catch (e) {
        problems.push(
          e instanceof ArtError ? e.message : `${label} › ${name}: ${(e as Error).message}`,
        );
      }
    }
  }
  return { art, problems };
}

export function checkArt(art: Compiled, where: string): string[] {
  const out: string[] = [];
  if (art.kind === "sprite") {
    for (const [frame, img] of art.frames) {
      const fw = `${where} › ${frame}`;
      out.push(...checkPalette(img, fw));
      if (frame === "shadow" && art.shadow) continue;
      out.push(...checkOrphans(img, fw));
      if (art.outline) out.push(...checkOutline(img, fw));
      if (art.slice) out.push(...checkSlice(img, art.slice, fw));
    }
    for (const [name, anim] of Object.entries(art.anim)) {
      out.push(...checkJumps(name, anim, (f) => opaqueCount(art.frames.get(f) as never), where));
    }
  } else if (art.kind === "rig") {
    for (const part of art.parts) {
      for (const [key, img] of part.frames)
        out.push(...checkPalette(img, `${where} › ${part.layer}.${part.name} › ${key}`));
    }
    for (const look of art.looks) {
      for (const [key, img] of look.checked) {
        const fw = `${where} › look ${look.name} › ${key}`;
        out.push(...checkOrphans(img, fw), ...checkOutline(img, fw));
      }
      for (const dir of art.directions) {
        for (const [name, anim] of Object.entries(art.anim)) {
          out.push(
            ...checkJumps(
              name,
              anim,
              (f) => opaqueCount(look.checked.get(`${dir}/${f}`) as never),
              `${where} › look ${look.name} › ${dir}`,
            ),
          );
        }
      }
    }
  } else if (art.kind === "glyphs") {
    for (const g of art.glyphs) {
      const fw = `${where} › "${g.chars.join("")}"`;
      out.push(...checkPalette(g.img, fw), ...checkOrphans(g.img, fw), ...checkOutline(g.img, fw));
    }
  } else if (art.kind === "overlay") {
    art.tiles.forEach((img, i) => {
      const fw = `${where} › tile ${i} (mask ${art.masks.findIndex((m) => m.includes(i))})`;
      out.push(...checkPalette(img, fw), ...checkOrphans(img, fw, true));
    });
  } else {
    const label = (i: number): string => {
      const m = art.masks.findIndex((list) => list.includes(i));
      if (m >= 0) return `mask ${m}`;
      for (const t of art.tones) {
        const tm = t.masks.findIndex((list) => list.includes(i));
        if (tm >= 0) return `tone ${t.name} mask ${tm}`;
      }
      return "unused";
    };
    art.tiles.forEach((img, i) => {
      const fw = `${where} › tile ${i} (${label(i)})`;
      out.push(...checkPalette(img, fw), ...checkOrphans(img, fw, true));
    });
    for (const d of art.decals) {
      const fw = `${where} › decal ${d.name}`;
      out.push(...checkPalette(d.img, fw), ...checkOrphans(d.img, fw));
    }
  }
  return out;
}
