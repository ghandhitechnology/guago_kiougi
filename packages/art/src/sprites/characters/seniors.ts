import { swapPart } from "../../figure.ts";
import { type Dir, type Legend, part, rig } from "../../format.ts";
import { frame, garment, ink, lone, shadow, skin, walkArms } from "./student.ts";

/**
 * The five class seniors who hold the stairs on the night of the rift and later give each
 * class its 전직. Each wears the school shirt under their class 과잠, in the colour of the class
 * emblem (수학 navy, 물리 crimson, 생명 forest, 지구과학 mustard; 화학 wears the lab coat), and
 * carries their class kit.
 */

/** The 하복 shirt and tie under every 과잠. */
const shirt = garment(
  {
    ...ink,
    "1": "stone.deep",
    "2": "stone.bright",
    "3": "stone.light",
    "4": "skin.deep",
    "5": "skin.mid",
    "6": "skin.dark",
  },
  {
    down: `
      GGwmmwGG
      GwwmrwqG
      GpwmrwqG
      GppmrqqG
      GwppppqG
      GwppppqG
      GGGGGGGG
    `,
    up: `
      GGGGGGGG
      GwppppqG
      GwppppqG
      GwppppqG
      GwpppqqG
      GwpppqqG
      GGGGGGGG
    `,
    side: `
      GGwwmG
      GwpwmG
      GwppmG
      GwpprG
      GwpprG
      GwpprG
      GGGGGG
    `,
  },
  true,
);

/** The 과잠, worn open: body in the class colour (the jacket slot), cream sleeves. */
const kwajam = garment(
  {
    ...ink,
    "1": "jacket.deep",
    "2": "stone.bright",
    "3": "stone.light",
    "4": "jacket.deep",
    "5": "stone.pale",
    "6": "stone.light",
  },
  {
    down: `
      JCj..jcJ
      JCj..jcJ
      JCj..jcJ
      Jwj..jcJ
      Jwj..jcJ
      JJJ..JJJ
      JJJ..JJJ
    `,
    up: `
      JjjjjjjJ
      JCccccjJ
      JCwwwwjJ
      JCwppwjJ
      JCwwwwjJ
      JjjjjjjJ
      JJJJJJJJ
    `,
    side: `
      JJJJJ.
      JcccJ.
      JcccJ.
      JcccJ.
      JcccJ.
      JJJJJ.
      JJJJJ.
    `,
  },
  false,
);

const look = (
  hair: string,
  face: string,
  book: string,
  slots: Record<string, string>,
  extra: Record<string, string> = {},
) => ({
  parts: {
    shadow: "blob",
    body: "base",
    uniform: "shirt",
    jacket: "kwajam",
    face,
    hair,
    book,
    ...extra,
  },
  slots,
});

const walking = {
  walk0: (d: Dir) => walkArms(d, "R") as never,
  walk1: { torso: [0, -1], tail: [0, 1], hand: [0, -1] },
  walk2: (d: Dir) => walkArms(d, "L") as never,
  walk3: { torso: [0, -1], tail: [0, 1], hand: [0, -1] },
} as const;

// 석지안 · 수학 -------------------------------------------------------------------------------

/**
 * 석지안, 3학년 수학: says what is optimal and stops. A side parting you could measure, thin
 * square frames he keeps pushing up, the navy 과잠, and a set square he sights along like a
 * rifle before every hit.
 */
const mathPalette: Legend = { ...ink, T: "sea.deep", A: "sea.pale", B: "sea.light" };

