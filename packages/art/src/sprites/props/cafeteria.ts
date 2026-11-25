import { sprite } from "../../format.ts";
import {
  boxShadow,
  clean,
  finish,
  frames,
  hline,
  IL,
  mounted,
  ovalShadow,
  rect,
  vline,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 급식실: the stainless 배식대 behind its sneeze guard, the 식판 everyone carries, long tables
 * with benches, the cook's window into the kitchen with the big pot going, the tray return
 * with the 잔반통 where somebody always checks what you left.
 */

// 식판 -----------------------------------------------------------------------------------------

/** A stainless compartment tray seen from above, 14×9, with lunch in it (or what is left). */
function tray(p: Pic, x: number, y: number, state: "full" | "half" | "empty"): void {
  rect(p, x, y, 14, 9, "k");
  hline(p, x, y, 14, "w");
  vline(p, x, y, 9, "w");
  vline(p, x + 13, y, 9, "K");
  hline(p, x, y + 8, 14, "K");
  // Three small wells on top, rice and soup below.
  const wells: [number, number, number, number, string, string][] = [
    [1, 1, 3, 2, "R", "r"],
    [5, 1, 3, 2, "G", "g"],
    [9, 1, 4, 2, "o", "y"],
    [1, 4, 6, 3, "w", "k"],
    [8, 4, 5, 3, "t", "p"],
  ];
  wells.forEach(([wx, wy, w, h, food, lit], i) => {
    rect(p, x + wx, y + wy, w, h, "K");
    const eaten = state === "empty" || (state === "half" && i % 2 === 0);
    if (eaten) return;
    rect(p, x + wx, y + wy, w, h, food);
    hline(p, x + wx, y + wy, w - 1, lit);
  });
}

/** A stack of clean trays on a counter: the top one, the edges of the rest. */
function trayStack(p: Pic, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) hline(p, x, y + 9 + i, 14, i % 2 ? "M" : "K");
  tray(p, x, y, "empty");
}

// 배식대 ---------------------------------------------------------------------------------------

type Pan = "rice" | "soup" | "kimchi" | "greens" | "pickles" | "bulgogi";

/** What a pan holds: fill, lit top, a scattered accent. */
const FOOD: Readonly<Record<Pan, [string, string, string]>> = {
  rice: ["k", "w", "w"],
  soup: ["t", "p", "T"],
  kimchi: ["R", "r", "w"],
  greens: ["G", "g", "D"],
  pickles: ["y", "Y", "o"],
  bulgogi: ["U", "u", "C"],
};

const LINE_W = 32;
const LINE_H = 50;
const TOP = 20;
const DEPTH = 14;

/**
 * One 32-pixel piece of the line: a glass sneeze guard on posts, the stainless top with two
 * pans or the tray stack, the tray rail along the front. Pieces join edge to edge; `cap-l` and
 * `cap-r` close the ends.
 */
