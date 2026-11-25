import { over, stack } from "../../draw.ts";
import { sprite, variant } from "../../format.ts";
import { RAMP_LIST } from "../../palette.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Book covers, 16×16, the `book` sprite whose frames the content names `book/<id>`: spine on
 * the left, the page block peeking out at the right. Every cover takes its class colour, the
 * colour its attack is drawn in (수학 navy, 물리 plum, 화학 sea, 생명 grass, 지구과학 gold), in
 * one of three bindings so six books of one class still tell apart in the bag: solid, pale (a
 * cream workbook bound in the colour) and deep. An evolved form is the same book grown up: gold
 * foil on its corners, a gold seal, a ribbon out of the bottom, and its own symbol.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const LEGEND = {
  ...UI,
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
 * The evolved binding: a red ribbon down the cover's lit edge and out of the bottom, gold foil on
 * the top right corner and a gold seal low on the right.
 */
function evolved(
  c: Cover,
  symbol: string,
  at: readonly [number, number] = [5, 4],
  foil = "Y",
): string {
  let pic = book(c, symbol, at);
  pic = over(pic, stack(...Array.from({ length: 12 }, () => "r"), "X", "X"), 3, 2);
  pic = over(pic, `${foil}${foil}\n.${foil}`, 11, 2);
  pic = over(pic, `${foil}${foil}\n${foil}${foil}`, 10, 11);
  return pic;
}

const pale = (line: string, spine: string): Cover => ({
  line,
  spine,
  light: "W",
  mid: "p",
  dark: "s",
});
const NAVY: Cover = { line: "k", spine: "N", light: "b", mid: "n", dark: "N" };
const NAVY_DEEP: Cover = { line: "o", spine: "k", light: "n", mid: "N", dark: "k" };
const NAVY_PALE = pale("k", "n");
const PLUM: Cover = { line: "6", spine: "7", light: "9", mid: "8", dark: "7" };
const PLUM_DEEP: Cover = { line: "6", spine: "6", light: "8", mid: "7", dark: "6" };
const PLUM_PALE = pale("6", "8");
const SEA: Cover = { line: "1", spine: "2", light: "4", mid: "3", dark: "2" };
const SEA_DEEP: Cover = { line: "1", spine: "1", light: "3", mid: "2", dark: "1" };
const SEA_PALE = pale("1", "3");
const GRASS: Cover = { line: "F", spine: "f", light: "H", mid: "h", dark: "f" };
const GRASS_DEEP: Cover = { line: "F", spine: "F", light: "h", mid: "f", dark: "F" };
const GRASS_PALE = pale("F", "h");
const GOLD: Cover = { line: "u", spine: "G", light: "Y", mid: "g", dark: "G" };
const GOLD_DEEP: Cover = { line: "u", spine: "u", light: "g", mid: "G", dark: "u" };
const GOLD_PALE = pale("v", "g");

// 수학 ------------------------------------------------------------------------------------

const MATH = {
  /** 수학의 왕도: a chalk polygon on its way to a circle. */
  wangdo: book(
    NAVY,
    stack("..www..", ".w...w.", "w.....w", "w.....w", ".w...w.", "..www.."),
    [5, 5],
  ),
  /** 함수 그래프 노트: graph paper with one period of a sine. */
  graph: book(NAVY_PALE, stack("b......", "b.nn...", "bn..n.n", "b....n.", "bbbbbbb"), [5, 5]),
  /** 수열 문제집: 1, 1, 2, 3, 5 in bars. */
  sequence: book(NAVY_DEEP, stack("......w", "......w", "....w.w", "..w.w.w", "w.w.w.w"), [5, 5]),
  /** 확률과 통계: a navy die showing five. */
  probability: book(
    NAVY_PALE,
    stack(".nnnnn.", "nwnnnwn", "nnnnnnn", "nnnwnnn", "nnnnnnn", "nwnnnwn", ".nnnnn."),
    [5, 4],
  ),
  /** 좌표 평면: axes and a point. */
  coordinate: book(
    NAVY,
    stack("w......", "w...tt.", "w...tt.", "w......", "w......", "wwwwwww"),
    [5, 5],
  ),
  /** 증명 노트: lines of proof and the Q.E.D. tombstone. */
  proof: book(
    NAVY_DEEP,
    stack("wwwww..", ".......", "wwww...", ".......", "www..ww", ".....ww"),
    [5, 5],
  ),

  /** 유클리드 원론: the circle, its radius drawn. */
  elements: evolved(
    NAVY,
    stack("..www..", ".w...w.", "w.....w", "w..wwww", "w.....w", ".w...w.", "..www.."),
    [5, 4],
  ),
  /** 푸리에 급수: a wave and its overtone. */
  fourier: evolved(NAVY_PALE, stack(".nn....", "n..n..n", "....nn.", ".b.b.b.", "b.b.b.b"), [5, 4]),
  /** 발산 급수: the bars, and an arrow off the top. */
  divergent: evolved(
    NAVY_DEEP,
    stack("......w", ".....ww", "......w", "....w.w", "..w.w.w", "w.w.w.w"),
    [5, 4],
  ),
  /** 기댓값 정리: the die on its best face. */
  expectation: evolved(
    NAVY_PALE,
    stack(".nnnnn.", "nwnnnwn", "nnnnnnn", "nwnnnwn", "nnnnnnn", "nwnnnwn", ".nnnnn."),
    [5, 4],
  ),
  /** 선형 변환: the axes turned, and the point carried with them. */
  "linear-map": evolved(
    NAVY,
    stack("w......", ".w...tt", "..w..tt", "...w...", "..w.w..", ".w...w.", "w.....w"),
    [5, 4],
  ),
  /** 완전한 증명: the tombstone, filled in, under every line. */
  "complete-proof": evolved(
    NAVY_DEEP,
    stack("wwwww..", "wwww...", "www....", ".......", "wwwwww.", "wwwwww."),
    [5, 4],
  ),
};

const books = sprite({
  ...ui,
  name: "book",
  size: [16, 16],
  palette: LEGEND,
  lone: "wqt",
  frames: {
    ...MATH,
    /** 홀리데이 일반물리: the heavy plum tome with its gold band and a thrown arc. */
    "holiday-physics": over(
      book(PLUM, stack("..ww...", ".w..w..", "w....w.", "w.....t"), [5, 3]),
      stack("YYYYYYYYYY", "gggggggggg"),
      3,
      9,
    ),
    /** 전자기 실습서: a lab manual with a bolt across it. */
    "em-lab": book(
      pale("6", "8"),
      stack("....88", "...88.", "..88..", ".8888.", "..88..", ".88...", "88...."),
      [5, 4],
    ),
    /** 줌인 일반화학: a flask, half full. */
    "zoomin-chem": book(
      SEA,
      stack("..www..", "..w.w..", "..w.w..", ".w...w.", "w55555w", "wwwwwww"),
      [5, 5],
    ),
    /** 실험 보고서: a report under a clip, with the alcohol lamp's flame on it. */
    "lab-report": over(
      book(
        pale("1", "3"),
        stack("...2...", "..22...", "..242..", ".24442.", ".24w42.", "..222.."),
        [5, 5],
      ),
      stack(".oooo.", "oSSSSo"),
      5,
      0,
    ),
    /** 캠핑 생명과학: a cell, looking out. */
    "camping-bio": book(
      GRASS,
      stack("..www..", ".wjjjw.", "wjjFFjw", "wjjFFjw", ".wjjjw.", "..www.."),
      [5, 5],
    ),
    /** 해부 실습서: a scalpel across a pale workbook. */
    dissection: book(
      pale("F", "h"),
      stack("......S", ".....SS", "....SS.", "...hf..", "..hf...", ".hf....", "hf....."),
      [5, 4],
    ),
    /** 지구는 둥글다 지구과학: the globe, parallels and a meridian. */
    "round-earth": book(
      GOLD,
      stack("..www..", ".wYwYw.", "wYYwYYw", "wwwwwww", "wYYwYYw", ".wYwYw.", "..www.."),
      [5, 4],
    ),
    /** 암석 표본 상자: the specimen tray, three stones in their compartments. */
    "rock-box": book(
      pale("v", "g"),
      stack("vvvvvvvvvv", "vqqvEEvllv", "vqqvCCvppv", "vvvvvvvvvv"),
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

export default [books, booksDim];
