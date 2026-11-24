import { type Legend, part, rig } from "../../format.ts";

/** One legend for every student part. Skin, hair and jacket are swap slots. */
const ink: Legend = {
  ".": null,
  O: "skin.deep",
  k: "skin.dark",
  s: "skin.mid",
  S: "skin.light",
  X: "hair.deep",
  x: "hair.dark",
  h: "hair.mid",
  H: "hair.light",
  J: "jacket.deep",
  j: "jacket.dark",
  c: "jacket.mid",
  C: "jacket.light",
  N: "navy.deep",
  n: "navy.dark",
  v: "navy.mid",
  V: "navy.light",
  w: "stone.bright",
  q: "stone.light",
  R: "red.dark",
  r: "red.mid",
  b: "wood.deep",
  B: "wood.dark",
  e: "ink.deep",
  z: "ink.dark",
  T: "clay.deep",
  t: "clay.mid",
  u: "clay.light",
  p: "stone.pale",
  L: "sea.pale",
  g: "ink.mid",
};

const shadow = part({
  palette: ink,
  pieces: {
    ground: {
      at: [3, 21],
      down: `
        .zzzzzzzz.
        zzzzzzzzzz
        .zzzzzzzz.
      `,
      up: `
        .zzzzzzzz.
        zzzzzzzzzz
        .zzzzzzzz.
      `,
      side: `
        .zzzzzzzz.
        zzzzzzzzzz
        .zzzzzzzz.
      `,
    },
  },
});

const body = part({
  palette: ink,
  pieces: {
    head: {
      at: [3, 3],
      down: `
        ..OOOOOO..
        .OsSSSSsO.
        OsSSSSSSsO
        OsSSSSSSsO
        OsSSSSSSsO
        OsSSSSSSkO
        OSSSSSSSSO
        .OSSSSSSO.
        ..OOOOOO..
      `,
      up: `
        ..OOOOOO..
        .OsssssskO
        OsssssssO.
        OsssssskO.
        OsssssskO.
        OsssssskO.
        OksssskkO.
        .OkkkkkO..
        ..OOOOOO..
      `,
      side: `
        ..OOOOOO..
        .OsSSSSSO.
        OsSSSSSSSO
        OsSSSSSSSO
        OsSSSSSSSO
        OsSSSSSSSO
        OsSSSSSSSO
        .OSSSSSSO.
        ..OOOOOO..
      `,
    },
  },
});

const face = part({
  palette: ink,
  lone: "e",
  pieces: {
    head: {
      at: [4, 8],
      down: {
        rest: `
          .e....e.
          .e....e.
          ...OO...
        `,
        hurt: `
          ........
          ee....ee
          ...OO...
        `,
        ko: `
          ........
          .ee..ee.
          ...OO...
        `,
      },
      up: null,
      side: {
        rest: `
          ......e.
          ......e.
          .......O
        `,
        hurt: `
          ........
          .....ee.
          .......O
        `,
        ko: `
          ........
          .....ee.
          .......O
        `,
      },
    },
  },
});

const short = part({
  palette: ink,
  pieces: {
    head: {
      at: [2, 1],
      down: `
        ...XXXXXX...
        ..XHHhhhhX..
        .XHHhhhhhhX.
        XHHhhhhhhhxX
        XHhhhhhhhhxX
        XhhhhhXhhhxX
        XxxxxxXxxxxX
        XxX......XxX
        .X........X.
      `,
      up: `
        ...XXXXXX...
        ..XHHhhhhX..
        .XHHhhhhhhX.
        XHhhhhhhhhxX
        XhhhhhhhhhxX
        XhhhhhhhhxxX
        XhhhhhhhhxxX
        XhhhhhhhxxxX
        XxhhhhhxxxxX
        .XxxxxxxxxX.
        ..XXXXXXXX..
      `,
      side: `
        ...XXXXX....
        ..XHHhhhX...
        .XHHhhhhhX..
        XHhhhhhhhhX.
        XhhhhhhhhhxX
        XhhhhhhxxxxX
        XhhhxXXXX...
        XhhxX.......
        XxxX........
        .XX.........
      `,
    },
  },
});