const parting = part({
  palette: mathPalette,
  pieces: {
    head: {
      at: { down: [5, 2], up: [5, 2], side: [0, 2] },
      down: `
        ......XXXX....
        ...XXXHHhhXX..
        ..XHHXHhhhhhX.
        .XHhXhhhhhhhxX
        XHhXhhhhhhhhxX
        XhXxxxxhhhxxxX
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
  },
});

const halfRims = part({
  palette: mathPalette,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: `
        ..g..gggg..g..
        ..g..g..g..g..
        ..gggg..gggg..
      `,
      up: null,
      side: `
        ..........g..g.
        ..........g..g.
        ..........ggg..
      `,
    },
  },
});

const precise = part({
  palette: mathPalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...^e....^e...
          ...ee....ee...
          ..............
          ......--......
        `,
        aim: `
          ...^e.........
          ...ee....--...
          ..............
          ......--......
        `,
      },
      up: null,
      side: {
        rest: `
          ...........^e..
          ...........ee..
          ...............
          .............-.
        `,
        aim: `
          ...........^e..
          ...........ee..
          ...............
          ............--.
        `,
      },
    },
  },
});

const SQUARE = "T...\nTT..\nTAT.\nTAAT\nTTTT";
const setSquare = part({
  palette: mathPalette,
  pieces: {
    hand: {
      at: { down: [2, 17], up: [18, 17], side: [5, 18] },
      down: {
        rest: SQUARE,
        aim: { at: [7, 17], grid: "TTTTTT\nTAAAAT\n.TAAT.\n..TT.." },
      },
      up: { rest: SQUARE, aim: "." },
      side: {
        rest: SQUARE,
        aim: { at: [18, 11], grid: "TT....\nTATT..\nTAAATT\nTTTTTT" },
      },
    },
  },
});

const math = rig({
  name: "senior-math",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { shirt },
    jacket: { kwajam },
    face: { precise },
    hair: { parting },
    accessory: { halfRims },
    book: { setSquare },
  },
  frames: {
    idle0: {},
    idle1: { torso: [0, 1], hand: [0, 1] },
    push: (d) =>
      (d === "down" ? { armL: "mouth" } : d === "side" ? { armR: "mouth" } : {}) as never,
    ...walking,
    aim0: (d) => ({ armR: "strike", hand: "aim", head: d === "up" ? "rest" : "aim" }) as never,
    aim1: (d) =>
      ({
        armR: "strike",
        hand: ["aim", d === "side" ? 1 : 0, d === "down" ? 1 : 0],
        head: "aim",
      }) as never,
  },
  anim: {
    idle: {
      frames: ["idle0", "idle0", "idle0", "idle1", "idle0", "push", "push", "idle0"],
      fps: 3,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    aim: { frames: ["idle0", "aim0", "aim0", "aim1", "aim0", "idle0"], fps: 5, loop: false },
  },
  looks: {
    math: look(
      "parting",
      "precise",
      "setSquare",
      { skin: "fair", hair: "blue", jacket: "navy" },
      {
        accessory: "halfRims",
      },
    ),
  },
});

// 배도윤 · 물리 -------------------------------------------------------------------------------

/**
 * 배도윤, 2학년 물리: delighted by every collision, never still. Spiky hair under a plum
 * sweatband, the plum 과잠 of the 물리 class, and a textbook he keeps tossing up to watch it
 * come down. His signature is the throw.
 */
const physicsPalette: Legend = { ...ink };