function linePiece(kind: "trays" | [Pan, Pan] | "cap-l" | "cap-r"): Pic {
  const p = Pic.blank(LINE_W, LINE_H);
  if (kind === "cap-l" || kind === "cap-r") {
    const x = kind === "cap-l" ? 0 : LINE_W - 3;
    rect(p, x, TOP, 3, DEPTH + 15, "K");
    vline(p, kind === "cap-l" ? x : x + 2, TOP, DEPTH + 15, "d");
    hline(p, x, TOP, 3, "d");
    hline(p, x, LINE_H - 2, 3, "d");
    rect(p, x, 6, 3, TOP - 6, "M");
    vline(p, x + 1, 6, TOP - 6, "K");
    hline(p, x, 6, 3, "d");
    return p;
  }
  // Top.
  rect(p, 0, TOP, LINE_W, DEPTH, "k");
  hline(p, 0, TOP, LINE_W, "d");
  hline(p, 0, TOP + 1, LINE_W, "K");
  if (kind === "trays") {
    trayStack(p, 2, TOP + 2, 3);
    trayStack(p, 16, TOP + 3, 2);
  } else {
    kind.forEach((pan, i) => {
      const x = 2 + i * 15;
      const [fill, lit, accent] = FOOD[pan];
      rect(p, x, TOP + 3, 13, 9, "K");
      rect(p, x + 1, TOP + 4, 11, 7, fill);
      hline(p, x + 1, TOP + 4, 11, "M");
      hline(p, x + 1, TOP + 5, 10, lit);
      p.set(x + 3, TOP + 7, accent).set(x + 4, TOP + 7, accent);
      p.set(x + 8, TOP + 8, accent).set(x + 9, TOP + 8, accent);
      // Ladle or paddle, handle up out of the pan.
      vline(p, x + 10, TOP - 1, 6, pan === "rice" ? "W" : "K");
      vline(p, x + 11, TOP - 1, 6, pan === "rice" ? "u" : "M");
    });
  }
  // Front: the edge, a three-tube tray rail, panels.
  hline(p, 0, TOP + DEPTH, LINE_W, "w");
  rect(p, 0, TOP + DEPTH + 1, LINE_W, 14, "K");
  hline(p, 0, TOP + DEPTH + 2, LINE_W, "w");
  hline(p, 0, TOP + DEPTH + 3, LINE_W, "k");
  hline(p, 0, TOP + DEPTH + 4, LINE_W, "M");
  hline(p, 0, TOP + DEPTH + 5, LINE_W, "S");
  vline(p, 15, TOP + DEPTH + 6, 8, "M");
  vline(p, 31, TOP + DEPTH + 6, 8, "M");
  hline(p, 0, LINE_H - 3, LINE_W, "M");
  hline(p, 0, LINE_H - 2, LINE_W, "d");
  // The sneeze guard: a rail on two posts, clear glass with a glint across it.
  rect(p, 0, 6, LINE_W, 2, "K");
  hline(p, 0, 6, LINE_W, "d");
  hline(p, 0, 7, LINE_W, "k");
  hline(p, 0, 8, LINE_W, "M");
  vline(p, 0, 6, TOP - 6, "M");
  vline(p, 1, 9, TOP - 9, "K");
  for (let i = 0; i < 8; i++) {
    p.set(6 + i, 16 - i, "w").set(7 + i, 16 - i, "w");
    if (i < 5) p.set(19 + i, 15 - i, "w").set(20 + i, 15 - i, "w");
  }
  return clean(p);
}

const LINE_FRAMES: Readonly<Record<string, "trays" | [Pan, Pan] | "cap-l" | "cap-r">> = {
  trays: "trays",
  "rice-soup": ["rice", "soup"],
  "kimchi-greens": ["kimchi", "greens"],
  "bulgogi-pickles": ["bulgogi", "pickles"],
  "cap-l": "cap-l",
  "cap-r": "cap-r",
};

const servingLine = sprite({
  name: "serving-line",
  group: "interior",
  size: [LINE_W, LINE_H],
  origin: [0, LINE_H - 2],
  palette: IL,
  outline: false,
  shadow: (() => {
    const p = Pic.blank(LINE_W, LINE_H);
    rect(p, 0, LINE_H - 2, LINE_W, 2, "J");
    return p.toString();
  })(),
  frames: Object.fromEntries(
    Object.entries(LINE_FRAMES).map(([k, v]) => [k, linePiece(v).toString()]),
  ),
  anim: { idle: { frames: ["rice-soup"], fps: 1 } },
});

/** A cook behind the line: hairnet, mask, white coat, ladle going up and down. */
function cook(f: number): Pic {
  const p = Pic.blank(18, 26);
  // Cap and face.
  rect(p, 4, 1, 10, 4, "w");
  hline(p, 5, 0, 8, "w");
  hline(p, 4, 4, 10, "k");
  rect(p, 5, 5, 8, 5, "f");
  vline(p, 5, 5, 5, "e");
  p.set(7, 6, "J").set(11, 6, "J");
  rect(p, 5, 8, 8, 3, "k");
  hline(p, 5, 8, 8, "w");
  // Coat and apron.
  rect(p, 3, 11, 12, 14, "w");
  vline(p, 14, 11, 14, "k");
  rect(p, 6, 13, 6, 12, "m");
  hline(p, 6, 13, 6, "~");
  // Arm and ladle.
  const up = f % 2 === 1;
  rect(p, 13, up ? 11 : 13, 3, 3, "w");
  vline(p, 16, up ? 3 : 6, 9, "M");
  rect(p, 15, up ? 11 : 14, 3, 2, "K");
  return finish(p);
}

// Tables ---------------------------------------------------------------------------------------

/** A long table, laminate top on steel legs; `lunch` lays three trays on each side. */
function longTable(state: "empty" | "lunch" | "late"): Pic {
  const W = 66;
  const p = Pic.blank(W, 28);
  rect(p, 1, 1, W - 2, 16, "K");
  hline(p, 1, 1, W - 2, "k");
  vline(p, 1, 1, 16, "k");
  vline(p, W - 2, 2, 15, "M");
  if (state !== "empty") {
    for (let i = 0; i < 3; i++) {
      tray(
        p,
        5 + i * 20,
        2,
        state === "late" && i === 1 ? "empty" : state === "late" ? "half" : "full",
      );
      tray(p, 5 + i * 20, 8, state === "late" && i !== 1 ? "empty" : "full");
    }
    // A cup and a pair of chopsticks someone put down across a tray.
    rect(p, 2, 3, 2, 3, "m");
    hline(p, 46, 13, 9, "W");
  }
  // Edge band and legs.
  rect(p, 1, 17, W - 2, 3, "M");
  hline(p, 1, 17, W - 2, "K");
  hline(p, 1, 19, W - 2, "S");
  for (const x of [4, W - 7]) {
    rect(p, x, 20, 3, 7, "M");
    vline(p, x, 20, 7, "K");
  }
  return finish(p);
}