const bob = part({
  palette: ink,
  pieces: {
    head: {
      at: [1, 1],
      down: `
        ....XXXXXX....
        ...XHHhhhhX...
        ..XHHhhhhhhX..
        .XHHhhhhhhhxX.
        .XHhhhhhhhhxX.
        .XhhhhhXhhhxX.
        XhxxxxxXxxxxxX
        XhxX......XxxX
        XhxX......XxxX
        XhxX......XxxX
        .XXX......XXX.
      `,
      up: `
        ....XXXXXX....
        ...XHHhhhhX...
        ..XHHhhhhhhX..
        .XHHhhhhhhhxX.
        .XHhhhhhhhhxX.
        XHhhhhhhhhhxxX
        XhhhhhhhhhhxxX
        XhhhhhhhhhxxxX
        XhhhhhhhhhxxxX
        XhhhhhhhhxxxxX
        .XXXXXXXXXXXX.
      `,
      side: `
        ...XXXXXX.....
        ..XHHhhhhX....
        .XHHhhhhhhX...
        XHHhhhhhhhhX..
        XHhhhhhhhhhxX.
        XhhhhhhhhxxxX.
        XhhhhhxXXXX...
        XhhhhxX.......
        XhhhhxX.......
        XhhhxxX.......
        XxxxxX........
        .XXXX.........
      `,
    },
  },
});

const blazer = part({
  palette: ink,
  pieces: {
    armL: {
      at: [2, 12],
      down: `
        .NN
        NVN
        NVN
        NvN
        NvN
        OsO
        OsO
        .O.
      `,
      up: `
        .NN
        NVN
        NVN
        NvN
        NvN
        OsO
        OsO
        .O.
      `,
      side: null,
    },
    armR: {
      at: { down: [11, 12], up: [11, 12], side: [5, 12] },
      down: `
        NN.
        NnN
        NnN
        NnN
        NnN
        OkO
        OkO
        .O.
      `,
      up: `
        NN.
        NnN
        NnN
        NnN
        NnN
        OkO
        OkO
        .O.
      `,
      side: `
        .NN.
        NVvN
        NVvN
        NnnN
        OssO
        OOOO
      `,
    },
    torso: {
      at: { down: [4, 12], up: [4, 12], side: [5, 12] },
      down: `
        NVwwwwnN
        NVwrrwnN
        NVvrRvnN
        NVvrRvnN
        NvvvvvnN
        NvvvvnnN
        NNNNNNNN
      `,
      up: `
        NNNNNNNN
        NVvvvvnN
        NVvvvvnN
        NVvvvvnN
        NvvvvvnN
        NvvvvnnN
        NNNNNNNN
      `,
      side: `
        .NNNwN
        NVvvwN
        NVvvrN
        NVvvrN
        NvvvvN
        NvvvvN
        NNNNNN
      `,
    },
    legL: {
      at: { down: [4, 18], up: [4, 18], side: [4, 18] },
      down: `
        NvvN
        NvvN
        NvvN
        NBBN
        NNNN
      `,
      up: `
        NvvN
        NvvN
        NvvN
        NBBN
        NNNN
      `,
      side: `
        NNNN
        NnnN
        NnnN
        NNNN
        NNNN
      `,
    },
    legR: {
      at: { down: [8, 18], up: [8, 18], side: [7, 18] },
      down: `
        NnnN
        NnnN
        NnnN
        NBBN
        NNNN
      `,
      up: `
        NnnN
        NnnN
        NnnN
        NBBN
        NNNN
      `,
      side: `
        NNNN.
        NvvN.
        NvvN.
        NBBBN
        NNNNN
      `,
    },
  },
});

