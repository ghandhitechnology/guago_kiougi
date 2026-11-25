import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, smooth } from "../../paint.ts";

/**
 * Pieces that make the campus buildings more than boxes: what stands on the roofs (the stair
 * house, a water tank, AC units, 가설관's observatory dome), the skybridge between 가설관 and
 * 증명관, the outside stair to 가설관's second floor, the steel fire escape up to the 자습실, the
 * 급식실's sheet-metal roof and the 역사관's tiled one. Lit from the top left.
 */
const palette: Legend = {
  ".": null,
  // concrete
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // steel
  J: "ink.deep",
  j: "ink.dark",
  I: "ink.mid",
  i: "ink.light",
  // glass
  v: "navy.dark",
  N: "navy.mid",
  n: "navy.light",
  b: "navy.pale",
  // tank
  T: "navy.deep",
  // sheet metal
  E: "sea.deep",
  e: "sea.dark",
  c: "sea.mid",
  C: "sea.light",
  // roof tiles
  P: "plum.deep",
  p: "plum.dark",
  q: "plum.mid",
  // brick and trim
  R: "clay.deep",
  r: "clay.dark",
  // warning paint
  Y: "gold.light",
  y: "gold.mid",
  O: "gold.dark",
};

const still = (
  name: string,
  size: [number, number],
  grid: string,
  extra: Partial<Parameters<typeof sprite>[0]> = {},
) =>
  sprite({
    name,
    size,
    palette,
    frames: { still: grid },
    anim: { idle: { frames: ["still"], fps: 1 } },
    ...extra,
  });

// Rooftop ---------------------------------------------------------------------------------------

/** The stair house (옥탑): a box with a steel door, its own little roof slab, a vent pipe. */
function stairHouse(): string {
  const W = 40;
  const H = 38;
  const pic = Pic.blank(W, H);
  // Roof slab seen from above.
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < W; x++) {
      const edge = y === 0 || x === 0 || x === W - 1;
      pic.set(x, y, edge ? "d" : y === 1 || x === 1 ? "w" : y > 8 ? "M" : x === W - 2 ? "K" : "K");
    }
  }
  for (let x = 4; x < W - 4; x += 9) pic.set(x, 4, "S").set(x + 1, 4, "S");
  // Front face.
  for (let y = 11; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ch = y === 11 ? "d" : y === 12 ? "w" : y === 13 ? "K" : "k";
      if (x === 0 || x === W - 1 || y === H - 1) ch = "d";
      else if (y >= H - 3) ch = "M";
      pic.set(x, y, ch);
    }
  }
  // Steel door and its frame, a wired window, a warning stripe on the step.
  for (let y = 17; y < H - 1; y++) {
    for (let x = 8; x < 20; x++) {
      const edge = x === 8 || x === 19 || y === 17;
      let ch = edge ? "J" : "i";
      if (!edge && x === 9) ch = "I";
      if (!edge && y >= 20 && y < 25 && x > 10 && x < 17)
        ch = y === 20 || y === 24 || x === 11 || x === 16 ? "j" : "N";
      if (!edge && y === 29 && x > 15) ch = "j";
      pic.set(x, y, ch);
    }
  }
  for (let x = 6; x < 22; x++) pic.set(x, H - 2, x % 4 < 2 ? "Y" : "J");
  // A small window and an exhaust grille.
  for (let y = 18; y < 23; y++)
    for (let x = 26; x < 34; x++)
      pic.set(x, y, y === 18 || x === 26 || x === 33 || y === 22 ? "d" : y === 19 ? "b" : "n");
  for (let y = 26; y < 31; y++)
    for (let x = 27; x < 33; x++) pic.set(x, y, y % 2 === 0 ? "S" : "M");
  return smooth(pic, "dJYwk").toString();
}

/** A blue water tank on a steel stand, its lid in the sun. */
function waterTank(): string {
  const W = 26;
  const H = 32;
  const body = lobes([{ x: 13, y: 5, rx: 11.5, ry: 4.5 }]);
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inLid = body(x, y);
      const inBody = x >= 2 && x <= 23 && y >= 5 && y <= 22;
      const inBelly = lobes([{ x: 13, y: 22, rx: 11.5, ry: 4 }])(x, y);
      if (!(inLid || inBody || inBelly)) continue;
      let ch = "N";
      if (inLid && !inBody) ch = y < 4 ? "b" : "n";
      else if (x < 6) ch = "n";
      else if (x > 19) ch = "v";
      if (y === 11 || y === 17) ch = x < 6 ? "N" : "v";
      pic.set(x, y, ch);
    }
  }
  pic.put("bb\nbb", 6, 2);
  // Legs and cross braces.
  for (let y = 25; y < H; y++) {
    for (const x of [4, 5, 20, 21]) pic.set(x, y, x % 2 ? "j" : "I");
    if (y === 28) for (let x = 6; x < 20; x++) pic.set(x, y, "I");
  }
  return seal(pic, "T", "Ij")
    .toString()
    .replace(/T(?=[Ij])/g, "T");
}

