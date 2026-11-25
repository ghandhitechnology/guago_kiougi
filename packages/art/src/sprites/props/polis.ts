import { clean, finish, hline, ovalShadow, rect, rim, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";

/**
 * The 아고라 and the buildings Page 1 shares: a stoa built in bays with painted panels on its
 * back wall, market stalls under striped awnings (one is the era shop, with an owl over its
 * counter), the fountain house where the town fills its jars, the heroes' monument whose
 * whitened boards carry the 과제, boundary stones, and the hills of Attica past the town. In the
 * interior legend, lit from the top left; packed in the `page1` atlas, which loads with the rift.
 */

// The stoa ---------------------------------------------------------------------------------------

/** One bay of a stoa: 32 px of roof, entablature, a column, the porch behind it, and the steps. */
const BAY_W = 32;
const STOA_H = 80;
const ROOF = 21;
const ENT = 9;
const COL_TOP = ROOF + ENT;
const STEPS = 72;

/** Terracotta roof seen from the front at a slant: cover tiles in ribs, courses, an eave line. */
function roof(p: Pic, x0: number, w: number, phase = 0): void {
  for (let y = 0; y < ROOF; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const k = (x + phase) % 8;
      // Cover tiles run down the slope as ribs, lit on their west side, each throwing a thin
      // shadow east onto the pan beside it. The upper slope takes more sky.
      let ch = k === 0 ? "P" : k === 1 ? "t" : k === 2 ? "C" : y < 10 ? "t" : "T";
      if (y < 3) ch = y === 0 ? "Q" : y === 1 ? "t" : "C";
      if (y >= ROOF - 2) ch = y === ROOF - 1 ? "Q" : k === 0 || k === 1 ? "w" : "C";
      p.set(x, y, ch);
    }
  }
}

/** Cornice, frieze of triglyphs and metopes, architrave: the beam the columns carry. */
function beam(p: Pic, x0: number, w: number): void {
  const rows = ["w", "k", "M", "f", "f", "f", "k", "K", "V"];
  rows.forEach((kind, i) => {
    const y = ROOF + i;
    for (let x = x0; x < x0 + w; x++) {
      let ch = kind;
      if (kind === "f") {
        const s = x % 16;
        ch = s < 5 ? (s === 1 || s === 3 ? "V" : "k") : i === 3 ? "V" : "K";
      }
      p.set(x, y, ch);
    }
  });
}

/** A Doric column 12 wide from `top` to `foot`, fluted, lit on its west side. */
function column(p: Pic, x: number, top: number, foot: number): void {
  const FLUTE = "dwkkKkKkVMSd";
  rect(p, x - 1, top, 14, 2, "k");
  hline(p, x - 1, top, 14, "w");
  hline(p, x - 1, top + 2, 14, "M");
  vline(p, x - 1, top, 3, "d");
  vline(p, x + 12, top, 3, "d");
  hline(p, x, top + 3, 12, "K");
  for (let y = top + 4; y < foot; y++) p.put(FLUTE, x, y);
}

/**
 * The porch behind the columns, in the stoa's shade: ceiling shadow, a painted panel on the back
 * wall, a red dado, the floor. `panel` picks what the painter put on this stretch of wall.
 */
function porch(p: Pic, x0: number, w: number, panel: string): void {
  const top = COL_TOP;
  rect(p, x0, top, w, 3, "I");
  rect(p, x0, top + 3, w, 3, "S");
  rect(p, x0, top + 6, w, 22, panel === "door" ? "S" : "q");
  // A key pattern along the panel's top.
  for (let x = x0; x < x0 + w; x++) {
    const k = x % 8;
    p.set(x, top + 6, "C");
    if (k < 6) p.set(x, top + 7, "o");
    if (k === 0 || k === 5) p.set(x, top + 8, "o");
    p.set(x, top + 9, "C");
  }
  rect(p, x0, top + 28, w, 5, "C");
  hline(p, x0, top + 28, w, "Q");
  rect(p, x0, top + 33, w, STEPS - top - 33, "M");
  hline(p, x0, STEPS - 1, w, "V");
}

