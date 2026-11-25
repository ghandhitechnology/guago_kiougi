import { type Legend, sprite } from "../../format.ts";
import {
  aimed,
  aimedFrames,
  clean,
  ell,
  framesOf,
  line,
  names,
  Pic,
  paintAt,
  put,
  rng,
} from "../../fx.ts";
import { shade } from "../../paint.ts";
import { BEAD, CHEM, CHEM_LONE, DOME, fire, POP } from "./chemistry.ts";

/**
 * 화학, the rest of the launch kit and its reactions: 주기율표 브로마이드's element cards,
 * 유기화학 노트's carbon chain, 몰 계산 문제집's spray of particles, 산·염기 적정 노트's drops,
 * and the four reactions as areas on the ground (연소 is `fx-combust`). Sea cyan and glass; the
 * acid and the base keep the colours a titration shows: lime for acid, pink for base.
 */
export const KIT: Legend = {
  ...CHEM,
  k: "ink.dark",
  i: "ink.mid",
  s: "stone.light",
  // Acid lime and base pink.
  A: "grass.dark",
  B: "grass.light",
  C: "grass.pale",
  P: "rose.dark",
  Q: "rose.mid",
  R: "rose.light",
  // Gold, for aqua regia's dissolving flecks.
  g: "gold.mid",
  G: "gold.light",
};
const fx = { group: "combat", outline: false, palette: KIT, lone: CHEM_LONE } as const;

// 주기율표 브로마이드 -------------------------------------------------------------------------

const LETTERS: Record<string, string> = {
  N: "#..#\n##.#\n#.##\n#..#\n#..#",
  a: "...\n##.\n..#\n###\n###",
  H: "#.#\n#.#\n###\n#.#\n#.#",
  e: "...\n.#.\n###\n#..\n.##",
  F: "###\n#..\n##.\n#..\n#..",
  O: "###\n#.#\n#.#\n#.#\n###",
};

/** The cards a throw can be: what each does is in the content (나트륨, 헬륨, 철, 산, 염기). */
export const ELEMENTS = ["Na", "He", "Fe", "H", "OH"] as const;

/**
 * A card from the periodic table: white, a sea band across its top, the symbol in ink. `border`
 * is the card's rim, gold for 멘델레예프의 꿈.
 */
export function card(symbol: string, border = "o", band = "m"): Pic {
  const pic = Pic.blank(13, 12);
  for (let y = 1; y <= 10; y++) for (let x = 1; x <= 11; x++) pic.set(x, y, "W");
  for (let x = 1; x <= 11; x++) {
    pic.set(x, 1, band);
    pic.set(x, 10, "s");
  }
  let x = 0;
  const glyphs = [...symbol].map((ch) => Pic.of(LETTERS[ch] as string));
  const width = glyphs.reduce((n, g) => n + g.w + 1, -1);
  x = Math.floor((13 - width) / 2);
  for (const g of glyphs) {
    for (let gy = 0; gy < g.h; gy++)
      for (let gx = 0; gx < g.w; gx++) if (g.at(gx, gy) === "#") pic.set(x + gx, 3 + gy, "k");
    x += g.w + 1;
  }
  for (let y = 0; y < 12; y++) {
    pic.set(0, y, border);
    pic.set(12, y, border);
  }
  for (let xx = 0; xx < 13; xx++) {
    pic.set(xx, 0, border);
    pic.set(xx, 11, border);
  }
  for (const [cx, cy] of [
    [0, 0],
    [12, 0],
    [0, 11],
    [12, 11],
  ] as const)
    pic.set(cx, cy, ".");
  return pic;
}

/** The card edge-on as it tumbles: a thin white bar with its band. */
export function cardEdge(border = "o", band = "m"): Pic {
  const pic = Pic.blank(13, 12);
  put(
    pic,
    `${border.repeat(13)}\n${border}${band}${band}${"W".repeat(9)}${border}\n${border.repeat(13)}`,
    0,
    4,
  );
  pic.set(0, 4, ".");
  pic.set(12, 4, ".");
  pic.set(0, 6, ".");
  pic.set(12, 6, ".");
  return pic;
}

