/**
 * Indoor maps: helpers for rooms built from the interior kit, and the parts of a map that are
 * about people (NPC spots, cutscene marks, arenas) with their checks.
 *
 * A room is drawn the way the kit's review scenes are: wall cells carry the `wall-top` overlay
 * (the wall seen from above), every back wall hangs a three-tile face below its cap, and things
 * on a wall (windows, doors, boards, clocks) anchor one pixel in front of the face's floor line,
 * so they sort after the wall and before anyone standing in the room.
 */
import { isSolidTile, TILE_SIZE } from "@guago/shared";
import { CUTSCENES } from "../narrative/cutscenes.ts";
import { SPEAKERS } from "../narrative/speakers.ts";
import type { ArtIndex } from "./check.ts";
import { reach } from "./check.ts";
import type { BuiltMap, BuiltStage, MapSource, Thing, TileRect } from "./format.ts";
import type { Prop, ShadowShape, Vec } from "./layers.ts";

const T = TILE_SIZE;
/** Rows a back wall's face covers below its cap. */
export const FACE_ROWS = 3;

/** The floor line of a back wall whose cap is on tile row `row`: the face's bottom pixel. */
export const floorLine = (row: number): number => (row + 1 + FACE_ROWS) * T - 1;
/** Where things hung on that wall anchor. */
export const mountLine = (row: number): number => floorLine(row) + 1;

/**
 * A back wall's face from tile column `x0` up to (not including) `x1`, cap on `row`. `ends`
 * shades the corner pieces where side walls meet it; `worn` and `outlet` pick variant pieces.
 */
export function backWall(
  prop: string,
  x0: number,
  x1: number,
  row: number,
  opt: {
    readonly ends?: "both" | "left" | "right" | "none";
    readonly worn?: readonly number[];
    readonly outlet?: readonly number[];
  } = {},
): Prop[] {
  const ends = opt.ends ?? "both";
  const out: Prop[] = [];
  for (let x = x0; x < x1; x++) {
    let frame = "run";
    if (x === x0 && (ends === "both" || ends === "left")) frame = "end-l";
    else if (x === x1 - 1 && (ends === "both" || ends === "right")) frame = "end-r";
    else if (opt.worn?.includes(x)) frame = "worn";
    else if (opt.outlet?.includes(x)) frame = "outlet";
    out.push({ prop, frame, at: [x * T, floorLine(row)] });
  }
  return out;
}

/** Something hung on the back wall whose cap is on `row`, centred on pixel `x`. */
export function mount(
  prop: string,
  x: number,
  row: number,
  opt: Omit<Prop, "prop" | "at"> = {},
): Prop {
  return { prop, ...opt, at: [x, mountLine(row)] };
}

/**
 * The shadow band a side wall throws on the floor east of it, from tile row `y0` to `y1`
 * (exclusive), the wall's cap in column `x - 1`.
 */
export function sideShade(x: number, y0: number, y1: number): Prop[] {
  const out: Prop[] = [];
  for (let y = y0; y < y1; y++)
    out.push({ prop: "wall-shade", frame: "v", at: [x * T, y * T + 15] });
  return out;
}

/** A placed sprite that blocks an explicit tile rectangle: for modular and wall-hugging art. */
export function solid(p: Prop, foot: TileRect): Thing {
  return { ...p, foot };
}

/** A soft rectangle of floor shadow in pixels, corners cut. */
export function shadeRect(x0: number, y0: number, x1: number, y1: number): ShadowShape {
  return {
    poly: [
      [x0 + 2, y0],
      [x1 - 2, y0],
      [x1, y0 + 2],
      [x1, y1 - 2],
      [x1 - 2, y1],
      [x0 + 2, y1],
      [x0, y1 - 2],
      [x0, y0 + 2],
    ],
  };
}

/** A tile's centre, feet a little up, as the map format places spawns. */
export const feet = (tile: Vec): Vec => [tile[0] * T + T / 2, tile[1] * T + T - 4];

// Stage: who stands where ---------------------------------------------------------------------

