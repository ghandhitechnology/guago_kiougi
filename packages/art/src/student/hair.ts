import { type PartDef, type Piece, part } from "../format.ts";
import { ink, withKo } from "./base.ts";

// Hair --------------------------------------------------------------------------------------
// Down and up heads span x 5..18; the side head spans x 3..17 with the face at the right.
//
// Twelve styles, each told apart by its outline alone, from behind as well as from the front:
//
//   crop       compact cap, one tuft on top, notched nape
//   spiky      jagged all round, one strand pointing up
//   bob        blunt box to the chin, flat bottom edge
//   long       straight drape to the chest, the tallest outline
//   ponytail   round head, a tail tied high and hanging down the middle of the back
//   curly      the widest, a round cloud
//   buzz       the smallest: the skull itself, ears out
//   twintails  two bunches tied at the sides, sticking out past the shoulders
//   bun        a ball on top of a sleek head, neck bare
//   braids     centre part, two thin plaits over the shoulders to the waist
//   shag       layered, a long fringe over one eye, tips flicked out at the nape
//   undercut   a high swept top over shaved sides: wide above, narrow below

function hair(pieces: Record<string, Piece>): PartDef {
  return withKo(part({ palette: ink, pieces }));
}

const none = { down: null, up: null, side: null } as const;

/** Neat and short, one tuft that will not lie down. */
export const crop = hair({
  head: {
    at: { down: [5, 2], up: [5, 2], side: [0, 2] },
    down: `
      ........XX....
      ....XXXXXXX...
      ..XXHHHHhhXX..
      .XHHhhhhhhhxX.
      XHHhhhhhhhhhxX
      XxxxxhhhhxxhxX
      Xx..........xX
      Xx..........xX
    `,
    up: `
      ........XX....
      ....XXXXXXX...
      ..XXHHHHhhXX..
      .XHHHHhhhhhxX.
      XHHhhhhxhhhhxX
      XHhhhhxhhhhhxX
      XhhhhxhhhxhxxX
      XhhhhxhhhxhxxX
      .XhhxhhhxhhxX.
      ..XhxhhhxhxX..
      ...XXX..XXX...
    `,
    side: `
      .........XXX........
      .......XXHHHXX......
      ......XHHHhhhhX.....
      .....XHHhhhhhhhX....
      .....XHhhhhhhhxxX...
      .....Xhhhhhhhxx.....
      .....Xhhhhhx........
      .....Xhhh..x........
      .....Xhhh...........
      ......XhhX..........
      .......XX...........
    `,
  },
  tail: none,
});

/** Slept on it wrong. Spikes everywhere and one strand that points at the sky. */
export const spiky = hair({
  head: {
    at: { down: [4, 1], up: [4, 1], side: [0, 1] },
    down: `
      .........XX.....
      ..XX..XXXhhX.X..
      .XHX.XHHhhXXXhX.
      .XHHXHHhhhhhhhX.
      XHHHhhhhhhhhhhxX
      XHhhhhhhhhhhhxxX
      XhhxhhhxxhhhxhxX
      Xhx....xx....xhX
      .Xx..........xX.
    `,
    up: `
      .........XX.....
      ......X.XhhX....
      ..X..XhXXXXXX...
      .XXXXHHhhhXXXX..
      .XHHHhhhhhhhhhX.
      XHHhhhhhxhhhhhxX
      XHhhhhhxhhhhhxxX
      XhhhhhxhhhxhhxxX
      XhhhhxhhhxhhxxxX
      .XhhxhhhxhhhxxX.
      .XhxhhXhhxhxxXX.
      ..XXXXXXXXXXX...
    `,
    side: `
      ..........XX........
      .....X...XhX........
      .....XX.XXhXX.X.....
      ....XHHXHHhhhXXX....
      ....XHHHhhhhhhhhX...
      ...XHHhhhhhhhhxxX...
      ....Xhhhhhhhhxxx....
      ...Xhhhhhhhx........
      ....Xhhhh..x........
      ...Xhhhhh...........
      ....XhXhX...........
      .....X.X............
    `,
  },
  tail: none,
});

