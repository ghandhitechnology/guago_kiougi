/**
 * Helpers for creature art: a silhouette drawn as a mask is shaded as one rounded form lit from
 * the top left, and any sprite can be given its elite form. Everything returns ordinary grids and
 * defs, so the output goes through the same parser and checks as hand-typed art.
 */
import { cells, grid } from "./draw.ts";
import type { Legend, PartGrid, Placement, SpriteDef, Vec } from "./format.ts";
import { type Lobe, lobes } from "./paint.ts";
import { colorIndex, isColorName, nameOf, type Remap, resolveRemap } from "./palette.ts";
import { CLEAR, type Indexed } from "./raster.ts";
import { compileSprite } from "./sprite.ts";

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
  const tones = [ramp.light, ramp.mid, ramp.dark, ramp.glint ?? ""].join("");
  return mend(out.map((r) => r.join("")).join("\n"), tones);
}

/**
 * A pixel of one of `only` with no same-colour neighbour takes the colour most of its opaque
 * neighbours have, so shading and overlays never leave single stray pixels.
 */
export function mend(src: string, only: string): string {
  const out = cells(src);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < out.length; y++) {
      const row = out[y] as string[];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x] as string;
        if (ch === "." || !only.includes(ch)) continue;
        const around = new Map<string, number>();
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const n = dx || dy ? out[y + dy]?.[x + dx] : undefined;
            if (n !== undefined && n !== ".") around.set(n, (around.get(n) ?? 0) + 1);
          }
        if (around.has(ch)) continue;
        const best = [...around].sort((a, b) => b[1] - a[1])[0];
        if (best) row[x] = best[0];
      }
    }
  }
  return out.map((r) => r.join("")).join("\n");
}

/** A `w`×`h` mask (`#` inside) of overlapping ellipses, for soft organic silhouettes. */
export function blob(w: number, h: number, list: readonly Lobe[]): string {
  const inside = lobes(list);
  return grid(w, h, (x, y) => (inside(x, y) ? "#" : "."));
}

/** Swaps characters: `swap(grid, "ab", "xy")` turns a into x and b into y. */
export function swap(src: string, from: string, to: string): string {
  const map = new Map([...from].map((c, i) => [c, to[i] ?? c]));
  return cells(src)
    .map((r) => r.map((c) => map.get(c) ?? c).join(""))
    .join("\n");
}

/**
 * Keeps the pixels of a grid where `keep` holds and clears the rest, then turns every kept pixel
 * on the new edge into `outline`, so a piece broken off a body is outlined along the break.
 * Characters in `lone` are left alone.
 */
export function cut(
  src: string,
  keep: (x: number, y: number) => boolean,
  outline: string,
  lone = "",
): string {
  const g = cells(src).map((r, y) => r.map((c, x) => (keep(x, y) ? c : ".")));
  const clear = (x: number, y: number) => (g[y]?.[x] ?? ".") === ".";
  return g
    .map((r, y) =>
      r
        .map((c, x) => {
          if (c === "." || lone.includes(c)) return c;
          const edge = clear(x - 1, y) || clear(x + 1, y) || clear(x, y - 1) || clear(x, y + 1);
          return edge ? outline : c;
        })
        .join(""),
    )
    .join("\n");
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

/** Rows of headroom an elite gets for its crown. */
const HEADROOM = 6;

/**
 * The elite form of a monster (PLAN §6: every 200 kills, rank 12). The client draws it at twice
 * the size; on top of that every frame wears a gold crown with a red-pen gem, seated one pixel
 * above the top of the head (the topmost non-lone pixels of the frame), and the eyes can be
 * swapped for lit ones. Death frames after the first drop the crown. Recolours go into the
 * legend, so the crown keeps its gold on every body.
 */
export function elite(
  base: SpriteDef,
  opts: {
    readonly recolor?: Remap;
    readonly palette?: Legend;
    readonly parts?: Readonly<Record<string, PartGrid>>;
    /** Frames with no crown. Defaults to every death frame but the first. */
    readonly bare?: (frame: string) => boolean;
    /** Palette colours the head measurement skips, like a spear held above the head. */
    readonly ignore?: readonly string[];
    /** Head centre and top for frames where something else is higher, like raised hands. */
    readonly seats?: Readonly<Record<string, Vec>>;
  },
): SpriteDef {
  if (base.shadow !== undefined) throw new Error(`elite ${base.name}: shadows are not supported`);
  const measured = compileSprite(base, base.name ?? "elite", `elite ${base.name}`);
  const bare = opts.bare ?? ((f: string) => /^die[1-9]/.test(f));
  const parts: Record<string, PartGrid> = { ...base.parts, ...opts.parts };
  const frames: Record<string, readonly Placement[]> = {};
  for (const [name, src] of Object.entries(base.frames)) {
    const stack: Placement[] = [];
    if (typeof src === "string") {
      parts[`whole-${name}`] = src;
      stack.push([`whole-${name}`, 0, HEADROOM]);
    } else {
      for (const p of src) {
        stack.push(typeof p === "string" ? [p, 0, HEADROOM] : [p[0], p[1], p[2] + HEADROOM]);
      }
    }
    const img = measured.frames.get(name);
    if (img && !bare(name)) {
      const top =
        opts.seats?.[name] ?? crownSeat(img, new Set((opts.ignore ?? []).map(colorIndex)));
      if (top) stack.push(["elite-crown", top[0] - 4, top[1] - 5 + HEADROOM]);
    }
    frames[name] = stack;
  }
  if (base.parts && "elite-crown" in base.parts) {
    throw new Error(`elite ${base.name}: base already has a part "elite-crown"`);
  }
  parts["elite-crown"] = CROWN;
  const legend = remapLegend(
    remapLegend({ ...base.palette, ...opts.palette }, base.recolor ?? {}),
    opts.recolor ?? {},
  );
  const { recolor: _drop, origin, ...rest } = base;
  const [w, h] = base.size;
  return {
    ...rest,
    name: `${base.name}-elite`,
    size: [w, h + HEADROOM],
    origin: origin ? [origin[0], origin[1] + HEADROOM] : [Math.floor(w / 2), h + HEADROOM - 1],
    palette: { ...legend, ...CROWN_LEGEND },
    lone: `${base.lone ?? ""}${GEM}`,
    parts,
    frames,
  };
}

/** Centre x and top y of a frame's head: the top three rows of its non-lone pixels. */
function crownSeat(img: Indexed, ignore: ReadonlySet<number>): [number, number] | undefined {
  const counts = (i: number) =>
    img.px[i] !== CLEAR && !img.lone[i] && !ignore.has(img.px[i] as number);
  let top = -1;
  for (let i = 0; i < img.px.length && top < 0; i++) {
    if (counts(i)) top = Math.floor(i / img.w);
  }
  if (top < 0) return undefined;
  let sum = 0;
  let n = 0;
  for (let y = top; y < Math.min(img.h, top + 3); y++) {
    for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x;
      if (counts(i)) {
        sum += x;
        n++;
      }
    }
  }
  return [Math.round(sum / n), top];
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