/** An AC condenser: a pale box, a round fan grille, a pipe going off. */
const AC = `
  dddddddddddddd
  dwwwwwwwwwwwkd
  dkkkkkkkkkkkKd
  dkkjjjjjkkkkKd
  dkjIjIjIjkkkKd
  dkjjIiIjjkMMKd
  dkjIiJiIjkkkKd
  dkjjIiIjjkMMKd
  dkjIjIjIjkkkKd
  dkkjjjjjkkkkKd
  dKKKKKKKKKKKMd
  dddddddddddddd
  .dd........dd.
`;

/**
 * 천문돔, the observatory on 가설관's roof: a white dome on a drum, its shutter slid open on a
 * dark slit, a telescope's tube just catching the light inside.
 */
function dome(): string {
  const W = 36;
  const H = 40;
  const cx = 17.5;
  const pic = Pic.blank(W, H);
  const isDome = lobes([{ x: cx, y: 22, rx: 16, ry: 18 }]);
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < W; x++) {
      if (!isDome(x, y)) continue;
      const d = Math.hypot((x + 0.5 - (cx - 6)) / 16, (y + 0.5 - 8) / 18);
      pic.set(x, y, d < 0.35 ? "w" : d < 0.75 ? "k" : d < 1.05 ? "K" : "M");
    }
  }
  // The slit: a dark band from the crown down, with the scope's tube in it.
  for (let y = 4; y < 22; y++) {
    for (let x = 18; x < 23; x++)
      if (isDome(x, y)) pic.set(x, y, x === 18 ? "J" : x === 22 ? "S" : "j");
    if (y > 7 && y < 13) pic.set(20, y, "i").set(21, y, "I");
  }
  // Drum.
  for (let y = 22; y < H; y++) {
    for (let x = 2; x < W - 2; x++) {
      let ch = x < 6 ? "w" : x > W - 7 ? "M" : "k";
      if (y === 22) ch = "K";
      if (y === 23) ch = "S";
      if (y >= H - 3) ch = "M";
      if (y === 30 && x % 6 === 0) ch = "K";
      pic.set(x, y, ch);
    }
  }
  return seal(smooth(pic, "jJiIS"), "d", "J").toString();
}

/** Solar panels on 증명관's roof, tilted to the south, cells in a grid. */
const SOLAR = (() => {
  const W = 48;
  const H = 14;
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ch = y === 0 ? "J" : y === 1 ? "i" : y >= H - 3 ? (y === H - 1 ? "J" : "I") : "N";
      if (y > 1 && y < H - 3) {
        if (x % 8 === 0 || y === 6) ch = "v";
        else if ((x + y) % 11 === 0) ch = "b";
      }
      if (x === 0 || x === W - 1) ch = "J";
      pic.set(x, y, ch);
    }
  }
  return smooth(pic, "J").toString();
})();

// Skybridge -------------------------------------------------------------------------------------

/**
 * The skybridge between 가설관 and 증명관 at the second floor: a slab, a ribbon of glass catching
 * the sky, a cornice. Pieces join edge to edge.
 */
const SKYBRIDGE = (() => {
  const rows: string[] = [];
  rows.push(
    "dddddddddddddddd",
    "wwwwwwwwwwwwwwww",
    "kkkkkkkkkkkkkkkk",
    "KKKKKKKKKKKKKKKK",
    "MMMMMMMMMMMMMMMM",
  );
  for (let r = 0; r < 18; r++) {
    let row = "";
    for (let x = 0; x < 16; x++) {
      if (x === 7) row += "M";
      else if (x === 8) row += "K";
      else if ((x + r) % 13 < 2) row += r < 8 ? "w" : "b";
      else row += r < 3 ? "b" : r < 11 ? "n" : "N";
    }
    rows.push(row);
  }
  rows.push(
    "KKKKKKKKKKKKKKKK",
    "kkkkkkkkkkkkkkkk",
    "KKKKKKKKKKKKKKKK",
    "MMMMMMMMMMMMMMMM",
    "SSSSSSSSSSSSSSSS",
    "dddddddddddddddd",
  );
  return smooth(Pic.of(rows.join("\n")), "d").toString();
})();

// Stairs ----------------------------------------------------------------------------------------

