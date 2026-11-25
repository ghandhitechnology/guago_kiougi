import type { Dir, PartDef, Piece, PieceGrids, PoseGrid, Vec } from "../format.ts";
import { gridRows } from "../grid.ts";

/**
 * Poses every student part gets from its own drawings, so a new hairstyle, garment or accessory
 * bends over a desk or bows to the floor with no extra art:
 *
 * - `crown`, down: the part's back view, for a head bowed toward the camera.
 * - `slump`, down: the back view's top rows and bottom edge: shoulders seen over a desk.
 * - `prone`, side: the side view (or its `doze` pose) turned a quarter clockwise about the hips,
 *   so the body lies forward with the face to the floor, crown first: the 절.
 * - `hide`, every direction: nothing.
 */

/** Turns a grid a quarter clockwise. */
export function rotCW(grid: string): string {
  const rows = gridRows(grid).map((r) => [...r]);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let row = "";
    for (let y = h - 1; y >= 0; y--) row += rows[y]?.[x] ?? ".";
    out.push(row);
  }
  return out.join("\n");
}

/** Keeps the first `top` rows and the last row of a grid. */
export function shoulders(grid: string, top = 3): string {
  const rows = gridRows(grid);
  if (rows.length <= top + 1) return rows.join("\n");
  return [...rows.slice(0, top), rows[rows.length - 1] as string].join("\n");
}

/** The pivot the `prone` pose turns about: the hips of a body kneeling on the floor. */
const PIVOT: Vec = [9, 15];

function atOf(piece: Piece, dir: Dir): Vec {
  const a = piece.at;
  if (a === undefined) return [0, 0];
  if (Array.isArray(a)) return a as Vec;
  return (a as Partial<Record<Dir, Vec>>)[dir] ?? [0, 0];
}

function poseMap(g: PieceGrids | null | undefined): Readonly<Record<string, PoseGrid>> | null {
  if (g === undefined || g === null) return null;
  return typeof g === "string" ? { rest: g } : g;
}

function placed(pose: PoseGrid, at: Vec): { at: Vec; grid: string } {
  return typeof pose === "string" ? { at, grid: pose } : pose;
}

/** Turns a placed grid a quarter clockwise about `PIVOT`. */
function prone({ at, grid }: { at: Vec; grid: string }): PoseGrid {
  const h = gridRows(grid).length;
  const [px, py] = PIVOT;
  return { at: [px + py - at[1] - h + 1, py - px + at[0]], grid: rotCW(grid) };
}

export function withDerived(def: PartDef): PartDef {
  const pieces: Record<string, Piece> = {};
  for (const [bone, piece] of Object.entries(def.pieces)) {
    const down = poseMap(piece.down);
    const up = poseMap(piece.up);
    const side = poseMap(piece.side);
    const upRest = up?.rest ? placed(up.rest, atOf(piece, "up")) : null;
    const sideSrc = side ? (side.doze ?? side.rest) : undefined;
    const add = (own: Readonly<Record<string, PoseGrid>> | null, extra: Record<string, PoseGrid>) =>
      ({ rest: ".", ...own, ...extra }) as Readonly<Record<string, PoseGrid>>;
    pieces[bone] = {
      ...piece,
      down: add(down, {
        crown: upRest ?? ".",
        slump: upRest ? { at: upRest.at, grid: shoulders(upRest.grid) } : ".",
        hide: ".",
      }),
      up: add(up, { hide: "." }),
      side: add(side, {
        prone: sideSrc ? prone(placed(sideSrc, atOf(piece, "side"))) : ".",
        hide: ".",
      }),
    };
  }
  return { ...def, pieces };
}
