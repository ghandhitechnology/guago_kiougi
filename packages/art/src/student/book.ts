import { over } from "../draw.ts";
import { part } from "../format.ts";
import { closed, ink, lone, withKo } from "./base.ts";

/** A `w`×`h` grid of clear pixels with small grids laid on it at their top-left corners. */
function scatter(w: number, h: number, ...items: [x: number, y: number, grid: string][]): string {
  let out = Array.from({ length: h }, () => ".".repeat(w)).join("\n");
  for (const [x, y, grid] of items) out = over(out, grid, x, y);
  return out;
}

const cup = `
  GGG
  GwG
  GwG
  .G.
`;
const hands = `
  .OO.
  O%%O
  .OO.
`;
const dropped = `
  TTTTT
  TUUUT
  TyyyT
  TTTTT
`;

// Book --------------------------------------------------------------------------------------

/** The textbook. Raised, swung, read, and dropped with its owner. */
export const textbook = withKo(
  part({
    palette: ink,
    lone,
    pieces: {
      hand: {
        at: { down: [2, 17], up: [18, 17], side: [5, 18] },
        down: {
          rest: closed,
          raise: {
            at: [0, 2],
            grid: `
              .TTTT
              TUuuT
              TUuuT
              TuuuT
              TyyyT
              TTTT.
            `,
          },
          strike: {
            at: [7, 18],
            grid: `
              TTTTTT
              TUuuuT
              TUuuuT
              TyyyyT
              TTTTTT
            `,
          },
          follow: {
            at: [12, 19],
            grid: `
              TTTT
              TUuT
              TUuT
              TTTT
            `,
          },
          fly: {
            at: [1, 0],
            grid: `
              ..TT..
              .TUuT.
              TUuuuT
              TyyuT.
              .TTT..
            `,
          },
          read0: {
            at: [9, 13],
            grid: `
              TTTTTT
              TwwwwT
              TUuTuT
              TUuTuT
              TUuTuT
              TTTTTT
            `,
          },
          read1: {
            at: [9, 11],
            grid: `
              ...T..
              ..TwT.
              TTTwTT
              TwwwwT
              TUuTuT
              TUuTuT
              TUuTuT
              TTTTTT
            `,
          },
          away: ".",
          tuck: {
            at: [4, 15],
            grid: `
              TTT
              TyT
              TyT
              TyT
              TTT
            `,
          },
          drop: {
            at: [2, 21],
            grid: `
              TTTTT
              TUUUT
              TyyyT
              TTTTT
            `,
          },
          carry: {
            at: [7, 13],
            grid: `
              .TTTTTTTT.
              TyyyyUUUUT
              TUUUUUUUUT
              TTTTwwTTTT
              TuuuwwuuuT
              TuuuwwuuuT
              TtttwwtttT
              TTTTTTTTTT
            `,
          },
          aloft: {
            at: [4, 1],
            grid: `
              .TTTT.
              TUUuuT
              TUuuuT
              TUuuuT
              TyyyyT
              TTTTTT
            `,
          },
          drink: { at: [2, 8], grid: scatter(13, 14, [10, 0, cup], [0, 9, closed]) },
          brow: {
            at: [9, 6],
            grid: `
              .OOOO.
              O%%&&O
              .OOOO.
            `,
          },
          clutch: {
            at: [1, 4],
            grid: scatter(22, 21, [1, 2, hands], [17, 2, hands], [0, 17, dropped]),
          },
          lap: {
            at: [9, 19],
            grid: `
              TTTTTT
              TUUuuT
              TyyyyT
              TTTTTT
            `,
          },
          read2: {
            at: [9, 13],
            grid: `
              TTTTTT
              TTwwwT
              TUuTuT
              TUuTuT
              TUuTuT
              TTTTTT
            `,
          },
        },
        up: {
          rest: `
            TTT
            TtT
            TtT
            TtT
            TTT
          `,
          raise: {
            at: [18, 3],
            grid: `
              .TTT.
              TtttT
              TtttT
              TtttT
              TTTTT
            `,
          },
          strike: {
            at: [17, 0],
            grid: `
              ~.TTTT
              .~TttT
              ..TTTT
            `,
          },
          follow: ".",
          fly: {
            at: [18, 1],
            grid: `
              ..TT..
              .TttT.
              TttttT
              .TttT.
              ..TT..
            `,
          },
          read0: ".",
          read1: ".",
          read2: ".",
          lap: ".",
          away: ".",
          tuck: {
            at: [17, 15],
            grid: `
              TTT
              TtT
              TtT
              TtT
              TTT
            `,
          },
          drop: {
            at: [17, 21],
            grid: `
              TTTTT
              TtttT
              TtttT
              TTTTT
            `,
          },
          carry: ".",
          aloft: {
            at: [14, 1],
            grid: `
              .TTTT.
              TttttT
              TttttT
              TttttT
              TttttT
              TTTTTT
            `,
          },
          drink: `
            TTT
            TtT
            TtT
            TtT
            TTT
          `,
          brow: ".",
          clutch: {
            at: [1, 4],
            grid: scatter(22, 21, [1, 2, hands], [17, 2, hands], [16, 17, dropped]),
          },
        },
        side: {
          rest: closed,
          ko: { at: [15, 15], grid: closed },
          away: ".",
          tuck: {
            at: [7, 15],
            grid: `
              TT
              TU
              TU
              TT
            `,
          },
          drop: {
            at: [3, 21],
            grid: `
              TTTTT
              TUUUT
              TyyyT
              TTTTT
            `,
          },
          carry: {
            at: [12, 13],
            grid: `
              .TTTTTT
              TyyUUUT
              TUUUUUT
              TuuwwuT
              TuuwwuT
              TuuwwuT
              TtttttT
              TTTTTTT
            `,
          },
          aloft: {
            at: [17, 0],
            grid: `
              .TTT.
              TUUuT
              TUuuT
              TUuuT
              TyyyT
              TTTTT
            `,
          },
          drink: { at: [5, 7], grid: scatter(15, 16, [12, 1, cup], [0, 11, closed]) },
          brow: {
            at: [16, 7],
            grid: `
              .OO
              O%O
              O%O
              .O.
            `,
          },
          clutch: { at: [5, 4], grid: scatter(15, 21, [2, 1, hands], [10, 17, dropped]) },
          lap: {
            at: [12, 17],
            grid: `
              TTTTT
              TUUUT
              TTTTT
            `,
          },
          raise: {
            at: [0, 12],
            grid: `
              TTTT
              TUuT
              TUuT
              TuuT
              TyyT
              TTTT
            `,
          },
          strike: {
            at: [18, 10],
            grid: `
              .TTTT
              .TUuT
              .TUuT
              @TUuT
              @TuuT
              @TuuT
              .TyyT
              .TTTT
            `,
          },
          follow: {
            at: [12, 19],
            grid: `
              ..TTTTT
              .TUuuuT
              @TUyyyT
              .TTTTT.
            `,
          },
          read0: {
            at: [18, 10],
            grid: `
              ..TT
              .TwT
              TwwT
              TUuT
              TUuT
              TTTT
            `,
          },
          read1: {
            at: [18, 8],
            grid: `
              ..T.
              .TwT
              .TwT
              .TTT
              TwwT
              TUuT
              TUuT
              TTTT
            `,
          },
          read2: {
            at: [18, 10],
            grid: `
              TT..
              TwT.
              TwwT
              TUuT
              TUuT
              TTTT
            `,
          },
        },
      },
    },
  }),
);
