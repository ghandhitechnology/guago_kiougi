import { addPoses, swapPart } from "../../figure.ts";
import { type Dir, type Legend, part, rig } from "../../format.ts";
import { frame, garment, ink, lone, shadow, skin, walkArms } from "./student.ts";

/**
 * The staff of 해솔과학고 on the student skeleton: 모 선생님, 교장 선생님, the 보건 선생님 and
 * the 조리사님. Each has an idle with the habit only they have and one signature animation.
 */

const legs = ["legL", "legR"];

/**
 * A step under a long coat or apron: the body rises as a leg lifts, so the lifted leg still
 * shows below the hem.
 */
const coatStep = (d: Dir, lead: "R" | "L") => ({
  ...walkArms(d, lead),
  torso: [0, -1],
  hand: d === "side" ? [lead === "R" ? -1 : 1, -1] : [0, -1],
});
const stepping = (d: Dir, lead: "R" | "L") =>
  d === "side"
    ? lead === "R"
      ? { legR: "fwd", legL: "back" }
      : { legL: "fwd", legR: "back" }
    : lead === "R"
      ? { legL: "lift" }
      : { legR: "lift" };

// 모 선생님 ------------------------------------------------------------------------------------

/**
 * 모 선생님: kind, vague, signing. Salt-and-pepper hair flattened on one side with the strand
 * that never lies down, half-moon readers he looks over, an olive cardigan, a stack of forms
 * against the chest and a pen that never stops moving.
 */
const moPalette: Legend = {
  ...ink,
  B: "olive.deep",
  P: "olive.dark",
  Q: "olive.mid",
  Y: "olive.light",
  d: "wood.mid",
};

const moHair = part({
  palette: moPalette,
  pieces: {
    head: {
      at: { down: [5, 1], up: [5, 1], side: [0, 1] },
      down: `
        ......XXX.....
        .....XhhXX....
        ....XXXhXXX...
        ..XXHHHHhhXX..
        .XHHhhhhhhhxX.
        XHHhhhhhhhhhxX
        XxxxhhxxhhxxxX
        Xg..........gX
        Xg..........gX
      `,
      up: `
        ......XXX.....
        .....XhhXX....
        ....XXXhXXX...
        ..XXHHHHhhXX..
        .XHHHHhhhhhxX.
        XHHhhhhxhhhhxX
        XHhhhhxhhhhhxX
        XhhhhxhhhxhxxX
        XghhhxhhhxhxgX
        .XghxhhhxhhgX.
        ..XhxhhhxhhX..
        ...XXX..XXX...
      `,
      side: `
        ..........XX........
        .........XhhX.......
        .......XXHHHXX......
        ......XHHHhhhhX.....
        .....XHHhhhhhhhX....
        .....XHhhhhhhhxxX...
        .....Xhhhhhhhxx.....
        .....Xhhhhhx........
        .....Xghh..x........
        .....Xggh...........
        ......XggX..........
        .......XX...........
      `,
    },
  },
});

