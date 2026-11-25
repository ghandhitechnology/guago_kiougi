import { disc, grid, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * The 콜로세움's pieces (PLAN §14): two rulers crossed like swords for a duel, the round pips a
 * best of three fills, each side's health share in its colour (청 the sea, 백 chalk white, as on
 * a sports day), a side's chip, and the small marks of a round's end: a hit's burst for a
 * knockout, the clock for a round decided on health, the white flag of a side that left.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const DUEL = {
  ...UI,
  // 청 is the sea; 백 is chalk on the paper ramp.
  "1": "sea.deep",
  "2": "sea.dark",
  "3": "sea.mid",
  "4": "sea.light",
  "5": "sea.pale",
} as const;

/**
 * Two rulers crossed in an X on a `size` square, two pixels thick and outlined: a wooden one from
 * the top left, a steel one laid over it from the top right.
 */
function crossed(size: number): string {
  const last = size - 3;
  const wood = (x: number, y: number) => y >= 1 && y <= last && (x - y === 0 || x - y === 1);
  const steel = (x: number, y: number) =>
    y >= 1 && y <= last && (x + y === size - 2 || x + y === size - 1);
  const near = (inside: (x: number, y: number) => boolean, x: number, y: number) =>
    inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1);
  return grid(size, size, (x, y) => {
    if (steel(x, y)) return x + y === size - 2 ? "W" : "s";
    if (near(steel, x, y)) return "o";
    if (wood(x, y)) return x - y === 1 ? "Y" : "g";
    if (near(wood, x, y)) return "o";
    return ".";
  });
}

/** 결투: the notebook tab, the slips and the ready check. */
const mark = sprite({
  ...ui,
  name: "duel",
  size: [16, 16],
  palette: DUEL,
  frames: { mark: crossed(16) },
});

/** A round socket: empty, or holding a round won. */
function pip(fill: (x: number, y: number) => string): string {
  return disc(7, [[1, "o"]], fill);
}

const pips = sprite({
  ...ui,
  name: "duel-pip",
  size: [7, 7],
  palette: DUEL,
  frames: {
    off: pip((_x, y) => (y <= 2 ? "k" : "m")),
    on: pip((x, y) => (x + y <= 4 ? "y" : y >= 4 ? "g" : "Y")),
  },
});

/** A side's health share, filled in its colour: the sea for 청, chalk white for 백. */
const fills = sprite({
  ...ui,
  name: "duel-fill",
  size: [3, 3],
  slice: [1, 1, 1, 1],
  outline: false,
  palette: DUEL,
  frames: {
    a: stack("444", "334", "223"),
    b: stack("WWW", "ppW", "ssp"),
  },
});

/** A side as a small outlined chip, for rows on paper and marks under the bar. */
function chip(light: string, mid: string, dark: string): string {
  return stack(
    ".ooooo.",
    `o${light}${light}${light}${light}${mid}o`,
    `o${light}${mid}${mid}${mid}${dark}o`,
    `o${light}${mid}${mid}${mid}${dark}o`,
    `o${light}${mid}${mid}${mid}${dark}o`,
    `o${mid}${dark}${dark}${dark}${dark}o`,
    ".ooooo.",
  );
}

const chips = sprite({
  ...ui,
  name: "duel-chip",
  size: [7, 7],
  palette: DUEL,
  frames: { a: chip("4", "3", "2"), b: chip("W", "p", "s") },
});

/** The result card's small marks, 9×9. */
const icons = sprite({
  ...ui,
  name: "duel-icon",
  size: [9, 9],
  palette: DUEL,
  frames: {
    /** Duels played: the rulers, small. */
    mark: crossed(9),
    /** Damage dealt, and a round ended by knockout: a hit's burst. */
    burst: stack(
      "....o....",
      "...oYo...",
      ".o.oYo.o.",
      "oYooyooYo",
      ".oYyyyYo.",
      "oYooyooYo",
      ".o.oYo.o.",
      "...oYo...",
      "....o....",
    ),
    /** Hits landed: a target. */
    target: stack(
      "..ooooo..",
      ".oRRRRRo.",
      "oRRWWWRRo",
      "oRWWrWWRo",
      "oRWrrrWRo",
      "oRWWrWWRo",
      "oxRWWWRxo",
      ".oxxxxxo.",
      "..ooooo..",
    ),
    /** Times knocked out: a heart cracked down the middle. */
    heart: stack(
      ".oo...oo.",
      "oeRo.orro",
      "oeRRorrro",
      "oRRRorrro",
      ".oRRRoro.",
      "..oRoro..",
      "...ooo...",
      "....o....",
      ".........",
    ),
    /** A round ended on time: the clock. */
    clock: stack(
      "..ooooo..",
      ".oWWWWso.",
      "oWWWoWWso",
      "oWWWoWWso",
      "oWWWooWso",
      "oWWWWWWso",
      "osWWWWsso",
      ".ossssso.",
      "..ooooo..",
    ),
    /** Forfeited: a white flag on its stick. */
    flag: stack(
      "oo.......",
      "oSooooo..",
      "oSoWWWWo.",
      "oSoWWWWWo",
      "oSoWWWsso",
      "oSoWssoo.",
      "oSoooo...",
      "oSo......",
      "ooo......",
    ),
  },
});

export default [mark, pips, fills, chips, icons];
