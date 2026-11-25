import { grid, over, stack } from "../../draw.ts";
import { sprite, variant } from "../../format.ts";
import { RAMP_LIST } from "../../palette.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Item slots and books. A slot is a well in the page with a frame in the book's grade colour
 * (PLAN §8): 교과서 gray, 참고서 green, 심화서 blue, 전공서 purple, 원서 gold. Higher grades
 * earn metal corners, the way a good book is bound. The selected slot is circled in red pen.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const LEGEND = {
  ...UI,
  // Sea, plum and grass, for grade rings and book covers.
  "1": "sea.deep",
  "2": "sea.dark",
  "3": "sea.mid",
  "4": "sea.light",
  "6": "plum.deep",
  "7": "plum.dark",
  "8": "plum.mid",
  "9": "plum.light",
  "0": "plum.pale",
  F: "grass.deep",
  f: "grass.dark",
  h: "grass.mid",
  H: "grass.light",
  j: "grass.pale",
  // Sea pale, gold deep and wood, for the newer covers.
  "5": "sea.pale",
  v: "gold.deep",
  a: "wood.deep",
  c: "wood.dark",
  C: "wood.mid",
  E: "wood.light",
  // Lone details: glints, symbols and pips on covers.
  "*": "stone.bright",
  w: "stone.bright",
  q: "ink.dark",
  t: "gold.pale",
} as const;

const SLOT = 24;

interface Grade {
  /** Ring light (top and left), ring shade (bottom and right), the line inside the ring. */
  readonly light: string;
  readonly shade: string;
  readonly line: string;
  /** Metal on the four corners, if any: light then shade. */
  readonly corner?: readonly [string, string];
  readonly glint?: boolean;
}

function slot(g: Grade): string {
  const e = SLOT - 1;
  return grid(SLOT, SLOT, (x, y) => {
    const edge = Math.min(x, y, e - x, e - y);
    const corner = (x < 4 || x > e - 4) && (y < 4 || y > e - 4);
    if (edge === 0) return (x === 0 || x === e) && (y === 0 || y === e) ? "." : "o";
    if (g.glint && ((x === 2 && y === 2) || (x === e - 3 && y === e - 3))) return "*";
    if (edge <= 2) {
      if (corner && g.corner) return x + y < e ? g.corner[0] : g.corner[1];
      const lit = (y === edge && x < e - edge) || (x === edge && y < e - edge);
      return lit ? g.light : g.shade;
    }
    if (edge === 3) return corner && g.corner ? g.corner[x + y < e ? 0 : 1] : g.line;
    const lit = y === 4 || x === 4;
    return lit ? "s" : "p";
  });
}

const item = sprite({
  ...ui,
  name: "item",
  size: [SLOT, SLOT],
  palette: LEGEND,
  lone: "*",
  frames: {
    textbook: slot({ light: "s", shade: "S", line: "D" }),
    reference: slot({ light: "H", shade: "h", line: "F" }),
    advanced: slot({ light: "b", shade: "n", line: "k", corner: ["B", "b"] }),
    major: slot({ light: "9", shade: "8", line: "6", corner: ["Y", "g"] }),
    original: slot({ light: "Y", shade: "g", line: "u", corner: ["y", "Y"], glint: true }),
  },
});

/**
 * An empty slot is only a cell pressed into the well, so a bag of empties stays quiet. It is
 * ruling on the well, not a shape of its own, so it has no outline.
 */
const itemEmpty = sprite({
  ...ui,
  name: "item-empty",
  size: [SLOT, SLOT],
  outline: false,
  palette: LEGEND,
  frames: {
    idle: grid(SLOT, SLOT, (x, y) => {
      const e = SLOT - 1;
      if (x === 0 || y === 0) return x === e || y === e ? "." : "s";
      if (x === e || y === e) return "W";
      return ".";
    }),
  },
});

/**
 * The red-pen circle around a selected slot: a two-pixel loop that runs past where it
 * closes, top right, the way a pen does.
 */
const SEL = 32;
const itemSelect = sprite({
  ...ui,
  name: "item-select",
  size: [SEL, SEL],
  outline: false,
  palette: LEGEND,
  frames: {
    idle: over(
      grid(SEL, SEL, (x, y) => {
        const r = 7;
        const lo = 2 + r;
        const hi = SEL - 3 - r;
        const dx = Math.max(lo - x - 0.5, 0, x + 0.5 - hi);
        const dy = Math.max(lo - y - 0.5, 0, y + 0.5 - hi);
        const d = Math.hypot(dx, dy) - r;
        if (d > -1.6 && d <= 0.4) return x + y < SEL - 4 ? "R" : "r";
        return ".";
      }),
      stack("....RR", "..RR..", "RR...."),
      SEL - 11,
      0,
    ),
  },
});

/** Book covers, 16×16: spine on the left, the page block peeking out at the right. */
interface Cover {
  readonly line: string;
  readonly spine: string;
  readonly light: string;
  readonly mid: string;
  readonly dark: string;
}

function book(c: Cover, symbol: string, at: readonly [number, number] = [5, 4]): string {
  const { line: o, spine: s, light: l, mid: m, dark: d } = c;
  const base = stack(
    "................",
    `..${o.repeat(12)}..`,
    `.${o}${s}${l.repeat(10)}${o}o.`,
    [`.${o}${s}${l}${m.repeat(9)}${o}Wo`, 9],
    `.${o}${s}${l}${m.repeat(9)}${o}so`,
    `.${o}${s}${d.repeat(10)}${o}so`,
    `..${o.repeat(12)}o.`,
    "................",
  );
  return over(base, symbol, at[0], at[1]);
}

