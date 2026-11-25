import { part } from "../format.ts";
import { closed, ink, lone, withKo } from "./base.ts";

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
            at: [1, 1],
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
        },
        side: {
          rest: closed,
          ko: { at: [15, 15], grid: closed },
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
              OTUuT
              OTuuT
              OTuuT
              .TyyT
              .TTTT
            `,
          },
          follow: {
            at: [12, 19],
            grid: `
              ..TTTTT
              .TUuuuT
              OTUyyyT
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