const element = sprite({
  ...fx,
  name: "atk-element",
  size: [13, 12],
  origin: [6, 6],
  frames: {
    ...Object.fromEntries(ELEMENTS.map((e) => [e, card(e).toString()])),
    edge: cardEdge().toString(),
  },
  anim: Object.fromEntries(ELEMENTS.map((e) => [e, { frames: [e, "edge"], fps: 10, jump: 1 }])),
});

// 유기화학 노트 -------------------------------------------------------------------------------

/**
 * The whip is a chain of round atoms with sea bonds between them, so the client can lay it along
 * any aim without turning a sprite: carbon (ink, with a glint), hydrogen capping the tip, and the
 * crack where the tip lands.
 */
function atom(d: number, dark: string, mid: string, light: string): Pic {
  const c = d / 2;
  const pic = shade(d, d, (x, y) => Math.hypot(x + 0.5 - c, y + 0.5 - c) <= c - 0.2, {
    outline: dark,
    dark: mid,
    mid,
    light,
  });
  return clean(put(pic, "*", Math.floor(c - 1), Math.floor(c - 1)), CHEM_LONE);
}

function crack(k: number): Pic {
  const pic = Pic.blank(13, 13);
  const r = [3, 5, 6][k] as number;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + k * 0.3;
    line(
      pic,
      6 + Math.cos(a) * (r - 2),
      6 + Math.sin(a) * (r - 2),
      6 + Math.cos(a) * r,
      6 + Math.sin(a) * r,
      k === 2 ? "l" : "p",
    );
  }
  if (k < 2) put(pic, "WW\nWW", 6, 6);
  return clean(pic, CHEM_LONE);
}

const chain = sprite({
  ...fx,
  name: "atk-carbon-chain",
  size: [13, 13],
  origin: [6, 6],
  frames: {
    carbon: put(Pic.blank(13, 13), atom(7, "k", "i", "l"), 3, 3).toString(),
    hydrogen: put(Pic.blank(13, 13), atom(5, "d", "p", "W"), 4, 4).toString(),
    bond: put(Pic.blank(13, 13), "ll\npp", 5, 5).toString(),
    ...framesOf("tip", [0, 1, 2].map(crack)),
  },
  anim: {
    carbon: { frames: ["carbon"], fps: 1, loop: false },
    hydrogen: { frames: ["hydrogen"], fps: 1, loop: false },
    bond: { frames: ["bond"], fps: 1, loop: false },
    tip: { frames: names("tip", 3), fps: 18, loop: false, jump: 1 },
  },
});

// 몰 계산 문제집 ------------------------------------------------------------------------------

/**
 * One particle of the many: a tiny molecule, three looks so a spray never repeats. Each is pale
 * on top and sea-dark underneath, so the spray holds on sunlit dirt as well as at night.
 */
const PARTICLES = ["ll.\nl*l\n.dd", "pp\ndd", "ll\ndd"];

/**
 * The spray the particles fly through: a fan of sea particles, drawn in sixteen directions so
 * the cone is never turned by the client. Range 64 at 40°.
 */
function spray(a: number, k: number): Pic {
  const s = 144;
  const c = s / 2;
  const r = rng(Math.round(a * 100) + k * 7);
  const pic = Pic.blank(s, s);
  // The front of the spray moves out over three frames; particles crowd at the front.
  const front = [26, 46, 64][k] as number;
  for (let i = 0; i < 34; i++) {
    const t = (r() - 0.5) * 0.7;
    const d = front * (0.45 + r() * 0.55);
    const x = c + Math.cos(a + t) * d;
    const y = c + Math.sin(a + t) * d;
    put(pic, PARTICLES[i % PARTICLES.length] as string, x - 1, y - 1);
  }
  return clean(pic, CHEM_LONE);
}

