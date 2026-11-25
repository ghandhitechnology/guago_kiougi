import { sprite } from "../../format.ts";
import { clean, ell, framesOf, line, names, Pic, paintAt, put, rng } from "../../fx.ts";
import { card, cardEdge, drop, ELEMENTS, KIT } from "./chem-kit.ts";
import { CHEM_LONE, DOME, POP } from "./chemistry.ts";

/** 화학's evolved forms, in the `combat-evolved` atlas. */
const evo = { group: "combat-evolved", outline: false, palette: KIT, lone: CHEM_LONE } as const;

/**
 * 왕수: the pool that dissolves gold. Wider than the acid's, its cyan shot through with gold
 * flecks going under, a corrosive rim; pools that touch merge, so its edge is drawn to blend.
 */
function aquaRegia(k: number): Pic {
  const w = 64;
  const h = 32;
  const cx = w / 2;
  const cy = h / 2;
  const size = [0.5, 0.85, 1, 1, 1, 0.8, 0.6][k] as number;
  const rx = 30 * size;
  const ry = 14 * size;
  const pic = paintAt(w, h, (x, y) => {
    const a = Math.atan2((y - cy) / ry, (x - cx) / rx);
    const e = ell(x, y, cx, cy, rx, ry) - 0.08 * Math.sin(4 * a + 1) - 0.06 * Math.sin(7 * a);
    if (e > 1) return null;
    if (k >= 5) return e > 0.8 ? "d" : e < 0.4 ? "o" : "m";
    if (e > 0.85) return "o";
    if (e > 0.7) return "d";
    if (e < 0.35 && y < cy) return "l";
    return "m";
  });
  if (k >= 2 && k <= 4) {
    const r = rng(5);
    for (let i = 0; i < 7; i++) {
      const x = cx + (r() - 0.5) * rx * 1.4;
      const y = cy + (r() - 0.5) * ry * 1.2;
      const phase = (i + k) % 3;
      put(pic, phase === 0 ? "GG\ngg" : phase === 1 ? "Gg\ngg" : DOME, x, y, "mld");
    }
    for (const [x, y] of [
      [cx - 12, cy - 3],
      [cx + 9, cy + 2],
    ] as const)
      put(pic, k === 3 ? POP : DOME, x, y, "mld");
  }
  return clean(pic, CHEM_LONE);
}

const aqua = sprite({
  ...evo,
  name: "fx-aqua-regia-pool",
  size: [64, 32],
  origin: [32, 16],
  frames: framesOf("a", [0, 1, 2, 3, 4, 5, 6].map(aquaRegia)),
  anim: {
    spread: { frames: ["a0", "a1"], fps: 12, loop: false, jump: 1 },
    bubble: { frames: ["a2", "a3", "a4"], fps: 6, jump: 1 },
    dry: { frames: ["a5", "a6"], fps: 4, loop: false, jump: 1 },
  },
});

/**
 * 테르밋: molten iron running out where the fire went, white-hot at its heart through gold to a
 * dark crust at the rim, then cooling to a dull metal skin.
 */
function molten(k: number): Pic {
  const w = 32;
  const h = 16;
  const cx = 16;
  const cy = 8;
  const pic = paintAt(w, h, (x, y) => {
    const a = Math.atan2(y - cy, (x - cx) * 0.5);
    const e = ell(x, y, cx, cy, 13, 6) - 0.12 * Math.sin(3 * a + k) - 0.08 * Math.sin(5 * a);
    if (e > 1) return null;
    if (k >= 3) return e > 0.75 ? "k" : k === 4 ? "i" : e < 0.4 ? "g" : "i";
    if (e > 0.8) return "k";
    if (e > 0.6) return "g";
    if (e > 0.35) return "G";
    return (x + k) % 5 < 2 ? "W" : "Y";
  });
  return clean(pic, CHEM_LONE);
}

const moltenIron = sprite({
  ...evo,
  name: "fx-molten-iron",
  palette: { ...KIT, Y: "gold.pale" },
  size: [32, 16],
  origin: [16, 8],
  frames: framesOf("m", [0, 1, 2, 3, 4].map(molten)),
  anim: {
    flow: { frames: ["m0", "m1", "m2"], fps: 8, jump: 1 },
    cool: { frames: ["m3", "m4"], fps: 3, loop: false, jump: 1 },
  },
});

