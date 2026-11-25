import type { Layers, MapSource } from "./format.ts";
import type { Prop, ShadowShape, Vec } from "./layers.ts";
import { unit } from "./noise.ts";
import type { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * What the Page 1 fields share: one plan legend, the rule that keeps grounds without a terrain
 * pair apart, and trees that come with their crowns and their shadows.
 */

const T = 16;

/**
 * `~` sky, `w` sea or stream, `r` limestone, `_` dust, `,` dry grass, `m` marble paving; `%` and
 * `:` are grass and dust past where anyone can walk.
 */
export const GREEK_LEGEND: MapSource["legend"] = {
  "~": { terrain: null },
  w: { terrain: "water", solid: "~" },
  r: { terrain: "rock", solid: "#" },
  _: { terrain: "dirt" },
  ",": { terrain: "grass" },
  m: { terrain: "marble" },
  "%": { terrain: "grass", solid: "#" },
  ":": { terrain: "dirt", solid: "#" },
};

/**
 * The fields' own ground (their own terrain ids, baked into the Greek themes only), keyed by the
 * same plan characters as `GREEK_LEGEND` so a plan and its collision stay as they are: `w` is
 * the shallows and `W` the deep beyond them, `m` the paving the field is laid with.
 */
export function fieldLegend(paving: "slab" | "flags"): MapSource["legend"] {
  return {
    "~": { terrain: null },
    w: { terrain: "shallows", solid: "~" },
    W: { terrain: "sea", solid: "~" },
    r: { terrain: "crag", solid: "#" },
    _: { terrain: "dust" },
    ",": { terrain: "dry" },
    m: { terrain: paving },
    "%": { terrain: "dry", solid: "#" },
    ":": { terrain: "dust", solid: "#" },
  };
}

const WATER = "wW";

/**
 * Water `reach` tiles or more from any shore becomes the deep (`W`). Both are water, so the
 * collision does not change; only the colour steps down past the shelf.
 */
export function deepen(plan: string, reach = 2): string {
  const rows = plan.split("\n").map((r) => [...r]);
  const at = (x: number, y: number) => rows[y]?.[x];
  const out = rows.map((r) => [...r]);
  const open = (x: number, y: number): boolean => {
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const n = at(x + dx, y + dy);
        if (n !== undefined && n !== "~" && !WATER.includes(n)) return false;
      }
    return true;
  };
  rows.forEach((row, y) => {
    row.forEach((ch, x) => {
      if (ch === "w" && open(x, y)) (out[y] as string[])[x] = "W";
    });
  });
  return out.map((r) => r.join("")).join("\n");
}

/**
 * Foam along every side where land meets the shallows, one strip per tile edge, the waves
 * staggered so they travel along the coast instead of breaking all at once.
 */
export function foam(plan: string): Prop[] {
  const at = cellOf(plan);
  const rows = plan.split("\n");
  const out: Prop[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = at(x, y);
      if (ch === "~" || WATER.includes(ch)) continue;
      for (const [dx, dy, dir] of [
        [0, 1, "s"],
        [0, -1, "n"],
        [1, 0, "e"],
        [-1, 0, "w"],
      ] as const) {
        if (at(x + dx, y + dy) !== "w") continue;
        out.push({
          prop: "foam",
          anim: dir,
          play: true,
          index: (x + y * 2) % 4,
          at: [(x + dx) * T, (y + dy) * T],
          raw: true,
        });
      }
    }
  });
  return out;
}

/** Sun catching the deep at a scatter of points. */
export function sparkles(plan: string, step: number, seed: number): Prop[] {
  const at = cellOf(plan);
  const rows = plan.split("\n");
  return scatter(
    { x: 0, y: 0, w: rows[0]?.length ?? 0, h: rows.length },
    step,
    seed,
    (x, y) => at(x, y) === "W",
  ).map(
    ([x, y], i): Prop => ({
      prop: "sparkle",
      anim: "glint",
      play: true,
      index: (i * 2) % 6,
      at: [x * T + 8, y * T + 8],
      raw: true,
    }),
  );
}

