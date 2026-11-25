import { type Dir, type Legend, part, rig } from "../../format.ts";
import { frame, garment, ink, lone, shadow, skin, walkArms } from "./student.ts";

/**
 * R&E team 0조 beside 도현우 (in `cast.ts`): 민가람, who built the laser rig and never lets a
 * silence last, and 윤서하, the leader who went into the first rift.
 */

const BLAZER = {
  "1": "navy.deep",
  "2": "navy.light",
  "3": "navy.dark",
  "4": "navy.deep",
  "5": "navy.mid",
  "6": "navy.dark",
} as const;

// 민가람 --------------------------------------------------------------------------------------

/**
 * 민가람: fast, loud, kind under it. Chestnut hair shoved up by laser goggles that never come
 * off the forehead, blazer sleeves pushed to the elbow, a screwdriver always in hand, and both
 * hands talking at once.
 */
const garamPalette: Legend = { ...ink, A: "gold.light", B: "sea.dark" };

const shoved = part({
  palette: garamPalette,
  pieces: {
    head: {
      at: { down: [4, 1], up: [4, 1], side: [0, 1] },
      down: `
        .........XX.....
        ..X...XXXhhX.X..
        .XHX.XHHhhXXXhX.
        .XHHXHHhhhhhhhX.
        XHHHhhhhhhhhhhxX
        XHhhhhhhhhhhhxxX
        XhhxhhhxxhhhxhxX
        Xxx....xx....xxX
        .Xx..........xX.
      `,
      up: `
        .........XX.....
        ......X.XhhX....
        ..X..XhXXXXXX...
        .XXXXHHhhhXXXX..
        .XHHHhhhhhhhhhX.
        XHHhhhhhxhhhhhxX
        XhhhhhhxhhhhhxxX
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
  },
});

/** Laser goggles pushed up on the forehead: teal lenses on a black strap. */
const laserGoggles = part({
  palette: garamPalette,
  pieces: {
    head: {
      at: { down: [5, 5], up: [5, 6], side: [3, 5] },
      down: `
        eeeeeeeeeeeeee
        eLLlleeeeLLlle
        eeeeeeeeeeeeee
      `,
      up: `
        eeeeeeeeeeeeee
      `,
      side: `
        ..........eeee.
        ..eeeeeeeeLLLe.
        ..........eeee.
      `,
    },
  },
});

const chatty = part({
  palette: garamPalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...^e....^e...
          ...ee....ee...
          ...'..!!..'...
        `,
        talk: `
          ...^e....^e...
          ...ee....ee...
          ...'.!!!!.'...
          ......!!......
        `,
        grin: `
          ..............
          ...--....--...
          ...'.!^^!.'...
          ......!!......
        `,
      },
      up: null,
      side: {
        rest: `
          ...........^e..
          ...........ee..
          ...........'...
          ............!!.
        `,
        talk: `
          ...........^e..
          ...........ee..
          ...........'.!.
          ............!!.
        `,
        grin: `
          ...............
          ...........--..
          ...........'...
          ...........!^!.
        `,
      },
    },
  },
});

const rolled = garment(
  { ...garamPalette, ...BLAZER, "4": "skin.deep", "5": "skin.mid", "6": "skin.dark" },
  {
    down: `
      NNwwwwNN
      NVwmmwvN
      NVVmrvnN
      NVVmrvnN
      NvvvrvnN
      NvvvvvnN
      NNNNNNNN
    `,
    up: `
      NNNNNNNN
      NVvvvvnN
      NVvvvvnN
      NVvvvvnN
      NvvvvvnN
      NvvvvvnN
      NNNNNNNN
    `,
    side: `
      NNwwmN
      NVvwmN
      NVvVmN
      NvvVrN
      NvvVrN
      NvvVrN
      NNNNNN
    `,
  },
  true,
);

/** The screwdriver: yellow handle, steel shaft. */
const DRIVER = ".DD.\nDaaD\nDaaD\n.GG.\n.GG.";
const screwdriver = part({
  palette: garamPalette,
  pieces: {
    hand: {
      at: { down: [3, 15], up: [18, 15], side: [5, 18] },
      down: { rest: DRIVER, up: { at: [1, 4], grid: DRIVER } },
      up: { rest: DRIVER, up: { at: [17, 4], grid: DRIVER } },
      side: { rest: DRIVER, up: { at: [2, 8], grid: DRIVER } },
    },
  },
});

const garam = rig({
  name: "garam",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { rolled },
    face: { chatty },
    hair: { shoved },
    accessory: { laserGoggles },
    book: { screwdriver },
  },
  frames: {
    idle0: { head: "talk" },
    idle1: { torso: [0, -1], hand: [0, -1] },
    idle2: (d) =>
      (d === "side" ? { armL: "fwd", head: "talk" } : { armL: "fling", head: "talk" }) as never,
    walk0: (d) => walkArms(d, "R") as never,
    walk1: { torso: [0, -1], hand: [0, -1] },
    walk2: (d) => walkArms(d, "L") as never,
    walk3: { torso: [0, -1], hand: [0, -1] },
    chatter0: { armR: "raise", hand: "up", head: "talk" },
    chatter1: (d) =>
      (d === "side"
        ? { armR: "raise", hand: "up", torso: [0, -1] }
        : { armL: "raise", torso: [0, -1], hand: [0, -1] }) as never,
    chatter2: (d) =>
      (d === "side"
        ? { armR: "fwd", head: "grin" }
        : { armR: "fling", armL: "fling", head: "grin" }) as never,
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle0", "idle2", "idle1", "idle0"], fps: 5 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 8 },
    chatter: {
      frames: ["chatter0", "chatter1", "chatter0", "chatter1", "chatter2", "chatter2", "idle0"],
      fps: 7,
      loop: false,
    },
  },
  looks: {
    maker: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "rolled",
        face: "chatty",
        hair: "shoved",
        accessory: "laserGoggles",
        book: "screwdriver",
      },
      slots: { skin: "warm", hair: "chestnut" },
    },
  },
});