/** What is painted on the panels, figure by figure: [x, y] from the panel's top left. */
function paint(p: Pic, x0: number, kind: string): void {
  const y0 = COL_TOP + 11;
  const put = (grid: string, dx: number, dy: number) => p.put(grid, x0 + dx, y0 + dy);
  if (kind === "hoplites") {
    // Two warriors with round shields and spears, black on red.
    const man = `
      ..J..
      .JJJ.
      ooJJ.
      oooJ.
      ooJJ.
      .J.J.
      .J.J.
    `;
    put(man, 0, 3);
    put(man, 24, 3);
    for (let y = 0; y < 10; y++) {
      p.set(x0 + 5, y0 + y, "J");
      p.set(x0 + 29, y0 + y, "J");
    }
  } else if (kind === "ship") {
    put(
      `
        ....J.....
        ....J.....
        ...JJJ....
        ..JwwwJ...
        J.JwwwJ.JJ
        JJJJJJJJJ.
        .J.J.J.J..
      `,
      22,
      3,
    );
    put(".JJ\nJ..", 4, 6);
  } else if (kind === "horse") {
    put(
      `
        .....JJ
        J...JJJ
        JJJJJJ.
        .JJJJJ.
        .J...J.
        .J...J.
      `,
      22,
      4,
    );
    put("J.J\n.J.\nJ.J", 3, 6);
  } else if (kind === "door") {
    // A doorway into the stoa's shops: dark, with a frame and a lit threshold.
    rect(p, x0 + 22, y0 - 4, 10, 22, "J");
    vline(p, x0 + 21, y0 - 5, 23, "K");
    hline(p, x0 + 21, y0 - 5, 11, "K");
    rect(p, x0 + 1, y0 - 4, 9, 22, "J");
    vline(p, x0 + 9, y0 - 5, 23, "M");
    hline(p, x0, y0 - 5, 10, "K");
  }
}

/** Two steps of the stylobate, the top lit, each face in its own shade. */
function steps(p: Pic, x0: number, w: number): void {
  const rows = ["w", "k", "K", "M", "k", "K", "V", "d"];
  for (const [i, ch] of rows.entries()) hline(p, x0, STEPS + i, w, ch);
}

function bay(panel: string): Pic {
  const p = Pic.blank(BAY_W, STOA_H);
  roof(p, 0, BAY_W);
  beam(p, 0, BAY_W);
  porch(p, 0, BAY_W, panel === "door" ? "door" : "panel");
  paint(p, 0, panel);
  column(p, 10, COL_TOP, STEPS);
  steps(p, 0, BAY_W);
  // The column's shadow on the porch floor, falling right.
  for (let y = STEPS - 5; y < STEPS - 1; y++)
    for (let x = 22; x < 28 - (STEPS - 1 - y); x++) p.set(x, y, "S");
  return clean(p, "J");
}

/**
 * The stoa's end: the roof's hip turning back, a thick anta wall closing the porch, lit on its
 * front face on the west end and in shade on the east.
 */
function stoaEnd(side: "w" | "e"): Pic {
  const W = 16;
  const p = Pic.blank(W, STOA_H);
  const toward = (x: number) => (side === "w" ? x : W - 1 - x);
  for (let y = 0; y < STOA_H; y++) {
    for (let x = 0; x < W; x++) {
      const out = toward(x);
      // The hip: the roof's edge drawn back from the corner.
      if (y < ROOF && out < Math.max(0, 9 - y)) continue;
      p.set(x, y, ".");
    }
  }
  const tmp = Pic.blank(W, STOA_H);
  roof(tmp, 0, W, side === "w" ? 0 : 0);
  beam(tmp, 0, W);
  for (let y = 0; y < ROOF + ENT; y++)
    for (let x = 0; x < W; x++) {
      const out = toward(x);
      if (y < ROOF && out < Math.max(0, 9 - y)) continue;
      p.set(x, y, tmp.at(x, y) as string);
    }
  // The hip's edge tiles, a lit ridge running down to the corner.
  for (let y = 0; y < 10; y++) {
    const x = side === "w" ? 9 - y : W - 10 + y;
    if (y < ROOF) p.set(x, y, "P").set(side === "w" ? x + 1 : x - 1, y, "t");
  }
  // The anta: a solid wall end, its face lit in the west, shaded in the east.
  const face = side === "w" ? "k" : "M";
  rect(p, 0, COL_TOP, W, STEPS - COL_TOP, face);
  for (let y = COL_TOP; y < STEPS; y += 6) hline(p, 0, y, W, side === "w" ? "K" : "S");
  vline(p, side === "w" ? 0 : W - 1, COL_TOP, STEPS - COL_TOP, side === "w" ? "w" : "S");
  steps(p, 0, W);
  return clean(rim(p, { keep: "wkKVMSIqCQoPtTJ" }));
}

// Market --------------------------------------------------------------------------------------

