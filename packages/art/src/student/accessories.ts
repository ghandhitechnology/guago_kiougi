import { part } from "../format.ts";
import { ink, withKo } from "./base.ts";

// Accessories -------------------------------------------------------------------------------

/** Round gold frames. */
export const glasses = withKo(
  part({
    palette: ink,
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
    pieces: {
      head: {
        at: { down: [5, 3], up: [5, 5], side: [3, 5] },
        down: `
          eGGGGGGGGGGGGe
          eGLLllGGLLllGe
          eGGGGGGGGGGGGe
        `,
        up: `
          eeeeeeeeeeeeee
        `,
        side: `
          ..........GGGG.
          ..eeeeeeeeGLLG.
          ..........GGGG.
        `,
      },
    },
  }),
);
