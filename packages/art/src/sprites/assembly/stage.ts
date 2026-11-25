import { type Legend, sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";

/**
 * The 체육관 stage for the morning assembly, the minimum the gym needs on top of the interior
 * kit's floor, walls, windows and doors: the stage itself in 16-pixel pieces, its side steps,
 * the wine-red curtain, the school banner, the podium with its microphone, and the court lines
 * painted on the wood. The banner and the podium carry shapes, never words.
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

// Stage ---------------------------------------------------------------------------------------

const TOP = 24;
const STAGE_H = 44;

/**
 * One 16-pixel column of stage: the boards on top, seams staggered, the bright nosing of the
 * lip, then the dark panelled front. `edge` closes the left or right end.
 */
function stagePiece(edge: "l" | "r" | null, worn = false): string {
  const p = Pic.blank(16, STAGE_H);
  for (let y = 0; y < STAGE_H; y++) {
    for (let x = 0; x < 16; x++) {
      let c: string;
      if (y === 0) c = "W";
      else if (y < TOP) {
        const plank = Math.floor((y - 1) / 4);
        const seam = (y - 1) % 4 === 3;
        const joint = x === (plank % 2 === 0 ? 4 : 12);
        c = seam ? "B" : joint && (y - 1) % 4 !== 0 ? "B" : (y - 1) % 4 === 0 ? "p" : "b";
        if (worn && plank === 2 && x > 5 && x < 11 && !seam) c = "o";
      } else if (y === TOP) c = "p";
      else if (y === TOP + 1) c = "B";
      else if (y === STAGE_H - 1) c = "W";
      else {
        const stile = x === 0 || x === 15;
        const rail = y === TOP + 2 || y === STAGE_H - 2;
        c = stile || rail ? "B" : y === TOP + 3 || x === 1 ? "o" : "B";
        if (!stile && !rail && x > 1 && x < 15 && y > TOP + 3 && y < STAGE_H - 2) c = "o";
        if (!stile && !rail && x > 2 && x < 14 && y > TOP + 4 && y < STAGE_H - 3) c = "B";
      }
      p.set(x, y, c);
    }
  }
  if (edge === "l") for (let y = 0; y < STAGE_H; y++) p.set(0, y, "W");
  if (edge === "r") for (let y = 0; y < STAGE_H; y++) p.set(15, y, "W");
  return p.toString();
}

/** Three steps down from the stage's lip to the floor, seen from the front. */
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

const stage = sprite({
  name: "stage",
  group: "cast",
  size: [16, STAGE_H],
  origin: [0, STAGE_H - 1],
  palette,
  outline: false,
  frames: {
    run: stagePiece(null),
    worn: stagePiece(null, true),
    "end-l": stagePiece("l"),
    "end-r": stagePiece("r"),
  },
  anim: { idle: { frames: ["run"], fps: 1 } },
});

const stageSteps = sprite({
  name: "stage-steps",
  group: "cast",
  size: [24, 22],
  origin: [0, 21],
  palette,
  frames: { still: steps() },
  anim: { idle: { frames: ["still"], fps: 1 } },
});

// Curtain -------------------------------------------------------------------------------------

/** The valance: one swag of wine velvet with its gold fringe, repeating every 16 pixels. */
function valance(): string {
  const p = Pic.blank(16, 16);
  for (let x = 0; x < 16; x++) {
    const sag = Math.round(3 * Math.sin((Math.PI * (x + 0.5)) / 16));
    const bottom = 8 + sag;
    for (let y = 0; y <= bottom; y++) {
      let c = y === 0 ? "R" : y < 3 ? "m" : "r";
      if (y >= 3 && y < bottom - 1 && (x === 3 || x === 4) && y < 6) c = "M";
      if (y === bottom) c = "R";
      p.set(x, y, c);
    }
    p.set(x, bottom + 1, "a");
    p.set(x, bottom + 2, "a");
    if (x % 4 < 2) p.set(x, bottom + 3, "D");
  }
  return p.toString();
}

/** A side curtain: pleats lit from the left, pooled where it meets the stage. */
function drape(h: number, flip: boolean): string {
  const w = 14;
  const p = Pic.blank(w, h);
  const pleat = ["R", "M", "m", "m", "r", "R", "m", "m", "r", "r", "R", "m", "r", "R"];
  for (let y = 0; y < h; y++) {
    const pool = y > h - 5 ? y - (h - 5) : 0;
    for (let x = 0; x < w; x++) {
      const xx = flip ? w - 1 - x : x;
      if (pool && (xx < pool - 1 || xx > w - pool)) continue;
      let c = pleat[x] as string;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) c = "R";
      p.set(xx, y, c);
    }
  }
  return p.toString();
}

const curtain = sprite({
  name: "stage-curtain",
  group: "cast",
  size: [16, 92],
  origin: [0, 0],
  palette,
  outline: false,
  parts: {
    swag: valance(),
    left: drape(92, false),
    right: { at: [2, 0], grid: drape(92, true) },
  },
  frames: { valance: ["swag"], "side-l": ["left"], "side-r": ["right"] },
  anim: { idle: { frames: ["valance"], fps: 1 } },
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

/** The podium: a wooden stand with the school roundel, and a gooseneck microphone. */
function podium(): string {
  const w = 24;
  const h = 26;
  const p = Pic.blank(w, h);
  // Gooseneck and microphone head.
  p.put(
    `
      .zz
      zeez
      zeez
      .zz.
      ..z.
      ..z.
      ...z
      ...z
    `,
    14,
    0,
  );
  // Slanted top.
  for (let x = 1; x < w - 1; x++) {
    p.set(x, 8, "W");
    p.set(x, 9, x < 6 ? "p" : "b");
    p.set(x, 10, "o");
    p.set(x, 11, "W");
  }
  p.set(0, 9, "W")
    .set(0, 10, "W")
    .set(w - 1, 9, "W")
    .set(w - 1, 10, "W");
  // Front panel.
  for (let y = 12; y < h; y++) {
    for (let x = 2; x < w - 2; x++) {
      const edge = x === 2 || x === w - 3 || y === h - 1;
      p.set(x, y, edge ? "W" : x < 5 ? "b" : x > w - 6 ? "B" : "o");
    }
  }
  p.put(
    `
      .NNNN.
      NvhhvN
      NvhhvN
      NvWWvN
      .NNNN.
    `,
    9,
    15,
  );
  return p.toString();
}

const podiumSprite = sprite({
  name: "gym-podium",
  group: "cast",
  size: [24, 26],
  origin: [12, 25],
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

export default [stage, stageSteps, curtain, schoolBanner, podiumSprite, courtLine, courtRing];