/** A stall's goods on its counter, by frame. */
const GOODS: Readonly<Record<string, string>> = {
  olives: `
    ...........................yy...
    .WWWWWWWW..WWWWWWWW.......oYYo..
    W43434343WW23232323W.....oyyyyo.
    W34343434WW32323232W.....oyyyyo.
    .uuuuuuuu..uuuuuuuu.......oooo..
  `,
  figs: `
    ............................gg..
    .WWWWWWWW...xx%x......WWWWWgghW.
    WXaXxaXaXW.x%xXxx....W3g4g3hg3W.
    WaXaXXaxaW.xXxXx%x...Wg3g4g3g4W.
    .uuuuuuuu...XxXxX.....uuuuuuuu..
  `,
  fish: `
    .........................++.....
    ..~c9c~c9c.....=++++....~c9c9...
    .~cc99cc99c...=+@@@++..~c99c99c.
    .99999999998...@@.@@+..99999998.
    ..WWWWWWWWW.....@..@...WWWWWWW..
  `,
  pots: `
    ....tt.......JJJ.........tt.....
    ...CTTC.....JooyJ.......CTTC....
    ..CtJJtC...JyJJJyJ.....CJJJJC...
    ..CtPPtC...JoyoyoJ.....CtPPtC...
    ...CTTC.....JjjjJ.......CTTC....
  `,
  scrolls: `
    .WWWW.WWWW....uuuuuuuu.....WWWW.
    WPPPPWPPPPW..uWPWPWPWPu...WPPPPW
    WPPPPWPPPPW..uWPWPWPWPu...WPPPPW
    .UUUU.UUUU...uuuuuuuuuu....UUUU.
    ..............................
  `,
  owl: `
    ..CTTC..CTTC..........CTTC.CTTC.
    .CtPPtCCtPPtC........CtPPtCtPPtC
    .CtJJtCCtJJtC........CtJJtCtJJtC
    .CTTTTCCTTTTC........CTTTTCTTTTC
    ..CTTC..CTTC..........CTTC..CTC.
  `,
};

/** Awning stripes per stall, light and dark. */
const CLOTH: Readonly<Record<string, readonly [string, string, string]>> = {
  olives: ["!", "R", "q"],
  figs: ["m", "n", "N"],
  fish: ["c", "9", "8"],
  pots: ["Y", "y", "o"],
  scrolls: ["%", "x", "X"],
  owl: ["!", "R", "q"],
};

/**
 * A market stall three tiles wide: four poles, a striped awning sloping toward the buyer, a
 * counter with the day's goods, baskets under it. The era shop's stall has an owl over its
 * counter and amphorae stacked behind.
 */
function stall(kind: string): Pic {
  const W = 48;
  const H = 46;
  const p = Pic.blank(W, H);
  const [hi, mid, lo] = CLOTH[kind] ?? ["!", "R", "q"];
  // Back poles, the awning's slope, its scalloped front edge.
  for (const x of [5, 42]) vline(p, x, 6, 34, "b");
  for (let y = 2; y < 15; y++) {
    const inset = Math.max(0, 6 - y);
    for (let x = 2 + inset; x < W - 2 - inset; x++) {
      const stripe = Math.floor((x - 2) / 6) % 2 === 0;
      let ch = stripe ? hi : mid;
      if (y > 11) ch = stripe ? mid : lo;
      p.set(x, y, ch);
    }
  }
  for (let x = 2; x < W - 2; x++) {
    const scallop = (x - 2) % 6;
    if (scallop > 0 && scallop < 5) p.set(x, 15, Math.floor((x - 2) / 6) % 2 === 0 ? mid : lo);
    if (scallop > 1 && scallop < 4) p.set(x, 16, lo);
  }
  // Shade under the awning: the back of the stall.
  rect(p, 4, 17, W - 8, 11, "b");
  rect(p, 4, 17, W - 8, 2, "B");
  hline(p, 6, 22, W - 12, "U");
  if (kind === "owl") {
    // Amphorae stacked behind the counter, and the owl on its perch over it.
    for (const x of [8, 14, 30, 36])
      p.put(
        `
          .CC.
          CttC
          CTTC
          .CC.
        `,
        x,
        20,
      );
    p.put(
      `
        .o..o.
        oyyyyo
        oJyyJo
        oyOOyo
        .oyyo.
        ..bb..
        bbbbbb
      `,
      21,
      16,
    );
  }
  // Front poles.
  for (const x of [2, 45]) {
    vline(p, x, 15, H - 15, "U");
    vline(p, x + 1, 15, H - 15, "b");
  }
  // The counter: a plank top, a front of boards, baskets in its shade.
  p.put(GOODS[kind] ?? (GOODS.olives as string), 8, 24);
  rect(p, 4, 28, W - 8, 3, "u");
  hline(p, 4, 28, W - 8, "W");
  rect(p, 4, 31, W - 8, 11, "U");
  for (let x = 4; x < W - 4; x += 7) vline(p, x, 31, 11, "b");
  hline(p, 4, 41, W - 8, "b");
  p.put(
    `
      .bbbbbb.
      bWuWuWub
      buUuUuUb
      .bbbbbb.
    `,
    W - 15,
    H - 4,
  );
  return finish(p, "!mcY%");
}

