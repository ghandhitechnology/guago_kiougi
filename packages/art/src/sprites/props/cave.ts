import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, smooth, tidy } from "../../paint.ts";

/**
 * 동굴 입구: the slope under the cliff where the 그림자 동굴 opens. A fire burns before the mouth;
 * between it and the rock a low wall where someone carried cut-out shapes on sticks, and their
 * shadows, ten times life size, still move on the cliff. Benches face the wall in rows, their
 * chains broken. The guards keep a post beside the mouth. Lit from the top left; fire is drawn
 * raw because it is light.
 */
const palette: Legend = {
  ".": null,
  // limestone
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  v: "stone.vein",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // the dark inside
  j: "ink.deep",
  J: "ink.dark",
  i: "ink.mid",
  // wood
  B: "wood.deep",
  b: "wood.dark",
  u: "wood.mid",
  U: "wood.light",
  e: "wood.pale",
  // fire
  Y: "gold.pale",
  y: "gold.light",
  g: "gold.mid",
  r: "clay.light",
  R: "clay.mid",
  h: "red.mid",
  H: "red.light",
  X: "red.deep",
  // bronze and the crest
  G: "gold.deep",
  q: "gold.dark",
  // cloth
  c: "stone.pale",
  C: "stone.light",
  // scrub
  o: "olive.mid",
  O: "olive.dark",
  x: null,
};

const one = (
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

function finish(pic: Pic, outline: string, fill: string, keep = ""): string {
  return tidy(tidy(seal(pic, outline), fill, outline + keep), fill, outline + keep).toString();
}

function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "d");
  return pic.toString();
}

function hash(x: number, y: number, s: number): number {
  let v = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
}

// The cliff ------------------------------------------------------------------------------------

const CL_W = 64;
const CL_H = 112;

/**
 * A 64-pixel run of cliff: a broken top against the sky, strata stepping down the face, joints
 * running down them, ledges with scrub, scree at the foot. Every variant meets its neighbours at
 * the same height on both sides, so runs tile in any order.
 */
function cliff(v: number): string {
  const pic = Pic.blank(CL_W, CL_H);
  const top = (x: number): number => {
    const edge = Math.min(x, CL_W - 1 - x);
    const bump = Math.sin((x + v * 17) * 0.19) * 7 + Math.sin((x + v * 5) * 0.53) * 3;
    return Math.round(14 + (edge < 6 ? 0 : bump * Math.min(1, (edge - 6) / 8)));
  };
  for (let x = 0; x < CL_W; x++) {
    const t = top(x);
    for (let y = t; y < CL_H; y++) {
      const depth = y - t;
      // Strata that wander and pinch: bands of uneven thickness, each lit along its top and
      // shaded under its overhang, their lines tilting with the bedding.
      // Periodic over the run's width, so the beds meet the next run's at both edges.
      const turn = (2 * Math.PI * x) / CL_W;
      const bed = y + Math.sin(turn) * 3 + Math.sin(turn * 3) * (0.8 + v * 0.5);
      const band = ((bed % 15) + 15) % 15;
      const blockSeam = Math.floor(bed / 15) * 7 + v * 5 + 3;
      let ch = band < 1 ? "k" : band < 2.2 ? "K" : band > 12.5 ? "S" : band > 9 ? "M" : "v";
      // Joints: cracks down part of a band, never the whole face.
      const joint = (x * 3 + blockSeam * 11) % 29;
      if (joint === 0 && band > 2 && band < 12) ch = "S";
      if (joint === 1 && band > 2 && band < 9) ch = "M";
      // Weathering: darker pits and pale flakes.
      const n = hash(x, y, v + 40);
      if (ch === "v" && n < 0.05) ch = "M";
      else if (ch === "M" && n > 0.96) ch = "v";
      if (depth < 2) ch = depth === 0 ? "w" : "k";
      if (y > CL_H - 10) ch = (x * 7 + y * 3) % 5 === 0 ? "M" : "S";
      pic.set(x, y, ch);
    }
  }
  // Scrub on the ledges.
  for (let y = 18; y < CL_H - 12; y++)
    for (let x = 2; x < CL_W - 3; x++)
      if (pic.at(x, y) === "k" && hash(x, y, v) < 0.06)
        pic.put(
          `
            .oo.
            oOOo
          `,
          x - 1,
          y - 2,
          { onto: "kKv" },
        );
  // Outline the skyline and the foot, but not the sides, where the next run continues.
  const smoothed = smooth(pic);
  const sealed = seal(smoothed, "d");
  for (let y = 0; y < CL_H; y++)
    for (const x of [0, CL_W - 1]) {
      const was = smoothed.at(x, y) as string;
      const above = smoothed.at(x, y - 1);
      if (was !== "." && above !== "." && y < CL_H - 1) sealed.set(x, y, was);
    }
  return tidy(tidy(sealed, "v", "doO"), "v", "doO").toString();
}

