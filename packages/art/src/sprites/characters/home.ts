import { swapPart } from "../../figure.ts";
import { type Dir, type Legend, part, rig } from "../../format.ts";
import { frame, garment, ink, lone, shadow, skin, walkArms } from "./student.ts";

/**
 * 엄마, in the one-room home a player is sent to at 20 벌점. Worry comes out as food: hair
 * twisted up in a claw clip, a rose cardigan, slippers, and the 보자기 bundle of 반찬 already
 * packed. She tucks a loose strand behind her ear; her signature is holding the bundle out.
 */
const palette: Legend = {
  ...ink,
  E: "rose.deep",
  d: "rose.dark",
  a: "rose.mid",
  A: "rose.light",
  D: "gold.deep",
  K: "gold.dark",
  Q: "gold.mid",
  Y: "gold.light",
};

const clipped = part({
  palette,
  pieces: {
    head: {
      at: { down: [5, 1], up: [5, 1], side: [0, 1] },
      down: `
        .....XXXX.....
        ....XYYYYX....
        ..XXXHHHhXXX..
        .XHHhhhhhhhxX.
        XHHhhhhhhhhhxX
        XHhhhhhhhhhxxX
        XhhhhhxxhxxhxX
        Xhx.......xxxX
        Xx..........xX
      `,
      up: `
        .....XXXX.....
        ....XYYYYX....
        ...XXXXXXXX...
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
        ....XXXX............
        ...XYYYYX.XXX.......
        ...XhhhhXXHHHXX.....
        ....XXXXHHhhhhX.....
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
  },
});

const fond = part({
  palette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: `
        ...^e....^e...
        ...ee....ee...
        ..'........'..
        ......--......
      `,
      up: null,
      side: `
        ...........^e..
        ...........ee..
        ..........'....
        .............-.
      `,
    },
  },
});

const cardigan = swapPart(
  garment(
    {
      ...palette,
      "1": "rose.deep",
      "2": "rose.light",
      "3": "rose.dark",
      "4": "rose.deep",
      "5": "rose.mid",
      "6": "rose.dark",
    },
    {
      down: `
        EAwwwpdE
        EAwwwpdE
        EAawpadE
        EAaaaadE
        EaaaaadE
        EaaaaddE
        EEEEEEEE
      `,
      up: `
        EEEEEEEE
        EAaaaadE
        EAaaaadE
        EAaaaadE
        EaaaaadE
        EaaaaddE
        EEEEEEEE
      `,
      side: `
        EEwwpE
        EAawpE
        EAawpE
        EaaaaE
        EaaaaE
        EaaddE
        EEEEEE
      `,
    },
    true,
  ),
  "Gw",
  "EA",
  ["legL", "legR"],
);

/** The 보자기: lunch boxes knotted in yellow cloth, the knot's ears up. */
const BUNDLE = ".D..D.\nDQDDQD\nDQQQQD\nDQQKKD\nDDDDDD";
const bundle = part({
  palette,
  pieces: {
    hand: {
      at: { down: [9, 15], up: [9, 15], side: [16, 15] },
      down: { rest: BUNDLE, out: { at: [7, 18], grid: BUNDLE } },
      up: { rest: ".", out: "." },
      side: { rest: BUNDLE, out: { at: [18, 11], grid: BUNDLE } },
    },
  },
});

const holding = (d: Dir) =>
  d === "up" ? {} : d === "side" ? { armR: "read" } : { armR: "read", armL: "read" };

const parent = rig({
  name: "parent",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { cardigan },
    face: { fond },
    hair: { clipped },
    book: { bundle },
  },
  frames: {
    idle0: (d) => holding(d) as never,
    idle1: (d) => ({ ...holding(d), torso: [0, 1], hand: [0, 1] }) as never,
    tuck: (d) => (d === "down" ? { armR: "read", armL: "mouth" } : holding(d)) as never,
    walk0: (d) => ({ ...walkArms(d, "R"), ...holding(d), hand: [0, 0] }) as never,
    walk1: (d) => ({ ...holding(d), torso: [0, -1], hand: [0, -1] }) as never,
    walk2: (d) => ({ ...walkArms(d, "L"), ...holding(d), hand: [0, 0] }) as never,
    walk3: (d) => ({ ...holding(d), torso: [0, -1], hand: [0, -1] }) as never,
    offer0: (d) =>
      (d === "up" ? { armR: "raise", armL: "raise" } : { armR: "strike", hand: "out" }) as never,
  },
  anim: {
    idle: {
      frames: ["idle0", "idle0", "idle1", "idle0", "idle0", "tuck", "tuck", "idle0"],
      fps: 3,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    offer: {
      frames: ["idle0", "offer0", "offer0", "offer0", "offer0", "idle0"],
      fps: 3,
      loop: false,
    },
  },
  looks: {
    home: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "cardigan",
        face: "fond",
        hair: "clipped",
        book: "bundle",
      },
      slots: { skin: "warm", hair: "brown" },
    },
  },
});

export default [parent];