const spikes = part({
  palette: physicsPalette,
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
        XhhxhhhxxhhhxxxX
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
        ...XhHhhhhhhhhxxX...
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

const sweatband = part({
  palette: { ...physicsPalette, R: "plum.deep", r: "plum.dark", m: "plum.mid", M: "plum.light" },
  pieces: {
    head: {
      at: { down: [5, 5], up: [5, 5], side: [5, 5] },
      down: `
        RRRRRRRRRRRRRR
        RmmmmmMMmmmrrR
      `,
      up: `
        RRRRRRRRRRRRRR
        RrrrrrrrrrrrrR
      `,
      side: `
        RRRRRRRRRRR
        RrrrrmmmmmR
      `,
    },
  },
});

const delighted = part({
  palette: physicsPalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...^e....^e...
          ...ee....ee...
          ...'.!^^!.'...
          ......!!......
        `,
        shout: `
          ...^e....^e...
          ...ee....ee...
          ...'.!!!!.'...
          .....!!!!.....
        `,
      },
      up: null,
      side: {
        rest: `
          ...........^e..
          ...........ee..
          ...........'.^.
          ............!!.
        `,
        shout: `
          ...........^e..
          ...........ee..
          ...........'!!.
          ...........!!!.
        `,
      },
    },
  },
});

const BOOK = "TTTT\nTUuT\nTUuT\nTyyT\nTTTT";
const tossBook = part({
  palette: physicsPalette,
  pieces: {
    hand: {
      at: { down: [2, 17], up: [18, 17], side: [5, 18] },
      down: {
        rest: BOOK,
        toss: { at: [0, 7], grid: "TTTT\nTUUT\nTyyT\nTTTT" },
        raise: { at: [0, 2], grid: ".TTTT\nTUuuT\nTUuuT\nTuuuT\nTyyyT\nTTTT." },
        fly: { at: [7, 18], grid: "TTTTTT\nTUuuuT\nTUuuuT\nTyyyyT\nTTTTTT" },
      },
      up: {
        rest: "TTT\nTtT\nTtT\nTtT\nTTT",
        toss: { at: [20, 7], grid: "TTT\nTtT\nTtT\nTTT" },
        raise: { at: [18, 3], grid: ".TTT.\nTtttT\nTtttT\nTtttT\nTTTTT" },
        fly: ".",
      },
      side: {
        rest: BOOK,
        toss: { at: [1, 9], grid: "TTTT\nTUUT\nTyyT\nTTTT" },
        raise: { at: [0, 12], grid: "TTTT\nTUuT\nTUuT\nTuuT\nTyyT\nTTTT" },
        fly: { at: [18, 9], grid: "..TT..\n.TUuT.\nTUuuuT\nTyyuT.\n.TTT.." },
      },
    },
  },
});

const physics = rig({
  name: "senior-physics",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { shirt },
    jacket: { kwajam },
    face: { delighted },
    hair: { spikes },
    accessory: { sweatband },
    book: { tossBook },
  },
  frames: {
    idle0: {},
    idle1: { torso: [0, -1], hand: [0, -1] },
    toss0: { torso: [0, -1], hand: "toss" },
    toss1: { hand: ["toss", 0, -2] },
    ...walking,
    throw0: { armR: "raise", hand: "raise" },
    throw1: (d) =>
      ({
        armR: "strike",
        hand: "fly",
        head: "shout",
        torso: d === "side" ? [1, 0] : [0, 1],
      }) as never,
    throw2: { armR: "follow", head: "shout" },
  },
  anim: {
    idle: {
      frames: ["idle0", "idle1", "idle0", "toss0", "toss1", "toss0", "idle0", "idle1"],
      fps: 6,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 9 },
    throw: {
      frames: ["throw0", "throw0", "throw1", "throw2", "throw2", "idle0"],
      fps: 10,
      loop: false,
    },
  },
  looks: {
    physics: look(
      "spikes",
      "delighted",
      "tossBook",
      { skin: "warm", hair: "brown", jacket: "violet" },
      {
        accessory: "sweatband",
      },
    ),
  },
});

// 한소율 · 화학 -------------------------------------------------------------------------------

/**
 * 한소율, 3학년 화학: polite to everyone, first-years included, which frightens them. Violet-
 * black hair in a low tail, safety goggles worn where they belong, over the eyes, a long white
 * lab coat, sea-green gloves and a flask she swirls while she talks. Her signature is the pour.
 */
const chemPalette: Legend = {
  ...ink,
  T: "sea.deep",
  A: "sea.light",
  B: "sea.mid",
  L: "sea.pale",
};

const lowTail = part({
  palette: chemPalette,
  pieces: {
    head: {
      at: { down: [4, 2], up: [4, 2], side: [0, 2] },
      down: `
        ....XXXXXXXX....
        ..XXHHHHhhhhXX..
        .XHHHhhhhhhhhhX.
        XHHhhhhhhhhhhhxX
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
    tail: {
      at: { down: [4, 11], up: [9, 12], side: [3, 12] },
      down: null,
      up: `
        XhhhxX
        XhhhxX
        .XhhxX
        .XhhX.
        ..XX..
      `,
      side: `
        .XhhX.
        .XhhX.
        .XxxX.
        ..XX..
      `,
    },
  },
});

const safetyGoggles = part({
  palette: chemPalette,
  pieces: {
    head: {
      at: { down: [5, 7], up: [5, 7], side: [3, 7] },
      down: `
        TTTTTTTTTTTTTT
        TA....TT....AT
        TA....TT....AT
        TTTTTT..TTTTTT
      `,
      up: `
        TTTTTTTTTTTTTT
      `,
      side: `
        ..TTTTTTTTTTTT.
        ..........TA.T.
        ..........TA.T.
        ..........TTT..
      `,
    },
  },
});

const polite = part({
  palette: chemPalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: `
        ...^e....^e...
        ...ee....ee...
        ...'......'...
        ......--......
      `,
      up: null,
      side: `
        ...........^e..
        ...........ee..
        ...........'...
        .............-.
      `,
    },
  },
});