const particles = sprite({
  ...fx,
  name: "atk-particles",
  size: [144, 144],
  origin: [72, 72],
  frames: {
    ...Object.fromEntries(
      PARTICLES.map((p, i) => [`p${i}`, put(Pic.blank(144, 144), p, 71, 71).toString()]),
    ),
    ...aimedFrames(
      "fan",
      aimed(16, (a) => spray(a, 0)).map((p, i) => [
        p,
        spray((i / 16) * Math.PI * 2, 1),
        spray((i / 16) * Math.PI * 2, 2),
      ]),
    ),
  },
  anim: {
    ...Object.fromEntries(
      PARTICLES.map((_, i) => [`p${i}`, { frames: [`p${i}`], fps: 1, loop: false }]),
    ),
    ...Object.fromEntries(
      Array.from({ length: 16 }, (_, d) => [
        `fan${d}`,
        { frames: [`fan${d}-0`, `fan${d}-1`, `fan${d}-2`], fps: 10, loop: false, jump: 1 },
      ]),
    ),
  },
});

// 실험 보고서 -----------------------------------------------------------------------------------

/** Drops of fuel: round, pale where the light catches them, sea-dark underneath. */
const FUEL = [".l.\nl'l\n.dd", "ll\ndd", "'l.\nll.\n.dd"];

/**
 * 실험 보고서's cone: the alcohol lamp's fuel thrown out in a fan of drops that land wet on the
 * ground, where the spark will find them. Sixteen aims, never turned. A jet near the hand first,
 * the drops spreading to the front, then most of them down as dark wet spots with the last few
 * still falling. `fan` reaches 60 over ±40° (the book's 70°, 85° at 25); `wide` reaches 72 over
 * ±47° for 테르밋 and the book past level 50.
 */
function fuel(a: number, k: number, reach: number, half: number): Pic {
  const s = 156;
  const c = s / 2;
  const r = rng(Math.round(a * 1000) + reach);
  const pic = Pic.blank(s, s);
  const front = [0.3, 0.62, 0.92, 1][k] as number;
  if (k === 0) {
    for (const off of [-0.18, 0, 0.18]) {
      const ux = Math.cos(a + off);
      const uy = Math.sin(a + off);
      line(pic, c + ux * 5, c + uy * 5, c + ux * reach * 0.28, c + uy * reach * 0.28, "l");
      line(
        pic,
        c + ux * 5,
        c + uy * 5 + 1,
        c + ux * reach * 0.28,
        c + uy * reach * 0.28 + 1,
        "d",
        ".",
      );
    }
  }
  const count = Math.round(reach * 0.7);
  for (let i = 0; i < count; i++) {
    const t = (r() * 2 - 1) * half;
    const spread = r();
    const d = reach * front * (k === 3 ? 0.55 + spread * 0.45 : 0.35 + spread * 0.65);
    const x = c + Math.cos(a + t) * d;
    const y = c + Math.sin(a + t) * d;
    if (k === 3 && i % 3 !== 0) put(pic, "dd", x - 1, y);
    else put(pic, FUEL[i % FUEL.length] as string, x - 1, y - 1);
  }
  return clean(pic, CHEM_LONE);
}

const FUEL_SIZES = [
  ["fan", 60, 0.7],
  ["wide", 72, 0.82],
] as const;

const fuelSpray = sprite({
  ...fx,
  name: "atk-fuel-spray",
  size: [156, 156],
  origin: [78, 78],
  frames: Object.fromEntries(
    FUEL_SIZES.flatMap(([name, reach, half]) =>
      Array.from({ length: 16 }, (_, d) =>
        [0, 1, 2, 3].map((k) => [
          `${name}${d}-${k}`,
          fuel((d / 16) * Math.PI * 2, k, reach, half).toString(),
        ]),
      ).flat(),
    ),
  ),
  anim: Object.fromEntries(
    FUEL_SIZES.flatMap(([name]) => [
      ...Array.from({ length: 16 }, (_, d) => [
        `${name}${d}`,
        { frames: names(`${name}${d}-`, 4), fps: 14, loop: false, jump: 1 },
      ]),
      [name, { frames: names(`${name}0-`, 4), fps: 14, loop: false, jump: 1 }],
    ]),
  ),
});