/**
 * The mouth of the cave: an arch of rock, its rim lit, the inside going from the rock's own
 * shadow to black, the floor sloping down into it, teeth of rock hanging from the roof.
 */
function caveMouth(): string {
  const W = 80;
  const H = 68;
  const pic = Pic.blank(W, H);
  const arch = (x: number, y: number) => {
    const u = (x - 40) / 31;
    return Math.abs(u) < 1 && y > 66 - 58 * Math.sqrt(1 - u * u) ** 0.9;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!arch(x, y)) continue;
      const inner = arch(x - 3, y) && arch(x + 3, y) && arch(x, y - 3);
      const deep = arch(x - 8, y) && arch(x + 8, y) && arch(x, y - 9);
      pic.set(x, y, deep ? "j" : inner ? "J" : "i");
    }
  // The rim of the arch, lit on the west.
  const rim = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (arch(x, y)) continue;
      const near =
        arch(x + 1, y) ||
        arch(x - 1, y) ||
        arch(x, y + 1) ||
        arch(x + 2, y) ||
        arch(x - 2, y) ||
        arch(x, y + 2);
      if (near) rim.set(x, y, x < 40 ? "k" : "M");
    }
  pic.put(rim, 0, 0);
  // Teeth from the roof.
  for (const [tx, len] of [
    [26, 6],
    [33, 9],
    [41, 5],
    [48, 8],
    [54, 4],
  ] as const) {
    for (let k = 0; k < len; k++) {
      const y = 66 - Math.round(58 * Math.sqrt(1 - ((tx - 40) / 31) ** 2) ** 0.9) + k;
      const half = len - k > 3 ? 1 : 0;
      for (let dx = -half; dx <= half; dx++) pic.set(tx + dx, y, dx < 0 ? "M" : "S");
    }
  }
  // The floor, worn pale where the guards walk in.
  for (let x = 22; x < 58; x++)
    for (let y = 62; y < H; y++) if (arch(x, y)) pic.set(x, y, y > 64 ? "S" : "i");
  return tidy(pic, "J", "jJikMS").toString();
}

// The shadow play --------------------------------------------------------------------------------

/**
 * Shadows on the cliff, ten times the size of the shapes that cast them: a horse, a man with a
 * jar on his shoulder, a bird. The fire flickers, so they swell and lean between frames. Raw ink.
 */