/** The lab coat over the shirt and tie, long, with sea-green gloves for hands. */
const labCoat = swapPart(
  garment(
    {
      ...chemPalette,
      "1": "stone.deep",
      "2": "stone.bright",
      "3": "stone.light",
      "4": "stone.deep",
      "5": "stone.pale",
      "6": "stone.light",
    },
    {
      down: `
        GwwmmwqG
        GwwmrwqG
        GwBmrBqG
        GwBmrBqG
        GwpppqqG
        GwpppqqG
        GwpppqqG
        GGGGGGGG
      `,
      up: `
        GGGGGGGG
        GwppppqG
        GwppppqG
        GwppppqG
        GwppppqG
        GwppppqG
        GwpppqqG
        GGGGGGGG
      `,
      side: `
        GGwwmG
        GwpwmG
        GwpBrG
        GwpBrG
        GwppqG
        GwppqG
        GwppqG
        GGGGGG
      `,
    },
    true,
  ),
  "O%&@",
  "TABT",
);
const gloved = { ...labCoat, lone: `${labCoat.lone ?? ""}AB` };

const FLASK = ".GG.\n.GG.\nGwwG\nGLLG\nGGGG";
const flask = part({
  palette: chemPalette,
  lone: "~",
  pieces: {
    hand: {
      at: { down: [3, 17], up: [18, 17], side: [6, 17] },
      down: {
        rest: FLASK,
        swirl: { at: [2, 17], grid: ".GG..\n..GG.\n.GwwG\nGLLLG\nGGGG." },
        pour: { at: [0, 2], grid: "GGG..\nGwwGG\nGLLLG\n.GGGG\n...~.\n...~." },
      },
      up: { rest: FLASK, swirl: FLASK, pour: { at: [18, 3], grid: FLASK } },
      side: {
        rest: FLASK,
        swirl: { at: [5, 17], grid: ".GG..\n..GG.\n.GwwG\nGLLLG\nGGGG." },
        pour: { at: [0, 12], grid: "GGG..\nGwwGG\nGLLLG\n.GGGG\n...~.\n...~." },
      },
    },
  },
});

/** A step under the long coat: the body rises as a leg lifts. */
const coatStep = (d: Dir, lead: "R" | "L") => ({
  ...walkArms(d, lead),
  torso: [0, -1],
  hand: d === "side" ? [lead === "R" ? -1 : 1, -1] : [0, -1],
});

