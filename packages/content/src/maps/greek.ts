import type { Layers, MapSource } from "./format.ts";
import type { Prop, ShadowShape, Vec } from "./layers.ts";
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
export function trees(kind: "olive" | "cypress", at: readonly Vec[], seed = 0): Placed {
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
    out.shadows.push(
      kind === "olive"
        ? blob(feet[0] + 7, feet[1] - 1, 21, 7, 3)
        : blob(feet[0] + 9, feet[1] - 1, 8, 4, 5),
    );
  });
  return out;
}

/** Tile to the world pixel at its centre. */
export function px(tx: number, ty: number): Vec {
  return [tx * T + T / 2, ty * T + T / 2];
}