/** A bench as long as the table. */
const bench = (() => {
  const W = 66;
  const p = Pic.blank(W, 12);
  rect(p, 1, 1, W - 2, 4, "N");
  hline(p, 1, 1, W - 2, "n");
  rect(p, 1, 5, W - 2, 2, "v");
  hline(p, 1, 6, W - 2, "v");
  for (const x of [4, W - 7]) {
    rect(p, x, 7, 3, 4, "M");
    vline(p, x, 7, 4, "K");
  }
  return finish(p);
})();

// On the walls ---------------------------------------------------------------------------------

/**
 * The cook's window: a pass-through into the kitchen, the big pot going under its steam, the
 * paddle working, ladles on the rail. The counter sill sticks out into the room.
 */
function cookWindow(f: number): Pic {
  const W = 52;
  const p = Pic.blank(W, 34);
  rect(p, 0, 0, W, 28, "d");
  rect(p, 2, 2, W - 4, 24, "k");
  // Kitchen tiles.
  for (let y = 2; y < 26; y++)
    for (let x = 2; x < W - 2; x++) if ((y - 2) % 6 === 5 || (x - 2) % 6 === 5) p.set(x, y, "K");
  // Ladle rail.
  hline(p, 4, 5, W - 8, "M");
  for (const x of [8, 14, 20, 40, 45]) {
    vline(p, x, 6, 6, "M");
    rect(p, x - 1, 12, 3, 2, "S");
  }
  // The pot: a steel drum, its rim, the soup.
  rect(p, 16, 14, 22, 12, "M");
  vline(p, 16, 14, 12, "K");
  vline(p, 37, 14, 12, "S");
  rect(p, 16, 13, 22, 3, "K");
  rect(p, 18, 14, 18, 2, "t");
  hline(p, 19, 14, 10, "p");
  // The paddle, stirring.
  const px = [24, 27, 30, 27][f % 4] as number;
  vline(p, px, 4, 11, "W");
  vline(p, px + 1, 4, 11, "u");
  // Steam.
  const steam = [
    [20, 10],
    [31, 8],
    [26, 6],
  ];
  steam.forEach(([sx, sy], i) => {
    const dy = (f + i) % 4;
    rect(p, (sx as number) + (dy % 2), (sy as number) - dy, 3, 2, "w");
  });
  // Sill.
  rect(p, 0, 26, W, 3, "w");
  hline(p, 0, 26, W, "w");
  hline(p, 0, 27, W, "k");
  hline(p, 0, 28, W, "K");
  hline(p, 0, 29, W, "M");
  hline(p, 1, 30, W - 2, "d");
  return finish(p);
}

/** 퇴식구: the tray return hatch, a conveyor carrying trays into the dish room. */
function trayReturn(f: number): Pic {
  const W = 52;
  const p = Pic.blank(W, 30);
  rect(p, 0, 0, W, 24, "d");
  rect(p, 2, 2, W - 4, 20, "j");
  rect(p, 2, 2, W - 4, 3, "I");
  // Belt with trays riding it.
  rect(p, 2, 15, W - 4, 5, "I");
  for (let x = 2; x < W - 2; x += 4) p.set(x + (f % 4), 19, "i");
  for (let i = 0; i < 3; i++) {
    const x = ((i * 17 + f * 2) % (W - 18)) + 2;
    rect(p, x, 12, 14, 3, "K");
    hline(p, x, 12, 14, "k");
  }
  // Sill with dirty trays waiting.
  rect(p, 0, 22, W, 4, "w");
  hline(p, 0, 23, W, "k");
  hline(p, 0, 24, W, "K");
  hline(p, 0, 25, W, "M");
  hline(p, 1, 26, W - 2, "d");
  rect(p, 30, 19, 14, 3, "K");
  hline(p, 30, 19, 14, "k");
  hline(p, 32, 20, 4, "r");
  return finish(p);
}

