import { type Dir, type Legend, part, rig } from "../../format.ts";
import { frame, garment, ink, lone, shadow, skin, walkArms } from "./student.ts";

/** The student legend plus the cast's own materials. */
const cast: Legend = {
  ...ink,
  K: "plum.deep",
  P: "plum.dark",
  Q: "plum.mid",
  Y: "plum.light",
  B: "wood.dark",
  o: "wood.mid",
  Z: "sea.deep",
};

// 권 사감 -------------------------------------------------------------------------------------

/**
 * 권 사감, the dorm supervisor. Scarier than Aristotle, never off duty: a tight perm, a plum
 * tracksuit zipped to the chin, a clipboard, and the whistle that stops even bosses mid-swing.
 */
const perm = part({
  palette: cast,
  pieces: {
    head: {
      at: { down: [4, 1], up: [4, 1], side: [2, 1] },
      down: `
        ....XX.XX.XX....
        ..XXHHXHHXhhXX..
        .XHHHhhhhhhhhhX.
        XHHhhhhhhhhhhxxX
        XHhhhhhhhhhhxxxX
        XhhxxhhxxhhxxxxX
        Xhx..........xxX
        Xhx..........xxX
        XhX..........XxX
        .X............X.
      `,
      up: `
        ....XX.XX.XX....
        ..XXHHXHHXhhXX..
        .XHHHhhhhhhhhhX.
        XHHhhhhhhhhhhxxX
        XHhhhhhhhhhhxxxX
        XhhhhhhhhhhhxxxX
        XhhxxhhxxhhxxxxX
        XhhhhhhhhhhhxxxX
        XxxhhxxhhxxhhxxX
        .XhhhhhhhhhxxxX.
        ..XXXXXXXXXXXX..
        .....X....X.....
      `,
      side: `
        ....XX.XX.XX.....
        ..XXHHXHHXhhXX...
        .XHHHhhhhhhhhhX..
        XHHhhhhhhhhhhxxX.
        XHhhhhhhhhhhhxxxX
        XhhxxhhxxhhxxhxxX
        Xhhhhhhhhhx......
        XxxhhxxhX........
        XhhhhhhhX........
        XxxhhxxX.........
        .XXXXXX..........
      `,
    },
  },
});

