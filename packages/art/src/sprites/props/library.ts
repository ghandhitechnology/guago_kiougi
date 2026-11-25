import { boxShadow, finish, frames, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 물음표 서고, the codex library: shelves to the ceiling, the rolling ladder, a long reading
 * table under green lamps, the card catalogue with its hundred brass pulls.
 */

/** Spine colours, dark and light, cycled with a hash so no two shelves match. */
const SPINES: readonly [string, string][] = [
  ["N", "n"],
  ["q", "R"],
  ["5", "6"],
  ["U", "u"],
  ["a", "X"],
  ["O", "o"],
  ["v", "N"],
  ["C", "T"],
  ["S", "K"],
];

/** A row of books standing on a shelf from (x0, base) up, with a gap or a leaner now and then. */
function shelfRow(p: Pic, x0: number, x1: number, base: number, seed: number, gaps: boolean): void {
  let x = x0;
  let i = seed;
  while (x < x1) {
    i = (i * 7 + 3) % 97;
    const w = 2 + (i % 2);
    const h = 7 + (i % 3);
    if (gaps && i % 11 === 0 && x + 4 < x1) {
      // A gap, and the book next to it leaning into it.
      for (let k = 0; k < 6; k++) p.set(x + 1 + Math.floor(k / 2), base - 1 - k, "U");
      x += 4;
      continue;
    }
    const [dark, light] = SPINES[i % SPINES.length] as [string, string];
    const ww = Math.min(w, x1 - x);
    rect(p, x, base - h, ww, h, dark);
    vline(p, x, base - h, h, light);
    if (h > 7) hline(p, x, base - h + 2, ww, "o");
    x += ww;
  }
}

/** A tall bookcase in dark wood, five shelves, full or with gaps. */
function tallShelf(gaps: boolean): Pic {
  const W = 50;
  const H = 62;
  const p = Pic.blank(W, H);
  rect(p, 1, 1, W - 2, 4, "u");
  hline(p, 1, 1, W - 2, "W");
  rect(p, 1, 5, W - 2, H - 6, "b");
  rect(p, 3, 6, W - 6, H - 10, "B");
  const shelves = [16, 27, 38, 49, 58];
  shelves.forEach((y, k) => {
    shelfRow(p, 3, W - 3, y, k * 13 + (gaps ? 5 : 0), gaps);
    rect(p, 3, y, W - 6, 2, "U");
    hline(p, 3, y, W - 6, "u");
  });
  vline(p, 1, 5, H - 6, "U");
  vline(p, 2, 5, H - 6, "u");
  vline(p, W - 3, 5, H - 6, "b");
  hline(p, 1, H - 2, W - 2, "U");
  return finish(p);
}

/** The rolling ladder, hooked on a rail at the top. */
const ladder = (() => {
  const p = Pic.blank(16, 62);
  vline(p, 3, 4, 56, "u");
  vline(p, 4, 4, 56, "U");
  vline(p, 11, 4, 56, "u");
  vline(p, 12, 4, 56, "U");
  for (let y = 8; y < 58; y += 6) {
    hline(p, 5, y, 6, "W");
    hline(p, 5, y + 1, 6, "U");
  }
  rect(p, 2, 1, 3, 3, "o");
  rect(p, 11, 1, 3, 3, "o");
  rect(p, 2, 59, 3, 2, "I");
  rect(p, 11, 59, 3, 2, "I");
  return finish(p);
})();

/** A long reading table, two green banker's lamps, open books and a sleeping bag of notes. */
function readingTable(lit: boolean): Pic {
  const W = 72;
  const p = Pic.blank(W, 36);
  const y0 = 10;
  rect(p, 1, y0, W - 2, 14, "U");
  hline(p, 1, y0, W - 2, "u");
  vline(p, 1, y0, 14, "u");
  vline(p, W - 2, y0 + 1, 13, "b");
  for (const x of [14, 50]) {
    // Lamp: brass foot, stem, green shade glowing underneath.
    rect(p, x, y0 + 2, 6, 2, "o");
    vline(p, x + 2, y0 - 4, 6, "o");
    rect(p, x - 2, y0 - 7, 10, 3, "6");
    hline(p, x - 2, y0 - 7, 10, "s");
    hline(p, x - 1, y0 - 4, 8, lit ? "Y" : "D");
  }
  // Open books.
  rect(p, 4, y0 + 5, 12, 6, "w");
  vline(p, 10, y0 + 5, 6, "K");
  rect(p, 26, y0 + 4, 10, 7, "w");
  vline(p, 31, y0 + 4, 7, "K");
  for (let y = y0 + 6; y < y0 + 10; y += 2) {
    hline(p, 27, y, 3, "K");
    hline(p, 33, y, 2, "K");
  }
  rect(p, 40, y0 + 6, 8, 5, "R");
  hline(p, 40, y0 + 6, 8, "r");
  rect(p, 58, y0 + 5, 9, 6, "w");
  vline(p, 62, y0 + 5, 6, "K");
  // Apron and turned legs.
  rect(p, 1, y0 + 14, W - 2, 3, "b");
  hline(p, 1, y0 + 14, W - 2, "U");
  for (const x of [3, W - 7]) {
    rect(p, x, y0 + 17, 4, 8, "b");
    vline(p, x, y0 + 17, 8, "U");
  }
  return finish(p, "Y");
}

/** The card catalogue: forty little drawers, a brass pull and label holder on each, one out. */
const cardCatalogue = (() => {
  const p = Pic.blank(34, 34);
  rect(p, 1, 1, 32, 4, "u");
  hline(p, 1, 1, 32, "W");
  rect(p, 1, 5, 32, 28, "U");
  vline(p, 32, 5, 28, "b");
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      const x = 3 + c * 7;
      const y = 6 + r * 5;
      rect(p, x, y, 6, 4, "u");
      hline(p, x, y, 6, "W");
      rect(p, x + 1, y + 1, 3, 1, "w");
      rect(p, x + 2, y + 2, 2, 1, "o");
    }
  }
  // One drawer pulled out, its cards fanned.
  rect(p, 17, 21, 6, 6, "W");
  rect(p, 18, 19, 4, 3, "w");
  hline(p, 18, 20, 4, "k");
  hline(p, 1, 32, 32, "b");
  return finish(p);
})();

export default [
  frames(
    "tall-shelf",
    { full: tallShelf(false), gaps: tallShelf(true) },
    { shadow: boxShadow(50, 62, 1, 56, 48, 61, 3, 0) },
  ),
  frames("library-ladder", { still: ladder }, { shadow: ovalShadow(16, 62, 9, 60.5, 7, 1.4) }),
  frames(
    "reading-table",
    { lit: readingTable(true), dark: readingTable(false) },
    { lone: "Y", shadow: boxShadow(72, 36, 1, 24, 70, 35, 3, 0) },
  ),
  frames(
    "card-catalogue",
    { still: cardCatalogue },
    { shadow: boxShadow(34, 34, 1, 28, 32, 33, 2, 0) },
  ),
];
