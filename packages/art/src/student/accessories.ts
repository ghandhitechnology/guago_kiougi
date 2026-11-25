import { part } from "../format.ts";
import { ink, lone, withKo } from "./base.ts";

// Accessories -------------------------------------------------------------------------------

/** Round gold frames. Fringes and side hair fall over them. */
export const glasses = withKo(
  part({
    palette: ink,
    under: "hair",
    pieces: {
      head: {
        at: { down: [5, 7], up: [5, 7], side: [3, 7] },
        down: `
          ...DD....DD...
          ..D..DDDD..D..
          ..D..D..D..D..
          ..DDD....DDD..
        `,
        up: null,
        side: `
          ..........DDDD.
          .............D.
          .............D.
        `,
      },
    },
  }),
);

/** Lab goggles pushed up on the forehead, never once pulled down. */
export const goggles = withKo(
  part({
    palette: ink,
    lone,
    pieces: {
      head: {
        at: { down: [5, 3], up: [5, 5], side: [3, 5] },
        down: `
          ..GGGGGGGGGG..
          ..G~LLGG~LLG..
          ..GGGGGGGGGG..
        `,
        up: null,
        side: `
          ..........GGGG.
          ........eeGLLG.
          ..........GGGG.
        `,
      },
    },
  }),
);

/** Extra materials for worn things: gold, sea, rose and grass beside the student legend. */
const gear = {
  ...ink,
  A: "gold.light",
  Y: "gold.pale",
  E: "gold.dark",
  B: "sea.deep",
  d: "sea.mid",
  K: "rose.deep",
  P: "rose.dark",
  Q: "rose.mid",
  F: "grass.deep",
  f: "grass.dark",
  o: "grass.mid",
  Z: "grass.light",
} as const;

/** White headphones round the neck, the cups on the collarbones, the band behind. Hair falls over them. */
export const headphones = withKo(
  part({
    palette: gear,
    lone,
    under: "hair",
    pieces: {
      torso: {
        at: { down: [6, 12], up: [8, 13], side: [9, 12] },
        down: `
          .GG....GG.
          G^pG..GqqG
          GppG..GqqG
          .GG....GG.
        `,
        up: `
          GGGGGGGG
          GqqqqqqG
        `,
        side: `
          GG....
          .GGGG.
          .G^ppG
          .GpqqG
          ..GGG.
        `,
      },
    },
  }),
);

/** A teal barrette above the right temple, the one colour no hair dye in the dorm comes in. */
export const hairclip = withKo(
  part({
    palette: gear,
    pieces: {
      head: {
        at: { down: [4, 5], up: [16, 5], side: [9, 5] },
        down: `
          BBBB
          BLLB
          BBBB
        `,
        up: `
          BBBB
          BddB
          BBBB
        `,
        side: `
          BBBB
          BLLB
          BBBB
        `,
      },
    },
  }),
);

/** 턱스크: a blue mask pulled down under the chin, where it lives between classes. */
export const mask = withKo(
  part({
    palette: gear,
    lone,
    under: "hair",
    pieces: {
      head: {
        at: { down: [6, 9], up: [6, 9], side: [11, 10] },
        down: `
          B..........B
          B..........B
          .BLLLLLLLlB.
          ..BLLLLLlB..
          ...BLLLlB...
          ....BBBB....
        `,
        up: null,
        side: `
          B......
          .BLLLLB
          .BLLLB.
          ..BBB..
        `,
      },
    },
  }),
);

/** 명찰: the student ID on a yellow lanyard. Worn inside the rifts too, by order of the principal. */
export const lanyard = withKo(
  part({
    palette: gear,
    lone,
    under: "hair",
    pieces: {
      torso: {
        at: { down: [10, 14], up: [10, 12], side: [15, 14] },
        down: `
          .aa.
          GGGG
          GvvG
          GwwG
          GGGG
        `,
        up: `
          aaaa
        `,
        side: `
          GG
          G^
          G^
          GG
        `,
      },
    },
  }),
);
