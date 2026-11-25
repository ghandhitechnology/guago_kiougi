import { type SpriteDef, variant } from "../../format.ts";
import { finish, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";
import polis from "./polis.ts";

/**
 * 크로톤 학당 at 05:50: the school on its headland waiting for the sun. The sky over the sea goes
 * from night to rose, the sun's rim just up; a monochord on its table in the courtyard, one
 * string and a bridge to slide; and the bean patch, fenced, which nobody in this school will walk
 * through even to save his life.
 */

// Dawn ----------------------------------------------------------------------------------------

/**
 * Sky and far sea at dawn, for the backdrop: night still high up, lilac, rose, a gold band on the
 * horizon, the sun's rim over it, its path laid across the water toward the shore. The sea's
 * last row is the sea tiles' own colour so the two meet without a seam.
 */
function dawn(): Pic {
  const W = 1040;
  const H = 60;
  const p = Pic.blank(W, H);
  const SUN = 700;
  const HORIZON = 38;
  const bands: readonly [number, string][] = [
    [6, "v"],
    [12, "N"],
    [18, "X"],
    [24, "x"],
    [30, "+"],
    [34, "="],
    [37, "Y"],
    [HORIZON, "y"],
  ];
  for (let y = 0; y < HORIZON; y++) {
    const band = bands.find(([end]) => y < end)?.[1] ?? "y";
    const next = bands.find(([end]) => y + 2 < end)?.[1] ?? band;
    for (let x = 0; x < W; x++) {
      // Dither one row into the next so the bands feather.
      const edge = bands.some(([end]) => end - y === 1);
      p.set(x, y, edge && (x + y) % 2 ? next : band);
    }
  }
  // Streaks of cloud lit from beneath.
  for (const [x0, y0, len] of [
    [120, 20, 90],
    [430, 16, 140],
    [640, 26, 120],
    [880, 22, 80],
  ] as const)
    for (let k = 0; k < len; k++) {
      const y = y0 + (k > len * 0.6 ? 1 : 0);
      p.set(x0 + k, y, k % 9 < 7 ? "=" : "+");
      if (k > 6 && k < len - 6) p.set(x0 + k, y + 1, "@");
    }
  // The sun's rim.
  for (let y = HORIZON - 9; y < HORIZON; y++)
    for (let x = SUN - 16; x <= SUN + 16; x++) {
      const r = Math.hypot(x - SUN, (y - HORIZON) * 1.1);
      if (r < 15) p.set(x, y, r < 12.5 ? "w" : "Y");
    }
  // The sea: dark far out, the sun's path in broken gold.
  for (let y = HORIZON; y < H; y++)
    for (let x = 0; x < W; x++) {
      const near = (y - HORIZON) / (H - HORIZON);
      let ch = near < 0.3 ? "v" : near < 0.65 ? "8" : near < 0.9 ? "9" : "9";
      const path = Math.abs(x - SUN) < 10 + (y - HORIZON) * 3;
      if (path && hash(x >> 1, y, 7) > 0.55) ch = y < HORIZON + 6 ? "Y" : "y";
      else if (hash(x >> 2, y, 3) > 0.93) ch = "c";
      p.set(x, y, ch);
    }
  return p;
}

// The courtyard --------------------------------------------------------------------------------

/** A monochord: one string over a long sounding box, a bridge to slide, on a trestle table. */
function monochord(): Pic {
  const W = 44;
  const H = 22;
  const p = Pic.blank(W, H);
  // Table top and its trestles.
  rect(p, 1, 9, W - 2, 3, "u");
  hline(p, 1, 9, W - 2, "W");
  rect(p, 1, 12, W - 2, 2, "U");
  for (const x of [4, W - 7]) {
    rect(p, x, 14, 3, 7, "U");
    vline(p, x + 2, 14, 7, "b");
  }
  // The box, the string, the bridge, the pegs.
  rect(p, 5, 4, W - 10, 5, "P");
  hline(p, 5, 4, W - 10, "W");
  hline(p, 5, 8, W - 10, "T");
  hline(p, 6, 5, W - 12, "y");
  p.put("bb\nbb\nbb", 23, 3);
  p.put("oo\noo", 7, 3).put("oo\noo", W - 9, 3);
  // A wax tablet beside it, ratios scratched in.
  p.put(
    `
      bbbbbbbb
      b5555556
      b5DD5D56
      b555DD56
      bbbbbbbb
    `,
    W - 12,
    8,
  );
  return finish(p, "y");
}

/** The bean patch: rows of broad beans in flower, a wattle fence all round, a gap nobody uses. */
function beans(): Pic {
  const W = 56;
  const H = 34;
  const p = Pic.blank(W, H);
  // Tilled earth.
  rect(p, 3, 6, W - 6, H - 10, "C");
  for (let y = 8; y < H - 5; y += 4) hline(p, 4, y, W - 8, "T");
  // Plants in rows: stalks, leaves, a white flower with its dark eye here and there.
  for (let y = 7; y < H - 6; y += 4)
    for (let x = 5; x < W - 6; x += 4) {
      const h = hash(x, y, 2);
      p.put(
        `
          .g.
          GgG
          DGD
          .D.
        `,
        x,
        y - 3,
      );
      if (h > 0.5) p.set(x + 1, y - 3, "w");
      if (h > 0.5) p.set(x + 1, y - 2, "J");
    }
  // The fence: stakes and woven withies.
  for (let x = 0; x < W; x += 5) {
    vline(p, x, 2, H - 4, "U");
    p.set(x, 1, "u");
  }
  for (const y of [4, 7, H - 6, H - 3]) {
    for (let x = 0; x < W; x++) if (p.at(x, y) !== "U") p.set(x, y, (x + y) % 3 ? "u" : "b");
  }
  for (const x of [0, W - 1])
    for (let y = 2; y < H - 2; y++) p.set(x, y, (y % 3 ? "u" : "b") as string);
  return finish(p, "wJ");
}

// The scrubbed diagonal ---------------------------------------------------------------------------

/**
 * One unit square's diagonal, scratched in corner to corner by someone and scrubbed at in a hurry
 * with a wet rag: the line broken, smears across it, the scratch still there under them. Raw, to
 * lie on the floor's own raw squares.
 */
function scrubbed(): Pic {
  const p = Pic.blank(32, 32);
  for (let k = 3; k < 29; k++) {
    if (hash(k, 1, 4) > 0.3) p.set(k, k, "C");
    if (hash(k, 2, 4) > 0.6) p.set(k + 1, k, "T");
  }
  // The rag's strokes, across the line, paler than the slab.
  for (let s = 0; s < 6; s++) {
    const c = 6 + s * 4;
    for (let t = -5; t <= 5; t++) {
      const x = c + t;
      const y = c - t + (s % 2);
      if (x > 1 && x < 31 && y > 1 && y < 31 && hash(t, s, 7) > 0.25) p.set(x, y, "P");
    }
  }
  return p;
}

// Dawn on the water and the walls ---------------------------------------------------------------

/** Rose and gold thrown over the sea at dawn: a sparse wash laid on the water tiles. Raw. */
function wash(): Pic {
  const p = Pic.blank(64, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const n = hash(x >> 1, y, 21);
      if ((x + y * 3) % 4 === 0 && n > 0.45) p.set(x, y, n > 0.85 ? "y" : n > 0.65 ? "+" : "%");
    }
  return p;
}

/** The sun's path glittering on the water, three frames. Raw. */
function glitter(frame: number): Pic {
  const p = Pic.blank(48, 12);
  for (let k = 0; k < 14; k++) {
    const x = Math.floor(hash(k, frame, 3) * 46);
    const y = Math.floor(hash(frame, k, 5) * 11);
    p.set(x, y, k % 3 ? "Y" : "w").set(x + 1, y, "y");
  }
  return p;
}

/** The school's stoa in the dawn: its whites taking the rose and peach of the first sun. */
const DAWN = { "stone.bright": "flesh.bright", "stone.pale": "rose.pale" };
const dawnOf = (name: string, as: string): SpriteDef => {
  const base = (polis as readonly SpriteDef[]).find((d) => d.name === name) as SpriteDef;
  return variant(base, { name: as, recolor: DAWN });
};

export default [
  greek(
    "scrubbed-diagonal",
    { still: scrubbed() },
    { origin: [0, 0], outline: false, lone: "CTP" },
  ),
  greek("dawn-wash", { still: wash() }, { origin: [0, 0], outline: false, lone: "y+%" }),
  greek(
    "dawn-glitter",
    { glint0: glitter(0), glint1: glitter(1), glint2: glitter(2) },
    {
      anim: { glint: { frames: ["glint0", "glint1", "glint2"], fps: 4 } },
      outline: false,
      lone: "Yyw",
    },
  ),
  dawnOf("stoa-bay", "stoa-bay-dawn"),
  dawnOf("stoa-end", "stoa-end-dawn"),
  greek("dawn", { still: dawn() }, { origin: [0, 0], outline: false, lone: "Yyc=+@EvN8Xx9w" }),
  greek(
    "monochord",
    { still: monochord() },
    { shadow: ovalShadow(44, 22, 22, 20, 21, 2), lone: "y" },
  ),
  greek("beans", { still: beans() }, { lone: "wJ", shadow: ovalShadow(56, 34, 28, 31, 27, 2.5) }),
];
