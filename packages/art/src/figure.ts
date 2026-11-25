/**
 * Authoring helpers for the cast's walk-around sprites, built on the student skeleton
 * (`sprites/characters/student.ts`): recolour a garment's trousers, shoes or hands, and add
 * poses to its pieces, so every person shares the student's proportions, directions and frames.
 */
import type { Dir, PartDef, Piece, PieceGrids, PoseGrid } from "./format.ts";

const DIRS: readonly Dir[] = ["down", "up", "side"];

function swapGrid(grid: string, map: ReadonlyMap<string, string>): string {
  return [...grid].map((c) => map.get(c) ?? c).join("");
}

function swapPose(p: PoseGrid, map: ReadonlyMap<string, string>): PoseGrid {
  return typeof p === "string" ? swapGrid(p, map) : { at: p.at, grid: swapGrid(p.grid, map) };
}

function swapGrids(g: PieceGrids | null | undefined, map: ReadonlyMap<string, string>) {
  if (g === undefined || g === null) return g;
  if (typeof g === "string") return swapGrid(g, map);
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, swapPose(v, map)]));
}

/**
 * Swaps letters in the grids of a part's pieces: `swapPart(coat, "eiI", "TtU", ["legL", "legR"])`
 * turns the trousers clay. Without `bones`, every piece changes.
 */
export function swapPart(
  def: PartDef,
  from: string,
  to: string,
  bones?: readonly string[],
): PartDef {
  const map = new Map([...from].map((c, i) => [c, to[i] ?? c]));
  const pieces: Record<string, Piece> = {};
  for (const [bone, piece] of Object.entries(def.pieces)) {
    if (bones && !bones.includes(bone)) {
      pieces[bone] = piece;
      continue;
    }
    const next: Record<string, unknown> = { ...piece };
    for (const d of DIRS) next[d] = swapGrids(piece[d], map);
    pieces[bone] = next as Piece;
  }
  return { ...def, pieces };
}

/** New poses per bone and direction, merged over a part's own. */
export type Poses = Readonly<
  Record<string, Partial<Record<Dir, Readonly<Record<string, PoseGrid>>>>>
>;

/** Adds poses to a part's pieces; a pose with the same name replaces the part's own. */
export function addPoses(def: PartDef, poses: Poses): PartDef {
  const pieces: Record<string, Piece> = { ...def.pieces };
  for (const [bone, byDir] of Object.entries(poses)) {
    const piece = pieces[bone];
    if (!piece) throw new Error(`addPoses: no piece on bone "${bone}"`);
    const next: Record<string, unknown> = { ...piece };
    for (const d of DIRS) {
      const extra = byDir[d];
      if (!extra) continue;
      const own = piece[d];
      const base =
        own === undefined || own === null
          ? { rest: "." }
          : typeof own === "string"
            ? { rest: own }
            : own;
      next[d] = { ...base, ...extra };
    }
    pieces[bone] = next as Piece;
  }
  return { ...def, pieces };
}

/** Replaces a part's legend entries, keeping the rest. */
export function withPalette(def: PartDef, palette: PartDef["palette"]): PartDef {
  return { ...def, palette: { ...def.palette, ...palette } };
}
