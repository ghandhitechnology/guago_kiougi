/**
 * Helpers for creature art: a silhouette drawn as a mask is shaded as one rounded form lit from
 * the top left, and any sprite can be given its elite form. Everything returns ordinary grids and
 * defs, so the output goes through the same parser and checks as hand-typed art.
 */
import { cells } from "./draw.ts";
import type { Legend, PartGrid, Placement, SpriteDef, Vec } from "./format.ts";
import { colorIndex, isColorName, nameOf, type Remap, resolveRemap } from "./palette.ts";

export interface FormRamp {
  /** Silhouette edge: the ramp's deep step. */
  readonly outline: string;
  readonly dark: string;
  readonly mid: string;
  readonly light: string;
  /** The topmost-leftmost lit pixels, if any. */
  readonly glint?: string;
}

/**
 * Shades the `#` pixels of a mask: outline where a side touches clear, `light` within
 * `reach.light` of an open edge up or up-left (only up-left with `lightFrom: "diagonal"`), `dark` within `reach.dark` of an open edge down or
 * down-right, `mid` elsewhere. Every other character stays as drawn and counts as inside, so eyes,
 * marks and hand-placed tones can sit in the mask.
 */
export function form(
  mask: string,
  ramp: FormRamp,
  reach: {
    readonly light: number;
    readonly dark: number;
    readonly lightFrom?: "top-left" | "diagonal";
  } = {
    light: 1,
    dark: 1,
  },
): string {
  const g = cells(mask);
  const h = g.length;
  const w = g[0]?.length ?? 0;
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && (g[y]?.[x] ?? ".") !== ".";
  const open = (x: number, y: number, dx: number, dy: number, n: number) => {
    for (let k = 1; k <= n; k++) if (!inside(x + dx * k, y + dy * k)) return true;
    return false;
  };
  const out = g.map((row, y) =>
    row.map((ch, x) => {
      if (ch !== "#") return ch;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))
        return ramp.outline;
      if (open(x, y, 0, 1, reach.dark) || open(x, y, 1, 1, reach.dark)) return ramp.dark;
      if (ramp.glint && open(x, y, -1, -1, 1) && open(x, y, 0, -1, 1)) return ramp.glint;
      const up = reach.lightFrom !== "diagonal" && open(x, y, 0, -1, reach.light);
      if (open(x, y, -1, -1, reach.light) || up) return ramp.light;
      return ramp.mid;
    }),
  );
  // A shaded pixel with no same-colour neighbour takes the colour most of its neighbours have.
  const tones = new Set([ramp.light, ramp.mid, ramp.dark, ramp.glint]);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = out[y]?.[x] as string;
        if (g[y]?.[x] !== "#" || !tones.has(ch)) continue;
        const around = new Map<string, number>();
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const n = dx || dy ? out[y + dy]?.[x + dx] : undefined;
            if (n !== undefined && n !== ".") around.set(n, (around.get(n) ?? 0) + 1);
          }
        if (around.has(ch)) continue;
        const best = [...around].sort((a, b) => b[1] - a[1])[0];
        if (best) (out[y] as string[])[x] = best[0];
      }
    }
  }
  return out.map((r) => r.join("")).join("\n");
}

/** Mirrors a grid left to right. */
export function flip(src: string): string {
  return cells(src)
    .map((r) => r.reverse().join(""))
    .join("\n");
}

/** A legend with a remap applied to its palette names, so later art in other characters is untouched. */
export function remapLegend(legend: Legend, remap: Remap): Legend {
  const map = resolveRemap(remap);
  const out: Record<string, string | null> = {};
  for (const [ch, name] of Object.entries(legend)) {
    if (name === null || !isColorName(name)) {
      out[ch] = name;
      continue;
    }
    const to = map.get(colorIndex(name));
    out[ch] = to === undefined ? name : (nameOf(to).split(" / ")[0] as string);
  }
  return out as Legend;
}

/**
 * The elite form of a monster (PLAN §6: every 200 kills, rank 12). The client draws it at twice
 * the size; on top of that every frame carries a gold crown with a red-pen gem, and the body takes
 * a heavier palette. `crown` gives the crown's top-left per frame; frames left out (the end of a
 * death) drop it. Recolours go into the legend, so the crown keeps its gold on every body.
 */
export function elite(
  base: SpriteDef,
  opts: {
    readonly crown: Readonly<Record<string, Vec>>;
    readonly recolor?: Remap;
    readonly palette?: Legend;
    readonly parts?: Readonly<Record<string, PartGrid>>;
  },
): SpriteDef {
  const frames: Record<string, string | readonly Placement[]> = {};
  const parts: Record<string, PartGrid> = { ...base.parts, ...opts.parts };
  for (const [name, src] of Object.entries(base.frames)) {
    const stack: Placement[] = typeof src === "string" ? [`whole-${name}`] : [...src];
    if (typeof src === "string") parts[`whole-${name}`] = src;
    const at = opts.crown[name];
    if (at) stack.push(["crown", at[0], at[1]]);
    frames[name] = stack;
  }
  if (parts.crown) throw new Error(`elite ${base.name}: base already has a part "crown"`);
  parts.crown = CROWN;
  const legend = remapLegend(
    remapLegend({ ...base.palette, ...opts.palette }, base.recolor ?? {}),
    opts.recolor ?? {},
  );
  const { recolor: _drop, ...rest } = base;
  return {
    ...rest,
    name: `${base.name}-elite`,
    palette: { ...legend, ...CROWN_LEGEND },
    lone: `${base.lone ?? ""}${GEM}`,
    parts,
    frames,
  };
}

/** The elite crown, 9×4: three gold points over a band, a red-pen gem in the middle. */
const GEM = "Ẑ";
const CROWN = `
  .Ẋ..Ẋ..Ẋ.
  ẊẎẊẊẎẊẊẎẊ
  ẊẎẎẎẐẎẎẎẊ
  ẊẊẊẊẊẊẊẊẊ
`;
const CROWN_LEGEND: Legend = { Ẋ: "gold.deep", Ẏ: "gold.light", Ẑ: "red.mid" };