/** 식단표: this week's menu as coloured blocks in five columns, today's column ringed. */
const menuBoard = (() => {
  const p = Pic.blank(32, 26);
  rect(p, 0, 0, 32, 26, "U");
  rect(p, 1, 1, 30, 24, "w");
  rect(p, 2, 2, 28, 3, "G");
  hline(p, 3, 3, 12, "h");
  const dishes = ["R", "o", "G", "t", "N"];
  for (let c = 0; c < 5; c++) {
    const x = 3 + c * 6;
    for (let r = 0; r < 4; r++) {
      const ch = dishes[(c + r * 2) % dishes.length] as string;
      rect(p, x, 7 + r * 4, 4, 2, r === 0 ? "k" : ch);
    }
  }
  // Today: Thursday, the fourth column.
  rect(p, 20, 6, 6, 18, "r");
  rect(p, 21, 7, 4, 16, "w");
  for (let r = 0; r < 4; r++)
    rect(p, 21, 7 + r * 4, 4, 2, r === 0 ? "k" : (dishes[(3 + r * 2) % 5] as string));
  return finish(p);
})();

/** 잔반통: the leftover bin, a funnel lid, and what people did not eat. */
const scrapBin = (() => {
  const p = Pic.blank(18, 20);
  rect(p, 2, 3, 14, 5, "K");
  hline(p, 2, 3, 14, "w");
  rect(p, 4, 4, 10, 3, "S");
  rect(p, 5, 5, 3, 1, "R");
  rect(p, 9, 5, 3, 1, "G");
  rect(p, 2, 8, 14, 10, "N");
  vline(p, 2, 8, 10, "n");
  vline(p, 15, 8, 10, "v");
  hline(p, 2, 11, 14, "v");
  hline(p, 2, 17, 14, "v");
  return finish(p);
})();

/** Somebody's lunch on the floor: the tray upside down, rice and kimchi everywhere. */
const spill = (() => {
  const p = Pic.blank(26, 14);
  rect(p, 6, 3, 14, 8, "K");
  hline(p, 6, 3, 14, "k");
  hline(p, 6, 10, 14, "M");
  vline(p, 19, 3, 8, "M");
  hline(p, 8, 5, 10, "M");
  rect(p, 1, 6, 4, 3, "w");
  rect(p, 2, 9, 3, 2, "k");
  rect(p, 21, 2, 3, 2, "R");
  rect(p, 22, 8, 3, 3, "R");
  hline(p, 22, 8, 2, "r");
  rect(p, 13, 11, 4, 2, "t");
  rect(p, 2, 1, 3, 2, "G");
  return finish(p);
})();

export default [
  servingLine,
  frames(
    "cook",
    { ladle0: cook(0), ladle1: cook(1) },
    {
      anim: {
        idle: { frames: ["ladle0"], fps: 1 },
        serve: { frames: ["ladle0", "ladle1"], fps: 3 },
      },
    },
  ),
  frames(
    "tray",
    (() => {
      const make = (state: "full" | "half" | "empty") => {
        const p = Pic.blank(16, 16);
        tray(p, 1, 6, state);
        return finish(p);
      };
      const stack = Pic.blank(16, 16);
      trayStack(stack, 1, 1, 5);
      return { full: make("full"), half: make("half"), empty: make("empty"), stack: finish(stack) };
    })(),
  ),
  frames(
    "long-table",
    { empty: longTable("empty"), lunch: longTable("lunch"), late: longTable("late") },
    { shadow: boxShadow(66, 28, 2, 18, 63, 27, 3, 0) },
  ),
  frames("meal-bench", { still: bench }, { shadow: boxShadow(66, 12, 2, 6, 63, 11, 2, 0) }),
  frames("cook-window", Object.fromEntries([0, 1, 2, 3].map((i) => [`steam${i}`, cookWindow(i)])), {
    origin: mounted([52, 34], 12),
    anim: {
      idle: { frames: ["steam0"], fps: 1 },
      cook: { frames: ["steam0", "steam1", "steam2", "steam3"], fps: 4 },
    },
  }),
  frames("tray-return", Object.fromEntries([0, 1, 2, 3].map((i) => [`belt${i}`, trayReturn(i)])), {
    origin: mounted([52, 30], 12),
    anim: {
      idle: { frames: ["belt0"], fps: 1 },
      run: { frames: ["belt0", "belt1", "belt2", "belt3"], fps: 4 },
    },
  }),
  frames("menu-board", { still: menuBoard }, { origin: mounted([32, 26], 16) }),
  frames("tray-spill", { still: spill }),
  frames("scrap-bin", { still: scrapBin }, { shadow: ovalShadow(18, 20, 10, 18.5, 7, 1.8) }),
];