/**
 * Pale covers: a cream workbook bound in the class colour. With the solid covers they give each
 * class two looks, so two books of one class still tell apart in the bag.
 */
const paleCover = (line: string, spine: string) => ({
  line,
  spine,
  light: "W",
  mid: "p",
  dark: "s",
});
const SEA = { line: "1", spine: "2", light: "4", mid: "3", dark: "2" };
const GOLD = { line: "u", spine: "G", light: "Y", mid: "g", dark: "G" };
const PLUM = { line: "6", spine: "7", light: "9", mid: "8", dark: "7" };
const GRASS = { line: "F", spine: "f", light: "H", mid: "h", dark: "f" };
const NAVY = { line: "k", spine: "N", light: "b", mid: "n", dark: "N" };

const books = sprite({
  ...ui,
  name: "book",
  size: [16, 16],
  palette: LEGEND,
  lone: "wqt",
  frames: {
    /**
     * The ten launch-set covers take their class colour, the colour their attack is drawn in
     * (수학 navy, 물리 plum, 화학 sea, 생명 grass, 지구과학 gold): a solid cover or a pale one.
     */
    /** 수학의 왕도: a chalk polygon on its way to a circle. */
    wangdo: book(
      NAVY,
      stack("..www..", ".w...w.", "w.....w", "w.....w", ".w...w.", "..www.."),
      [5, 5],
    ),
    /** 함수 그래프 노트: graph paper with one period of a sine. */
    graph: book(
      paleCover("k", "n"),
      stack("b......", "b.nn...", "bn..n.n", "b....n.", "bbbbbbb"),
      [5, 5],
    ),
    /** 수열 문제집: 1, 2, 3, 5. */
    sequence: book(GOLD, stack("......w", "......w", "....w.w", "..w.w.w", "w.w.w.w"), [5, 5]),
    /** 확률과 통계: a die showing five. */
    probability: book(
      PLUM,
      stack(".wwwww.", "wqwwwqw", "wwwwwww", "wwwqwww", "wwwwwww", "wqwwwqw", ".wwwww."),
      [5, 4],
    ),
    /** 좌표 평면: axes and a point. */
    coordinate: book(
      GRASS,
      stack("w......", "w...tt.", "w...tt.", "w......", "w......", "wwwwwww"),
      [5, 5],
    ),
    /** 증명 노트: lines of proof and the Q.E.D. tombstone. */
    proof: book(
      NAVY,
      stack("wwwww..", ".......", "wwww...", ".......", "www..ww", ".....ww"),
      [5, 5],
    ),
    /** 홀리데이 일반물리: the heavy plum tome with its gold band and a thrown arc. */
    holiday: over(
      book(PLUM, stack("..ww...", ".w..w..", "w....w.", "w.....t"), [5, 3]),
      stack("YYYYYYYYYY", "gggggggggg"),
      3,
      9,
    ),
    /** 전자기 실습서: a lab manual with a bolt across it. */
    electro: book(
      paleCover("6", "8"),
      stack("....77", "...77.", "..7777", "...77.", "..77..", ".77..."),
      [6, 4],
    ),
    /** 줌인 일반화학: a flask, half full. */
    zoomin: book(
      SEA,
      stack("..www..", "..w.w..", "..w.w..", ".w...w.", "w55555w", "wwwwwww"),
      [5, 5],
    ),
    /** 실험 보고서: a report under a clip, with the alcohol lamp's flame on it. */
    report: over(
      book(
        paleCover("1", "3"),
        stack("...3...", "..33...", "..343..", ".34443.", ".34443.", "..333.."),
        [5, 5],
      ),
      stack(".oooo.", "oSSSSo"),
      5,
      0,
    ),
    /** 캠핑 생명과학: a cell, looking out. */
    camping: book(
      GRASS,
      stack("..www..", ".wjjjw.", "wjjFFjw", "wjjFFjw", ".wjjjw.", "..www.."),
      [5, 5],
    ),
    /** 해부 실습서: a scalpel across a pale workbook. */
    dissect: book(
      paleCover("F", "h"),
      stack("......S", ".....SS", "....SS.", "...hf..", "..hf...", ".hf....", "hf....."),
      [5, 4],
    ),
    /** 지구는 둥글다 지구과학: the globe, parallels and a meridian. */
    round: book(
      GOLD,
      stack("..www..", ".wYwYw.", "wYYwYYw", "wwwwwww", "wYYwYYw", ".wYwYw.", "..www.."),
      [5, 4],
    ),
    /** 암석 표본 상자: the specimen tray, three stones in their compartments. */
    rocks: book(
      paleCover("v", "g"),
      stack("CCCCCCCCC", "CkCECaaCC", "CkCEECaaC", "CCCCCCCCC"),
      [4, 6],
    ),
  },
});

/** Every colour two steps down its ramp: the book under a running cooldown. */
const DIM = Object.fromEntries(
  RAMP_LIST.flatMap((r) =>
    r.steps
      .slice(1)
      .map((step, i) => [`${r.name}.${step}`, `${r.name}.${r.steps[Math.max(0, i - 1)]}`]),
  ),
);
const booksDim = variant(books, { name: "book-dim", recolor: DIM });

export default [item, itemEmpty, itemSelect, books, booksDim];