/**
 * The outside stair to 가설관's second floor, running straight out from the wall: a landing at
 * the door, sixteen treads down to the walk between two concrete parapets.
 */
function frontStair(): string {
  const W = 40;
  const H = 104;
  const pic = Pic.blank(W, H);
  const landing = 14;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const left = x < 5;
      const right = x >= W - 5;
      let ch: string;
      if (left) ch = x === 0 ? "d" : x === 1 ? "w" : x === 4 ? "M" : "k";
      else if (right) ch = x === W - 1 ? "d" : x === W - 5 ? "w" : x === W - 2 ? "S" : "K";
      else if (y < landing) ch = y === landing - 1 ? "M" : y < 2 ? "K" : "k";
      else {
        const step = (y - landing) % 6;
        ch = step < 3 ? "k" : step === 3 ? "K" : step === 4 ? "M" : "S";
        if (x === 5) ch = step < 3 ? "K" : "S";
      }
      if (y === H - 1) ch = "d";
      pic.set(x, y, ch);
    }
  }
  // Parapet tops lit, a handrail on the right.
  for (let y = 0; y < H - 1; y++) pic.set(2, y, "w").set(W - 3, y, y % 12 < 1 ? "I" : "K");
  return smooth(pic, "dw").toString();
}

/**
 * The fire escape up 가설관's west end to the 자습실: four landings, flights zigzagging between
 * them, railings, painted steel. The way students come back up after the doors are locked.
 */
function fireEscape(): string {
  const W = 34;
  const FLOOR = 48;
  const H = FLOOR * 4 + 10;
  const pic = Pic.blank(W, H);
  const line = (x0: number, y0: number, x1: number, y1: number, ch: string) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let t = 0; t <= n; t++)
      pic.set(Math.round(x0 + ((x1 - x0) * t) / n), Math.round(y0 + ((y1 - y0) * t) / n), ch);
  };
  // Posts.
  for (let y = 6; y < H; y++) {
    pic.set(1, y, "J").set(2, y, "i").set(3, y, "J");
    pic
      .set(W - 4, y, "J")
      .set(W - 3, y, "I")
      .set(W - 2, y, "J");
  }
  for (let f = 0; f < 4; f++) {
    const top = H - 1 - (f + 1) * FLOOR;
    const bottom = H - 1 - f * FLOOR;
    // Landing at the top of this flight: a grating band with a railing above.
    for (let x = 1; x < W - 1; x++) {
      pic
        .set(x, top, "J")
        .set(x, top + 1, "i")
        .set(x, top + 2, "I")
        .set(x, top + 3, "J");
      if (x % 3 === 0) pic.set(x, top + 2, "j");
      pic.set(x, top - 8, "J").set(x, top - 7, "I");
    }
    for (let x = 4; x < W - 4; x += 5) for (let y = top - 6; y < top; y++) pic.set(x, y, "I");
    // A flight: stringer and treads, alternating direction.
    const goingRight = f % 2 === 0;
    const x0 = goingRight ? 4 : W - 5;
    const x1 = goingRight ? W - 5 : 4;
    line(x0, bottom - 2, x1, top + 4, "J");
    line(x0, bottom - 3, x1, top + 3, "I");
    const n = 10;
    for (let k = 1; k < n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n);
      const y = Math.round(bottom - 3 + ((top + 3 - (bottom - 3)) * k) / n);
      pic.set(x, y - 1, "i").set(x + (goingRight ? 1 : -1), y - 1, "i");
    }
    // Its handrail.
    line(x0, bottom - 14, x1, top - 8, "i");
  }
  // Foot plate.
  for (let x = 0; x < W; x++) pic.set(x, H - 1, "J");
  return pic.toString();
}

// Pitched roofs ---------------------------------------------------------------------------------

/**
 * The 급식실's sheet-metal roof, its south slope seen from the yard: standing seams every four
 * pixels, a ridge cap, a gutter. `l` and `r` close the ends with a verge.
 */
function metalRoof(part: "l" | "m" | "r", h: number): string {
  const pic = Pic.blank(16, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 16; x++) {
      let ch: string;
      if (y === 0) ch = "J";
      else if (y < 3) ch = y === 1 ? "w" : "K";
      else if (y === 3) ch = "S";
      else if (y >= h - 4) ch = y === h - 4 ? "w" : y === h - 3 ? "K" : y === h - 2 ? "S" : "J";
      else ch = x % 4 === 0 ? "C" : x % 4 === 3 ? "e" : y < 8 ? "C" : "c";
      pic.set(x, y, ch);
    }
  }
  if (part === "l") for (let y = 0; y < h; y++) pic.set(0, y, "J").set(1, y, "w").set(2, y, "K");
  if (part === "r") for (let y = 0; y < h; y++) pic.set(15, y, "J").set(14, y, "S").set(13, y, "M");
  return pic.toString();
}

