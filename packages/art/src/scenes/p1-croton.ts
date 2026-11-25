import { type Actor, type Doll, type Prop, scene } from "../scene.ts";

/**
 * p1-croton-school: 크로톤 학당, week three. The counting floor is laid out under the colonnade,
 * forty numbered slabs, and the 피타고라스 학파 stand on it in their tetractys, hands joined along
 * every row, the knotted cords pulled taut: a row strike is coming down the third row and the
 * first, red along the seams. One student is already crossing a slab corner to corner, the
 * diagonal half drawn behind her, and the formation has started to flinch. The rest hold the
 * cells the cords cannot reach, and two 유리수 병사 march the edge of the grid.
 */

const X0 = 112;
const Y0 = 80;
const COLS = 8;
const ROWS = 5;
const cell = (c: number, r: number) => [X0 + c * 32, Y0 + r * 32] as const;

const slabs: Prop[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    slabs.push({
      prop: "p1-cell",
      frame: `n${((r * COLS + c) % 10) + 1}`,
      at: cell(c, r),
      raw: true,
    });
  }
}

/** A row strike's warning along the cells of one row. */
const lane = (r: number, cols: readonly number[]): Prop[] =>
  cols.map((c) => ({
    prop: "p1-lane",
    anim: "row",
    play: true,
    index: c % 2,
    at: cell(c, r),
    raw: true,
  }));

const column = (x: number, y: number): Prop[] => [
  { prop: "column", frame: "whole", at: [x, y] },
  { prop: "column-capital", at: [x, y] },
];
const colonnade = [40, 88, 136, 184, 232, 280, 328, 376, 424].flatMap((x) => column(x, 58));

const student = (
  look: string,
  at: readonly [number, number],
  anim: string,
  dir: "down" | "up" | "side" = "side",
  flip = false,
  index = 0,
): Doll => ({ rig: "student", look, dir, anim, play: true, index, at, flip });

const add = (actor: string, at: readonly [number, number], anim: string, flip = false): Actor => ({
  actor,
  anim,
  play: true,
  shadow: "shadow-m/blob",
  at,
  flip,
});

export default scene({
  name: "p1-croton-school",
  seed: 7,
  theme: "greece",
  legend: {
    m: { terrain: "marble" },
    d: { terrain: "dirt" },
    g: { terrain: "grass" },
  },
  ground: `
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    ddddddddddddddddddddddddddddmm
    gddddddddddddddddddddddddddddd
    ggdddddddddddddddddddddddddddd
    ggdddddddddddddddddddddddddddg
    gggddddddddddddddddddddddddddg
    ggdddddddddddddddddddddddddddg
    ggdddddddddddddddddddddddddggg
    gddddddddddddddddddddddddddggg
    ggdddddddddddddddddddddddddddg
    gggddddddddddddddddddddddddddg
    ggdddddddddddddddddddddddddddg
    ggggdddddddddddddddddddddddggg
    gggggdddddddddddddddddddddgggg
  `,
  details: [
    ...slabs,
    // The row strike coming: the third row end to end, the first on both sides of them.
    ...lane(3, [0, 1, 2, 3, 4, 5, 6, 7]),
    ...lane(1, [0, 1, 2, 5, 6, 7]),
    // The diagonal she is drawing.
    { prop: "p1-diagonal", frame: "trace2", at: cell(6, 4), raw: true },
    { prop: "p1-diagonal", frame: "hint", at: cell(1, 4), raw: true },
  ],
  objects: [
    ...colonnade.filter((c) => c.prop === "column"),
    { prop: "olive", at: [22, 150] },
    { prop: "olive", at: [462, 236] },
    { prop: "amphora", at: [72, 78] },
    { prop: "amphora-tipped", at: [410, 80] },
    { actor: "boss-pythagoreans", anim: "row", index: 1, at: [240, 151] },
    // Holding the cells the cords cannot reach.
    student("club", [204, 172], "attack", "side", false, 1),
    student("curls", [280, 172], "attack", "side", true, 2),
    student("reader", [178, 140], "attack", "side", false, 0),
    student("summer", [313, 226], "walk", "side"),
    student("bedhead", [150, 206], "walk", "down"),
    student("blazer", [372, 116], "idle", "down"),
    student("club", [96, 130], "idle", "side"),
    student("summer", [236, 250], "idle", "up"),
    student("curls", [352, 252], "attack", "up", false, 3),
    student("reader", [136, 248], "walk", "side", true, 1),
    add("rational", [84, 214], "walk"),
    add("rational", [404, 182], "walk", true),
  ],
  overhead: [
    ...colonnade.filter((c) => c.prop === "column-capital"),
    { prop: "olive-crown", anim: "stir", play: true, at: [22, 150] },
    { prop: "olive-crown", anim: "stir", play: true, at: [462, 236] },
  ],
});
