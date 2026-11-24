import { sprite, variant } from "../../format.ts";

/**
 * 4원소 정령: Aristotle's elements, each sure it is the one true substance. Haughty: the eyes look
 * down the nose. Between bobs each shows off: the flame flares, the water drips, the air curls,
 * the earth drops a pebble. One body; the crown and the tail give each its own silhouette.
 */
const fire = sprite({
  name: "element-fire",
  size: [16, 16],
  palette: {
    ".": null,
    o: "red.deep",
    d: "red.dark",
    r: "red.mid",
    R: "red.light",
    P: "red.pale",
    D: "gold.deep",
    g: "gold.dark",
    a: "gold.mid",
    A: "gold.light",
    Y: "gold.pale",
    "*": "ink.deep",
    "~": "gold.pale",
  },
  lone: "*~",
  parts: {
    body: {
      at: [3, 5],
      grid: `
        ..oooooo..
        .oPPrrrro.
        oPPRrrrrdo
        oRRrrrrrdo
        orrrrrrddo
        .orrrrddo.
        ..oooooo..
      `,
    },
    face: {
      at: [5, 6],
      grid: `
        **..**
        .*..*.
        ......
        ..**..
      `,
    },
    blink: {
      at: [5, 6],
      grid: `
        ......
        **..**
        ......
        ..**..
      `,
    },
    crown: {
      at: [3, 1],
      grid: `
        ....o...o.
        ...oAo.oAo
        .o.oAAooAo
        oaooAAoAAo
        .oaaaaaaao
      `,
    },
    crown2: {
      at: [3, 1],
      grid: `
        ...oo..oo.
        ..oAAo.oAo
        oooAAAoAAo
        oaoAAAoAAo
        .oaaaaaaao
      `,
    },
    skirt: {
      at: [4, 11],
      grid: `
        .oddddo.
        ..oddo..
        ...oo...
      `,
    },
    skirt2: {
      at: [4, 11],
      grid: `
        .oddddo.
        ..oddo..
        ..ooo...
      `,
    },
    puff: {
      at: [3, 4],
      grid: `
        ..oooooo..
        .oPPPPPPo.
        oPPPPPPPPo
        oPPPPPPPPo
        oPPPPPPPPo
        oPPPPPPPPo
        .oPPPPPPo.
        ..oooooo..
      `,
    },
    motes: {
      at: [0, 0],
      grid: `
        .~............~.
        ................
        ......~.........
        ..~.........~...
        ................
        ...............~
        ~...............
        ................
        .....~......~...
        ................
        ..~.............
        ...........~....
        ................
        ......~.........
        ................
        ................
      `,
    },
  },
  frames: {
    idle0: ["skirt", "body", "crown", "face"],
    idle1: [
      ["skirt2", 0, -1],
      ["body", 0, -1],
      ["crown", 0, -1],
      ["face", 0, -1],
    ],
    idle2: [
      ["skirt", 0, -1],
      ["body", 0, -1],
      ["crown2", 0, -1],
      ["blink", 0, -1],
    ],
    move0: ["skirt2", "body", "crown", "face"],
    move1: [
      ["skirt", 0, -1],
      ["body", 0, -1],
      ["crown2", 0, -1],
      ["face", 0, -1],
    ],
    move2: ["skirt2", "body", "crown", "face"],
    move3: [
      ["skirt", 0, 1],
      ["body", 0, 1],
      ["crown", 0, 1],
      ["face", 0, 1],
    ],
    hit: [
      ["skirt", 1, 0],
      ["body", 1, 0],
      ["crown2", 1, 0],
      ["blink", 1, 0],
    ],
    die0: ["puff"],
    die1: [["puff", 0, -1], "motes"],
    die2: ["motes"],
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle0", "idle1", "idle2", "idle2", "idle1"], fps: 5 },
    move: { frames: ["move0", "move1", "move2", "move3"], fps: 8 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 12, loop: false, jump: 1 },
  },
});

/** Water: a smooth droplet peak, a rippled hem, and the flourish is one drip falling. */
const water = variant(fire, {
  name: "element-water",
  recolor: { "red.*": "sea.*", "gold.*": "navy.*" },
  palette: { "~": "sea.pale" },
  parts: {
    crown: {
      at: [3, 1],
      grid: `
        .....o....
        ....oRo...
        ...oRRro..
        ..oRRrrro.
        .orrrrrrro
      `,
    },
    crown2: {
      at: [3, 1],
      grid: `
        ....oo....
        ...oRRo...
        ...oRRro..
        ..oRRrrro.
        .orrrrrrro
      `,
    },
    skirt: {
      at: [3, 11],
      grid: `
        .oddddddo.
        oddddddddo
        oooooooooo
      `,
    },
    skirt2: {
      at: [3, 11],
      grid: `
        .oddddddo.
        oddddddddo
        .ooooooooo
      `,
    },
  },
});

/** Air: a curl that hooks to one side and two thin trailing wisps. */
const air = variant(fire, {
  name: "element-air",
  recolor: { "red.*": "plum.*", "gold.*": "stone.*" },
  palette: { "~": "stone.bright" },
  parts: {
    crown: {
      at: [3, 1],
      grid: `
        ...ooooo..
        ..oPPPPPo.
        ..oPoooPo.
        ...o..oPo.
        .ooooooPo.
      `,
    },
    crown2: {
      at: [3, 1],
      grid: `
        ..oooooo..
        .oPPPPPPo.
        .oPoooooPo
        ..o...oPPo
        .ooooooPPo
      `,
    },
    skirt: {
      at: [3, 11],
      grid: `
        .oddddddo.
        ..oddoddo.
        ...oo.oo..
      `,
    },
    skirt2: {
      at: [3, 11],
      grid: `
        .oddddddo.
        .oddoddo..
        ..oo.oo...
      `,
    },
  },
});

/** Earth: angular stone points on top, a flat heavy base, a pebble that drops off. */
const earth = variant(fire, {
  name: "element-earth",
  recolor: { "red.*": "clay.*", "gold.*": "grass.*" },
  palette: { "~": "clay.pale" },
  parts: {
    crown: {
      at: [3, 1],
      grid: `
        ..o....o..
        .oAo..oAo.
        .oAaooaAo.
        oaaaaaaaao
        .oaaaaaaao
      `,
    },
    crown2: {
      at: [3, 1],
      grid: `
        .o....oo..
        oAo..oAAo.
        oAaooaaAo.
        oaaaaaaaao
        .oaaaaaaao
      `,
    },
    skirt: {
      at: [2, 11],
      grid: `
        .oooooooooo.
        oddddddddddo
        oooooooooooo
      `,
    },
    skirt2: {
      at: [2, 11],
      grid: `
        .oooooooooo.
        oddddddddddo
        oooooooooooo
      `,
    },
  },
});

export default [fire, water, air, earth];