/**
 * Wheel ruts or a trodden footpath along a route of tiles, one piece per tile, only where the
 * route crosses open dust.
 */
export function track(kind: "ruts" | "footpath", route: readonly Vec[], plan: string): Prop[] {
  const at = cellOf(plan);
  const out: Prop[] = [];
  const seen = new Set<string>();
  for (let k = 0; k + 1 < route.length; k++) {
    const [x0, y0] = route[k] as Vec;
    const [x1, y1] = route[k + 1] as Vec;
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    const frame = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? "h" : "v";
    for (let i = 0; i <= n; i++) {
      const tx = Math.round(x0 + ((x1 - x0) * i) / n);
      const ty = Math.round(y0 + ((y1 - y0) * i) / n);
      const key = `${tx},${ty}`;
      if (seen.has(key) || at(tx, ty) !== "_") continue;
      seen.add(key);
      out.push({ prop: kind, frame, at: [tx * T, ty * T + (frame === "h" ? 4 : 0)] });
    }
  }
  return out;
}

/** Masonry fragments strewn around a point, thinning out with distance, on open ground only. */
export function rubble(
  center: Vec,
  radius: number,
  count: number,
  seed: number,
  plan: string,
): Prop[] {
  const at = cellOf(plan);
  const out: Prop[] = [];
  for (let k = 0; out.length < count && k < count * 6; k++) {
    const a = unit(k, 1, seed) * Math.PI * 2;
    const r = radius * unit(k, 2, seed) ** 1.6;
    const tx = Math.round(center[0] + Math.cos(a) * r);
    const ty = Math.round(center[1] + Math.sin(a) * r * 0.8);
    if (!"_,m".includes(at(tx, ty) || "\0")) continue;
    out.push({
      prop: "rubble",
      frame: ["a", "b", "c"][k % 3] as string,
      at: [
        tx * T + Math.floor(unit(k, 3, seed) * 10),
        ty * T + 10 + Math.floor(unit(k, 4, seed) * 5),
      ],
      ...(k % 2 ? { flip: true } : {}),
    });
  }
  return out;
}

/**
 * Boulders heaped on the rims of rock outcrops, so a small crag reads as a pile of stone and not
 * as a pad. The tiles are solid already: the boulders carry no footprint and change nothing a
 * player bumps into.
 */
export function rockPiles(plan: string, step: number, seed: number): Prop[] {
  const at = cellOf(plan);
  return edgeLine(plan, "r", "_,m", step, seed).map(
    ([x, y], i): Prop => ({
      prop: i % 3 === 0 ? "boulder-big" : "boulder",
      at: [x * T + 8 + Math.floor(unit(x, y, seed) * 6) - 3, y * T + 13],
      ...(i % 2 ? { flip: true } : {}),
      ...(at(x, y + 1) === "r" ? { sort: y * T + 13 } : {}),
    }),
  );
}

const WALKABLE = "_,m";
const SOLID_TWIN = { _: ":", ",": "%", m: ":" } as const;

/**
 * Settles a painted plan: grounds without a terrain pair never meet (dust goes between, walkable
 * beside walkable and solid beside solid), one-tile squeezes close, and walkable pockets not
 * connected to `from` turn solid.
 */
export function settle(g: PlanGrid, from: Vec): PlanGrid {
  const pass = () =>
    g
      .separate(",", "wrm", "_")
      .separate("%", "wrm", ":")
      .separate("m", "wr", "_")
      .separate("r", "w", ":");
  pass();
  g.unsqueeze(WALKABLE).enclose(WALKABLE, from, SOLID_TWIN);
  return pass().unsqueeze(WALKABLE).enclose(WALKABLE, from, SOLID_TWIN);
}

/** A soft oval shadow, leaning `lean` pixels to the right at its top and bottom. */
export function blob(x: number, y: number, rx: number, ry: number, lean = 0): ShadowShape {
  const poly: Vec[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    poly.push([
      Math.round(x + Math.cos(a) * rx + Math.sin(a) * lean),
      Math.round(y + Math.sin(a) * ry),
    ]);
  }
  return { poly };
}