/** Chin-length bob with a blunt fringe, cut in the dorm bathroom. */
export const bob = hair({
  head: {
    at: { down: [4, 2], up: [4, 2], side: [0, 2] },
    down: `
      ....XXXXXXXX....
      .XXXHHHHhhhhXX..
      .XHHHhhhhhhhhhX.
      XhHhhhhhhhhhhhxX
      XhhhhhhhhhhhhxxX
      XhhhhhhhhhhhhxxX
      Xhx..........xxX
      Xhx..........xxX
      Xhx..........xxX
      XhhX........XxxX
      .XXX........XXX.
    `,
    up: `
      .....XXXXXX.....
      ...XXHHHxHHXX...
      ..XHHHHHxhhhhX..
      .XHHhhhhxhhhhxX.
      .XHhhhhhxhhhhxX.
      XHhhhhhxhxhhhxxX
      XhhhhhxhhhxhhxxX
      XhhhhxhhhhhxhxxX
      XhhhxhhhhhhxxxxX
      XhhxhhhhhhhhxxxX
      .XXXXXXXXXXXXXX.
    `,
    side: `
      ........XXXX........
      ......XXHHHHXX......
      .....XHHHhhhhhX.....
      ....XHHhhhhhhhhX....
      ....XHhhhhhhhhhhX...
      ....Xhhhhhhhhhhxx...
      ....Xhhhhhhhx.......
      ....Xhhhhhhhx.......
      ...Xhhhhhhhhx.......
      ...Xhhhhhhhxx.......
      ...XXXXXXXXXX.......
    `,
  },
  tail: none,
});

/** Straight and long, centre parting, falls over the shoulders and down the back. */
export const long = hair({
  head: {
    at: { down: [4, 2], up: [4, 2], side: [0, 2] },
    down: `
      ....XXXXXXXX....
      ..XXHHHxhHHhXX..
      .XHHhhhxXhhhhhX.
      XHHhhhhXhhhhhhxX
      XHhhhhxxxhhhhhxX
      XhhhhhxhhxhhhxxX
      Xhhx........xhxX
      Xhx..........xxX
      Xhx..........xxX
      Xhx..........xxX
      XhX..........XxX
      XhX..........XxX
      XhX..........XxX
      XhX..........XxX
      .XX..........XX.
    `,
    up: `
      .....XXXXXX.....
      ...XXHHHxHHXX...
      ..XHHHHhxhHHhX..
      .XHHhhhhxhhHhxX.
      .XHhhhhhxhhhhxX.
      XHhhhhhhxhhhhxxX
      XhHhhhhhxhhhhxxX
      XhHhhhhxhxhhhxxX
      XhhhhhhxhxhhhxxX
      XhhhhhxhhhxhxxxX
      XhhhhhxhhhxhxxxX
      XhhhxhhhhhhxxxxX
      .XhhxhhhhhxhxxX.
      ..XhXhhhhXhxXX..
      ...X.XXXX.XX....
    `,
    side: `
      ........XXXX........
      ......XXHHHHXX......
      .....XHHHhhhhhX.....
      ....XHHhhhhhhhhX....
      ....XHhhhhhhhhxxX...
      ....Xhhhhhhhhxx.....
      ....Xhhhhhhhx.......
      ....Xhhhhhhhx.......
      ....Xhhhhhhhx.......
      ....Xhhhhhhxx.......
      ....Xhhhhhhx........
    `,
  },
  tail: {
    at: { down: [4, 11], up: [4, 11], side: [4, 12] },
    down: null,
    up: null,
    side: `
      XhhhhX
      XhhhhX
      XhhhxX
      XhhhxX
      XhhxX.
      .XxX..
      ..X...
    `,
  },
});