const chem = rig({
  name: "senior-chem",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { labCoat: gloved },
    face: { polite },
    hair: { lowTail },
    accessory: { safetyGoggles },
    book: { flask },
  },
  frames: {
    idle0: {},
    idle1: { hand: "swirl" },
    ...walking,
    walk0: (d) => coatStep(d, "R") as never,
    walk1: {},
    walk2: (d) => coatStep(d, "L") as never,
    walk3: {},
    pour0: { armR: "raise", hand: "swirl" },
    pour1: { armR: "raise", hand: "pour" },
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle0", "idle1", "idle0", "idle0"], fps: 4 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    pour: {
      frames: ["idle0", "pour0", "pour1", "pour1", "pour1", "pour0", "idle0"],
      fps: 5,
      loop: false,
    },
  },
  looks: {
    chem: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "labCoat",
        face: "polite",
        hair: "lowTail",
        accessory: "safetyGoggles",
        book: "flask",
      },
      slots: { skin: "fair", hair: "violet" },
    },
  },
});

// 오여름 · 생명 -------------------------------------------------------------------------------

/**
 * 오여름, 2학년 생명: gentle, counting, on the side of anything alive. A green bucket hat over a
 * short bob, the forest 과잠, yellow rubber boots for the 생태공원 pond and a magnifier she
 * peers through at the ground. Her signature: a cell on her palm divides in two.
 */
const bioPalette: Legend = {
  ...ink,
  F: "grass.deep",
  f: "grass.dark",
  B: "grass.mid",
  P: "grass.light",
  Q: "grass.pale",
  d: "gold.dark",
  A: "gold.light",
};

const bucketHat = part({
  palette: bioPalette,
  pieces: {
    head: {
      at: { down: [3, 1], up: [3, 1], side: [0, 1] },
      down: `
        ......FFFFFF......
        ....FFPPPBBBFF....
        ...FPQQPPBBBffF...
        ...FPPPPBBBBffF...
        ...FwwwwwwppppF...
        .FFPPPBBBBBBBffFF.
        FBBBBBBBBBBBBBBffF
        .FFFFFFFFFFFFFFFF.
        ..Xhh........xxX..
        ..Xhh........xxX..
        ..XhX........XxX..
        ..XX..........XX..
      `,
      up: `
        ......FFFFFF......
        ....FFPPPBBBFF....
        ...FPQQPPBBBffF...
        ...FPPPPBBBBffF...
        ...FwwwwwwppppF...
        .FFPPPBBBBBBBffFF.
        FBBBBBBBBBBBBBBffF
        .FFFFFFFFFFFFFFFF.
        .XhhhhhhhhhhhhxxX.
        ..XhhhhhhhhhhxxX..
        ...XhhhhhhhhxxX...
        ....XXXXXXXXXX....
      `,
      side: `
        .....FFFFFF.........
        ...FFPPPBBBFF.......
        ..FPQQPPBBBffF......
        ..FPPPPBBBBffF......
        ..FwwwwwwpppppF.....
        FFPPPBBBBBBBBffFFF..
        FBBBBBBBBBBBBBBBffF.
        .FFFFFFFFFFFFFFFFFF.
        ...XhhhhX...........
        ...XhhhhX...........
        ....XhhX............
        .....XX.............
      `,
    },
  },
});

