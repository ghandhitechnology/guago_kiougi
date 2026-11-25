import type { Prop, ScaledActor } from "../scene.ts";
import { scene } from "../scene.ts";
import { crowd, fx, mob, student } from "./fight.ts";

/**
 * evolved-horde: five students, one per class, each with an evolved book, on the sports field at
 * night in a surge. 유클리드 원론's circle, 스펙트럼's seven beams, 왕수 pooling under the pack,
 * 극상림 coming up through it and 태풍의 눈 turning over the far side. The same question as the
 * combat scene, asked on the dark ground: with the grandest forms out at once, can the fight
 * still be read, and is every class still its own colour?
 */

const MATH: [number, number] = [86, 116];
const PHYS: [number, number] = [70, 206];
const CHEM: [number, number] = [246, 256];
const BIO: [number, number] = [222, 62];
const EARTH: [number, number] = [392, 150];

/**
 * 스펙트럼's fan as the client would draw it: seven beams from one point, each laid as its 16 px
 * segment stepped along the beam every 8 px (the client uses line primitives or turned tiles).
 */
function spectrum(x0: number, y0: number, length: number, spread: number): Prop[] {
  const out: Prop[] = [];
  for (let i = 0; i < 7; i++) {
    const a = -spread / 2 + (i * spread) / 6;
    for (let t = 0; t < length; t += 8) {
      out.push(
        fx("atk-spectrum", Math.round(x0 + Math.cos(a) * t), Math.round(y0 + Math.sin(a) * t), {
          anim: `c${i}`,
          play: true,
          index: (t / 8) % 2,
        }),
      );
    }
  }
  return out;
}

/** The elite, at the client's double size, behind its aura. */
const ELITE: ScaledActor = {
  actor: "element-earth",
  anim: "move",
  play: true,
  at: [262, 150],
  shadow: "shadow-s/blob",
  scale: 2,
};

export default scene({
  name: "evolved-horde",
  seed: 83,
  theme: "field-night",
  sky: "ink.deep",
  legend: {
    g: { terrain: "grass" },
    s: { terrain: "sand" },
  },
  ground: `
    gggggggggggggggggggggggggggggg
    ggggssssssssssssssssssssssgggg
    gggsssssssssssssssssssssssssgg
    ggssssssssssssssssssssssssssgg
    ggssssssssssssssssssssssssssgg
    gsssssssssssssssssssssssssssss
    gsssssssssssssssssssssssssssss
    ssssssssssssssssssssssssssssss
    ssssssssssssssssssssssssssssss
    ssssssssssssssssssssssssssssss
    ssssssssssssssssssssssssssssss
    gsssssssssssssssssssssssssssss
    gsssssssssssssssssssssssssssss
    ggssssssssssssssssssssssssssgg
    ggssssssssssssssssssssssssssgg
    gggsssssssssssssssssssssssssgg
    ggggssssssssssssssssssssssgggg
  `,
  details: [
    fx("evo-elements", MATH[0], MATH[1] - 4, { frame: "r64" }),
    fx("fx-aqua-regia-pool", 290, 232, { anim: "bubble", play: true }),
    fx("fx-aqua-regia-pool", 336, 254, { anim: "bubble", play: true, index: 1 }),
    fx("fx-forest", 300, 66, { anim: "hold", play: true }),
    fx("fx-typhoon", EARTH[0], EARTH[1], { anim: "turn", play: true }),
    fx("tele-circle", PHYS[0] + 4, PHYS[1] + 2, { frame: "t3" }),
    fx("fx-elite-aura", 262, 150, { anim: "aura", play: true }),
  ],
  objects: [
    ...crowd(
      11,
      70,
      [120, 26, 476, 266],
      [
        [EARTH[0], EARTH[1], 30],
        [CHEM[0], CHEM[1], 26],
        [BIO[0], BIO[1], 26],
        [MATH[0], MATH[1], 30],
        [262, 150, 14],
      ],
      13,
    ),
    ELITE,
    mob("odap", 30, 150, "hop", 1, false),
    mob("odap-pencil", 24, 250, "hop", 2, false),
    student("reader", MATH[0], MATH[1], 1),
    student("club", PHYS[0], PHYS[1], 2),
    student("curls", CHEM[0], CHEM[1], 1),
    student("summer", BIO[0], BIO[1], 1),
    student("bedhead", EARTH[0], EARTH[1], 2),
    // 줄기세포's three specialists at work in the pack.
    { actor: "evo-stem-cell", anim: "killer", play: true, at: [258, 84] },
    { actor: "evo-stem-cell", anim: "burst", play: true, at: [282, 96] },
    { actor: "evo-stem-cell", anim: "healer", play: true, at: [236, 78] },
  ],
  atmosphere: [
    ...spectrum(PHYS[0] + 12, PHYS[1] - 10, 168, 0.62),
    fx("fx-qed-big", 160, 92, { anim: "burst", index: 1, play: true }),
    fx("evo-complete-proof", 186, 112, { anim: "stamp", index: 1, play: true }),
    fx("evo-complete-proof", 138, 124, { anim: "stamp", index: 0, play: true }),
    fx("evo-buffer", 254, 222, { anim: "fly", play: true }),
    fx("evo-buffer", 276, 214, { anim: "fly", play: true, index: 2 }),
    fx("fx-explosion", 372, 236, { anim: "blast", index: 1, play: true }),
    ...[0, 1, 2, 3, 4, 5].map((k) => {
      const a = (k / 6) * Math.PI * 2;
      return fx(
        "evo-herd-immunity",
        BIO[0] + Math.round(Math.cos(a) * 22),
        BIO[1] - 10 + Math.round(Math.sin(a) * 12),
        {
          anim: "tumble",
          play: true,
          index: k,
        },
      );
    }),
    fx("evo-typhoon-cloud", EARTH[0], EARTH[1] - 34, { anim: "drift", play: true }),
    fx("fx-thunder", 434, 120, { anim: "strike", play: true }),
    fx("fx-thunder", 352, 186, { anim: "strike", play: true, index: 1 }),
    fx("status", 290, 214, { anim: "armor-break", play: true }),
    fx("status", 336, 236, { anim: "armor-break", play: true }),
    fx("status", 434, 106, { anim: "wet", play: true }),
    fx("status", 160, 76, { anim: "proof", play: true }),
    fx("fx-hit-heavy", 200, 176, { anim: "hit", play: true }),
    fx("fx-hit-crit", 160, 100, { anim: "hit", index: 1, play: true }),
  ],
});