/** High ponytail and side-swept bangs. The tail swings a beat behind every step. */
export const ponytail = hair({
  head: {
    at: { down: [5, 2], up: [5, 2], side: [0, 2] },
    down: `
      ....XXXXXX....
      ..XXHHHHhhXX..
      .XHHhhhhhhhxX.
      XhHhhhhhhhhhxX
      XhhhhhhhhhhxxX
      XhhhhhxxhxxhxX
      Xhx........xxX
      Xx..........xX
    `,
    up: `
      ....XXXXXX....
      ..XXHHHHhhXX..
      .XHHhhXXhhhxX.
      XHHhhXmmXhhxxX
      XHhhhXrrXhhxxX
      XhhhxXhhXxhxxX
      XhhxhXhhXhxxxX
      XhhhhXhhXhhxxX
      .XhhhXhhXhxxX.
      ..XhhXhhXhxX..
      ...XXXhhXXX...
    `,
    side: `
      .........XXXX.......
      ........XHHHHXX.....
      .......XHHhhhhhX....
      .......XHhhhhhhhX...
      ......XhhhhhhhhxX...
      ......Xhhhhhhxx.....
      ......Xhhhhhx.......
      .......Xhh..x.......
      .......Xhh..........
      ........XX..........
      .........XX.........
    `,
  },
  tail: {
    at: { down: [17, 5], up: [9, 12], side: [1, 3] },
    down: `
      XX..
      XhX.
      XhxX
      XXxX
      XXxX
      .XxX
      .XX.
    `,
    up: `
      XhhhxX
      XhhhxX
      .XhhxX
      .XhhX.
      ..XX..
    `,
    side: `
      ...XX..
      ..XmmX.
      .XhrrX.
      .XhhX..
      XhhxX..
      XhxX...
      XhxX...
      XhX....
      XhX....
      .X.....
    `,
  },
});

/** Tight curls with a lot of volume. Will not fit under the 기숙사 shower cap. */
export const curly = hair({
  head: {
    at: { down: [3, 1], up: [3, 1], side: [0, 1] },
    down: `
      .....XX.XX.XX.....
      ...XXHHXHHXhhXX...
      ..XHHHHhHHhhhhhX..
      .XHHHhhHHhhhhxhhX.
      XHHhhhhhhhhhxxhhxX
      XhhhhhhhhhhhhhhxxX
      XhhhxhhxxhhxxhhxxX
      Xhhx..........xxxX
      XhhX..........XxxX
      XhhX..........XxxX
      .XXX..........XXX.
    `,
    up: `
      .....XX.XXX.XX....
      ...XXHHXHHhXhhXX..
      ..XHHhHHhhhhhhhxX.
      .XHHhhhHHhhhhxxhxX
      XHHhhhhhhhHHhxxhxX
      XHhhHHhhhhhhhhhxxX
      XhhhhhhhHHhhxxhxxX
      XhhHHhhhhhhhhhxxxX
      XhhhhhxxhhxxhhhxxX
      .XhhxxhhhhhhhxxxX.
      .XhhhhxxhxxhhxxxX.
      ..XXXXXXXXXXXXXX..
      ......X....X......
    `,
    side: `
      ......XX.XX.XX......
      ....XXHHXHHXhhXX....
      ...XHHHhHHhhhhhhX...
      ..XHHhhhhhhhhhhhhX..
      ..XHhhHHhhhhhxhhxX..
      .XhhhhhhhhhhhxhxxX..
      .XhhxxhhhhhhxXX.....
      .Xhhhhhhhxxx........
      ..Xhhhxxhhhx........
      ..Xhhhhhhhh.........
      ...Xhhxxhhh.........
      ....XXXXXXX.........
    `,
  },
  tail: none,
});

/** 까까머리: clippered to the skull for the whole first term. The ears get cold. */
export const buzz = hair({
  head: {
    at: { down: [3, 3], up: [3, 3], side: [0, 4] },
    down: `
      ......XXXXXX......
      ....XXHHHhhhXX....
      ...XHHhhhhhhhxX...
      ..Xxxx......xxxX..
      .OXx..........xXO.
      OsO............OkO
      OsO............OkO
      .O..............O.
    `,
    up: `
      ......XXXXXX......
      ....XXHHHhhhXX....
      ...XHHhhhhhhhxX...
      ..XHhhhhhhhhhxxX..
      .OXhhhhhhhhhhxxXO.
      OsXhhhhhhhhhxxxXkO
      OsXxhhhhhhhhxxxXkO
      .OXXxhhhhhhxxXXXO.
    `,
    side: `
      .........XXXX.......
      .......XXHHhhXX.....
      ......XHHhhhhhhX....
      ......Xhhhhhhhxx....
      ......Xhhhhxx.......
      ......Xhh...........
      ......Xxx...........
      .......XX...........
    `,
  },
  tail: none,
});

