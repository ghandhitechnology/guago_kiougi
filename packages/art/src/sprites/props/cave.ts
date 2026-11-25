import { clean, finish, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";

/**
 * 그림자 동굴: the cave from the story, kept by the city. Prisoners' bench chained facing the
 * back wall; behind them a low wall where the carriers walk their cutouts; behind that the fire.
 * On the back wall the cutouts pass as shadows, the only things the bench has ever seen. Torches
 * for the guards, stalagmites to hide behind.
 */

// Fire ------------------------------------------------------------------------------------------

/** Flame colours from the heart out. */
const FLAME = ["Y", "y", "o", "R", "q"];

/**
 * Flames over a base: tongues as lobes that sway and stretch by frame, each pixel coloured by how
 * deep inside the fire it is.
 */
function flames(p: Pic, cx: number, base: number, size: number, frame: number): void {
  // Tongues: each narrows to a point as it rises and bends with the draught, by frame.
  const tongues = [
    { dx: 0, h: 1, w: 0.36 },
    { dx: -0.3, h: 0.66, w: 0.26 },
    { dx: 0.3, h: 0.72, w: 0.26 },
    { dx: -0.14, h: 0.86, w: 0.22 },
    { dx: 0.16, h: 0.8, w: 0.22 },
  ];
  const inside = (x: number, y: number): boolean =>
    tongues.some((t, i) => {
      const h = size * t.h * (1 + Math.sin(frame * 2.3 + i * 1.7) * 0.14);
      const k = (base - y) / h;
      if (k < 0 || k > 1) return false;
      const bend = Math.sin(frame * 1.7 + i * 2.1) * size * 0.1 * k * k;
      const half = size * t.w * (1 - k) ** 0.75 * (k < 0.15 ? 0.7 + k * 2 : 1);
      return Math.abs(x + 0.5 - (cx + t.dx * size + bend)) <= half;
    });
  const depth = (x: number, y: number): number => {
    for (let r = 1; r <= 4; r++)
      if (!inside(x - r, y) || !inside(x + r, y) || !inside(x, y - r * 2) || !inside(x, y + r))
        return r - 1;
    return 4;
  };
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (inside(x, y)) p.set(x, y, FLAME[Math.max(0, 4 - depth(x, y))] as string);
}

function bonfire(frame: number): Pic {
  const W = 44;
  const H = 46;
  const p = Pic.blank(W, H);
  // Ring of stones and the logs crossed in it.
  for (let x = 6; x < W - 6; x += 5) {
    const y = H - 6 + (x % 2);
    p.put(".dd.\ndKMd\ndMSd\n.dd.", x, y - 2);
  }
  for (let k = 0; k < 18; k++) {
    p.set(12 + k, H - 10 + Math.round(k * 0.25), "b").set(
      12 + k,
      H - 9 + Math.round(k * 0.25),
      "U",
    );
    p.set(31 - k, H - 10 + Math.round(k * 0.25), "b").set(
      31 - k,
      H - 9 + Math.round(k * 0.25),
      "u",
    );
  }
  flames(p, W / 2, H - 9, 30, frame);
  clean(p);
  // Sparks going up.
  for (let k = 0; k < 4; k++) {
    const x = Math.round(W / 2 + Math.sin(frame * 1.3 + k * 1.9) * 12);
    const y = Math.round(6 + ((frame * 5 + k * 7) % 16));
    if (p.at(x, y) === ".") p.set(x, y, "Y");
  }
  return p;
}

const TORCH_HANDLE = `
  .II.
  IiiI
  .IbI
  .IbI
  ..b.
  ..b.
  ..b.
  .II.
`;

function torch(frame: number): Pic {
  const p = Pic.blank(10, 22);
  flames(p, 5, 13, 11, frame * 2);
  p.put(TORCH_HANDLE, 3, 13);
  return p;
}

// The back wall ---------------------------------------------------------------------------------

/** Silhouettes the carriers hold up, as the wall receives them: soft-edged, dark on lit stone. */
const SHAPES: readonly string[] = [
  // A horse, walking.
  `
    ........##..
    .......####.
    #.....####..
    ##########..
    .#########..
    .##.....##..
    .#.#....#.#.
    .#.#....#.#.
  `,
  // A man carrying a jar on his shoulder.
  `
    ....##.
    ...####
    ..##.##
    ..###..
    .####..
    #####..
    .###...
    .###...
    .#.#...
    .#.#...
  `,
  // A bird on a stick.
  `
    ##....##
    .##..##.
    ..####..
    ...##...
    ...#....
    ...#....
  `,
  // A tree on a pole.
  `
    ..####..
    .######.
    ########
    .######.
    ...##...
    ...#....
    ...#....
  `,
];

/**
 * The back wall in firelight: rough stone, brightest where the fire faces it, the carriers'
 * cutouts going by as shadows from right to left, and along the foot the round shadows of the
 * prisoners' heads, which never move.
 */
function shadowWall(frame: number): Pic {
  const W = 208;
  const H = 52;
  const p = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - W / 2) / (W / 2);
      const n = hash(x >> 1, y >> 1, 3);
      const j = d + (hash(x, y, 5) - 0.5) * 0.18;
      let ch = j < 0.35 ? "L" : j < 0.7 ? "K" : "V";
      if (n > 0.86) ch = d < 0.5 ? "K" : "V";
      if (n < 0.06) ch = "M";
      if (y < 4 + Math.round(hash(x >> 2, 0, 9) * 3)) ch = "S";
      p.set(x, y, ch);
    }
  // Cracks.
  for (const [x0, y0, len] of [
    [30, 10, 14],
    [150, 14, 18],
    [96, 34, 10],
  ] as const)
    for (let k = 0; k < len; k++) p.set(x0 + k, y0 + Math.round(Math.sin(k / 2) * 1.5), "M");
  // The procession, moving left one step per frame.
  const shapes = [0, 1, 3, 1, 2, 0];
  shapes.forEach((s, i) => {
    const pic = Pic.of(SHAPES[s] as string);
    const x = ((i * 38 + 220 - frame * 6) % 240) - 20;
    const y = 30 - pic.h;
    for (let yy = 0; yy < pic.h; yy++)
      for (let xx = 0; xx < pic.w; xx++) {
        if (pic.at(xx, yy) !== "#") continue;
        for (const [dx, dy, ch] of [
          [-1, 0, "M"],
          [1, 0, "M"],
          [0, -1, "M"],
          [0, 0, "S"],
        ] as const) {
          const X = x + xx * 2 + dx;
          const Y = y + yy * 2 + dy;
          if (X < 0 || X >= W) continue;
          for (const [ax, ay] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ] as const)
            if (ch === "S" || p.at(X + ax, Y + ay) !== "S") p.set(X + ax, Y + ay, ch);
        }
      }
  });
  // The prisoners' heads, in a row along the foot of the wall.
  for (let k = 0; k < 7; k++) {
    const cx = 44 + k * 20;
    for (let y = 38; y < H; y++)
      for (let x = cx - 6; x <= cx + 6; x++) {
        const r = Math.hypot((x - cx) / 6, (y - 44) / 6);
        if (r < 1 || y > 46) p.set(x, y, r < 0.8 || y > 47 ? "S" : "M");
      }
  }
  hline(p, 0, H - 1, W, "d");
  return clean(p);
}