function wallShadows(frame: number): string {
  const W = 120;
  const H = 64;
  const pic = Pic.blank(W, H);
  const lean = [0, 1, -1][frame] ?? 0;
  const grow = [0, 1, 0][frame] ?? 0;
  const horse = lobes([
    { x: 26 + lean, y: 34, rx: 15 + grow, ry: 8 },
    { x: 42 + lean, y: 22, rx: 5, ry: 9 },
    { x: 47 + lean * 2, y: 15, rx: 6, ry: 4 },
    { x: 14 + lean, y: 47, rx: 2, ry: 11 },
    { x: 20 + lean, y: 48, rx: 2, ry: 10 },
    { x: 33 + lean, y: 48, rx: 2, ry: 10 },
    { x: 38 + lean, y: 47, rx: 2, ry: 11 },
    { x: 10 + lean, y: 32, rx: 5, ry: 2 },
  ]);
  const man = lobes([
    { x: 78 + lean, y: 14, rx: 4, ry: 4 },
    { x: 78 + lean, y: 30, rx: 6 + grow, ry: 12 },
    { x: 75 + lean, y: 50, rx: 2.5, ry: 11 },
    { x: 81 + lean, y: 50, rx: 2.5, ry: 11 },
    { x: 86 + lean, y: 8, rx: 5, ry: 7 },
    { x: 85 + lean, y: 15, rx: 2, ry: 6 },
  ]);
  const bird = lobes([
    { x: 106 + lean * 2, y: 12 - frame, rx: 7, ry: 2 },
    { x: 106 + lean * 2, y: 14 - frame, rx: 2.5, ry: 2.5 },
  ]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (horse(x, y) || man(x, y) || bird(x, y)) pic.set(x, y, "J");
  return pic.toString();
}

/** The fire before the mouth: a ring of stones, logs crossed, flames in four flickers. Raw. */
function bonfire(frame: number): string {
  const W = 32;
  const H = 40;
  const pic = Pic.blank(W, H);
  // Flames: three tongues whose heights trade off frame to frame.
  const step = (list: readonly number[]) => list[frame % list.length] ?? 0;
  const tongues: readonly [number, number, number][] = [
    [11, 18 + step([0, 3, 5, 2]), 5],
    [16, 26 - step([0, 4, 1, 3]), 6],
    [21, 17 + step([4, 0, 2, 5]), 5],
  ];
  for (const [cx, height, half] of tongues) {
    for (let k = 0; k < height; k++) {
      const y = 33 - k;
      const w = Math.max(0, Math.round(half * (1 - (k / height) ** 1.6)));
      const sway = Math.round(Math.sin(k * 0.5 + frame * 1.7 + cx) * (k / height) * 2);
      for (let dx = -w; dx <= w; dx++) {
        const edge = Math.abs(dx) === w;
        const core = Math.abs(dx) < w - 2 && k < height * 0.55;
        const ch = core
          ? k < height * 0.3
            ? "Y"
            : "y"
          : edge
            ? k > height * 0.6
              ? "h"
              : "r"
            : "y";
        if (pic.at(cx + dx + sway, y) === "Y") continue;
        pic.set(cx + dx + sway, y, ch);
      }
    }
  }
  // Logs and the stone ring.
  pic.put(
    `
      ..bbBB......BBbb..
      .buUUbBB..BBbUUub.
      bUueebbBBBBbbeeUub
      .bbbbBBRRrBBbbbbb.
    `,
    7,
    31,
  );
  pic.put(
    `
      ..dKd..dKd...dKd...dKd..
      .dKMd.dKMSd.dKMd..dKMMd.
      .ddd..dddd...ddd...dddd.
    `,
    4,
    37,
  );
  // Sparks above.
  const sparks: readonly [number, number][] = [
    [9, 6 + frame * 2],
    [20, 3 + ((frame * 3) % 7)],
    [14, 10 - frame],
    [24, 9 + frame],
  ];
  for (const [x, y] of sparks) if (y >= 0 && y < 18) pic.set(x, y, "y");
  return smooth(pic, "Yyrh").toString();
}

/** A torch on a pole, three flickers. Raw. */
function torch(frame: number): string {
  const pic = Pic.blank(10, 34);
  const hgt = [9, 11, 8][frame] ?? 9;
  for (let k = 0; k < hgt; k++) {
    const y = 10 - k;
    const w = Math.max(0, Math.round(2.6 * (1 - k / hgt)));
    const sway = Math.round(Math.sin(k * 0.8 + frame * 2) * (k / hgt) * 1.5);
    for (let dx = -w; dx <= w; dx++)
      pic.set(5 + dx + sway, y, Math.abs(dx) === w ? (k > hgt / 2 ? "h" : "r") : k < 3 ? "Y" : "y");
  }
  pic.put("BBBB\nBrrB\nBBBB", 3, 11);
  for (let y = 14; y < 33; y++) pic.set(4, y, "u").set(5, y, "b");
  pic.put("BBBB", 3, 33);
  return pic.toString();
}

/**
 * The low wall the shapes were carried along: stacked stone, and above it on sticks the
 * cut-outs themselves, a horse, a man with a jar, a bird, propped where they were left.
 */
const PUPPET_WALL = `
  ...........bb..................bb...........bb......
  ......bbbbbuu.................bUUb.........bUUb.....
  .....bUUUUUub..............bbbUUUbbb.....bbbbbbbb...
  ....bUuuuuuub.................bUUb..........bb......
  ...bUuuuuuub..................buub..........bb......
  ...bbub..bub..................bb.bb.........bb......
  ....bb....bb.................bb...bb........bb......
  ......bb...........bb.........bb..............bb....
  ......bb...........bb.........bb..............bb....
  dddddddddddddddddddddddddddddddddddddddddddddddddddd
  dwwkwwkkwwwkwwkkwwwkwwkkwwwkwwkkwwwkwwkkwwwkwwkkwwkd
  dKKMKKKMKKKKMKKKMKKKKMKKKMKKKKMKKKMKKKKMKKKMKKKKMKMd
  dKkKKMKKkKKMKKkKKKMKKkKKMKKkKKKMKKkKKMKKkKKKMKKkKKMd
  dMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMSd
  dKKKMkKKKKMKkKKKMkKKKKMKkKKKMkKKKKMKkKKKMkKKKKMKkKMd
  dMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSMMMSd
  dddddddddddddddddddddddddddddddddddddddddddddddddddd
`;

/**
 * The guards' post by the mouth: a linen awning on two poles, a stool with a crested helmet on
 * it, a round shield and two spears leaning on the pole, and the roster on its little table.
 */
const GUARD_POST = `
  ..BB..........................BB....
  .BUUBBBBBBBBBBBBBBBBBBBBBBBBBBUUB...
  .BUcccccccccccccccccccccccccccbUB...
  .BUcccCcccCcccCcccCcccCcccCccCbUB...
  .BUcCCCcCCCcCCCcCCCcCCCcCCCcCCCUB...
  .BUCCCCCCCCCCCCCCCCCCCCCCCCCCCCUB...
  .BUbBBBBBBBBBBBBBBBBBBBBBBBBBBbUB...
  .BUb..........................bUB...
  .BUb.....XX...................bUB.uB
  .BUb....XhhX..................bUBuUB
  .BUb...XhhhhX.................bUBuUB
  .BUb...GqyyyqG..........BBBB..bUBuUB
  .BUb..GqyYYyyqG.......BBcccCBBbUBuUB
  .BUb..GqyyGGyqG.......BcCcCcCBbUBuUB
  .BUb...GqGjjGG........BBBBBBBBbUBuUB
  .BUb..BBBBBBBBBB.......Bu..uB.bUBuUB
  .BUb...Bu....uB...GGGG.Bu..uB.bUBuUB
  .BUb...Bu....uB..GqyyqGBu..uB.bUBuUB
  .BUb...Bu....uB.GqyhhyqGu..uB.bUBuUB
  .BUb...Bu....uB.GqyhhyqGBBBBB.bUBuUB
  .BUb...BB....BB..GqyyqG.......bUBuUB
  .BBB..............GGGG........BBBBBB
`;

/** A stone bench where the prisoners sat facing the wall, its chain broken and lying open. */
const BENCH = `
  dddddddddddddddddddddddddddddddddddddddddddddd
  dwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwkd
  dkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkKd
  dKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKMd
  dddddddddddddddddddddddddddddddddddddddddddddd
  .dMMd..SS..SS..SS................dMMd.........
  .dMSd....SS..SS..SS..SS..........dMSd.........
  .dddd................SS..SS......dddd.........
`;

/** A dead tree on the slope: leafless, twisted, its branches reaching away from the cave. */
function deadTree(): string {
  const W = 44;
  const H = 56;
  const pic = Pic.blank(W, H);
  const branch = (x0: number, y0: number, a: number, len: number, w: number, depth: number) => {
    let x = x0;
    let y = y0;
    for (let k = 0; k < len; k++) {
      x += Math.cos(a) * 1;
      y += Math.sin(a) * 1;
      const ww = Math.max(0, Math.round(w * (1 - k / len)));
      for (let dx = -ww; dx <= ww; dx++) {
        const px = Math.round(x) + dx;
        const py = Math.round(y);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        pic.set(px, py, dx < 0 ? "U" : dx > 0 ? "b" : "u");
      }
      a += Math.sin(k * 0.7 + depth) * 0.08;
    }
    if (depth < 3) {
      branch(x, y, a - 0.55, len * 0.62, w * 0.6, depth + 1);
      branch(x, y, a + 0.5, len * 0.55, w * 0.55, depth + 1);
    }
  };
  branch(22, 55, -Math.PI / 2, 24, 3, 0);
  return finish(pic, "B", "u");
}

/** Shadow crawling out of the cave over the ground: a smear with reaching fingers. Raw, flat. */
function crawl(frame: number): string {
  const W = 72;
  const H = 26;
  const pic = Pic.blank(W, H);
  const body = lobes([
    { x: 16, y: 12, rx: 15, ry: 8 },
    { x: 30, y: 13, rx: 10, ry: 6 },
  ]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (body(x, y)) pic.set(x, y, body(x, y - 2) && body(x, y + 2) ? "j" : "J");
  for (const [y0, len] of [
    [8, 26],
    [12, 34],
    [17, 24],
  ] as const) {
    for (let k = 0; k < len + frame * 2; k++) {
      const x = 36 + k;
      const y = Math.round(y0 + Math.sin(k * 0.3 + y0 + frame) * 2);
      if (x < W) pic.set(x, y, "J").set(x, y + 1, k < len * 0.6 ? "J" : ".");
    }
  }
  return tidy(pic, "J", "j").toString();
}

export default [
  sprite({
    name: "cliff-face",
    size: [CL_W, CL_H],
    origin: [0, CL_H - 1],
    palette,
    outline: false,
    frames: { a: cliff(0), b: cliff(1), c: cliff(2) },
    anim: { idle: { frames: ["a"], fps: 1 } },
  }),
  one("cave", [80, 68], caveMouth(), { outline: false, origin: [40, 67] }),
  sprite({
    name: "wall-shadows",
    size: [120, 64],
    origin: [60, 63],
    palette,
    outline: false,
    frames: { flick0: wallShadows(0), flick1: wallShadows(1), flick2: wallShadows(2) },
    anim: { flicker: { frames: ["flick0", "flick1", "flick2"], fps: 5 } },
  }),
  sprite({
    name: "bonfire",
    size: [32, 40],
    origin: [16, 38],
    palette,
    lone: "Yyrh",
    outline: false,
    frames: Object.fromEntries([0, 1, 2, 3].map((f) => [`burn${f}`, bonfire(f)])),
    anim: { burn: { frames: ["burn0", "burn1", "burn2", "burn3"], fps: 8, jump: 0.5 } },
  }),
  sprite({
    name: "torch",
    size: [10, 34],
    origin: [5, 33],
    palette,
    lone: "Yyrh",
    outline: false,
    frames: { burn0: torch(0), burn1: torch(1), burn2: torch(2) },
    anim: { burn: { frames: ["burn0", "burn1", "burn2"], fps: 7 } },
  }),
  one("puppet-wall", [52, 17], finish(Pic.of(PUPPET_WALL), "d", "K", "U"), {
    outline: false,
    shadow: oval(52, 17, 26, 16, 25, 1.6),
  }),
  one("guard-post", [36, 22], finish(Pic.of(GUARD_POST), "B", "U", "cyYjXhq"), {
    outline: false,
    shadow: oval(36, 22, 18, 21, 17, 2),
  }),
  one("bench-stone", [46, 8], finish(Pic.of(BENCH), "d", "k", "S"), {
    outline: false,
    lone: "S",
    shadow: oval(46, 8, 18, 7, 17, 1.4),
  }),
  one("dead-tree", [44, 56], deadTree(), { shadow: oval(44, 56, 22, 55, 8, 1.6) }),
  sprite({
    name: "shadow-crawl",
    size: [72, 26],
    origin: [16, 12],
    palette,
    outline: false,
    frames: { a: crawl(0), b: crawl(1) },
    anim: { reach: { frames: ["a", "b"], fps: 1.5 } },
  }),
];
