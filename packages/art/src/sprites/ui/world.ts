import { grid, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Pieces for the world's UI: pins on the minimap, the unread mark on a chat tab, the prompt over
 * whatever is in reach, and the card that asks a phone to turn sideways.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

/** A round pin: lit top left, outlined in ink. */
function pin(light: string, body: string): string {
  const [l, b] = [light, body];
  return stack(".ooo.", `o${l}${l}${b}o`, `o${l}${b}${b}o`, `o${b}${b}${b}o`, ".ooo.");
}

/** Pins: another student, a teacher or senior standing at their spot, and a chat tab's unread mark. */
const pins = sprite({
  ...ui,
  name: "pin",
  size: [5, 5],
  palette: UI,
  frames: {
    player: pin("B", "b"),
    npc: pin("Y", "g"),
    unread: pin("R", "r"),
  },
});

/** A paper tag over something in reach, its tail pointing at it. */
function tag(icon: (x: number, y: number) => string | undefined): string {
  const w = 13;
  const h = 13;
  return grid(w, h, (x, y) => {
    if (y <= 9) {
      const edge = x === 0 || x === w - 1 || y === 0 || y === 9;
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === 9);
      if (corner) return ".";
      if (edge) return y === 9 && x > 0 && x < w - 1 ? "o" : "o";
      if (y === 1 || x === 1) return "W";
      if (y === 8 || x === w - 2) return "s";
      return icon(x, y) ?? "p";
    }
    if (y === 10) return x >= 4 && x <= 8 ? (x === 4 || x === 8 ? "o" : "s") : ".";
    if (y === 11) return x >= 5 && x <= 7 ? (x === 6 ? "s" : "o") : ".";
    return x === 6 ? "o" : ".";
  });
}

const prompts = sprite({
  ...ui,
  name: "prompt",
  size: [13, 13],
  palette: UI,
  frames: {
    // Someone to talk to: a speech ellipsis.
    talk: tag((x, y) =>
      (y === 4 || y === 5) && [3, 4, 6, 7, 9, 10].includes(x) ? "n" : undefined,
    ),
    // Something to use: the red pen's exclamation.
    use: tag((x, y) => ((x === 6 || x === 5) && ((y >= 2 && y <= 5) || y === 7) ? "r" : undefined)),
    // Something to read: ruled lines.
    read: tag((x, y) => (y % 2 === 0 && y >= 2 && y <= 6 && x >= 3 && x <= 9 ? "S" : undefined)),
  },
});

/**
 * The card a phone held upright shows: the phone standing, a red-pen arrow, the phone on its
 * side.
 */
function rotateCard(): string {
  const W = 56;
  const H = 30;
  // Upright phone: 14×24 at (2, 3). Sideways phone: 24×14 at (30, 8).
  const phone = (x: number, y: number, px: number, py: number, pw: number, ph: number) => {
    const u = x - px;
    const v = y - py;
    if (u < 0 || v < 0 || u >= pw || v >= ph) return undefined;
    const edge = u === 0 || v === 0 || u === pw - 1 || v === ph - 1;
    const corner = (u === 0 || u === pw - 1) && (v === 0 || v === ph - 1);
    if (corner) return ".";
    if (edge) return "o";
    // The case: navy, lit at the top left; the screen: paper.
    const screen = u >= 2 && v >= 2 && u <= pw - 3 && v <= ph - 3;
    if (screen) return u === 2 || v === 2 ? "W" : "p";
    return u === 1 || v === 1 ? "b" : "n";
  };
  return grid(W, H, (x, y) => {
    const a = phone(x, y, 2, 3, 14, 24);
    if (a) return a;
    const b = phone(x, y, 30, 8, 24, 14);
    if (b) return b;
    // The arrow: a shaft on rows 14 and 15, and a head narrowing over three columns.
    const shaft = x >= 18 && x <= 23 && (y === 14 || y === 15);
    const reach = x === 24 ? 3 : x === 25 ? 2 : x === 26 ? 1 : 0;
    const head = reach > 0 && y >= 15 - reach && y <= 14 + reach;
    if (shaft || head) return y <= 14 ? "R" : "r";
    return ".";
  });
}

const rotate = sprite({
  ...ui,
  name: "rotate",
  size: [56, 30],
  palette: UI,
  lone: "rR",
  frames: { idle: rotateCard() },
});

export default [pins, prompts, rotate];