const stern = part({
  palette: cast,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...**....**...
          ...*^....^*...
          ......--......
        `,
        blow: `
          ...**....**...
          ...**....**...
          ..''......''..
        `,
      },
      up: null,
      side: {
        rest: `
          ...........***.
          ............*..
          ...............
          ...........--..
        `,
        blow: `
          ...........***.
          ...........**..
          ...........''..
        `,
      },
    },
  },
});

const tracksuit = garment(
  {
    "1": "plum.deep",
    "2": "plum.light",
    "3": "plum.dark",
    "4": "plum.deep",
    "5": "plum.mid",
    "6": "plum.dark",
    e: "plum.deep",
    i: "plum.mid",
    I: "plum.light",
    z: "plum.dark",
    K: "plum.deep",
    P: "plum.dark",
    Q: "plum.mid",
    Y: "plum.light",
  },
  {
    down: `
      KYYQQQPK
      KYQgQQPK
      KYQgQQPK
      KQQgQQPK
      KQQgQPPK
      KQQgQPPK
      KKKKKKKK
    `,
    up: `
      KKKKKKKK
      KYQQQQPK
      KYQQQQPK
      KYQQQQPK
      KQQQQPPK
      KQQQQPPK
      KKKKKKKK
    `,
    side: `
      KKKKgK
      KYQKgK
      KYQQgK
      KQQQgK
      KQQQgK
      KQQQgK
      KKKKKK
    `,
  },
  true,
);

/** On a red cord. It comes up to the mouth and the whole field goes quiet. */
const whistle = part({
  palette: cast,
  lone,
  pieces: {
    torso: {
      at: { down: [9, 13], up: [9, 13], side: [12, 13] },
      down: {
        rest: `
          m....m
          .mmmm.
          .GqqG.
          .GGGG.
        `,
        blow: { at: [10, 10], grid: "GGGG\nGqqG\nGGGG" },
      },
      up: null,
      side: {
        rest: `
          .m
          .m
          GG
        `,
        blow: { at: [16, 11], grid: "GGG\nG~G\nGGG" },
      },
    },
  },
});

const clipboard = part({
  palette: cast,
  pieces: {
    hand: {
      at: { down: [2, 17], up: [18, 17], side: [11, 15] },
      down: `
        .GG.
        WwwW
        WqqW
        WwwW
        WqqW
        WWWW
      `,
      up: `
        WWW
        WoW
        WoW
        WoW
        WWW
      `,
      side: closedBoard(),
    },
  },
});

function closedBoard(): string {
  return `
    WGGW
    WwwW
    WqqW
    WwwW
    WWWW
  `;
}

const blow = (d: Dir, lift: number) =>
  d === "side"
    ? { torso: ["blow", 0, -lift] as const, head: "blow", hand: [0, -lift] as const }
    : {
        torso: ["blow", 0, -lift] as const,
        head: "blow",
        armL: "mouth",
        hand: [0, -lift] as const,
      };

const sagam = rig({
  name: "sagam",
  ...frame,
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { tracksuit },
    face: { stern },
    hair: { perm },
    accessory: { whistle },
    book: { clipboard },
  },
  frames: {
    idle0: {},
    idle1: { torso: [0, 1], hand: [0, 1] },
    walk0: (d) => walkArms(d, "R") as never,
    walk1: { torso: [0, -1], hand: [0, -1] },
    walk2: (d) => walkArms(d, "L") as never,
    walk3: { torso: [0, -1], hand: [0, -1] },
    whistle0: (d) => blow(d, 0) as never,
    whistle1: (d) => blow(d, 1) as never,
  },
  anim: {
    idle: { frames: ["idle0", "idle0", "idle0", "idle1"], fps: 2 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    whistle: {
      frames: ["idle0", "whistle0", "whistle1", "whistle1", "whistle1", "whistle1", "whistle0"],
      fps: 6,
      loop: false,
    },
  },
  looks: {
    duty: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "tracksuit",
        face: "stern",
        hair: "perm",
        accessory: "whistle",
        book: "clipboard",
      },
      slots: { skin: "warm", hair: "black" },
    },
  },
});

// 도현우 -------------------------------------------------------------------------------------

/**
 * 도현우, second year, R&E team 0조. Stayed behind when the rift opened and lost pieces of that
 * night. Tired and kind; holds the notebook with twelve torn-out pages close to his chest and
 * keeps looking down at it as if it might answer.
 */
const mop = part({
  palette: cast,
  pieces: {
    head: {
      at: { down: [4, 1], up: [4, 1], side: [2, 1] },
      down: `
        .....XXXXXX.....
        ...XXHHhhhhXX...
        ..XHHhhhhhhhhX..
        .XHHhhhhhhhhhxX.
        .XHhhhhhhhhhhxX.
        XhhhhhhxhhhhhxxX
        XhhxhhxhhhhhhhxX
        Xhx........hhxxX
        Xhx..........xxX
        .XX..........XX.
      `,
      up: `
        .....XXXXXX.....
        ...XXHHhhhhXX...
        ..XHHhhhhhhhhX..
        .XHHhhhhhhhhhxX.
        .XHhhhhhhhhhhxX.
        XhhhhhhhhhhhhxxX
        XhhhhhhhhhhhxxxX
        XhhhxhhhxhhhxxxX
        XhhhxhhhxhhxxxxX
        .XhhhhhhhhhxxxX.
        ..XXXXXXXXXXXX..
        .....X....X.....
      `,
      side: `
        .....XXXXXX......
        ...XXHHhhhhXX....
        ..XHHhhhhhhhhX...
        .XHHhhhhhhhhhhX..
        XHhhhhhhhhhhhhxX.
        XhhhhhhhhhhhhhhxX
        XhhhhhhhxxhhxxhX.
        Xhhhhhhx.........
        XhhhhhX..........
        .XhhxxX..........
        ..XXXX...........
      `,
    },
  },
});

const tired = part({
  palette: cast,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...--....--...
          ...^*....^*...
          ...,,....,,...
          ......--......
        `,
        look: `
          ..............
          ...--....--...
          ...,,....,,...
          ......--......
        `,
      },
      up: null,
      side: {
        rest: `
          ............--.
          ...........^*..
          ...........,...
          ............-..
        `,
        look: `
          ...............
          ...........--..
          ...........,...
          ............-..
        `,
      },
    },
  },
});

