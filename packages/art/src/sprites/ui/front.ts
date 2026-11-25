import { flipX, grid, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * The front door of the game: the 과고키우기 title and the arrows that flip through choices in
 * the character creator.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

// Title ----------------------------------------------------------------------------------------

/**
 * Each syllable is built from strokes on a 2 px unit, three units thick: `[x, y, w, h]`. The
 * letters are cut from notebook paper and stand on the navy cover, so they carry the cover's
 * thickness underneath like the kit's keycaps.
 */
type Stroke = readonly [x: number, y: number, w: number, h: number];
const U = 2;

const SYLLABLES: readonly { w: number; strokes: readonly Stroke[] }[] = [
  // 과: ㄱ over ㅗ, then ㅏ.
  {
    w: 16,
    strokes: [
      [0, 0, 8, 3],
      [5, 0, 3, 6],
      [2, 7, 3, 3],
      [0, 10, 10, 3],
      [11, 0, 3, 15],
      [14, 5, 2, 3],
    ],
  },
  // 고: ㄱ over a wide ㅗ.
  {
    w: 13,
    strokes: [
      [1, 0, 11, 3],
      [9, 0, 3, 7],
      [5, 9, 3, 3],
      [0, 12, 13, 3],
    ],
  },
  // 키: ㅋ, then ㅣ.
  {
    w: 14,
    strokes: [
      [0, 0, 8, 3],
      [5, 0, 3, 14],
      [1, 6, 4, 3],
      [11, 0, 3, 15],
    ],
  },
  // 우: ㅇ over ㅜ.
  {
    w: 13,
    strokes: [
      [2, 0, 9, 2],
      [2, 5, 9, 2],
      [2, 0, 3, 7],
      [8, 0, 3, 7],
      [0, 9, 13, 3],
      [5, 12, 3, 3],
    ],
  },
  // 기: ㄱ, then ㅣ.
  {
    w: 14,
    strokes: [
      [0, 0, 8, 3],
      [5, 0, 3, 13],
      [11, 0, 3, 15],
    ],
  },
];
const GAP = 3;
/** Each syllable sits a little off the line, as letters cut out by hand and stuck down. */
const BOUNCE = [0, -2, 1, -1, 2];
const LETTER_H = 15 * U;
/** Room above the letters for the sprout, below them for the cover's depth and the pen line. */
const TOP = 11;
const DEPTH = 3;
const BOTTOM = DEPTH + 11;
const PAD = 2;

const LETTERS_W = SYLLABLES.reduce((a, s) => a + s.w * U, 0) + GAP * U * (SYLLABLES.length - 1);
/** Room at the right for the highlighter's chisel end. */
const FLICK = 2;
const LOGO_W = LETTERS_W + PAD * 2 + FLICK;
const LOGO_H = TOP + LETTER_H + BOTTOM;

/** Where each syllable starts, in pixels inside the logo. */
const starts = SYLLABLES.reduce<number[]>((acc, _s, i) => {
  const prev = i === 0 ? PAD : (acc[i - 1] as number) + (SYLLABLES[i - 1]?.w ?? 0) * U + GAP * U;
  acc.push(prev);
  return acc;
}, []);

/** 키's ㅣ is a red pen, tip down: where it stands, in pixels. */
const PEN = { x: 0, y: 0, w: 3 * U, h: 15 * U };

/** Rows of the pen from the cap down; the tip narrows to the ball. */
const PEN_ROWS: readonly string[] = [
  ...Array.from({ length: 10 }, () => "RRrrxx"),
  "WWssSS",
  ...Array.from({ length: 11 }, () => "rRrrxx"),
  "xxxxxx",
  "xxxxxx",
  "ppppss",
  ".pppS.",
  ".ppSS.",
  "..SS..",
  "..kk..",
  "......",
];

PEN.x = (starts[2] as number) + 11 * U;
PEN.y = TOP + (BOUNCE[2] ?? 0);

function letterMask(): boolean[][] {
  const m = Array.from({ length: LOGO_H }, () => new Array<boolean>(LOGO_W).fill(false));
  SYLLABLES.forEach((s, i) => {
    const x0 = starts[i] as number;
    const y0 = TOP + (BOUNCE[i] ?? 0);
    for (const [x, y, w, h] of s.strokes) {
      for (let yy = y * U; yy < (y + h) * U; yy++) {
        for (let xx = x * U; xx < (x + w) * U; xx++) {
          const row = m[y0 + yy];
          if (row) row[x0 + xx] = true;
        }
      }
    }
  });
  // Round every outer corner by one pixel, so the strokes read as cut paper, not boxes.
  const at = (x: number, y: number) => m[y]?.[x] === true;
  const cut: [number, number][] = [];
  for (let y = 0; y < LOGO_H; y++) {
    for (let x = 0; x < LOGO_W; x++) {
      if (!at(x, y)) continue;
      const up = at(x, y - 1);
      const down = at(x, y + 1);
      const left = at(x - 1, y);
      const right = at(x + 1, y);
      if ((!up && !left) || (!up && !right) || (!down && !left) || (!down && !right)) {
        cut.push([x, y]);
      }
    }
  }
  for (const [x, y] of cut) {
    const row = m[y];
    if (row) row[x] = false;
  }
  // The pen keeps its own shape below the cap: a straight barrel and a narrowing tip.
  PEN_ROWS.forEach((line, y) => {
    if (y === 0) return;
    [...line].forEach((ch, x) => {
      const row = m[PEN.y + y];
      if (row) row[PEN.x + x] = ch !== ".";
    });
  });
  return m;
}

/** The sprout growing from the top of 기's ㅣ: two leaves on a short stem. */
const SPROUT = stack(
  ".oo.....oo.",
  "oHHo...oHho",
  "oHhho.oHhfo",
  ".ohhfofhffo",
  "..offffffo.",
  "...ooffoo..",
  "....offo...",
  "....offo...",
);

function logo(): string {
  const m = letterMask();
  const at = (x: number, y: number) => m[y]?.[x] === true;
  const out = Array.from({ length: LOGO_H }, () => new Array<string>(LOGO_W).fill("."));
  // A highlighter pass behind the whole word, chisel-cut at both ends.
  const bandTop = TOP + 13;
  const bandBottom = TOP + LETTER_H + DEPTH + 1;
  const bandLeft = 1;
  const bandRight = LOGO_W - FLICK;
  for (let y = bandTop; y <= bandBottom; y++) {
    const k = y - bandTop;
    const left = bandLeft + Math.max(0, 3 - k);
    const right = bandRight - Math.max(0, k - (bandBottom - bandTop - 3));
    for (let x = left; x <= right; x++) {
      const row = out[y];
      if (row) row[x] = y >= bandBottom - 1 ? "g" : "Y";
    }
  }
  // The cover's depth under every stroke, then the paper face on top, lit from the top left.
  for (let y = 0; y < LOGO_H; y++) {
    for (let x = 0; x < LOGO_W; x++) {
      if (!at(x, y)) continue;
      // The pen floats over the page: no cover under it.
      if (x >= PEN.x && x < PEN.x + PEN.w && y > PEN.y) continue;
      for (let d = 1; d <= DEPTH; d++) {
        const row = out[y + d];
        if (row && !at(x, y + d)) row[x] = d === DEPTH ? "N" : "n";
      }
    }
  }
  for (let y = 0; y < LOGO_H; y++) {
    for (let x = 0; x < LOGO_W; x++) {
      if (!at(x, y)) continue;
      const row = out[y] as string[];
      const lit = !at(x, y - 1) || !at(x - 1, y);
      const shade = !at(x, y + 1) || !at(x + 1, y);
      row[x] = lit && !shade ? "W" : shade ? "s" : "p";
    }
  }
  // The red pen standing in for 키's ㅣ, lit from the left like every stroke.
  PEN_ROWS.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      const row = out[PEN.y + y];
      if (row && ch !== "." && at(PEN.x + x, PEN.y + y)) row[PEN.x + x] = ch;
    });
  });
  // The sprout on 기's ㅣ.
  const gi = SYLLABLES[4];
  const stemX = (starts[4] as number) + 11 * U + 2;
  const sprout = SPROUT.split("\n");
  sprout.forEach((line, sy) => {
    [...line].forEach((ch, sx) => {
      if (ch === ".") return;
      const y = TOP + (BOUNCE[4] ?? 0) - sprout.length + sy + 1;
      const x = stemX - 5 + sx;
      const row = out[y];
      if (row && gi && row[x] === ".") row[x] = ch;
    });
  });
  // An ink outline round every letter, over the highlighter too, and round the highlighter.
  const band = (c: string | undefined) => c === "Y" || c === "g";
  const letter = (c: string | undefined) => c !== undefined && c !== "." && c !== "o" && !band(c);
  const near = (x: number, y: number, test: (c: string | undefined) => boolean) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (test(out[y + dy]?.[x + dx])) return true;
    }
    return false;
  };
  return grid(LOGO_W, LOGO_H, (x, y) => {
    const c = out[y]?.[x] ?? ".";
    if (c === "." && (near(x, y, letter) || near(x, y, band))) return "o";
    if (band(c) && near(x, y, letter)) return "o";
    return c;
  });
}