const gentle = part({
  palette: bioPalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...^e....^e...
          ...ee....ee...
          ...'......'...
          ......--......
        `,
        read: `
          ..............
          ...ee....ee...
          ...'......'...
          ......--......
        `,
      },
      up: null,
      side: {
        rest: `
          ...........^e..
          ...........ee..
          ...........'...
          .............-.
        `,
        read: `
          ...............
          ...........ee..
          ...........'...
          .............-.
        `,
      },
    },
  },
});

const LENS = ".DDD.\nDLLLD\nDLLLD\n.DDD.\n...WW\n...WW";
const magnifier = part({
  palette: { ...bioPalette, D: "gold.deep", L: "sea.pale", W: "wood.deep" },
  pieces: {
    hand: {
      at: { down: [1, 15], up: [18, 16], side: [4, 17] },
      down: {
        rest: LENS,
        peer: { at: [7, 18], grid: ".DDD.\nDLLLD\nDLLLD\n.DDD." },
        cell0: { at: [0, 2], grid: ".FF.\nFPPF\nFBBF\n.FF." },
        cell1: { at: [0, 2], grid: ".FFF.\nFPPBF\nFBBBF\n.FFF." },
        cell2: { at: [0, 1], grid: ".FF..\nFPPF.\n.FF..\n..FF.\n.FPPF\n..FF." },
      },
      up: { rest: LENS, peer: ".", cell0: ".", cell1: ".", cell2: "." },
      side: {
        rest: LENS,
        peer: { at: [17, 17], grid: ".DDD.\nDLLLD\nDLLLD\n.DDD." },
        cell0: { at: [0, 12], grid: ".FF.\nFPPF\nFBBF\n.FF." },
        cell1: { at: [0, 12], grid: "FFFF\nFPPF\nFBBF\nFFFF" },
        cell2: { at: [0, 10], grid: ".FF.\nFPPF\n.FF.\n.FF.\nFPPF\n.FF." },
      },
    },
  },
});

/** Yellow rubber boots for the pond. */
const bootsShirt = swapPart(shirt, "Gw", "DA", ["legL", "legR"]);

const bio = rig({
  name: "senior-bio",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: {
      shirt: { ...bootsShirt, palette: { ...bootsShirt.palette, D: "gold.deep", A: "gold.light" } },
    },
    jacket: { kwajam },
    face: { gentle },
    hair: { bucketHat },
    book: { magnifier },
  },
  frames: {
    idle0: {},
    idle1: { torso: [0, 1], hand: [0, 1] },
    peer: (d) =>
      (d === "up"
        ? { torso: [0, 1] }
        : { armR: "strike", hand: "peer", head: "read", torso: [0, 1] }) as never,
    ...walking,
    divide0: { armR: "raise", hand: "cell0" },
    divide1: { armR: "raise", hand: "cell1" },
    divide2: { armR: "raise", hand: "cell2" },
  },
  anim: {
    idle: { frames: ["idle0", "idle0", "idle1", "idle0", "peer", "peer", "peer", "idle0"], fps: 3 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    divide: {
      frames: [
        "idle0",
        "divide0",
        "divide0",
        "divide1",
        "divide1",
        "divide2",
        "divide2",
        "divide2",
      ],
      fps: 4,
      loop: false,
    },
  },
  looks: {
    bio: look("bucketHat", "gentle", "magnifier", {
      skin: "warm",
      hair: "brown",
      jacket: "forest",
    }),
  },
});

// 우태산 · 지구과학 ---------------------------------------------------------------------------

/**
 * 우태산, 3학년 지구과학: slow, few words, asleep on his feet at the 졸방대 and insisting he is
 * awake. The hood of the mustard 과잠 always up, a heavy fringe, a folded umbrella hooked on
 * the wrist because the forecast is always right. His head nods, then jerks up. His signature
 * is the forecast: a flat hand into the wind, then a point.
 */
const earthPalette: Legend = { ...ink, Z: "stone.bright" };

const hood = part({
  palette: earthPalette,
  pieces: {
    head: {
      at: { down: [3, 1], up: [3, 1], side: [0, 1] },
      down: `
        ....JJJJJJJJJJ....
        ...JJCCCcccccjJJ..
        ..JCCcccccccccjjJ.
        .JCCJJJJJJJJJJcjjJ
        .JCJXXXXXXXXXXJcjJ
        JCcJHHhhhhhhhhJcjJ
        JCcJxxhhxxhhxxJcjJ
        JCcJ..........JcjJ
        JCcJ..........JcjJ
        JCcJ..........JcjJ
        .JCJ..........JjJ.
        ..JJ..........JJ..
      `,
      up: `
        ....JJJJJJJJJJ....
        ...JJCCCcccccjJJ..
        ..JCCcccccccccjjJ.
        .JCccccccccccccjjJ
        .JCccccccccccccjjJ
        JCcccccccccccccjjJ
        JCcccccccccccccjjJ
        JCcccccccccccccjjJ
        JCccccccccccccjjjJ
        .JcccccccccccjjjJ.
        ..JJccccccccjjJJ..
        ....JJJJJJJJJJ....
      `,
      side: `
        ......JJJJJJ........
        ....JJCCCccjJJ......
        ...JCCccccccjjJ.....
        ..JCcccccXXXXXJ.....
        ..JCcccXXhhhhhhX....
        ..JCccXhhhhhhxxX....
        ..JCccXhhhhxx.......
        ..JCccXhhxx.........
        ..JCccjX............
        ..JcccjJ............
        ...JjjJ.............
        ....JJ..............
      `,
    },
  },
});

const sleepy = part({
  palette: earthPalette,
  lone: `${lone}Z`,
  pieces: {
    head: {
      at: { down: [5, 7], up: [5, 7], side: [3, 7] },
      down: {
        rest: `
          ..............
          ...--....--...
          ...,,....,,...
          ..............
          ......--......
        `,
        awake: `
          ..............
          ...^e....^e...
          ...ee....ee...
          ..............
          ......--......
        `,
      },
      up: null,
      side: {
        rest: `
          ...............
          ...........--..
          ...........,,..
          ...............
          .............-.
        `,
        awake: `
          ...............
          ...........^e..
          ...........ee..
          ...............
          .............-.
        `,
      },
    },
  },
});

/** A tiny z over the hood while he sleeps on his feet. */
const snore = part({
  palette: earthPalette,
  lone: "Z",
  pieces: {
    head: {
      at: { down: [17, 0], up: [17, 0], side: [15, 0] },
      down: { rest: "ZZZ\n.Z.\nZZZ", awake: "." },
      up: { rest: "ZZZ\n.Z.\nZZZ", awake: "." },
      side: { rest: "ZZZ\n.Z.\nZZZ", awake: "." },
    },
  },
});

const UMBRELLA = ".NN\nNvN\nNvN\nNvN\nNvN\nNNN\n.N.\n.NN";
const umbrella = part({
  palette: earthPalette,
  pieces: {
    hand: {
      at: { down: [3, 16], up: [18, 16], side: [5, 16] },
      down: { rest: UMBRELLA, point: { at: [7, 19], grid: "NNNNNNNN\nNvvvvvvN\nNNNNNNNN" } },
      up: { rest: UMBRELLA, point: "." },
      side: { rest: UMBRELLA, point: { at: [18, 13], grid: "NNNNN\nNvvvN\nNNNNN" } },
    },
  },
});

const earth = rig({
  name: "senior-earth",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { shirt },
    jacket: { kwajam },
    face: { sleepy },
    hair: { hood },
    accessory: { snore },
    book: { umbrella },
  },
  frames: {
    idle0: {},
    nod: { torso: [0, 1], hand: [0, 1] },
    jerk: { head: "awake", torso: [0, -1], hand: [0, -1] },
    ...walking,
    walk0: (d) => ({ ...walkArms(d, "R"), head: "awake" }) as never,
    walk1: { torso: [0, -1], hand: [0, -1], head: "awake" },
    walk2: (d) => ({ ...walkArms(d, "L"), head: "awake" }) as never,
    walk3: { torso: [0, -1], hand: [0, -1], head: "awake" },
    forecast0: { armL: "raise", head: "awake" },
    forecast1: (d) =>
      ({ armR: "strike", hand: d === "up" ? "rest" : "point", head: "awake" }) as never,
  },
  anim: {
    idle: { frames: ["idle0", "idle0", "nod", "nod", "nod", "jerk", "idle0", "idle0"], fps: 2 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 5 },
    forecast: {
      frames: ["jerk", "forecast0", "forecast0", "forecast0", "forecast1", "forecast1", "idle0"],
      fps: 3,
      loop: false,
    },
  },
  looks: {
    earth: look(
      "hood",
      "sleepy",
      "umbrella",
      { skin: "deep", hair: "black", jacket: "mustard" },
      {
        accessory: "snore",
      },
    ),
  },
});

export default [math, physics, chem, bio, earth];
