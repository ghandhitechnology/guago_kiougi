import type { TerrainGrid } from "../dualgrid.ts";

/** A small map that exercises all 16 masks, with a worn path and a lone patch. `#` is upper. */
const SAMPLE = `
  ################
  #####...########
  ####.....###.###
  ###..###..#...##
  ###.#####.##.###
  ###..###..######
  ####.....#######
  ######..##.#####
  #######......###
  ########..#..###
  ################
`;

export function sampleGrid(): TerrainGrid {
  const rows = SAMPLE.trim()
    .split("\n")
    .map((r) => r.trim());
  const w = (rows[0] as string).length;
  const cells = new Uint8Array(w * rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      cells[y * w + x] = ch === "#" ? 1 : 0;
    });
  });
  return { w, h: rows.length, cells };
}