// The fountain house ------------------------------------------------------------------------------

/**
 * The fountain house: a little temple front with two columns in antis and a pediment, the dark
 * hall behind them where three lion heads pour into the basin, and the basin's lip in front.
 * Water runs in three frames.
 */
function krene(frame: number): Pic {
  const W = 64;
  const H = 62;
  const p = Pic.blank(W, H);
  // Pediment and its cornice.
  for (let y = 0; y < 12; y++) {
    const half = Math.round((y + 1) * 2.6);
    for (let x = 32 - half; x < 32 + half; x++) p.set(x, y, y === 11 ? "w" : "K");
  }
  for (let y = 3; y < 11; y++) {
    const half = Math.round((y - 2) * 2.6);
    for (let x = 32 - half; x < 32 + half; x++) p.set(x, y, "V");
  }
  p.put("ww\nkk", 31, 0);
  rect(p, 0, 12, W, 2, "w");
  rect(p, 0, 14, W, 2, "M");
  rect(p, 0, 16, W, 5, "k");
  for (let x = 2; x < W - 2; x += 8) p.put("VkV\nVkV\nVkV", x, 16);
  rect(p, 0, 21, W, 2, "K");
  // The hall: shade, the back wall with its lion heads and the water falling from them.
  rect(p, 4, 23, W - 8, 24, "S");
  rect(p, 4, 23, W - 8, 3, "I");
  for (const x of [14, 30, 46]) {
    p.put(
      `
        .oooo.
        oyOyOo
        oyyyyo
        .oJJo.
        ..oo..
      `,
      x,
      28,
    );
    for (let y = 33; y < 44; y++) {
      const wob = (y + frame) % 3 === 0 ? 1 : 0;
      p.set(x + 2 + wob, y, "~").set(x + 3 + wob, y, "c");
    }
  }
  // Antae and columns.
  rect(p, 0, 23, 5, 28, "k");
  vline(p, 0, 23, 28, "w");
  rect(p, W - 5, 23, 5, 28, "M");
  for (const x of [18, 38]) {
    const FL = "dwkKkKVMd";
    for (let y = 23; y < 47; y++) p.put(FL, x, y);
    hline(p, x - 1, 23, 11, "w");
  }
  // The basin: water with its ripples, then the marble lip.
  rect(p, 5, 44, W - 10, 4, "9");
  for (let x = 6; x < W - 6; x++) if ((x + frame * 2) % 7 < 2) p.set(x, 45, "c");
  for (const x of [16, 32, 48]) p.put("~~~", x - (frame % 2), 44);
  rect(p, 0, 48, W, 3, "w");
  rect(p, 0, 51, W, 6, "K");
  hline(p, 0, 51, W, "k");
  hline(p, 0, 56, W, "M");
  for (let x = 6; x < W; x += 13) vline(p, x, 52, 4, "V");
  // Steps.
  rect(p, 2, 57, W - 4, 2, "k");
  rect(p, 2, 59, W - 4, 2, "M");
  return finish(p, "~c");
}

// The heroes' monument -----------------------------------------------------------------------------

/**
 * The monument of the eponymous heroes: a long plinth with ten small bronzes on top, its front
 * hung with whitened boards where the town posts what needs doing, inside a fence of stone posts
 * and rails. A red notice is the one everyone reads.
 */