/** 양갈래: two bunches tied with red bands, bouncing a beat behind every step. */
export const twintails = hair({
  head: {
    at: { down: [4, 2], up: [4, 2], side: [0, 2] },
    down: `
      .....XXXXXX.....
      ...XXHHHxHHXX...
      ..XHHhhhxXhhhX..
      .XHHhhhxXhhhhxX.
      .XHhhhxxxhhhhxX.
      XHhhhxhhhxhhhxxX
      Xhh..........xxX
      .XX..........XX.
    `,
    up: `
      .....XXXXXX.....
      ...XXHHHxHHXX...
      ..XHHhhhxhhhhX..
      .XHHhhhhxhhhhxX.
      .XHhhhhhxhhhhxX.
      XHhhhhhhxhhhhxxX
      XhhhhhhhxhhhhxxX
      XhhhhhhxhxhhhxxX
      .XhhhhhxhxhhxxX.
      ..XXXhxhhhxXXX..
      .....XXXXXX.....
    `,
    side: `
      ........XXXX........
      ......XXHHHHXX......
      .....XHHHhhhhhX.....
      ....XHHhhhhhhhhX....
      ....XHhhhhhhhhxxX...
      ....Xhhhhhhhhxx.....
      ....Xhhhhhhhx.......
      ....Xhhhhhhhx.......
      .....Xhhhhxx........
      ......XXXX..........
    `,
  },
  tail: {
    at: { down: [0, 5], up: [0, 5], side: [0, 5] },
    down: `
      ..XX................XX..
      .XmmX..............XmmX.
      XHrrX..............XrrxX
      XHhhX..............XhhxX
      XHhhX..............XhhxX
      XhhxX..............XhhxX
      XhhxX..............XhxxX
      .XhxX..............XhxX.
      .XxX................XxX.
      ..X..................X..
    `,
    up: `
      ..XX................XX..
      .XmmX..............XmmX.
      XHrrX..............XrrxX
      XHhhX..............XhhxX
      XHhhX..............XhhxX
      XhhxX..............XhhxX
      XhhxX..............XhxxX
      .XhxX..............XhxX.
      .XxX................XxX.
      ..X..................X..
    `,
    side: `
      ..XX..
      .XmmX.
      .XrrX.
      .XHhhX
      .XHhhX
      .XhhxX
      .XhhxX
      .XhxX.
      ..XxX.
      ...X..
    `,
  },
});

/** 똥머리: everything pulled up into one bun before the first period. */
export const bun = hair({
  head: {
    at: { down: [4, 1], up: [4, 1], side: [0, 1] },
    down: `
      ......XXXX......
      .....XHHhhX.....
      .....XHhhxX.....
      ...XXXXxxXXXX...
      ..XHHHhhhhhhxX..
      .XHHhhhhhhhhhxX.
      XHhhhhhhhhhhhxxX
      Xhh..........xxX
      XhX..........XxX
      .X............X.
    `,
    up: `
      ......XXXX......
      .....XHHhxX.....
      .....XHhhxX.....
      ...XXXXxxXXXX...
      ..XHHhxhhxhhxX..
      .XHHhhxhhxhhhxX.
      .XHhhhxhhxhhxxX.
      XHhhhxhhhhxhhxxX
      XhhhxhhhhhhxhxxX
      .XXXXXXXXXXXXXX.
    `,
    side: `
      .....XXXX...........
      ....XHHhxX..........
      ....XHhhxX..XX......
      .....XXxXXXXHHXX....
      ......XHHhhhhhhhX...
      .....XHHhhhhhhhhX...
      .....XHhhhhhhhxxX...
      .....Xhhhhhhxx......
      .....Xhhx...........
      ......Xxx...........
      .......XX...........
    `,
  },
  tail: none,
});

