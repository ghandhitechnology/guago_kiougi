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
