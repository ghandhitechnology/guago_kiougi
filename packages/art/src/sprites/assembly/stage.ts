import { type Legend, sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";

/**
 * Dressing for the 체육관 on top of the interior kit's floor, walls, stage and curtain: steps up
 * to the stage, the school banner, the podium with its microphone, and the court lines painted
 * on the wood. The banner and the podium carry shapes, never words.
 */

const palette: Legend = {
  ".": null,
  W: "wood.deep",
  B: "wood.dark",
  o: "wood.mid",
  b: "wood.light",
  p: "wood.pale",
  R: "red.deep",
  r: "red.dark",
  m: "red.mid",
  M: "red.light",
  D: "gold.deep",
  K: "gold.dark",
  a: "gold.mid",
  A: "gold.light",
  N: "navy.deep",
  n: "navy.dark",
  v: "navy.mid",
  V: "navy.light",
  G: "stone.deep",
  g: "stone.mid",
  q: "stone.light",
  s: "stone.pale",
  w: "stone.bright",
  e: "ink.deep",
  z: "ink.dark",
  F: "grass.deep",
  f: "grass.dark",
  h: "grass.mid",
};

// Steps ---------------------------------------------------------------------------------------

/** Three steps up to the stage's lip, seen from the front. */
function steps(): string {
  const w = 24;
  const h = 22;
  const p = Pic.blank(w, h);
  const tread = (y0: number, x0: number) => {
    for (let x = x0; x < w; x++) {
      p.set(x, y0, "W");
      p.set(x, y0 + 1, "p");
      p.set(x, y0 + 2, "b");
      for (let y = y0 + 3; y < y0 + 7 && y < h - 1; y++) p.set(x, y, x === x0 ? "W" : "B");
    }
    for (let y = y0; y < h; y++) p.set(x0, y, "W");
  };
  tread(0, 0);
  tread(7, 0);
  tread(14, 0);
  for (let x = 0; x < w; x++) p.set(x, h - 1, "W");
  for (let y = 0; y < h; y++) p.set(w - 1, y, "W");
  return p.toString();
}

const stageSteps = sprite({
  name: "stage-steps",
  group: "cast",
  size: [24, 22],
  origin: [0, 21],
  palette,
  frames: { still: steps() },
  anim: { idle: { frames: ["still"], fps: 1 } },
});

// Banner --------------------------------------------------------------------------------------

/**
 * The school banner over the stage: cream cloth in a navy border, the 해솔 in a navy roundel
 * between the three marks of the motto (가설 · 실험 · 증명 as a question, a flask, a square).
 */
function banner(): string {
  const w = 104;
  const h = 18;
  const p = Pic.blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const band = x === 1 || y === 1 || x === w - 2 || y === h - 2;
      p.set(x, y, border ? "N" : band ? "v" : y > h - 5 ? "q" : "w");
    }
  }
  const roundel = Pic.of(`
    ...NNNN...
    ..NvvvvN..
    .NvvhhvvN.
    NvvhhhhvvN
    NvhhhhhhvN
    NvvvWWvvvN
    .NvvWWvvN.
    ..NvvvvN..
    ...NNNN...
  `);
  p.put(roundel, 47, 4);
  const marks = [
    Pic.of("NNNN\nN..N\n..NN\n.NN.\n....\n.NN."),
    Pic.of(".NN.\n.NN.\nNvvN\nNvvN\nNNNN\n...."),
    Pic.of("NNNN\nNvvN\nNvvN\nNNNN\n....\n...."),
  ];
  [14, 30, 72].forEach((x, i) => {
    p.put(marks[i] as Pic, x, 6);
  });
  for (const x of [23, 39, 63, 82]) p.put("aa\naa", x, 8);
  return p.toString();
}

const schoolBanner = sprite({
  name: "school-banner",
  group: "cast",
  size: [104, 18],
  origin: [52, 0],
  palette,
  frames: { still: banner() },
  anim: { idle: { frames: ["still"], fps: 1 } },
});

// Podium --------------------------------------------------------------------------------------

/**
 * The podium: a low wooden stand with the school roundel, its gooseneck microphone at the near
 * corner so the speaker's face stays clear.
 */
function podium(): string {
  const w = 24;
  const h = 20;
  const p = Pic.blank(w, h);
  p.put(
    `
      zz..
      eez.
      eez.
      .z..
      .z..
      ..z.
    `,
    0,
    0,
  );
  for (let x = 1; x < w - 1; x++) {
    p.set(x, 6, "W");
    p.set(x, 7, x < 6 ? "p" : "b");
    p.set(x, 8, "o");
    p.set(x, 9, "W");
  }
  p.set(0, 7, "W")
    .set(0, 8, "W")
    .set(w - 1, 7, "W")
    .set(w - 1, 8, "W");
  for (let y = 10; y < h; y++) {
    for (let x = 2; x < w - 2; x++) {
      const edge = x === 2 || x === w - 3 || y === h - 1;
      p.set(x, y, edge ? "W" : x < 5 ? "b" : x > w - 6 ? "B" : "o");
    }
  }
  p.put(
    `
      .NNNN.
      NvhhvN
      NvWWvN
      .NNNN.
    `,
    9,
    12,
  );
  return p.toString();
}

const podiumSprite = sprite({
  name: "gym-podium",
  group: "cast",
  size: [24, 20],
  origin: [12, 19],
  palette,
  frames: { still: podium() },
  anim: { idle: { frames: ["still"], fps: 1 } },
});

// Court lines ---------------------------------------------------------------------------------

/** Court lines painted on the gym floor: a run either way, and the centre circle in perspective. */
function ring(rx: number, ry: number): string {
  const p = Pic.blank(2 * rx + 1, 2 * ry + 1);
  for (let a = 0; a < 1440; a++) {
    const t = (a / 1440) * Math.PI * 2;
    p.set(Math.round(rx + rx * Math.cos(t)), Math.round(ry + ry * Math.sin(t)), "s");
  }
  return p.toString();
}

const courtLine = sprite({
  name: "court-line",
  group: "cast",
  size: [16, 16],
  origin: [0, 0],
  palette,
  outline: false,
  parts: {
    across: "ssssssssssssssss",
    down: "s\ns\ns\ns\ns\ns\ns\ns\ns\ns\ns\ns\ns\ns\ns\ns",
  },
  frames: { h: ["across"], v: ["down"] },
  anim: { idle: { frames: ["h"], fps: 1 } },
});

const courtRing = sprite({
  name: "court-ring",
  group: "cast",
  size: [57, 35],
  origin: [28, 17],
  palette,
  outline: false,
  frames: { still: ring(28, 17) },
  anim: { idle: { frames: ["still"], fps: 1 } },
});

export default [stageSteps, schoolBanner, podiumSprite, courtLine, courtRing];
