import { type Legend, sprite } from "../../format.ts";
import { type Lobe, lobes, type Mark, Pic, seal, shade, texture, tidy } from "../../paint.ts";

/**
 * 해솔, the school's black pine and the campus landmark. Forty years of sea wind from the east
 * have pushed its crown west. The trunk is the Y-sorted base; the needle pads are a separate
 * overhead sprite on the same canvas and anchor, so students walk behind the crown.
 */
const W = 72;
const H = 96;
const ORIGIN = [44, 94] as const;

const palette: Legend = {
  ".": null,
  o: "board.deep",
  d: "board.dark",
  m: "board.mid",
  l: "board.light",
  T: "wood.deep",
  t: "wood.dark",
  L: "wood.mid",
  r: "ink.mid",
  q: "ink.light",
};

// Trunk and branches ---------------------------------------------------------------------------

/** Trunk centre and half width by height, leaning west as it rises. */
function trunkAt(y: number): { cx: number; hw: number } {
  const k = (94 - y) / 64;
  return { cx: 44 - 15 * k * k - 4 * k, hw: 4.2 - 2.4 * k };
}

function trunk(): Pic {
  const pic = Pic.blank(W, H);
  for (let y = 28; y < H - 1; y++) {
    const { cx, hw } = trunkAt(y);
    const flare = y >= 90 ? (y - 89) * 1.4 : 0;
    const x0 = Math.round(cx - hw - flare);
    const x1 = Math.round(cx + hw + flare * 0.6);
    for (let x = x0; x <= x1; x++) {
      const ch = x === x0 || x === x1 ? "T" : x === x0 + 1 ? "L" : "t";
      pic.set(x, y, ch);
    }
  }
  // Limbs: thick to the west where the wind pushed the crown, short and thin to the east.
  const limb = (pts: readonly (readonly [number, number])[], thick: boolean) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i] as [number, number];
      const [bx, by] = pts[i + 1] as [number, number];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= n; s++) {
        const x = Math.round(ax + ((bx - ax) * s) / n);
        const y = Math.round(ay + ((by - ay) * s) / n);
        pic
          .set(x, y - 1, "T")
          .set(x, y, "t")
          .set(x, y + 1, "T");
        if (thick)
          pic
            .set(x, y, "L")
            .set(x, y + 1, "t")
            .set(x, y + 2, "T");
      }
    }
  };
  limb(
    [
      [32, 48],
      [20, 42],
      [9, 36],
    ],
    true,
  );
  limb(
    [
      [36, 63],
      [25, 57],
      [15, 53],
    ],
    true,
  );
  limb(
    [
      [32, 38],
      [44, 33],
      [56, 30],
    ],
    false,
  );
  limb(
    [
      [40, 70],
      [50, 56],
    ],
    false,
  );
  // Bark plates: grey scales on the dark body, spaced unevenly.
  for (const [y, dx, ch] of [
    [34, 0, "r"],
    [41, -1, "q"],
    [46, 1, "r"],
    [55, 0, "q"],
    [61, -1, "r"],
    [66, 1, "r"],
    [73, 0, "q"],
    [79, -1, "r"],
    [84, 1, "q"],
    [88, -1, "r"],
  ] as const) {
    const x = Math.round(trunkAt(y).cx) + dx;
    if (pic.at(x, y) === "t" && pic.at(x + 1, y + 1) === "t")
      pic.set(x, y, ch).set(x + 1, y + 1, ch);
  }
  return tidy(tidy(seal(pic, "T"), "t", "T"), "T", "Lrq");
}

// Needle pads ---------------------------------------------------------------------------------

/**
 * A pad is a run of small needle clumps from (x0, y) to (x1, y), thickest in the middle. The
 * jitter is fixed per pad, so the pads keep their shape from frame to frame.
 */