const moFace = part({
  palette: moPalette,
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
        shut: `
          ..............
          ...--....--...
          ...'......'...
          ......!!......
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
        shut: `
          ...............
          ...........--..
          ...........'...
          ............!!.
        `,
      },
    },
  },
});

const cardigan = swapPart(
  garment(
    {
      ...moPalette,
      "1": "olive.deep",
      "2": "olive.light",
      "3": "olive.dark",
      "4": "olive.deep",
      "5": "olive.mid",
      "6": "olive.dark",
    },
    {
      down: `
        BwwvvwwB
        BYYvvPPB
        BYQQvQPB
        BYQQQQPB
        BQQQQQPB
        BQQQQPPB
        BBBBBBBB
      `,
      up: `
        BBBBBBBB
        BYQQQQPB
        BYQQQQPB
        BYQQQQPB
        BQQQQQPB
        BQQQQPPB
        BBBBBBBB
      `,
      side: `
        BBwwvB
        BYQwvB
        BYQQvB
        BQQQQB
        BQQQPB
        BQQQPB
        BBBBBB
      `,
    },
    true,
  ),
  "Gw",
  "Wd",
  legs,
);

/** The pen hand on the forms: two positions, so the signature never stops. */
const moCardigan = addPoses(cardigan, {
  armR: {
    down: {
      sign: {
        at: [6, 14],
        grid: `
          .11.....
          121.....
          12144...
          .1455Oe.
          ...O%Oe.
        `,
      },
    },
    side: {
      sign: {
        at: [9, 14],
        grid: `
          1111......
          1211......
          1214444O%O
          12555555O.
          11444444..
          111111....
        `,
      },
    },
    up: { sign: { at: [15, 14], grid: "11.\n131\n131\n.1." } },
  },
});

/** A stack of forms held to the chest; up close every one already has his signature. */
const forms = part({
  palette: moPalette,
  lone: "~",
  pieces: {
    hand: {
      at: { down: [9, 15], up: [9, 15], side: [19, 13] },
      down: {
        rest: `
          GGGGGG
          GwwwwG
          GwqqwG
          GwwwwG
          GqqqqG
          GGGGGG
        `,
        lift: {
          at: [9, 11],
          grid: `
            GGGGGG
            GwwwwG
            GwqqwG
            GwwwwG
            GqqqqG
            GGGGGG
          `,
        },
      },
      up: ".",
      side: `
        GGG
        GwG
        GwG
        GqG
        GqG
        GGG
      `,
    },
  },
});

const hold = (d: Dir) => (d === "up" ? {} : { armR: "sign", armL: "read" });

const mo = rig({
  name: "mo",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { cardigan: moCardigan },
    face: { kind: moFace },
    hair: { tousled: moHair },
    book: { forms },
  },
  frames: {
    idle0: (d) => hold(d) as never,
    idle1: (d) =>
      (d === "side"
        ? { ...hold(d), hand: [0, 1] }
        : { ...hold(d), armR: d === "up" ? "rest" : ["sign", 0, 1] }) as never,
    idle2: (d) => ({ ...hold(d), armR: d === "up" ? "rest" : ["sign", 0, -1] }) as never,
    walk0: (d) => ({ ...hold(d), ...stepping(d, "R") }) as never,
    walk1: (d) => ({ ...hold(d), torso: [0, -1], hand: [0, -1] }) as never,
    walk2: (d) => ({ ...hold(d), ...stepping(d, "L") }) as never,
    walk3: (d) => ({ ...hold(d), torso: [0, -1], hand: [0, -1] }) as never,
    sign0: (d) =>
      ({ armR: "raise", armL: d === "up" ? "rest" : "read", hand: "lift", head: "shut" }) as never,
    sign1: (d) =>
      ({ armL: d === "up" ? "rest" : "read", head: ["shut", 0, 1], hand: "lift" }) as never,
    sign2: (d) => ({ armL: d === "up" ? "rest" : "read", head: "shut", hand: "lift" }) as never,
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle2", "idle1", "idle0", "idle2"], fps: 6 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    sign: {
      frames: ["idle0", "sign0", "sign0", "sign1", "sign2", "sign1", "sign2", "idle0"],
      fps: 6,
      loop: false,
    },
  },
  looks: {
    teacher: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "cardigan",
        face: "kind",
        hair: "tousled",
        book: "forms",
      },
      slots: { skin: "warm", hair: "black" },
    },
  },
});

// 교장 선생님 ------------------------------------------------------------------------------

/**
 * 교장 선생님: ceremonial, delighted with himself. Silver hair combed straight back off a high
 * forehead, a clipped moustache, a charcoal suit with the 명찰 he makes everyone wear. Hands
 * clasped behind his back, he rocks on his heels; on stage he takes the microphone.
 */
const principalPalette: Legend = { ...ink, a: "gold.mid", A: "gold.light" };

const slick = part({
  palette: principalPalette,
  pieces: {
    head: {
      at: { down: [5, 2], up: [5, 2], side: [0, 2] },
      down: `
        ....XXXXXX....
        ..XXHHHHhhXX..
        .XHHhhhhhhhxX.
        XHhx......xhxX
        Xhx........xxX
        Xx..........xX
        Xx..........xX
      `,
      up: `
        ....XXXXXX....
        ..XXHHHHhhXX..
        .XHHHHhhhhhxX.
        XHHhhhhhhhhhxX
        XHhhhxxxxhhhxX
        XhhhhhhhhhhhxX
        XhhxxxxxhhhxxX
        XhhhhhhhhhhxxX
        .XhhhhhhhhhxX.
        ..XhhhhhhhxX..
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

const beaming = part({
  palette: principalPalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...^e....^e...
          ...ee....ee...
          ..'.gggggg.'..
          ......!!......
        `,
        speak: `
          ...^e....^e...
          ...ee....ee...
          ..'.gggggg.'..
          .....!!!!.....
        `,
      },
      up: null,
      side: {
        rest: `
          ...........^e..
          ...........ee..
          ..........'.gg.
          ............!!.
        `,
        speak: `
          ...........^e..
          ...........ee..
          ..........'.gg.
          ...........!!!.
        `,
      },
    },
  },
});

const suit = garment(
  {
    ...principalPalette,
    "1": "ink.deep",
    "2": "ink.light",
    "3": "ink.dark",
    "4": "ink.deep",
    "5": "ink.mid",
    "6": "ink.dark",
  },
  {
    down: `
      eIwmmwie
      eIwrrwie
      eIIrrize
      ewwiiize
      eIiiiize
      eIiiiize
      eeeeeeee
    `,
    up: `
      eeeeeeee
      eIiiiize
      eIiiiize
      eIiiiize
      eIiiiize
      eIiiizze
      eeeeeeee
    `,
    side: `
      eewmme
      eIiwre
      eIiire
      eIiiie
      eIiiie
      eIiize
      eeeeee
    `,
  },
  true,
);

const behind = (d: Dir) =>
  d === "side" ? { armR: "back", armL: "back" } : { armR: "back", armL: "back" };

const principal = rig({
  name: "principal",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { suit },
    face: { beaming },
    hair: { slick },
  },
  frames: {
    idle0: (d) => behind(d) as never,
    idle1: (d) => ({ ...behind(d), torso: [0, -1] }) as never,
    tie: (d) => (d === "down" ? { armR: "read", armL: "back" } : behind(d)) as never,
    walk0: (d) => walkArms(d, "R") as never,
    walk1: { torso: [0, -1] },
    walk2: (d) => walkArms(d, "L") as never,
    walk3: { torso: [0, -1] },
    announce0: { armR: "raise", armL: "back", head: "speak" },
    announce1: { armR: "raise", armL: "back", head: "speak", torso: [0, -1] },
    announce2: { armR: "fling", armL: "back", head: "speak" },
  },
  anim: {
    idle: {
      frames: ["idle0", "idle0", "idle1", "idle0", "idle0", "idle1", "tie", "tie", "idle0"],
      fps: 4,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 5 },
    announce: {
      frames: [
        "idle0",
        "announce0",
        "announce0",
        "announce1",
        "announce1",
        "announce2",
        "announce2",
        "announce0",
      ],
      fps: 4,
      loop: false,
    },
  },
  looks: {
    principal: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "suit",
        face: "beaming",
        hair: "slick",
      },
      slots: { skin: "fair", hair: "silver" },
    },
  },
});

// 보건 선생님 ------------------------------------------------------------------------------

/**
 * 보건 선생님: has seen everything twice. A neat bob pinned back, eyes at half-mast, the mask
 * pulled down under the chin, a long white gown over mint scrubs and a stethoscope. Her thumb
 * clicks the visit counter; for a student on the bed, a paper cup of water.
 */
const nursePalette: Legend = {
  ...ink,
  B: "board.mid",
  P: "board.light",
  F: "board.deep",
  Y: "grass.pale",
  L: "sea.pale",
  Q: "sea.light",
};

const pinnedBob = part({
  palette: nursePalette,
  pieces: {
    head: {
      at: { down: [4, 2], up: [4, 2], side: [0, 2] },
      down: `
        ....XXXXXXXX....
        ..XXHHHHhhhhXX..
        .XHHHhhhhhhhhhX.
        XHHhhhhhhhhggxxX
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
  },
});

const halfMast = part({
  palette: nursePalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: `
        ...**....**...
        ...*,....*,...
        ......--......
        ....LLLLLL....
      `,
      up: null,
      side: `
        ...........**..
        ...........*,..
        .............-.
        ..........LLLL.
      `,
    },
  },
});