/** The blazer worn open over an untucked shirt, tie pulled loose. */
const loose = garment(
  {
    "1": "navy.deep",
    "2": "navy.light",
    "3": "navy.dark",
    "4": "navy.deep",
    "5": "navy.mid",
    "6": "navy.dark",
  },
  {
    down: `
      NVwwwwNN
      NVwmmwnN
      NVwwrwvN
      NvwwrwvN
      NvwwwwvN
      NvwwwwnN
      NNwwwwNN
    `,
    up: `
      NNNNNNNN
      NVvvvvnN
      NVvvvvnN
      NVvvvvnN
      NvvvnvnN
      NvvvnvnN
      NNNNNNNN
    `,
    side: `
      NNNwwN
      NVvwmN
      NVvwmN
      NVvwwN
      NvvvwN
      NvvvwN
      NNNNwN
    `,
  },
  true,
);

/** 0조 연구노트: the shared notebook, twelve stubs where pages used to be. */
const notebook = part({
  palette: cast,
  lone: "~",
  pieces: {
    hand: {
      at: { down: [10, 14], up: [10, 14], side: [11, 13] },
      down: {
        rest: `
          ZZZZZZ
          ~ZllbZ
          ZZwwbZ
          ~ZllbZ
          ZZlbbZ
          ZZZZZZ
        `,
        open: `
          ZZZZZZ
          ZwwwwZ
          ~ZllbZ
          ZZwwbZ
          ~ZllbZ
          ZZZZZZ
        `,
      },
      up: ".",
      side: `
        ZZZZ
        ZllZ
        ZwwZ
        ZllZ
        ZbbZ
        ZbbZ
        ZZZZ
      `,
    },
  },
});

/** Both arms around the notebook from the front and back; from the side it rests on the hip. */
const holding = (d: Dir) => (d === "side" ? {} : { armR: "read", armL: "read" });

const hyunwoo = rig({
  name: "hyunwoo",
  ...frame,
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { loose },
    face: { tired },
    hair: { mop },
    book: { notebook },
  },
  frames: {
    idle0: (d) => holding(d) as never,
    idle1: (d) => ({ ...holding(d), torso: [0, 1], hand: [0, 1] }) as never,
    walk0: (d) =>
      ({
        ...holding(d),
        ...(d === "side" ? { legR: "fwd", legL: "back" } : { legL: "lift" }),
      }) as never,
    walk1: (d) => ({ ...holding(d), torso: [0, -1], hand: [0, -1] }) as never,
    walk2: (d) =>
      ({
        ...holding(d),
        ...(d === "side" ? { legL: "fwd", legR: "back" } : { legR: "lift" }),
      }) as never,
    walk3: (d) => ({ ...holding(d), torso: [0, -1], hand: [0, -1] }) as never,
    look0: (d) => ({ ...holding(d), head: "look" }) as never,
    look1: (d) =>
      ({ ...holding(d), head: ["look", 0, 1], hand: ["open", 0, 1], torso: [0, 1] }) as never,
  },
  anim: {
    idle: { frames: ["idle0", "idle0", "idle1", "idle1"], fps: 2 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    remember: {
      frames: ["idle0", "look0", "look1", "look1", "look1", "look1", "look0", "idle0"],
      fps: 4,
      loop: false,
    },
  },
  looks: {
    tired: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "loose",
        face: "tired",
        hair: "mop",
        book: "notebook",
      },
      slots: { skin: "fair", hair: "brown" },
    },
  },
});

export default [sagam, hyunwoo];