function pad(x0: number, x1: number, y: number, thick: number, seed: number): Lobe[] {
  const out: Lobe[] = [];
  const n = Math.max(2, Math.round((x1 - x0) / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bulge = Math.sin(Math.PI * t);
    const j = ((seed * 7 + i * 13) % 5) - 2;
    out.push({
      x: x0 + (x1 - x0) * t,
      y: y - bulge * thick * 0.5 + j * 0.3,
      rx: 3 + bulge * 1.8,
      ry: 2 + bulge * thick * 0.45,
    });
    if (i % 2 === 1)
      out.push({ x: x0 + (x1 - x0) * t + 1, y: y - thick * 0.8 - bulge * 1.4, rx: 2.6, ry: 2 });
  }
  return out;
}

const PADS: readonly (readonly Lobe[])[] = [
  pad(14, 50, 18, 11, 1),
  pad(44, 60, 22, 6, 7),
  pad(6, 19, 25, 6, 6),
  pad(5, 33, 38, 9, 2),
  pad(40, 66, 34, 8, 3),
  pad(6, 28, 54, 8, 4),
  pad(44, 61, 54, 6, 5),
];

const needles: readonly (readonly Mark[])[] = [
  [
    [1, 1, Pic.of("l.l\n.l.")],
    [7, 3, Pic.of("d.d\n.d.")],
    [11, 0, Pic.of(".l\nl.")],
    [4, 6, Pic.of("dd")],
  ],
  [
    [3, 2, Pic.of("ll")],
    [9, 1, Pic.of("l.l\n.l.")],
    [1, 5, Pic.of("d.d\n.d.")],
    [12, 5, Pic.of(".d\nd.")],
  ],
  [
    [6, 0, Pic.of("l.\n.l")],
    [1, 3, Pic.of("d.d\n.d.")],
    [10, 4, Pic.of("ll")],
  ],
];
const tips: readonly (readonly Mark[])[] = [
  [
    [2, 0, Pic.of("m.m\n.m.")],
    [9, 1, Pic.of("mm")],
  ],
  [[5, 1, Pic.of("m.\n.m")]],
];

/** Pads drawn back to front, each shaded on its own so the tiers read as layers. */
function crown(shift: readonly number[]): Pic {
  const pic = Pic.blank(W, H);
  PADS.forEach((p, i) => {
    const dx = shift[i] ?? 0;
    const moved = p.map((l) => ({ ...l, x: l.x + dx }));
    const shaded = shade(
      W,
      H,
      lobes(moved),
      { outline: "o", dark: "d", mid: "m", light: "l" },
      { light: 2, dark: 2 },
    );
    texture(shaded, needles, "m", (cx, cy) => cx + cy + i);
    texture(shaded, tips, "l", (cx, cy) => cx * 2 + cy + i);
    pic.put(tidy(shaded, "m", "o"), 0, 0);
  });
  return tidy(tidy(pic, "m", "o"), "m", "o");
}

const shadow = Pic.blank(W, H)
  .put(
    shade(W, H, lobes([{ x: 46, y: 93.5, rx: 17, ry: 3.6 }]), {
      outline: "o",
      dark: "o",
      mid: "o",
      light: "o",
    }),
    0,
    0,
  )
  .toString();

export default [
  sprite({
    name: "pine",
    size: [W, H],
    origin: ORIGIN,
    palette,
    shadow,
    frames: { base: trunk().toString() },
    anim: { idle: { frames: ["base"], fps: 1 } },
  }),
  sprite({
    name: "pine-crown",
    size: [W, H],
    origin: ORIGIN,
    palette,
    frames: {
      sway0: crown([0, 0, 0, 0, 0]).toString(),
      sway1: crown([-1, -1, -1, 0, 0, 0, 0]).toString(),
      sway2: crown([-1, -1, -1, -1, 0, 0, 0]).toString(),
      sway3: crown([0, 0, 0, -1, 0, -1, 0]).toString(),
    },
    anim: { sway: { frames: ["sway0", "sway1", "sway2", "sway1", "sway0", "sway3"], fps: 3 } },
  }),
];