/** Builds a source's NPC spots, marks and arenas. */
export function buildStage(
  src: MapSource,
  rect: (r: TileRect | string, what: string) => TileRect,
): BuiltStage {
  return {
    npcs: (src.npcs ?? []).map((n) => {
      const [x, y] = feet(n.tile);
      return { speaker: n.speaker, x, y, facing: n.facing ?? "down" };
    }),
    marks: Object.fromEntries(
      Object.entries(src.marks ?? {}).map(([name, m]) => {
        const [x, y] = feet(m.tile);
        return [name, { x, y }];
      }),
    ),
    arenas: (src.arenas ?? []).map((a) => ({
      id: a.id,
      rect: rect(a.rect, `arena ${a.id}`),
      modes: a.modes,
    })),
  };
}

/** Themes a map paints its ground in: its theme, its shade, cell themes and every light band. */
function themesUsed(map: BuiltMap): Set<string> {
  const s = map.scene;
  const out = new Set<string>([s.theme]);
  if (s.shade) out.add(s.shade);
  for (const cell of Object.values(s.legend)) if (cell.theme) out.add(cell.theme);
  for (const l of s.lights ?? []) for (const b of l.bands) out.add(b);
  return out;
}

type Baked = { readonly bake?: readonly string[] | null };

/**
 * Problems with a map's people and with its tiles' baking: every terrain and overlay it draws
 * must be baked into every theme it paints with; NPCs must be known speakers standing somewhere
 * a player can walk up to; arenas must be open floor.
 */
export function checkIndoor(map: BuiltMap, art: ArtIndex): string[] {
  const out: string[] = [];
  const say = (msg: string) => out.push(`map ${map.id}: ${msg}`);
  const themes = themesUsed(map);
  const terrains = new Set(
    Object.values(map.scene.legend).flatMap((c) => (c.terrain ? [c.terrain] : [])),
  );
  for (const [name, set] of Object.entries(art.tilesets)) {
    if (!terrains.has(set.upper) && !terrains.has(set.lower)) continue;
    const bake = (set as Baked).bake;
    if (!bake) continue;
    for (const t of themes) if (!bake.includes(t)) say(`${name} is not baked into theme ${t}`);
  }
  for (const e of map.scene.edges ?? []) {
    for (const o of typeof e.overlay === "string" ? [e.overlay] : e.overlay) {
      const bake = (art.overlays[o] as Baked | undefined)?.bake;
      if (!bake) continue;
      for (const t of themes) if (!bake.includes(t)) say(`${o} is not baked into theme ${t}`);
    }
  }

  const speakers = new Set(SPEAKERS.map((s) => s.id));
  const grid = map.collision;
  const main = map.spawns.main;
  const reached = main
    ? reach(grid, [Math.floor(main.x / T), Math.floor(main.y / T)])
    : new Uint8Array(map.w * map.h);
  const near = (tx: number, ty: number) =>
    [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => {
      const x = tx + (dx as number);
      const y = ty + (dy as number);
      return x >= 0 && y >= 0 && x < map.w && y < map.h && reached[y * map.w + x] === 1;
    });
  for (const n of map.npcs) {
    if (!speakers.has(n.speaker)) say(`npc ${n.speaker} is not a narrative speaker`);
    const tx = Math.floor(n.x / T);
    const ty = Math.floor(n.y / T);
    if (!near(tx, ty)) say(`npc ${n.speaker} at tile ${tx},${ty} cannot be walked up to`);
  }
  for (const [name, m] of Object.entries(map.marks)) {
    const tx = Math.floor(m.x / T);
    const ty = Math.floor(m.y / T);
    if (isSolidTile(map, tx, ty)) say(`mark ${name} at tile ${tx},${ty} is not walkable`);
  }
  for (const a of map.arenas) {
    const shut: string[] = [];
    for (let y = a.rect.y; y < a.rect.y + a.rect.h; y++)
      for (let x = a.rect.x; x < a.rect.x + a.rect.w; x++)
        if (isSolidTile(map, x, y)) shut.push(`${x},${y}`);
    if (shut.length > 0) say(`arena ${a.id} has solid tiles at ${shut.slice(0, 6).join(" ")}`);
  }
  return out;
}

/** Every cutscene set on a built map names only marks that map defines. */
export function checkCutsceneMarks(maps: readonly BuiltMap[]): string[] {
  const out: string[] = [];
  for (const c of CUTSCENES) {
    const map = maps.find((m) => m.id === c.map);
    if (!map) continue;
    for (const mark of c.marks)
      if (!(mark in map.marks)) out.push(`map ${map.id}: cutscene ${c.id} needs mark ${mark}`);
  }
  return out;
}