/** The layers a group of placed things fills, ready to spread into a map source. */
export interface Placed {
  objects: NonNullable<Layers["objects"]>[number][];
  overhead: Prop[];
  shadows: NonNullable<Layers["shadows"]>[number][];
}

export function merge(...parts: readonly Partial<Placed>[]): Placed {
  return {
    objects: parts.flatMap((p) => p.objects ?? []),
    overhead: parts.flatMap((p) => p.overhead ?? []),
    shadows: parts.flatMap((p) => p.shadows ?? []),
  };
}

/**
 * Trees at tiles: the trunk blocks its tile, the crown goes overhead, and the crown's shadow
 * falls a little right of the trunk under a high sun. Crowns stir out of step.
 */
export function trees(
  kind: "olive" | "cypress",
  at: readonly Vec[],
  seed = 0,
  opt: { dapple?: boolean } = {},
): Placed {
  const crown = kind === "olive" ? "olive-crown" : "cypress-crown";
  const anim = kind === "olive" ? "stir" : "sway";
  const out: Placed = { objects: [], overhead: [], shadows: [] };
  at.forEach(([tx, ty], i) => {
    const flip = (tx * 7 + ty * 3 + seed) % 2 === 0;
    const trunk = place(kind, tx, ty, { flip });
    const feet = trunk.at;
    out.objects.push(trunk);
    out.overhead.push({
      prop: crown,
      anim,
      play: true,
      index: (i + seed) % 2,
      at: feet,
      flip,
    });
    if (kind === "olive" && opt.dapple)
      out.shadows.push({
        prop: "dapple",
        frame: i % 2 ? "a" : "b",
        at: [feet[0] + 6, feet[1] - 4],
        flip,
      });
    else
      out.shadows.push(
        kind === "olive"
          ? blob(feet[0] + 7, feet[1] - 1, 21, 7, 3)
          : blob(feet[0] + 9, feet[1] - 1, 8, 4, 5),
      );
  });
  return out;
}

/**
 * Points on a jittered grid `step` tiles apart inside `area` where `keep` says yes: rows of an
 * orchard that never line up perfectly, or trees scattered past an edge.
 */
export function scatter(
  area: { x: number; y: number; w: number; h: number },
  step: number,
  seed: number,
  keep: (tx: number, ty: number) => boolean,
): Vec[] {
  const out: Vec[] = [];
  for (let gy = area.y; gy < area.y + area.h; gy += step) {
    for (
      let gx = area.x + ((gy / step) % 2 ? Math.floor(step / 2) : 0);
      gx < area.x + area.w;
      gx += step
    ) {
      const jx = Math.floor(unit(gx, gy, seed) * 3) - 1;
      const jy = Math.floor(unit(gx, gy, seed + 1) * 3) - 1;
      const tx = gx + jx;
      const ty = gy + jy;
      if (keep(tx, ty)) out.push([tx, ty]);
    }
  }
  return out;
}

/** A plan string's character at a tile, for placing art against the settled ground. */
export function cellOf(plan: string): (tx: number, ty: number) => string {
  const rows = plan.split("\n");
  return (tx, ty) => rows[ty]?.[tx] ?? "";
}

/**
 * Solid tiles of `solid` that touch walkable ground on a side: the line a player bumps into.
 * Every `step`th one (by a seeded hash) is returned, so the edge can be marked with rocks and
 * trees and never reads as an invisible wall.
 */
export function edgeLine(
  plan: string,
  solid: string,
  walk: string,
  step: number,
  seed: number,
): Vec[] {
  const at = cellOf(plan);
  const rows = plan.split("\n");
  const out: Vec[] = [];
  rows.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      if (!solid.includes(at(tx, ty))) continue;
      const touches = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => walk.includes(at(tx + (dx as number), ty + (dy as number)) || "\0"));
      if (touches && Math.floor(unit(tx, ty, seed) * step) === 0) out.push([tx, ty]);
    }
  });
  return out;
}

/** Tile to the world pixel at its centre. */
export function px(tx: number, ty: number): Vec {
  return [tx * T + T / 2, ty * T + T / 2];
}