// 윤서하 --------------------------------------------------------------------------------------

/**
 * 윤서하: exact, impatient with sloppy numbers, never late. Long black hair tucked behind one
 * ear with a mechanical pencil parked there, the blazer buttoned and the tie straight, a vernier
 * caliper in hand. She checks her watch; she measures with one eye shut.
 */
const seohaPalette: Legend = { ...ink, A: "gold.light", B: "gold.mid" };

const tucked = part({
  palette: seohaPalette,
  pieces: {
    head: {
      at: { down: [4, 2], up: [4, 2], side: [0, 2] },
      down: `
        ....XXXXXXXX....
        ..XXHHHxhHHhXX..
        .XHHhhhxXhhhhhX.
        XHHhhhhXhhhhhhxX
        XHhhhhxXxhhhhhxX
        XhhhhhxhhxhhhxxX
        Xhhx........xhAX
        Xhx..........xAX
        Xhx...........X.
        Xhx.............
        XhX.............
        XhX.............
        XhX.............
        XhX.............
        .XX.............
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
  },
});

const level = part({
  palette: seohaPalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...e,....,e...
          ...ee....ee...
          ......--......
        `,
        read: `
          ..............
          ...ee....ee...
          ......--......
        `,
        squint: `
          ...e,.........
          ...ee....--...
          .......-......
        `,
      },
      up: null,
      side: {
        rest: `
          ...........e,..
          ...........ee..
          ...............
          .............-.
        `,
        read: `
          ...............
          ...........ee..
          ...............
          .............-.
        `,
        squint: `
          ...............
          ...........--..
          ...............
          .............-.
        `,
      },
    },
  },
});

const buttoned = garment(
  { ...seohaPalette, ...BLAZER },
  {
    down: `
      NNwmmwNN
      NVwmrwvN
      NVVmrvnN
      NVVmrvnN
      NvvaavnN
      NvvvvvnN
      NNNNNNNN
    `,
    up: `
      NNNNNNNN
      NVvvvvnN
      NVvvvvnN
      NVvvvvnN
      NvvvvvnN
      NvvvvvnN
      NNNNNNNN
    `,
    side: `
      NNwwmN
      NVvwmN
      NVvVmN
      NvvVrN
      NvvVrN
      NvvVrN
      NNNNNN
    `,
  },
  true,
);

/** A vernier caliper: the steel beam and its jaw, raised to read against the light. */
const CALIPER = "GGGG\nGqqG\nGqG.\nGqG.\nGqG.\nGGG.";
const RAISED = "GGGGG\nGqqqG\nGGGqG\n..GqG\n..GqG\n..GGG";
const caliper = part({
  palette: seohaPalette,
  pieces: {
    hand: {
      at: { down: [2, 17], up: [18, 16], side: [3, 19] },
      down: { rest: CALIPER, eye: { at: [0, 2], grid: RAISED } },
      up: { rest: CALIPER, eye: { at: [18, 2], grid: RAISED } },
      side: {
        rest: "GGG\nGqG\nGqG\nGGG",
        eye: { at: [0, 12], grid: "GGGG\nGqqG\nGGqG\n.GqG\n.GqG\n.GGG" },
      },
    },
  },
});

const watch = (d: Dir) => (d === "up" ? {} : { armR: "read", head: "read" });

const seoha = rig({
  name: "seoha",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { buttoned },
    face: { level },
    hair: { tucked },
    book: { caliper },
  },
  frames: {
    idle0: {},
    idle1: { torso: [0, 1], hand: [0, 1] },
    watch: (d) => watch(d) as never,
    walk0: (d) => walkArms(d, "R") as never,
    walk1: { torso: [0, -1], tail: [0, 1], hand: [0, -1] },
    walk2: (d) => walkArms(d, "L") as never,
    walk3: { torso: [0, -1], tail: [0, 1], hand: [0, -1] },
    measure0: { armR: "raise", hand: "eye" },
    measure1: { armR: "raise", hand: "eye", head: "squint" },
  },
  anim: {
    idle: {
      frames: ["idle0", "idle0", "idle1", "idle0", "idle0", "watch", "watch", "idle0"],
      fps: 3,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 7 },
    measure: {
      frames: ["idle0", "measure0", "measure1", "measure1", "measure1", "measure0", "idle0"],
      fps: 4,
      loop: false,
    },
  },
  looks: {
    leader: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "buttoned",
        face: "level",
        hair: "tucked",
        book: "caliper",
      },
      slots: { skin: "fair", hair: "black" },
    },
  },
});

export default [garam, seoha];
