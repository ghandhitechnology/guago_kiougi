import type { TileRect } from "./format.ts";
import type { Prop } from "./layers.ts";
import { hash } from "./noise.ts";
import { gridLines } from "./stamp.ts";

const TILE = 16;
/** Tiles a back wall's face stands tall. */
export const FACE_ROWS = 3;

/**
 * Walls of an interior read from its plan, the way the interior kit draws them: wall cells get
 * the `wall-top` cap from the map's `edges`; under every wall cell with floor below, a face
 * three tiles tall hangs from the cap and is solid; floor beside a side wall gets its shade.
 *
 * Doorways are wall characters listed in `doors`: capped like wall, but the face under them is
 * walkable and a door sprite stands in it, open, so a doorway two cells wide is a way through.
 */
export interface InteriorWalls {
  /** Plan characters that are wall. */
  readonly walls: string;
  /** Face sprite for a wall, by the plan character of the floor under the face. */
  readonly faces: Readonly<Record<string, string>>;
  /** Doorway characters to the door drawn in them. Doorways are two cells wide. */
  readonly doors?: Readonly<Record<string, { readonly prop: string; readonly frame: string }>>;
  readonly seed?: number;
}

export interface WallLayers {
  readonly objects: Prop[];
  readonly shadows: Prop[];
  /** Face cells: solid. */
  readonly blocks: TileRect[];
}

/** The floor line (y) of the faces hanging from wall row `row`: where mounted things stand. */
export function mountY(row: number): number {
  return (row + 1 + FACE_ROWS) * TILE;
}

export function interiorWalls(plan: string, spec: InteriorWalls): WallLayers {
  const rows = gridLines(plan);
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const at = (x: number, y: number): string => rows[y]?.[x] ?? "";
  const doors = spec.doors ?? {};
  const isWall = (x: number, y: number) => {
    const c = at(x, y);
    return c !== "" && (spec.walls.includes(c) || c in doors);
  };
  /**
   * A face hangs under (x, y): it is wall, the cell below is not, and the wall runs across, so
   * the end of a side wall over a doorway stays a thin cap.
   */
  const hangs = (x: number, y: number) =>
    isWall(x, y) && y + 1 < h && !isWall(x, y + 1) && (isWall(x - 1, y) || isWall(x + 1, y));

  const objects: Prop[] = [];
  const shadows: Prop[] = [];
  const blocks: TileRect[] = [];
  const face = new Set<number>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!hangs(x, y)) continue;
      const depth = Math.min(FACE_ROWS, h - 1 - y);
      for (let k = 1; k <= depth; k++) face.add((y + k) * w + x);
      const floor = at(x, Math.min(h - 1, y + 1 + FACE_ROWS));
      const prop = spec.faces[floor] ?? spec.faces[at(x, y + 1)] ?? Object.values(spec.faces)[0];
      if (!prop) continue;
      const left = hangs(x - 1, y);
      const right = hangs(x + 1, y);
      const roll = hash(x, y, spec.seed ?? 7) % 13;
      const frame = !left
        ? "end-l"
        : !right
          ? "end-r"
          : roll === 0
            ? "outlet"
            : roll < 3
              ? "worn"
              : "run";
      objects.push({ prop, frame, at: [x * TILE, mountY(y) - 1] });
      if (!(at(x, y) in doors)) blocks.push({ x, y: y + 1, w: 1, h: depth });
    }
  }

  // Doors, one per pair of doorway cells, standing in the face.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const door = doors[at(x, y)];
      if (!door || !hangs(x, y) || at(x - 1, y) === at(x, y)) continue;
      objects.push({ prop: door.prop, frame: door.frame, at: [x * TILE + TILE, mountY(y)] });
    }
  }

  // Shade on the floor beside every side wall: a corner where it meets a face's shadow.
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      if (isWall(x, y) || face.has(y * w + x)) continue;
      if (!isWall(x - 1, y) || face.has(y * w + x - 1)) continue;
      const corner = face.has((y - 1) * w + x) || isWall(x, y - 1);
      shadows.push({
        prop: "wall-shade",
        frame: corner ? "corner" : "v",
        at: [x * TILE, (y + 1) * TILE - 1],
      });
    }
  }
  return { objects, shadows, blocks };
}

// Walls by hand -------------------------------------------------------------------------------
// For rooms whose walls are placed piece by piece instead of read from the plan.

/**
 * A back wall's face from tile column `x0` up to (not including) `x1`, its cap on `row`.
 * `ends` shades the corner pieces where side walls meet it; `worn` and `outlet` pick variants.
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
    out.push({ prop, frame, at: [x * TILE, mountY(row) - 1] });
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
  return { prop, ...opt, at: [x, mountY(row)] };
}

/** The shadow band a side wall in column `x - 1` throws on the floor east of it, rows y0..y1. */
export function sideShade(x: number, y0: number, y1: number): Prop[] {
  const out: Prop[] = [];
  for (let y = y0; y < y1; y++)
    out.push({ prop: "wall-shade", frame: "v", at: [x * TILE, y * TILE + 15] });
  return out;
}