const gown = swapPart(
  garment(
    {
      ...nursePalette,
      "1": "stone.deep",
      "2": "stone.bright",
      "3": "stone.light",
      "4": "stone.deep",
      "5": "stone.pale",
      "6": "stone.light",
    },
    {
      down: `
        GwYYYYqG
        GwwYYqqG
        GwiYYiqG
        GwpiipqG
        GwppppqG
        GwppppqG
        GwppppqG
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
        GGYYwG
        GwpYwG
        GwpiwG
        GwppqG
        GwppqG
        GwppqG
        GwppqG
        GGGGGG
      `,
    },
    true,
  ),
  "eIiz",
  "FPBF",
  legs,
);

/** The visit counter in her hand, and the paper cup of water. */
const COUNTER = "GGG\nGwG\nGwG\nGGG";
const CLICK = "GGG\nGqG\nGqG\nGGG";
const CUP = "GGGG\nGLLG\nGwwG\n.GG.";
const counter = part({
  palette: nursePalette,
  pieces: {
    hand: {
      at: { down: [3, 17], up: [18, 17], side: [6, 18] },
      down: { rest: COUNTER, click: CLICK, cup: { at: [6, 17], grid: CUP } },
      up: { rest: CLICK, click: CLICK, cup: "." },
      side: { rest: COUNTER, click: CLICK, cup: { at: [19, 12], grid: CUP } },
    },
  },
});