function heroes(): Pic {
  const W = 84;
  const H = 46;
  const p = Pic.blank(W, H);
  // Plinth top and its front.
  rect(p, 3, 7, W - 6, 3, "w");
  hline(p, 3, 7, W - 6, "k");
  rect(p, 3, 10, W - 6, 22, "K");
  hline(p, 3, 10, W - 6, "k");
  hline(p, 3, 31, W - 6, "M");
  // Bronzes, in a row, each its own stance.
  for (let i = 0; i < 10; i++) {
    const x = 6 + i * 7.5;
    const lean = i % 3;
    p.put(
      `
        .Oo..
        .yO..
        oyyO.
        yyOOo
        oyOO.
        .yO..
        .yO..
        ${lean === 0 ? ".y.O." : lean === 1 ? "y..O." : ".yO.."}
        ${lean === 0 ? "y...O" : lean === 1 ? "y..O." : ".y.O."}
      `,
      Math.round(x) - 1,
      0,
    );
  }
  // Whitened boards, written over.
  for (let b = 0; b < 4; b++) {
    const x = 7 + b * 19;
    rect(p, x, 12, 16, 16, "w");
    vline(p, x + 15, 12, 16, "k");
    hline(p, x, 27, 16, "k");
    for (let y = 14; y < 26; y += 2) {
      const len = 6 + Math.floor(hash(b, y) * 7);
      hline(p, x + 2, y, len, "I");
    }
  }
  // The red notice pinned over the second board.
  rect(p, 30, 15, 8, 9, "r");
  hline(p, 30, 15, 8, "!");
  for (let y = 17; y < 23; y += 2) hline(p, 31, y, 5, "q");
  // Fence: stone posts, wooden rails.
  for (let x = 0; x < W; x += 12) {
    rect(p, x, 26, 4, 18, "k");
    vline(p, x + 3, 26, 18, "M");
    hline(p, x, 26, 4, "w");
  }
  for (const y of [30, 36]) {
    for (let x = 0; x < W; x++) if (p.at(x, y) !== "k" && p.at(x, y) !== "M") p.set(x, y, "u");
    for (let x = 0; x < W; x++)
      if (p.at(x, y + 1) !== "k" && p.at(x, y + 1) !== "M") p.set(x, y + 1, "U");
  }
  return finish(p, "Ir!q");
}

// Small civic things ---------------------------------------------------------------------------

/** A boundary stone: a squat marble stele with its two lines cut in. */
const HOROS = `
  .dddddd.
  dwwkkkKd
  dwkkkkKd
  dkIIIIKd
  dkkkkkKd
  dkIIIkKd
  dkkkkkKd
  dkkkkkMd
  dKKKKKMd
  dKKKKKMd
  dddddddd
`;

/** A pithos, a storage jar taller than a child, half sunk in the ground. */
const PITHOS = `
  ...QQQQQQ...
  ..QtPPPtTQ..
  .QTQQQQQQTQ.
  QtPtTTTTTCCQ
  QtPtTTTTTTCQ
  QtTTTTTTTTCQ
  QtTTCCCCTTCQ
  QTTTTTTTTCCQ
  .QTTTTTTTCQ.
  .QCTTTTTCCQ.
  ..QCCCCCCQ..
  ...QQQQQQ...
`;

/** A handcart with its shafts down, a sack and a jar in it. */
const CART = `
  ..........bbbbb..bbbbbb.........
  .........bWWWWub.bAaaXab........
  ...bbbbbbbuuuuubbbaXXXab........
  ..bWuuuuuuuuuuuuuuuuuuuub.......
  ..buUUUUUUUUUUUUUUUUUUUUbbbbbbbb
  ..bbbbbbbbbbbbbbbbbbbbbbbWuuuuub
  ......bbbb.......bbbb....bbbbbbb
  .....bWuUUb.....bWuUUb..........
  .....buBBUb.....buBBUb..........
  .....bUBBUb.....bUBBUb..........
  ......bbbb.......bbbb...........
`;

/** A marble bench on two lion-footed legs. */
const BENCH = `
  ..............................
  .wwwwwwwwwwwwwwwwwwwwwwwwwwkk.
  .kkkkkkkkkkkkkkkkkkkkkkkkkkKM.
  .KKKKKKKKKKKKKKKKKKKKKKKKKKMM.
  .MMMMMMMMMMMMMMMMMMMMMMMMMMMS.
  ...kKKM..............kKKM.....
  ...kKMM..............kKMM.....
  ..kkKMMS............kkKMMS....
  ..KKMMSS............KKMMSS....
  ..............................
`;

/** Pebbles for counting in the dust, three ways up. */
const PEBBLES = [
  `
    .dd.
    dwkd
    dKMd
    .dd.
  `,
  `
    .ddd.
    dwkKd
    dKMMd
    .ddd.
  `,
  `
    .dd..
    dkkd.
    dKMMd
    .ddd.
  `,
];

// Hills past the town ----------------------------------------------------------------------------