const varsity = part({
  palette: ink,
  pieces: {
    armL: {
      at: [2, 12],
      down: `
        .JJ
        JCJ
        JCJ
        JpJ
        JpJ
        OsO
        OsO
        .O.
      `,
      up: `
        .JJ
        JCJ
        JCJ
        JpJ
        JpJ
        OsO
        OsO
        .O.
      `,
      side: null,
    },
    armR: {
      at: { down: [11, 12], up: [11, 12], side: [5, 12] },
      down: `
        JJ.
        JjJ
        JjJ
        JpJ
        JpJ
        OkO
        OkO
        .O.
      `,
      up: `
        JJ.
        JjJ
        JjJ
        JpJ
        JpJ
        OkO
        OkO
        .O.
      `,
      side: `
        .JJ.
        JCcJ
        JCcJ
        JppJ
        OssO
        OOOO
      `,
    },
    torso: {
      at: { down: [4, 12], up: [4, 12], side: [5, 12] },
      down: `
        JCwwwwjJ
        JCwrrwjJ
        JCprRcjJ
        JCprRcjJ
        JcccccjJ
        JppppppJ
        JJJJJJJJ
      `,
      up: `
        JJJJJJJJ
        JCccccjJ
        JCcppcjJ
        JCcppcjJ
        JcccccjJ
        JppppppJ
        JJJJJJJJ
      `,
      side: `
        .JJJwJ
        JCccwJ
        JCccrJ
        JCccrJ
        JppppJ
        JppppJ
        JJJJJJ
      `,
    },
  },
});

const glasses = part({
  palette: ink,
  lone: "L",
  pieces: {
    head: {
      at: [4, 8],
      down: `
        gLggggLg
        g.g..g.g
      `,
      up: null,
      side: `
        ....ggLg
        .....g.g
      `,
    },
  },
});

const textbook = part({
  palette: ink,
  pieces: {
    hand: {
      at: { down: [11, 17], up: [11, 17], side: [8, 16] },
      down: `
        TTTT
        TuuT
        TttT
        TwwT
        TTTT
      `,
      up: null,
      side: `
        TTTT
        TuuT
        TTTT
      `,
    },
  },
});

export default rig({
  name: "student",
  size: [16, 24],
  origin: [8, 22],
  directions: ["down", "up", "side"],
  bones: {
    ground: null,
    armL: "torso",
    legL: null,
    legR: null,
    torso: null,
    armR: "torso",
    head: "torso",
    hand: "armR",
  },
  layers: ["shadow", "body", "uniform", "jacket", "face", "hair", "accessory", "book"],
  unchecked: ["shadow"],
  parts: {
    shadow: { blob: shadow },
    body: { base: body },
    uniform: { blazer },
    jacket: { varsity },
    face: { calm: face },
    hair: { short, bob },
    accessory: { glasses },
    book: { textbook },
  },
  frames: {
    idle0: {},
    idle1: { torso: [0, 1] },
    walk0: (d) =>
      d === "side"
        ? { legL: [-1, 0], legR: [1, -1] }
        : { legL: [0, -1], armL: [0, -1], armR: [0, 1] },
    walk1: { torso: [0, -1] },
    walk2: (d) =>
      d === "side"
        ? { legL: [1, -1], legR: [-1, 0] }
        : { legR: [0, -1], armL: [0, 1], armR: [0, -1] },
    walk3: { torso: [0, -1] },
    attack0: (d) => ({ armR: d === "side" ? [1, -1] : [1, -3] }),
    attack1: (d) => ({ torso: [0, 1], armR: d === "side" ? [3, 0] : [0, 1] }),
    attack2: (d) => ({ torso: [0, 1], armR: d === "side" ? [2, 0] : [0, 0] }),
    attack3: (d) => ({ armR: d === "side" ? [0, 0] : [0, -1] }),
    hit: (d) => ({
      torso: [0, -1],
      armL: [-1, -1],
      armR: d === "side" ? [2, 0] : [1, -1],
      head: "hurt",
    }),
    ko: (d) => ({
      torso: [0, 3],
      armL: [-1, 0],
      armR: d === "side" ? [0, 0] : [1, -1],
      head: "ko",
    }),
  },
  anim: {
    idle: { frames: ["idle0", "idle1"], fps: 2 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 8 },
    attack: { frames: ["attack0", "attack1", "attack2", "attack3"], fps: 12, loop: false },
    hit: { frames: ["hit"], fps: 1, loop: false },
    ko: { frames: ["ko"], fps: 1, loop: false },
  },
  looks: {
    blazer: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "blazer",
        face: "calm",
        hair: "short",
        book: "textbook",
      },
      slots: { skin: "fair", hair: "black" },
    },
    varsity: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "blazer",
        jacket: "varsity",
        face: "calm",
        hair: "bob",
        accessory: "glasses",
        book: "textbook",
      },
      slots: { skin: "warm", hair: "pink", jacket: "crimson" },
    },
  },
});