// 산·염기 적정 노트 ---------------------------------------------------------------------------

/** A round drop, so it flies at any angle unturned: lime for acid, pink for base. */
export function drop(dark: string, mid: string, light: string, wobble: boolean): Pic {
  const pic = Pic.blank(9, 9);
  const body = shade(
    7,
    wobble ? 6 : 7,
    (x, y) =>
      ((x + 0.5 - 3.5) / 3.4) ** 2 + ((y + 0.5 - (wobble ? 3 : 3.5)) / (wobble ? 2.9 : 3.4)) ** 2 <=
      1,
    { outline: dark, dark: mid, mid, light, glint: "W" },
  );
  put(pic, body, 1, wobble ? 2 : 1);
  return clean(pic, CHEM_LONE);
}

const drops = sprite({
  ...fx,
  name: "atk-drop",
  size: [9, 9],
  origin: [4, 4],
  frames: {
    acid0: drop("A", "B", "C", false).toString(),
    acid1: drop("A", "B", "C", true).toString(),
    base0: drop("P", "Q", "R", false).toString(),
    base1: drop("P", "Q", "R", true).toString(),
  },
  anim: {
    acid: { frames: ["acid0", "acid1"], fps: 8, jump: 1 },
    base: { frames: ["base0", "base1"], fps: 8, jump: 1 },
  },
});

// Reactions -------------------------------------------------------------------------------------

/** A ragged pool centred in its own canvas. */
function puddle(w: number, h: number, rx: number, ry: number, seed: number) {
  const cx = w / 2;
  const cy = h / 2;
  return (x: number, y: number) => {
    const a = Math.atan2((y - cy) / ry, (x - cx) / rx);
    return (
      ell(x, y, cx, cy, rx, ry) - 0.1 * Math.sin(3 * a + seed) - 0.07 * Math.sin(5 * a + seed * 2)
    );
  };
}

/**
 * 중화: acid and base cancel. Lime and pink swirl together on the target's ground and clear to
 * water, and the bubbles close into the shield the reaction grants.
 */
function neutralize(k: number): Pic {
  const w = 44;
  const h = 26;
  const f = puddle(w, h, [10, 15, 17, 16][k] as number, [5, 7, 8, 7.5][k] as number, 2);
  const pic = paintAt(w, h, (x, y) => {
    const e = f(x, y);
    if (e > 1) return null;
    if (e > 0.82) return k === 3 ? "d" : "o";
    if (k === 3) return e < 0.4 ? "p" : "l";
    const a = Math.atan2(y - h / 2, (x - w / 2) * 0.5) + k * 0.9 + e * 3;
    const side = Math.sin(a * 2) > 0;
    if (k === 2) return e < 0.35 ? "p" : side ? "B" : "R";
    return side ? (e < 0.5 ? "C" : "B") : e < 0.5 ? "R" : "Q";
  });
  if (k >= 2) {
    for (const [x, y] of [
      [14, 9],
      [26, 13],
      [20, 16],
      [31, 9],
    ] as const)
      put(pic, k === 2 ? DOME : POP, x, y);
  }
  return clean(pic, CHEM_LONE);
}

const neutralizeSprite = sprite({
  ...fx,
  name: "fx-neutralize",
  size: [44, 26],
  origin: [22, 13],
  frames: framesOf("n", [0, 1, 2, 3].map(neutralize)),
  anim: { react: { frames: names("n", 4), fps: 8, loop: false, jump: 1 } },
});