/** 멘델레예프의 꿈: the same cards bordered in gold, the table with no gaps left in it. */
const mendeleev = sprite({
  ...evo,
  name: "evo-mendeleev",
  size: [13, 12],
  origin: [6, 6],
  frames: {
    ...Object.fromEntries(ELEMENTS.map((e) => [e, card(e, "g", "G").toString()])),
    edge: cardEdge("g", "G").toString(),
  },
  anim: Object.fromEntries(ELEMENTS.map((e) => [e, { frames: [e, "edge"], fps: 10, jump: 1 }])),
});

/**
 * 고분자: the chain grows rings. A benzene ring the client lays into the whip every few links,
 * and a side branch.
 */
function ring(): Pic {
  const pic = Pic.blank(15, 15);
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return [7 + Math.cos(a) * 6, 7 + Math.sin(a) * 6] as const;
  });
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % 6] as readonly [number, number];
    line(pic, p[0], p[1], q[0], q[1], "l");
  });
  for (const [x, y] of pts) put(pic, "kk\nki", Math.round(x) - 1, Math.round(y) - 1);
  put(
    pic,
    paintAt(15, 15, (x, y) => (Math.abs(Math.hypot(x - 7.5, y - 7.5) - 2.6) < 0.55 ? "p" : null)),
    0,
    0,
  );
  return clean(pic, CHEM_LONE);
}

const polymer = sprite({
  ...evo,
  name: "evo-polymer",
  size: [15, 15],
  origin: [7, 7],
  frames: { ring: ring().toString() },
  anim: { ring: { frames: ["ring"], fps: 1, loop: false } },
});

/**
 * 아보가드로 수: too many to draw one by one, so particles come in clouds: three clusters of
 * molecules the client throws instead of single motes.
 */
function cluster(seed: number): Pic {
  const pic = Pic.blank(13, 13);
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 4.5;
    const x = 5 + Math.cos(a) * d;
    const y = 5 + Math.sin(a) * d;
    put(pic, i % 3 === 0 ? ".l.\nlWl\n.l." : "pl\nlm", x, y);
  }
  return clean(pic, CHEM_LONE);
}

const avogadro = sprite({
  ...evo,
  name: "evo-avogadro",
  blend: "add",
  size: [13, 13],
  origin: [6, 6],
  frames: framesOf("c", [3, 7, 11].map(cluster)),
  anim: Object.fromEntries(
    [0, 1, 2].map((i) => [`c${i}`, { frames: [`c${i}`], fps: 1, loop: false }]),
  ),
});

/**
 * 완충 용액: the two drops fly as a pair, acid and base turning round each other, a pale ring
 * holding them: the buffer that will not let the pH move.
 */
function buffer(k: number): Pic {
  const pic = Pic.blank(19, 19);
  put(
    pic,
    paintAt(19, 19, (x, y) => (Math.abs(Math.hypot(x - 9.5, y - 9.5) - 7.5) < 0.55 ? "p" : null)),
    0,
    0,
  );
  const a = (k * Math.PI) / 2;
  const ax = 9.5 + Math.cos(a) * 4 - 4;
  const ay = 9.5 + Math.sin(a) * 4 - 4;
  const bx = 9.5 - Math.cos(a) * 4 - 4;
  const by = 9.5 - Math.sin(a) * 4 - 4;
  put(pic, drop("A", "B", "C", false), ax, ay);
  put(pic, drop("P", "Q", "R", false), bx, by);
  return clean(pic, CHEM_LONE);
}

const bufferSprite = sprite({
  ...evo,
  name: "evo-buffer",
  size: [19, 19],
  origin: [9, 9],
  frames: framesOf("b", [0, 1, 2, 3].map(buffer)),
  anim: { fly: { frames: names("b", 4), fps: 12, jump: 1 } },
});

export default [aqua, moltenIron, mendeleev, polymer, avogadro, bufferSprite];