// The low wall and what goes along it ---------------------------------------------------------------

/** A dry-stone wall, a course of capstones on top, stones in two courses below. */
function parapet(kind: "mid" | "w" | "e"): Pic {
  const W = 32;
  const H = 18;
  const p = Pic.blank(W, H);
  rect(p, 0, 0, W, 4, "k");
  hline(p, 0, 0, W, "w");
  hline(p, 0, 3, W, "M");
  for (let x = 0; x < W; x += 8) vline(p, x, 0, 4, "V");
  for (let y = 4; y < H - 1; y++)
    for (let x = 0; x < W; x++) {
      const course = y < 10 ? 0 : 1;
      const off = course ? 5 : 0;
      const joint = (x + off) % 10 === 0 || y === 9;
      p.set(x, y, joint ? "S" : y < 6 || (y > 9 && y < 12) ? "K" : "M");
    }
  hline(p, 0, H - 1, W, "d");
  if (kind !== "mid") {
    const side = kind === "w" ? 0 : W - 1;
    for (let y = 0; y < H; y++) {
      p.set(side, y, "d");
      const inner = kind === "w" ? 1 : W - 2;
      if (y > 0 && y < H - 1) p.set(inner, y, kind === "w" ? "k" : "S");
    }
    p.set(side, 0, ".").set(side, H - 1, ".");
  }
  hline(p, 0, 0, W, "d");
  return clean(p, "dwkKMSV");
}

/** The carriers' cutouts, painted wood on poles, propped in a stand behind the wall. */
const CUTOUTS: Readonly<Record<string, string>> = {
  horse: `
    .........uu..
    ........uWuu.
    U......uuuU..
    UUuuuuuuuuU..
    .UuuuuuuuuU..
    .UU.....UU...
    .U.U....U.U..
    .....b.......
    .....b.......
    .....b.......
    .....b.......
    .....b.......
  `,
  jar: `
    ....uuu....
    ...uWWWu...
    ...UuuuU...
    ..uWuuuuU..
    .uWuuuuuuU.
    .uuuuuuuuU.
    ..UuuuuuU..
    ...UUUUU...
    .....b.....
    .....b.....
    .....b.....
    .....b.....
  `,
  man: `
    ...uu....
    ..uWuu...
    ..uuuU...
    .uuuuuU..
    uWuuuuuU.
    uuuuuuuU.
    .uuuuuU..
    .uU.uU...
    .uU.uU...
    ....b....
    ....b....
    ....b....
  `,
};