const nurse = rig({
  name: "nurse",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { gown },
    face: { halfMast },
    hair: { pinnedBob },
    book: { counter },
  },
  frames: {
    idle0: {},
    idle1: { hand: "click" },
    walk0: (d) => coatStep(d, "R") as never,
    walk1: {},
    walk2: (d) => coatStep(d, "L") as never,
    walk3: {},
    care0: (d) => (d === "up" ? { armR: "raise" } : { armR: "follow", hand: "cup" }) as never,
    care1: (d) => (d === "up" ? { armR: "raise" } : { armR: "strike", hand: "cup" }) as never,
  },
  anim: {
    idle: {
      frames: ["idle0", "idle1", "idle0", "idle0", "idle1", "idle0", "idle0", "idle0"],
      fps: 4,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    care: { frames: ["idle0", "care0", "care1", "care1", "care1", "care0"], fps: 4, loop: false },
  },
  looks: {
    nurse: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "gown",
        face: "halfMast",
        hair: "pinnedBob",
        book: "counter",
      },
      slots: { skin: "fair", hair: "brown" },
    },
  },
});

// 조리사님 ----------------------------------------------------------------------------------

/**
 * 조리사님: generous, and keeping something under the kitchen floor. A puffed white cap with
 * grey curls at the temples, a white jacket under a rose apron, rubber boots and the big ladle.
 * She taps the ladle on her palm and glances sideways when nobody asks about the tunnel.
 */
const cookPalette: Legend = {
  ...ink,
  K: "rose.deep",
  P: "rose.dark",
  Y: "rose.mid",
  Q: "rose.light",
  F: "board.deep",
  B: "board.mid",
};

const cap = part({
  palette: cookPalette,
  pieces: {
    head: {
      at: { down: [4, 1], up: [4, 1], side: [0, 1] },
      down: `
        .....GGGGGG.....
        ...GGwwwwppGG...
        ..GwwwwwwpppqG..
        .GwwwwwwppppqqG.
        GwwwwwwppppqqqqG
        GqqqqqqqqqqqqqqG
        .GGGGGGGGGGGGGG.
        .Xh..........hX.
        .Xh..........hX.
        ..X..........X..
      `,
      up: `
        .....GGGGGG.....
        ...GGwwwwppGG...
        ..GwwwwwwpppqG..
        .GwwwwwwppppqqG.
        GwwwwwwppppqqqqG
        GqqqqqqqqqqqqqqG
        .GGGGGGGGGGGGGG.
        .XhhhhxhhhxhxxX.
        .XhhhhxhhhxhxxX.
        ..XhhxhhhxhhxX..
        ...XhxhhhxhxX...
        ....XXX..XXX....
      `,
      side: `
        ......GGGGGG........
        ....GGwwwwppGG......
        ...GwwwwwwpppqG.....
        ..GwwwwwwppppqqG....
        ..GwwwwwppppqqqqG...
        ..GqqqqqqqqqqqqqG...
        ...GGGGGGGGGGGGG....
        .....Xhhhxx.........
        .....Xhhx...........
        .....Xhhh...........
        ......XhhX..........
        .......XX...........
      `,
    },
  },
});

