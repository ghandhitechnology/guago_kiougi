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

/** Eyes squeezed into arcs, mouth wide open: 박수 and ㅋㅋ. */
const laugh = {
  down: `
    ...*......*...
    ..*.*....*.*..
    ...'.!!!!.'...
    ......!!......
  `,
  side: `
    ...........*...
    ..........*.*..
    ...........'...
    ............!!.
  `,
};

/** Eyes shut, breathing slow: dozing off, asleep, and the 절. */
const doze = {
  down: `
    ..............
    ..**......**..
    ...'..--..'...
  `,
  side: `
    ...............
    ..........**...
    ...........'...
    .............-.
  `,
};

/** 멘붕: white eyes with pinprick pupils, mouth gone wobbly. Due tomorrow, started tonight. */
const panic = {
  down: `
    ...~~....~~...
    ...~*....*~...
    .....!.!!.....
    ......!..!....
  `,
  side: `
    ...........~~..
    ...........*~..
    ...............
    ...........!.!.
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
          down: {
            ...own.down,
            hurt: hurt.down,
            yawn: yawn.down,
            laugh: laugh.down,
            doze: doze.down,
            panic: panic.down,
          },
          up: null,
          side: {
            ...own.side,
            hurt: hurt.side,
            yawn: yawn.side,
            laugh: laugh.side,
            doze: doze.side,
            panic: panic.side,
            ko: koSide,
          },
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

/** 엉뚱: beady eyes set wide and the tip of a tongue. Was thinking about something else entirely. */
export const goofy = face({
  down: {
    rest: `
      ...*......*...
      ...*......*...
      .'...---....'.
      .......'......
    `,
    shout: `
      ...*......*...
      ...*......*...
      .'....!!....'.
      ......!!......
    `,
    read: `
      ..............
      ...*......*...
      .'...---....'.
      .......'......
    `,
  },
  side: {
    rest: `
      ............*..
      ............*..
      ..........'....
      ............--.
      ..............'
    `,
    shout: `
      ............*..
      ............*..
      ..........'....
      ............!!.
    `,
    read: `
      ...............
      ............*..
      ..........'....
      ............--.
      ..............'
    `,
  },
});

/** 수줍음: eyes kept low, cheeks that give everything away. */
export const shy = face({
  down: {
    rest: `
      ..............
      ...ee....ee...
      ..'''....'''..
      .......-......
    `,
    shout: `
      ..............
      ...ee....ee...
      ..'''.!!.'''..
      ......!!......
    `,
    read: `
      ..............
      ...--....--...
      ..'''....'''..
      .......-......
    `,
  },
  side: {
    rest: `
      ...............
      ...........ee..
      ...........''..
      .............-.
    `,
    shout: `
      ...............
      ...........ee..
      ...........''..
      ............!!.
    `,
    read: `
      ...............
      ...........--..
      ...........''..
      .............-.
    `,
  },
});

/** 시크: flat lids, a sideways look, a mouth that has heard it before. */
export const cool = face({
  down: {
    rest: `
      ..eee....eee..
      ..~ee....~ee..
      ......---.....
    `,
    shout: `
      ..eee....eee..
      ..~ee....~ee..
      ......!!!.....
      .......!......
    `,
    read: `
      ..............
      ..eee....eee..
      ......---.....
    `,
  },
  side: {
    rest: `
      ..........eee..
      ..........~ee..
      ...............
      ............--.
    `,
    shout: `
      ..........eee..
      ..........~ee..
      ...............
      ............!!.
    `,
    read: `
      ...............
      ..........eee..
      ...............
      ............--.
    `,
  },
});