/** 땋은 머리: parted down the middle, two plaits over the shoulders, tied in red. */
export const braids = hair({
  head: {
    at: { down: [4, 2], up: [4, 2], side: [0, 2] },
    down: `
      .....XXXXXX.....
      ...XXHHHxHHXX...
      ..XHHhhhxXhhhX..
      .XHHhhhxXxhhhxX.
      XHHhhhxxhhhhhxxX
      XHhhhxhhhhhhhxxX
      Xhx..........xxX
      Xhx..........xxX
    `,
    up: `
      .....XXXXXX.....
      ...XXHHHxHHXX...
      ..XHHhhhxhhhhX..
      .XHhHxhhxhhHxxX.
      .XHhxHhhxhhxHxX.
      XHhhHxhhxhhHxhxX
      XhhhxHhhxhhxHhxX
      XhhhHxhhxhhHxhxX
      .XhhxHhhxhhxHxX.
    `,
    side: `
      ........XXXX........
      ......XXHHHHXX......
      .....XHHHhhhhhX.....
      ....XHHhhhhhhhhX....
      ....XHhhhhhhhhxxX...
      ....Xhhhhhhhhxx.....
      ....Xhhhhhhhx.......
      ....Xhhhhhhxx.......
      .....Xhhhhxx........
      ......XXXXX.........
    `,
  },
  tail: {
    at: { down: [4, 9], up: [3, 10], side: [5, 11] },
    down: `
      XhX..........xxX
      XhhX........XhhX
      XhxX........XxxX
      .XxX........XxX.
      XhhX........XhhX
      XmmX........XmmX
      .XX..........XX.
    `,
    up: `
      .XhhX........XxxX.
      .XhhX........XxxX.
      XhhX..........XhhX
      XxxX..........XxxX
      .XX............XX.
    `,
    side: `
      .XX.
      XhhX
      XhxX
      .XxX
      XhhX
      XmmX
      .XX.
    `,
  },
});

/** Layered and grown out, the fringe over one eye. Says it is not hiding anything. */
export const shag = hair({
  head: {
    at: { down: [3, 2], up: [3, 2], side: [0, 2] },
    down: `
      ......XXXXXX......
      ....XXHHHHhhXX....
      ...XHHhhhhhhhhX...
      ..XHHhhhhhhhhhxX..
      .XHHhhhhhhhhhhxxX.
      .XHhhhhhhhhhhhhxX.
      .Xhhx.....XhhhhxX.
      .Xhx.......XhhhxX.
      .XhX........XhxxX.
      XhX..........XxXX.
      .X............XXX.
    `,
    up: `
      ......XXXXXX......
      ....XXHHHHhhXX....
      ...XHHhhhhhhhhX...
      ..XHHhhhhhhhhhxX..
      .XHHhhxhhhhxhhxxX.
      .XHhhxhhhhhhxhxxX.
      XHhhxhhhhhhhhxhxxX
      XhhhxhhhxhhhhxhxxX
      XhhxhhhxhhhhxhhxxX
      XhXXhhxhhhhxhhXXxX
      XX.XhXhhXhhXhXX.XX
      ...XX.XXXXXX.XX...
    `,
    side: `
      ........XXXX........
      ......XXHHHHXX......
      .....XHHHhhhhhXX....
      ....XHHhhhhhhhhhX...
      ....XHhhhhhhhhhhhX..
      ....XhhhhhhhhxhhxX..
      ....Xhhhhhhhxxxx....
      ....Xhhhhhhhx.......
      ...Xhhhhhhhxx.......
      ..XhXhhhhhX.........
      ..XX.XXXXX..........
    `,
  },
  tail: none,
});

/** 투블럭: the top swept up and over, the sides clippered. Takes twenty minutes every morning. */
export const undercut = hair({
  head: {
    at: { down: [4, 1], up: [4, 1], side: [0, 1] },
    down: `
      ......XXXXXX....
      ....XXHHHHhhX...
      ..XXHHHhhhhhhX..
      .XHHhhhhhhhhhxX.
      .XHhhhhhhhhhxxX.
      .XxxxhhhhhxxxxX.
      .Xxx........xxX.
      .Xx..........xX.
      .Xx..........xX.
    `,
    up: `
      ......XXXXX.....
      ....XXHHHhhXX...
      ..XXHHhhhhhhhX..
      .XHHhhhhhhhhhxX.
      .XHhhhhhhhhhxxX.
      .XxxxxxxxxxxxxX.
      .XxxxxxxxxxxxxX.
      .XxxxxxxxxxxxxX.
      ..XxxxxxxxxxxX..
      ..XXxxxxxxxxXX..
    `,
    side: `
      .........XXXXX......
      .......XXHHHhhXX....
      ......XHHhhhhhhhXX..
      .....XHhhhhhhhhhhXX.
      .....XhhhhhhhhhxxX..
      ......XxxxxxxxXX....
      ......Xxxx..........
      ......Xxx...........
      ......Xxx...........
      .......XX...........
    `,
  },
  tail: none,
});