/** The kitchen's exhaust hood on the metal roof: a box, a cap, a stain of grease run down. */
const EXHAUST = `
  ..JJJJJJJJJJ..
  .JiiiiiiiiiiJ.
  JJJJJJJJJJJJJJ
  ...JjjjjjjJ...
  ...JiIIIIjJ...
  ...JiIjjIjJ...
  ...JiIIIIjJ...
  ...JiIIIIjJ...
  ...JiIIIIjJ...
  ..JJJJJJJJJJ..
  ..JIIIIIIIIJ..
  ..JJJJJJJJJJ..
`;

/**
 * The 역사관's tiled roof, the oldest roof on campus: rows of dark fired tiles, a pale ridge, the
 * eaves throwing a shadow. Hipped at the ends.
 */
function tileRoof(part: "l" | "m" | "r", h: number): string {
  const pic = Pic.blank(16, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 16; x++) {
      let ch: string;
      if (y === 0) ch = "J";
      else if (y < 4) ch = y === 1 ? "k" : y === 2 ? "K" : "M";
      else if (y >= h - 3) ch = y === h - 3 ? "q" : y === h - 2 ? "p" : "P";
      else {
        const row = (y - 4) % 5;
        ch =
          row === 0
            ? "P"
            : row === 1
              ? "q"
              : (x + (Math.floor((y - 4) / 5) % 2) * 2) % 4 === 0
                ? "P"
                : "p";
      }
      pic.set(x, y, ch);
    }
  }
  // Hips: the roof's ends slope in toward the ridge.
  if (part !== "m") {
    for (let y = 0; y < h; y++) {
      const inset = Math.max(0, Math.round((h - 1 - y) * 0.45) - 1);
      for (let k = 0; k < 16; k++) {
        const x = part === "l" ? k : 15 - k;
        if (k < inset) pic.set(x, y, ".");
        else if (k === inset) pic.set(x, y, "J");
        else if (k === inset + 1 && y > 0) pic.set(x, y, part === "l" ? "k" : "p");
      }
    }
  }
  return smooth(pic, "J").toString();
}

// The clock ------------------------------------------------------------------------------------

/** The clock over 가설관's doors, stopped at ten to five. */
const CLOCK_GOLDEN = `
  ....dddddd....
  ..ddwwwwwwdd..
  .dwwwwMwwwwKd.
  .dwwwwjwwwwKd.
  dwwwwwjwwwwwKd
  dwwwwwjwwwwwKd
  dMwwwwjwwwwMKd
  dwwwwwwjwwwwKd
  dwwwwwwwjwwwKd
  .dwwwwwwwjwKd.
  .dwwwwwMwwwKd.
  ..ddKKKKKKdd..
  ....dddddd....
  ..............
`;

export default [
  still("roof-stairs", [40, 38], stairHouse(), { outline: false }),
  still("water-tank", [26, 32], waterTank(), { outline: false }),
  still("ac-unit", [14, 13], smooth(Pic.of(AC), "d").toString(), { outline: false }),
  still("dome", [36, 40], dome(), { outline: false }),
  still("solar", [48, 14], SOLAR, { outline: false }),
  sprite({
    name: "skybridge",
    size: [16, 29],
    origin: [0, 28],
    palette,
    outline: false,
    frames: { run: SKYBRIDGE },
    anim: { idle: { frames: ["run"], fps: 1 } },
  }),
  still("stair-2f", [40, 104], frontStair(), { outline: false }),
  still("fire-escape", [34, 4 * 48 + 10], fireEscape(), { outline: false, lone: "iIjJ" }),
  sprite({
    name: "roof-metal",
    size: [16, 48],
    origin: [0, 47],
    palette,
    outline: false,
    frames: { l: metalRoof("l", 48), m: metalRoof("m", 48), r: metalRoof("r", 48) },
    anim: { idle: { frames: ["m"], fps: 1 } },
  }),
  still("exhaust", [14, 12], EXHAUST, { outline: false }),
  sprite({
    name: "roof-tile",
    size: [16, 64],
    origin: [0, 63],
    palette,
    outline: false,
    frames: { l: tileRoof("l", 64), m: tileRoof("m", 64), r: tileRoof("r", 64) },
    anim: { idle: { frames: ["m"], fps: 1 } },
  }),
  still("clock-golden", [14, 14], CLOCK_GOLDEN, { lone: "Mj", outline: false }),
];