/**
 * The hills of Attica in afternoon haze, and on the nearest the rock of the Acropolis with its
 * temple. Drawn raw, for the backdrop, to sit on the bottom of the Greek sky.
 */
function attica(): Pic {
  const W = 1200;
  const H = 46;
  const p = Pic.blank(W, H);
  // Far ranges violet in the haze, a nearer ridge in olive scrub.
  const far = (x: number) =>
    20 + Math.sin(x / 57) * 7 + Math.sin(x / 23 + 1) * 2.5 + Math.sin(x / 9) * 0.8;
  const near = (x: number) =>
    32 + Math.sin(x / 41 + 2) * 5 + Math.sin(x / 15) * 1.6 + Math.sin(x / 6) * 0.6;
  for (let x = 0; x < W; x++) {
    const f = Math.round(far(x));
    for (let y = f; y < H; y++) p.set(x, y, y < f + 2 ? "=" : "%");
    const n = Math.round(near(x));
    for (let y = n; y < H; y++) p.set(x, y, y < n + 2 ? "4" : y < n + 6 ? "3" : "2");
  }
  // The rock of the Acropolis: steep sides, flat top, lit on its west face.
  const rx = 760;
  for (let x = rx - 46; x < rx + 50; x++) {
    const d = x - rx;
    const top = Math.abs(d) < 34 ? 15 : 15 + (Math.abs(d) - 34) * 1.6;
    for (let y = Math.round(top); y < 40; y++)
      p.set(x, y, y < top + 2 ? "k" : d < -20 ? "K" : d < 10 ? "V" : "M");
  }
  // The temple on it: stylobate, a row of columns, the pediment.
  for (let x = rx - 18; x < rx + 18; x++) p.set(x, 13, "K").set(x, 14, "K");
  for (let x = rx - 17; x < rx + 17; x += 3) for (let y = 7; y < 13; y++) p.set(x, y, "w");
  for (let x = rx - 18; x < rx + 18; x++) p.set(x, 5, "w").set(x, 6, "k");
  for (let y = 2; y < 5; y++)
    for (let x = rx - 18 + (5 - y) * 5; x < rx + 18 - (5 - y) * 5; x++) p.set(x, y, "k");
  return p;
}

export default [
  greek(
    "stoa-bay",
    {
      hoplites: bay("hoplites"),
      ship: bay("ship"),
      horse: bay("horse"),
      plain: bay("plain"),
      door: bay("door"),
    },
    { origin: [0, STOA_H - 1], outline: false },
  ),
  greek(
    "stoa-end",
    { w: stoaEnd("w"), e: stoaEnd("e") },
    { origin: [0, STOA_H - 1], outline: false },
  ),
  greek(
    "stall",
    {
      olives: stall("olives"),
      figs: stall("figs"),
      fish: stall("fish"),
      pots: stall("pots"),
      scrolls: stall("scrolls"),
      owl: stall("owl"),
    },
    { shadow: ovalShadow(48, 46, 25, 43, 24, 3), lone: "!mcY%" },
  ),
  greek(
    "krene",
    { run0: krene(0), run1: krene(1), run2: krene(2) },
    {
      anim: { run: { frames: ["run0", "run1", "run2"], fps: 6 } },
      shadow: ovalShadow(64, 62, 33, 60, 32, 3),
      lone: "~c",
    },
  ),
  greek("heroes", { still: heroes() }, { shadow: ovalShadow(84, 46, 43, 44, 42, 3), lone: "Ir!q" }),
  greek("horos", { still: Pic.of(HOROS) }, { shadow: ovalShadow(8, 11, 4.5, 10, 4.5, 1.4) }),
  greek(
    "pithos",
    { still: finish(Pic.of(PITHOS)) },
    { shadow: ovalShadow(12, 12, 6.5, 11, 6, 1.4) },
  ),
  greek("cart", { still: finish(Pic.of(CART)) }, { shadow: ovalShadow(32, 11, 16, 10, 15, 1.6) }),
  greek(
    "pebble",
    Object.fromEntries(PEBBLES.map((g, i) => [`p${i}`, Pic.blank(5, 4).put(g, 0, 0)])),
    { lone: "wkKM" },
  ),
  greek("attica", { still: attica() }, { origin: [0, 45], outline: false, lone: "kw" }),
  greek(
    "bench-stone",
    { still: finish(Pic.of(BENCH)) },
    { shadow: ovalShadow(30, 10, 16, 9, 15, 1.6) },
  ),
];