function cutout(kind: string): Pic {
  const p = Pic.blank(16, 40);
  const grid = Pic.of(CUTOUTS[kind] ?? (CUTOUTS.man as string));
  const x = Math.floor((16 - grid.w) / 2);
  p.put(grid, x, 0);
  // The pole runs on down to a stand, long enough to hold the figure over the wall.
  const pole = x + (grid.rows[grid.h - 1]?.indexOf("b") ?? 0);
  for (let y = grid.h; y < 37; y++) p.set(pole, y, "b");
  p.put(".SS.\nSKMS\n.dd.", 6, 37);
  return finish(p);
}

/** The bench the prisoners sit on, shackles still locked to it, the chains run to rings in the floor. */
function bench(): Pic {
  const W = 52;
  const H = 18;
  const p = Pic.blank(W, H);
  rect(p, 1, 3, W - 2, 3, "k");
  hline(p, 1, 3, W - 2, "w");
  rect(p, 1, 6, W - 2, 7, "M");
  hline(p, 1, 6, W - 2, "K");
  for (let x = 6; x < W - 4; x += 8) {
    p.put(".II.\nI..I\n.II.", x, 0);
    for (let y = 7; y < 15; y++) p.set(x + 1 + (y % 2), y, y % 2 ? "i" : "I");
    p.put("III", x, 15);
  }
  return finish(p, "iI");
}

// Rock ---------------------------------------------------------------------------------------------

/** A stalagmite: a lumpy cone, wet on its lit side. */
function stalagmite(w: number, h: number, seed: number): Pic {
  const out = Pic.blank(18, 30);
  const p = Pic.blank(w, h);
  const half = (y: number) => {
    const t = y / (h - 1);
    return Math.max(0.6, (w / 2 - 1) * t ** 0.8 + Math.sin(y * 0.9 + seed) * 0.7);
  };
  const cx = w / 2;
  const isIn = (x: number, y: number) => y >= 1 && y < h - 1 && Math.abs(x + 0.5 - cx) <= half(y);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!isIn(x, y)) continue;
      const rel = (x + 0.5 - cx) / Math.max(1, half(y));
      let ch = rel < -0.35 ? "K" : rel < 0.35 ? "M" : "S";
      if (rel < -0.1 && rel > -0.5 && (y + seed) % 6 < 2) ch = "k";
      if ((y + seed) % 5 === 0 && rel > -0.6) ch = rel > 0.3 ? "S" : "V";
      p.set(x, y, ch);
    }
  return out.put(finish(p), Math.floor((18 - w) / 2), 30 - h);
}

export default [
  greek(
    "bonfire",
    { burn0: bonfire(0), burn1: bonfire(1), burn2: bonfire(2), burn3: bonfire(3) },
    {
      anim: { burn: { frames: ["burn0", "burn1", "burn2", "burn3"], fps: 8 } },
      outline: false,
      lone: "Yyo",
      shadow: ovalShadow(44, 46, 22, 42, 18, 3),
    },
  ),
  greek(
    "torch",
    { burn0: torch(0), burn1: torch(1), burn2: torch(2) },
    {
      anim: { burn: { frames: ["burn0", "burn1", "burn2"], fps: 8 } },
      outline: false,
      lone: "Yyo",
    },
  ),
  greek(
    "shadow-wall",
    { pass0: shadowWall(0), pass1: shadowWall(1), pass2: shadowWall(2), pass3: shadowWall(3) },
    {
      anim: { pass: { frames: ["pass0", "pass1", "pass2", "pass3"], fps: 2 } },
      origin: [104, 51],
      outline: false,
    },
  ),
  greek(
    "low-wall",
    { mid: parapet("mid"), w: parapet("w"), e: parapet("e") },
    { origin: [0, 17], outline: false },
  ),
  greek(
    "cutout",
    { horse: cutout("horse"), jar: cutout("jar"), man: cutout("man") },
    {
      shadow: ovalShadow(16, 40, 8, 39, 4, 1.2),
    },
  ),
  greek(
    "shackle-bench",
    { still: bench() },
    { lone: "iI", shadow: ovalShadow(52, 18, 27, 16, 25, 2) },
  ),
  greek(
    "stalagmite",
    { a: stalagmite(14, 30, 1), b: stalagmite(12, 20, 4), c: stalagmite(18, 24, 7) },
    { shadow: ovalShadow(18, 30, 9, 29, 8, 1.6) },
  ),
];
