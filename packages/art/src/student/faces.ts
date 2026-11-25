import { type PartDef, part } from "../format.ts";
import { ink, lone, withKo } from "./base.ts";

// Faces -------------------------------------------------------------------------------------
// Down grids sit on the face at [5, 8]; side grids at [3, 8]. Rows: eyes, eyes, cheeks, chin.

const hurt = {
  down: `
    ...*......*...
    ....*....*....
    ......--......
  `,
  side: `
    ............*..
    ...........*...
    ...............
    .............-.
  `,
};

const yawn = {
  down: `
    ..............
    ...**....**...
    ...'..!!..'...
    ......!!......
  `,
  side: `
    ...............
    ...........**..
    ...........'...
    ............!!.
  `,
};

/** Profile for the knocked-out pose, drawn upright; it is transposed with the head. */
const koSide = `
  ...............
  ...........**..
  ...............
  .............!.
`;

function face(own: {
  down: Record<"rest" | "shout" | "read", string>;
  side: Record<"rest" | "shout" | "read", string>;
}): PartDef {
  return withKo(
    part({
      palette: ink,
      lone,
      pieces: {
        head: {
          at: { down: [5, 8], up: [5, 8], side: [3, 8] },
          down: { ...own.down, hurt: hurt.down, yawn: yawn.down },
          up: null,
          side: { ...own.side, hurt: hurt.side, yawn: yawn.side, ko: koSide },
        },
      },
    }),
  );
}

/** 밝음: eager, round eyes with a glint, always a little flushed. */
export const bright = face({
  down: {
    rest: `
      ...^e....^e...
      ...ee....ee...
      ...'..--..'...
    `,
    shout: `
      ...^e....^e...
      ...ee....ee...
      ...'..!!..'...
      ......!!......
    `,
    read: `
      ..............
      ...ee....ee...
      ...'..--..'...
    `,
  },
  side: {
    rest: `
      ...........^e..
      ...........ee..
      ...........'...
      .............-.
    `,
    shout: `
      ...........^e..
      ...........ee..
      ...........'...
      ............!!.
    `,
    read: `
      ...............
      ...........ee..
      ...........'...
      .............-.
    `,
  },
});

/** 졸림: heavy lids, a sideways look, rings under the eyes. Has not slept since March. */
export const sleepy = face({
  down: {
    rest: `
      ...**....**...
      ...*,....*,...
      ...,,.-..,,...
    `,
    shout: `
      ...**....**...
      ...ee....ee...
      ...,,.!!.,,...
    `,
    read: `
      ..............
      ...**....**...
      ...,,..-.,,...
    `,
  },
  side: {
    rest: `
      ...........**..
      ...........*,..
      ...........,,..
      .............-.
    `,
    shout: `
      ...........**..
      ...........ee..
      ...........,,..
      ............!!.
    `,
    read: `
      ...............
      ...........**..
      ...........,,..
      .............-.
    `,
  },
});

/** 승부: eyes angled down to the nose, a one-sided grin. Treats every quiz as a duel. */
export const sharp = face({
  down: {
    rest: `
      ...e,....,e...
      ...ee....ee...
      .......--.....
    `,
    shout: `
      ...e,....,e...
      ...ee....ee...
      .....!^^!.....
      ......!!......
    `,
    read: `
      ..............
      ...ee....ee...
      .......--.....
    `,
  },
  side: {
    rest: `
      ...........e,..
      ...........ee..
      ...............
      ............--.
    `,
    shout: `
      ...........e,..
      ...........ee..
      ............^..
      ............!!.
    `,
    read: `
      ...............
      ...........ee..
      ...............
      ............--.
    `,
  },
});
