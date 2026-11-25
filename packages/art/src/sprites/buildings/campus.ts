import {
  BAY,
  curtainFrames,
  FLOOR,
  facadeFrames,
  GLASS,
  roofFrames,
  sideFrames,
} from "../../facade.ts";
import { type Legend, sprite } from "../../format.ts";

/**
 * The campus buildings' walls and roofs, in daylight, one material each:
 *
 * - `bld-cream`: 가설관, the old main building, cream concrete with punched windows.
 * - `bld-grey`: 증명관, newer, cool grey concrete, a curtain-glass lobby.
 * - `bld-brick`: 실험동, red brick with white concrete bands.
 * - `bld-canteen`: 급식실, pale yellow render under a sheet-metal roof.
 *
 * Every piece joins edge to edge and draws its outer outline by hand (`outline: false`).
 */
type Roles = Record<
  "o" | "L" | "H" | "h" | "F" | "f" | "d" | "E" | "e" | "T" | "t" | "s" | "P" | "p",
  string
>;

const CREAM: Roles = {
  o: "stone.deep",
  L: "stone.bright",
  H: "stone.light",
  h: "stone.mid",
  F: "stone.pale",
  f: "stone.light",
  d: "stone.light",
  E: "stone.mid",
  e: "stone.light",
  T: "stone.bright",
  t: "stone.light",
  s: "stone.dark",
  P: "stone.mid",
  p: "stone.dark",
};

const GREY: Roles = {
  o: "ink.deep",
  L: "stone.pale",
  H: "stone.mid",
  h: "stone.dark",
  F: "stone.light",
  f: "stone.mid",
  d: "stone.mid",
  E: "stone.dark",
  e: "stone.mid",
  T: "stone.pale",
  t: "stone.mid",
  s: "ink.mid",
  P: "stone.dark",
  p: "ink.mid",
};

const BRICK: Roles = {
  o: "clay.deep",
  L: "stone.bright",
  H: "stone.pale",
  h: "stone.light",
  F: "clay.mid",
  f: "clay.light",
  d: "clay.dark",
  E: "clay.dark",
  e: "clay.light",
  T: "stone.bright",
  t: "stone.pale",
  s: "stone.mid",
  P: "stone.mid",
  p: "stone.dark",
};

const CANTEEN: Roles = {
  o: "wood.dark",
  L: "stone.bright",
  H: "stone.pale",
  h: "stone.light",
  F: "gold.pale",
  f: "gold.light",
  d: "gold.light",
  E: "gold.mid",
  e: "gold.light",
  T: "stone.bright",
  t: "stone.pale",
  s: "stone.mid",
  P: "stone.mid",
  p: "stone.dark",
};

const legend = (roles: Roles): Legend => ({ ...GLASS, ...roles }) as Legend;

function facade(name: string, roles: Roles, brick = false) {
  const frames = facadeFrames({
    texture: brick ? "brick" : "plain",
    glass: ["sky", "blind", "dark", "open", "lit", "poster", "plant", "face"],
  });
  return sprite({
    name,
    size: [BAY, FLOOR],
    origin: [0, FLOOR - 1],
    palette: legend(roles),
    outline: false,
    frames,
    anim: { idle: { frames: ["g-wall"], fps: 1 } },
  });
}

function side(name: string, roles: Roles) {
  return sprite({
    name,
    size: [10, FLOOR],
    origin: [0, FLOOR - 1],
    palette: legend(roles),
    outline: false,
    frames: sideFrames(),
    anim: { idle: { frames: ["ground"], fps: 1 } },
  });
}

/** Flat roof paint: green on the old buildings, plain grey on the new one. */
const ROOF_GREEN: Legend = {
  ".": null,
  o: "stone.deep",
  L: "stone.bright",
  H: "stone.pale",
  h: "stone.mid",
  e: "stone.bright",
  R: "board.light",
  r: "board.mid",
  x: "board.mid",
  X: "olive.mid",
  D: "ink.dark",
};
const ROOF_GREY: Legend = {
  ...ROOF_GREEN,
  o: "ink.deep",
  L: "stone.pale",
  H: "stone.light",
  h: "stone.dark",
  e: "stone.pale",
  R: "stone.mid",
  r: "stone.dark",
  x: "stone.dark",
  X: "stone.vein",
};

function roof(name: string, palette: Legend) {
  return sprite({
    name,
    size: [16, 16],
    origin: [0, 15],
    palette,
    outline: false,
    frames: roofFrames(),
    anim: { idle: { frames: ["fill0"], fps: 1 } },
  });
}

export default [
  facade("bld-cream", CREAM),
  side("bld-cream-side", CREAM),
  facade("bld-grey", GREY),
  side("bld-grey-side", GREY),
  sprite({
    name: "bld-grey-curtain",
    size: [BAY, FLOOR],
    origin: [0, FLOOR - 1],
    palette: legend(GREY),
    outline: false,
    frames: { ...curtainFrames("sky") },
    anim: { idle: { frames: ["g"], fps: 1 } },
  }),
  facade("bld-brick", BRICK, true),
  side("bld-brick-side", BRICK),
  facade("bld-canteen", CANTEEN),
  side("bld-canteen-side", CANTEEN),
  roof("roof-green", ROOF_GREEN),
  roof("roof-grey", ROOF_GREY),
];
