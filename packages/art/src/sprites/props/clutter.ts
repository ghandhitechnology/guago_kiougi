import {
  boxShadow,
  finish,
  frames,
  hline,
  mounted,
  ovalShadow,
  rect,
  shadows,
  vline,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * Small life: what students leave everywhere. Bags slumped by chairs, textbooks in stacks, the
 * umbrella nobody claims, cup noodles, 실내화, posters as shapes, the fire extinguisher.
 */

/** A backpack standing on the floor: body, front pocket, a strap over the top. */
function bag(body: string, mid: string, light: string, slumped: boolean): Pic {
  const p = Pic.blank(14, 14);
  if (!slumped) {
    rect(p, 2, 2, 10, 11, mid);
    hline(p, 3, 1, 8, mid);
    vline(p, 2, 3, 9, light);
    hline(p, 3, 2, 7, light);
    vline(p, 11, 2, 11, body);
    hline(p, 2, 12, 10, body);
    // Front pocket and its zip.
    rect(p, 4, 7, 6, 5, body);
    hline(p, 4, 7, 6, light);
    // Top strap.
    hline(p, 5, 0, 4, body);
    p.set(5, 1, body).set(8, 1, body);
  } else {
    // Fallen on its back: the straps up, the pocket toward us.
    rect(p, 1, 6, 12, 7, mid);
    hline(p, 2, 5, 10, mid);
    hline(p, 2, 6, 9, light);
    vline(p, 12, 6, 7, body);
    hline(p, 1, 12, 12, body);
    rect(p, 4, 9, 6, 3, body);
    hline(p, 3, 4, 3, body);
    hline(p, 8, 4, 3, body);
  }
  return finish(p);
}

/** A stack of textbooks, spines out, the top one open a crack. */
function books(tall: boolean): Pic {
  const p = Pic.blank(14, 14);
  const colors: [string, string][] = tall
    ? [
        ["N", "n"],
        ["R", "r"],
        ["W", "P"],
        ["G", "g"],
        ["X", "x"],
      ]
    : [
        ["R", "r"],
        ["N", "n"],
        ["G", "g"],
      ];
  let y = 13;
  colors.forEach(([dark, light], i) => {
    const x0 = 1 + (i % 2);
    const w = 11 - (i % 2);
    rect(p, x0, y - 2, w, 2, dark);
    hline(p, x0, y - 2, w, light);
    vline(p, x0 + w - 1, y - 2, 2, "w");
    y -= 2;
  });
  // The top cover seen from above.
  rect(p, 2, y - 3, 10, 3, colors[colors.length - 1]?.[1] ?? "n");
  hline(p, 3, y - 2, 6, "w");
  return finish(p);
}

/** The umbrella nobody has claimed since March, leaning on whatever is nearest. */
const umbrella = (() => {
  const p = Pic.blank(10, 22);
  // Furled canopy.
  for (let y = 3; y < 17; y++) {
    const w = y < 6 ? 2 : y < 14 ? 4 : 3;
    rect(p, 4 - Math.floor(w / 2) + Math.floor((y - 3) / 7), y, w, 1, "X");
  }
  for (let y = 5; y < 15; y++) p.set(4 + Math.floor((y - 3) / 7), y, "x");
  // Strap and tip.
  rect(p, 4, 9, 3, 1, "A");
  vline(p, 5, 17, 4, "M");
  p.set(6, 21, "M");
  // Hook handle.
  p.set(4, 2, "U").set(4, 1, "U").set(5, 0, "U").set(6, 0, "U").set(7, 1, "U");
  return finish(p);
})();

/** Cup noodles: the lid peeled back, steam not yet gone, chopsticks across it. */
function noodles(steam: number): Pic {
  const p = Pic.blank(10, 14);
  rect(p, 2, 7, 6, 6, "w");
  vline(p, 7, 7, 6, "K");
  hline(p, 2, 9, 6, "R");
  hline(p, 2, 10, 6, "r");
  rect(p, 2, 6, 6, 1, "t");
  hline(p, 3, 6, 3, "P");
  // Peeled lid.
  rect(p, 6, 4, 3, 2, "k");
  // Chopsticks.
  hline(p, 0, 5, 7, "W");
  if (steam >= 0) {
    const s = steam;
    p.set(3 + (s % 2), 3, "k").set(3 + (s % 2), 2, "k");
    p.set(4 - (s % 2), 1, "k").set(4 - (s % 2), 0, "k");
  }
  return finish(p, "k");
}

/** 실내화: white indoor slippers with a blue band. */
function slippers(scattered: boolean): Pic {
  const p = Pic.blank(16, 8);
  const one = (x: number, y: number) => {
    rect(p, x, y, 5, 6, "w");
    hline(p, x, y + 2, 5, "N");
    hline(p, x, y + 3, 5, "n");
    vline(p, x + 4, y, 6, "K");
  };
  one(1, 1);
  one(scattered ? 9 : 7, scattered ? 2 : 1);
  return finish(p);
}

/** Posters as shapes: a science fair chart, a club's big symbol, a safety notice. */
function poster(kind: "chart" | "club" | "safety"): Pic {
  const p = Pic.blank(16, 22);
  rect(p, 0, 0, 16, 22, "w");
  vline(p, 15, 1, 21, "k");
  hline(p, 1, 21, 15, "k");
  if (kind === "chart") {
    rect(p, 2, 2, 12, 3, "N");
    hline(p, 3, 3, 8, "n");
    for (const [x, h] of [
      [3, 4],
      [6, 7],
      [9, 5],
      [12, 9],
    ] as const)
      rect(p, x, 17 - h, 2, h, x === 12 ? "R" : "9");
    hline(p, 2, 18, 12, "M");
  }
  if (kind === "club") {
    rect(p, 1, 1, 14, 20, "R");
    rect(p, 4, 4, 8, 8, "Y");
    rect(p, 6, 6, 4, 4, "R");
    hline(p, 3, 15, 10, "w");
    hline(p, 4, 17, 8, "w");
  }
  if (kind === "safety") {
    rect(p, 2, 2, 12, 2, "o");
    rect(p, 5, 6, 6, 6, "R");
    rect(p, 7, 7, 2, 3, "w");
    p.set(7, 11, "w").set(8, 11, "w");
    for (let y = 14; y < 20; y += 2) hline(p, 3, y, 10, "K");
  }
  // Tape at the corners.
  rect(p, 0, 0, 2, 2, "k");
  rect(p, 14, 0, 2, 2, "k");
  return finish(p);
}

/** 소화기: red, a black hose, its pressure gauge, a pin. */
const extinguisher = (() => {
  const p = Pic.blank(10, 18);
  rect(p, 2, 4, 6, 13, "R");
  vline(p, 2, 5, 11, "r");
  vline(p, 7, 4, 13, "q");
  hline(p, 2, 4, 6, "r");
  rect(p, 3, 1, 4, 3, "I");
  hline(p, 4, 0, 3, "I");
  rect(p, 4, 7, 2, 2, "w");
  // Hose down the front.
  vline(p, 1, 3, 9, "J");
  p.set(2, 3, "J");
  rect(p, 3, 11, 4, 3, "w");
  hline(p, 2, 16, 6, "q");
  return finish(p);
})();

/** A tumbler, the only drink allowed in the 자습실. */
const tumbler = (() => {
  const p = Pic.blank(6, 10);
  rect(p, 1, 2, 4, 7, "K");
  vline(p, 1, 2, 7, "k");
  vline(p, 4, 2, 7, "M");
  rect(p, 1, 0, 4, 2, "N");
  hline(p, 1, 0, 4, "n");
  return finish(p);
})();

export default [
  frames(
    "bag",
    {
      navy: bag("v", "N", "n", false),
      red: bag("q", "R", "r", false),
      green: bag("5", "D", "6", false),
      slump: bag("v", "N", "n", true),
    },
    { shadow: ovalShadow(14, 14, 8, 12.5, 6.5, 2) },
  ),
  frames(
    "textbooks",
    { stack: books(false), tall: books(true) },
    { shadow: boxShadow(14, 14, 1, 11, 12, 13, 2, 0) },
  ),
  frames("umbrella", { lean: umbrella }, { shadow: ovalShadow(10, 22, 7, 21, 3, 1.2) }),
  frames(
    "cup-noodles",
    { s0: noodles(0), s1: noodles(1), cold: noodles(-1) },
    {
      lone: "k",
      shadow: ovalShadow(10, 14, 6, 13, 4, 1.2),
      anim: { idle: { frames: ["s0"], fps: 1 }, steam: { frames: ["s0", "s1"], fps: 3 } },
    },
  ),
  frames(
    "slippers",
    { pair: slippers(false), scattered: slippers(true) },
    { shadow: shadows(boxShadow(16, 8, 1, 6, 14, 7, 1, 0)) },
  ),
  frames(
    "poster",
    { chart: poster("chart"), club: poster("club"), safety: poster("safety") },
    { origin: mounted([16, 22], 18) },
  ),
  frames("extinguisher", { still: extinguisher }, { shadow: ovalShadow(10, 18, 6, 17, 4, 1.3) }),
  frames("tumbler", { still: tumbler }, { shadow: ovalShadow(6, 10, 4, 9, 2.5, 1) }),
];
