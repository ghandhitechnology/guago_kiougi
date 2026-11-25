import type { Thing } from "./format.ts";
import type { Prop, Vec } from "./layers.ts";

const TILE = 16;

/**
 * Footprints of the props that block walking, in tiles: what the art package draws and what a
 * player bumps into are declared here once. A prop stands with its feet at the bottom centre of
 * its footprint. Props not listed are walked over or through: decals, chalk, cones, leaves.
 */
export const PROPS = {
  bench: { foot: [2, 1] },
  lamp: { foot: [1, 1] },
  vending: { foot: [1, 1] },
  corkboard: { foot: [2, 1] },
  planter: { foot: [3, 1] },
  shrub: { foot: [1, 1] },
  pine: { foot: [1, 1] },
  ev: { foot: [2, 1] },
  column: { foot: [1, 1] },
  drum: { foot: [1, 1] },
  olive: { foot: [1, 1] },
  "tortoise-statue": { foot: [2, 1] },
  "goal-column": { foot: [2, 1] },
  amphora: { foot: [1, 1] },
  rocket: { foot: [1, 1] },
  flagpole: { foot: [1, 1] },
  zelkova: { foot: [1, 1] },
  bikes: { foot: [3, 1] },
  bins: { foot: [2, 1] },
  picnic: { foot: [2, 1] },
  "notice-case": { foot: [2, 1] },
  binocular: { foot: [1, 1] },
  pot: { foot: [1, 1] },
  "menu-stand": { foot: [1, 1] },
  hedge: { foot: [1, 1] },
  floodlight: { foot: [1, 1] },
  podium: { foot: [4, 2] },
  bars: { foot: [3, 1] },
  tires: { foot: [3, 1] },
  // Page 1 hunting fields.
  "shaft-fallen": { foot: [3, 1] },
  "capital-fallen": { foot: [1, 1] },
  "column-stump": { foot: [1, 1] },
  statue: { foot: [1, 1] },
  herm: { foot: [1, 1] },
  altar: { foot: [2, 1] },
  boulder: { foot: [1, 1] },
  "boulder-big": { foot: [2, 1] },
  cypress: { foot: [1, 1] },
  boat: { foot: [3, 1] },
  nets: { foot: [2, 1] },
  gnomon: { foot: [1, 1] },
  "olive-giant": { foot: [3, 2] },
  "oil-press": { foot: [3, 2] },
  hives: { foot: [2, 1] },
  well: { foot: [2, 1] },
  shrine: { foot: [1, 1] },
  "tortoise-stone": { foot: [1, 1] },
  cart: { foot: [2, 1] },
  "wall-dry": { foot: [1, 1] },
  "puppet-wall": { foot: [3, 1] },
  "guard-post": { foot: [2, 1] },
  "bench-stone": { foot: [3, 1] },
  "dead-tree": { foot: [1, 1] },
} as const satisfies Record<string, { readonly foot: Vec }>;

export type SolidProp = keyof typeof PROPS;

/**
 * Places a prop with a footprint at tile (tx, ty), its footprint's top left. `nudge` moves the
 * art a few pixels without moving the footprint.
 */
export function place(
  prop: SolidProp,
  tx: number,
  ty: number,
  opt: Omit<Prop, "prop" | "at"> & { readonly nudge?: Vec } = {},
): Thing {
  const [w, h] = PROPS[prop].foot;
  const { nudge, ...rest } = opt;
  const x = Math.round((tx + w / 2) * TILE) + (nudge?.[0] ?? 0);
  const y = (ty + h) * TILE - 2 + (nudge?.[1] ?? 0);
  return { prop, ...rest, at: [x, y], foot: { x: tx, y: ty, w, h } };
}