const title = sprite({
  ...ui,
  name: "logo",
  size: [LOGO_W, LOGO_H],
  palette: {
    ...UI,
    F: "grass.deep",
    f: "grass.dark",
    h: "grass.mid",
    H: "grass.light",
  },
  lone: "k",
  frames: { idle: logo() },
});

// Arrows ---------------------------------------------------------------------------------------

/** A chunky arrow pointing left; the right one is its mirror. Hover inks it in red pen. */
function arrow(light: string, mid: string, dark: string, line: string): string {
  const [l, m, d, o] = [light, mid, dark, line];
  return stack(
    `...${o}${o}`,
    `..${o}${l}${o}`,
    `.${o}${l}${m}${o}`,
    `${o}${l}${m}${m}${o}`,
    `.${o}${d}${m}${o}`,
    `..${o}${d}${o}`,
    `...${o}${o}`,
  );
}

const ARROW = {
  idle: arrow("b", "n", "N", "o"),
  hover: arrow("R", "r", "x", "X"),
};

const arrows = sprite({
  ...ui,
  name: "arrow",
  size: [5, 7],
  palette: UI,
  frames: {
    left: ARROW.idle,
    "left-hover": ARROW.hover,
    right: flipX(ARROW.idle),
    "right-hover": flipX(ARROW.hover),
  },
});

export default [title, arrows];