const warm = part({
  palette: cookPalette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...^e....^e...
          ...ee....ee...
          ..'........'..
          .....-..-.....
        `,
        glance: `
          ..^e....^e....
          ..ee....ee....
          ..'........'..
          ......--......
        `,
      },
      up: null,
      side: {
        rest: `
          ...........^e..
          ...........ee..
          ..........'....
          ............-..
        `,
        glance: `
          ..........^e...
          ..........ee...
          ..........'....
          .............-.
        `,
      },
    },
  },
});

const apron = swapPart(
  garment(
    {
      ...cookPalette,
      "1": "stone.deep",
      "2": "stone.bright",
      "3": "stone.light",
      "4": "stone.deep",
      "5": "stone.pale",
      "6": "stone.light",
    },
    {
      down: `
        GwwppwwG
        GwKKKKqG
        GwKQYKqG
        GKKQYYKG
        KQQYYYPK
        KQYYYYPK
        KQYYYPPK
        KKKKKKKK
      `,
      up: `
        GGGGGGGG
        GwppppqG
        GwpKKpqG
        GKKKKKKG
        KQYYYYPK
        KQYYYYPK
        KQYYYPPK
        KKKKKKKK
      `,
      side: `
        GGwwwG
        GwwKKG
        GwKQQK
        KKQQQK
        KQYYPK
        KQYYPK
        KKKKKK
      `,
    },
    true,
  ),
  "eIizGw",
  "GwqqFB",
  legs,
);

/** The ladle: tapped on the palm, dipped, raised, poured. */
const LADLE = ".GGG.\nGqqqG\nGqqqG\n.GGG.\n..G..\n..G..\n..G..\n..G..";
const ladle = part({
  palette: cookPalette,
  lone: "~",
  pieces: {
    hand: {
      at: { down: [2, 11], up: [17, 11], side: [3, 13] },
      down: {
        rest: LADLE,
        dip: { at: [7, 17], grid: ".GGG.\nGqqqG\nGqqqG\n.GGG." },
        raise: { at: [0, 0], grid: LADLE },
        pour: { at: [0, 15], grid: "GGGG..\nGqqqG.\nGqqqqG\n.GGGG.\n...~..\n...~.." },
      },
      up: { rest: LADLE, dip: ".", raise: { at: [17, 1], grid: LADLE }, pour: "." },
      side: {
        rest: LADLE,
        dip: { at: [15, 17], grid: ".GGG.\nGqqqG\nGqqqG\n.GGG." },
        raise: { at: [2, 6], grid: LADLE },
        pour: { at: [18, 10], grid: "..GGGG\n.GqqqG\nGqqqqG\n.GGGG.\n..~...\n..~..." },
      },
    },
  },
});

const cook = rig({
  name: "cook",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { apron },
    face: { warm },
    hair: { cap },
    book: { ladle },
  },
  frames: {
    idle0: {},
    idle1: { hand: [0, 1] },
    glance: { head: "glance" },
    walk0: (d) => coatStep(d, "R") as never,
    walk1: {},
    walk2: (d) => coatStep(d, "L") as never,
    walk3: {},
    ladle0: (d) => ({ armR: d === "up" ? "rest" : "follow", hand: "dip" }) as never,
    ladle1: { armR: "raise", hand: "raise" },
    ladle2: (d) =>
      ({ armR: d === "side" ? "strike" : d === "up" ? "raise" : "fling", hand: "pour" }) as never,
  },
  anim: {
    idle: {
      frames: ["idle0", "idle1", "idle0", "idle1", "idle0", "idle0", "glance", "glance", "idle0"],
      fps: 4,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    ladle: {
      frames: ["idle0", "ladle0", "ladle0", "ladle1", "ladle2", "ladle2", "ladle2", "idle0"],
      fps: 6,
      loop: false,
    },
  },
  looks: {
    cook: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "apron",
        face: "warm",
        hair: "cap",
        book: "ladle",
      },
      slots: { skin: "warm", hair: "silver" },
    },
  },
});

export default [mo, principal, nurse, cook];
