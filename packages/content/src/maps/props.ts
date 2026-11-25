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

  // The interior kit: furniture that blocks, by the floor it stands on. Chairs, stools, bags,
  // books and small things on the floor are walked around by eye, not blocked.
  carrel: { foot: [2, 1] },
  jolbangdae: { foot: [4, 1] },
  "water-cooler": { foot: [1, 1] },
  "log-stand": { foot: [1, 1] },
  "school-desk": { foot: [1, 1] },
  "desk-chair": { foot: [1, 1] },
  lectern: { foot: [2, 1] },
  lockers: { foot: [3, 1] },
  "cleaning-cupboard": { foot: [1, 1] },
  "teacher-desk": { foot: [3, 1] },
  "document-tower": { foot: [1, 1] },
  copier: { foot: [2, 1] },
  "sad-plant": { foot: [1, 1] },
  forge: { foot: [4, 1] },
  anvil: { foot: [1, 1] },
  quench: { foot: [1, 1] },
  bindery: { foot: [5, 1] },
  "printer-3d": { foot: [2, 1] },
  "vise-bench": { foot: [3, 1] },
  "stock-shelf": { foot: [2, 1] },
  worktable: { foot: [4, 1] },
  lumber: { foot: [1, 1] },
  "tool-cart": { foot: [1, 1] },
  sawhorses: { foot: [3, 1] },
  boxes: { foot: [2, 1] },
  guillotine: { foot: [2, 1] },
  "long-table": { foot: [4, 1] },
  "meal-bench": { foot: [4, 1] },
  "scrap-bin": { foot: [1, 1] },
  "lab-bench": { foot: [4, 1] },
  "fume-hood": { foot: [2, 1] },
  "bottle-cabinet": { foot: [2, 1] },
  skeleton: { foot: [1, 1] },
  interferometer: { foot: [5, 1] },
  telescope: { foot: [2, 1] },
  "tall-shelf": { foot: [3, 1] },
  "reading-table": { foot: [4, 1] },
  "card-catalogue": { foot: [2, 1] },
  sofa: { foot: [3, 1] },
  armchair: { foot: [1, 1] },
  piano: { foot: [3, 2] },
  "low-table": { foot: [2, 1] },
  "snack-vending": { foot: [1, 1] },
  "bunk-bed": { foot: [3, 1] },
  "single-bed": { foot: [2, 1] },
  "dorm-desk": { foot: [2, 1] },
  wardrobe: { foot: [2, 1] },
  "drying-rack": { foot: [2, 1] },
  "sagam-desk": { foot: [2, 1] },
  extinguisher: { foot: [1, 1] },
  "rice-sacks": { foot: [2, 1] },
  "tray-trolley": { foot: [1, 1] },
  "sink-row": { foot: [4, 1] },
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