/**
 * 부식: acid eats metal. Cyan froth fizzing over the target's armour, rust flakes falling off it
 * to the ground and lying there in a rusted ring.
 */
function corrosion(k: number): Pic {
  const w = 32;
  const h = 32;
  const r = rng(9 + k);
  const pic = paintAt(w, h, (x, y) => {
    const e = ell(x, y, 16, 27, 11, 3.5);
    if (e > 1) return null;
    return e > 0.7 ? "K" : k >= 2 ? "L" : null;
  });
  // Froth on the body.
  for (let i = 0; i < 7; i++) {
    const x = 9 + r() * 14;
    const y = 8 + r() * 14 - k;
    put(pic, [BEAD, DOME, POP][(i + k) % 3] as string, x, y);
  }
  // Rust flakes falling.
  for (let i = 0; i < 5; i++) {
    const x = 8 + r() * 16;
    const y = 12 + ((r() * 14 + k * 5) % 14);
    put(pic, i % 2 ? "LK" : "M\nL", x, y);
  }
  return clean(pic, CHEM_LONE);
}

const corrosionSprite = sprite({
  ...fx,
  name: "fx-corrosion",
  palette: { ...KIT, K: "clay.dark", L: "clay.mid", M: "clay.light" },
  size: [32, 32],
  origin: [16, 27],
  frames: framesOf("c", [0, 1, 2, 3].map(corrosion)),
  anim: { react: { frames: names("c", 4), fps: 8, loop: false, jump: 1 } },
});

/**
 * 폭발: sodium meets water. A white flash, a cyan ring of spray thrown wide (radius 40) with
 * droplets, and a burst of the alcohol-lamp fire at its heart.
 */
function explosion(k: number): Pic {
  const w = 88;
  const h = 56;
  const cx = 44;
  const cy = 34;
  const pic = Pic.blank(w, h);
  if (k === 0) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = ell(x, y, cx, cy - 4, 14, 11);
        return e < 0.55 ? "W" : e < 0.8 ? "p" : e < 1 ? "l" : null;
      }),
      0,
      0,
    );
    return clean(pic);
  }
  const rx = [0, 26, 38, 42][k] as number;
  const ry = rx * 0.5;
  put(
    pic,
    paintAt(w, h, (x, y) => {
      const e = (ell(x, y, cx, cy, rx, ry) - 1) * ry;
      if (e > 0.6 || e < (k === 1 ? -3 : -1.4)) return null;
      if (k === 3 && Math.floor((Math.atan2(y - cy, (x - cx) * 0.5) + 4) * 2.4) % 2 === 0)
        return null;
      return e > -0.4 ? "m" : y < cy ? "W" : "l";
    }),
    0,
    0,
  );
  if (k <= 2) {
    const tongues = [
      { x: 44, h: k === 1 ? 26 : 18, w: 8, lean: 2 },
      { x: 36, h: k === 1 ? 16 : 11, w: 5, lean: -3 },
      { x: 52, h: k === 1 ? 18 : 12, w: 5, lean: 3 },
    ];
    put(pic, fire(88, 56, cy, tongues), 0, 0);
  }
  const r = rng(31 + k);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + r() * 0.4;
    const d = rx * (1.05 + r() * 0.2) + 2;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.5 - (k === 1 ? 6 : 2);
    put(pic, k === 3 ? "'" : "pl\nlm", x, y);
  }
  return clean(pic, CHEM_LONE);
}

const explosionSprite = sprite({
  ...fx,
  name: "fx-explosion",
  size: [88, 56],
  origin: [44, 34],
  frames: framesOf("e", [0, 1, 2, 3].map(explosion)),
  anim: { blast: { frames: names("e", 4), fps: 14, loop: false, jump: 1 } },
});

export default [
  element,
  chain,
  particles,
  fuelSpray,
  drops,
  neutralizeSprite,
  corrosionSprite,
  explosionSprite,
];
