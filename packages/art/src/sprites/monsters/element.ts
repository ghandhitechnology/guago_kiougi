import { sprite, variant } from "../../format.ts";

/**
 * 4원소 정령: Aristotle's elements, each sure it is the one true substance. Haughty: the eyes look
 * down the nose. Between bobs each shows off: the flame flickers, the water drips, the air
 * swings its tail, the earth drops a pebble. Each has its own silhouette: a flame of three
 * tongues, a droplet, a funnel of wind, a lopsided boulder with moss on top.
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
      at: [0, 6],
      grid: `
        .oRooRrrrooRro.
        .oRrRrraArrRro.
        oRrrrraAAarrrro
        oRrraaYYYAarrdo
        oRrrAYYYYYAardo
        oRrrAYYYYYAardo
        .oRraAYYYAaardo
        ..oddaaaaadddo.
        ...oooooooooo..
      `,
    },
    face: {
      at: [4, 9],
      grid: `
        **..**
        .*..*.
        ......
        ..**..
      `,
    },
    blink: {
      at: [4, 9],
      grid: `
        ......
        **..**
        ......
        ..**..
      `,
    },
    // Three tongues that trade heights on every flicker.
    crown: {
      at: [0, 1],
      grid: `
        ........o......
        .......oRo.....
        ......oRRo..o..
        ..o...oRro.oRo.
        .oRo.oRrro.oRo.
      `,
    },
    crown2: {
      at: [0, 1],
      grid: `
        .......o.......
        ......oRo......
        ..o...oRRo.....
        .oRo..oRro..o..
        .oRo.oRrro.oRo.
      `,
    },
    // Embers drifting off the sides.
    skirt: {
      at: [0, 11],
      grid: `
        ~..............
        ...............
        .............~.
      `,
    },
    skirt2: {
      at: [0, 11],
      grid: `
        ...............
        ~..............
        ..............~
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

/** Water: a smooth droplet peak over a round body, a rippled hem, one drip falling. */
const water = variant(fire, {
  name: "element-water",
  recolor: { "red.*": "sea.*", "gold.*": "navy.*" },
  palette: { "~": "sea.pale" },
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

/** Air: a funnel of wind, widest at the top, its tail swinging a beat behind the bob. */
const air = variant(fire, {
  name: "element-air",
  recolor: { "red.*": "plum.*", "gold.*": "stone.*" },
  palette: { "~": "stone.bright" },
  parts: {
    body: {
      at: [0, 1],
      grid: `
        ..ooooooooooo..
        .oYYYYYYYYYYYo.
        oYYYYYYYYYYYAAo
        oYYYYYYYYYYYAAo
        oYYYYYYYYYYYAAo
        .oRRRRRRRRRRRo.
        ..oYYYYYYYYAAo.
        ...oRRRRRRRRo..
        ....oYYYYYYo...
        .....oRRRRo....
      `,
    },
    face: {
      at: [5, 3],
      grid: `
        **..**
        .*..*.
        ......
        ..**..
      `,
    },
    blink: {
      at: [5, 3],
      grid: `
        ......
        **..**
        ......
        ..**..
      `,
    },
    // Gusts curling off the rim.
    crown: {
      at: [0, 0],
      grid: `
        ~..............
        ...............
        ...............
        ..............~
      `,
    },
    crown2: {
      at: [0, 0],
      grid: `
        ...............
        ~..............
        ..............~
        ...............
      `,
    },
    skirt: {
      at: [5, 11],
      grid: `
        oYYYYo..
        .oRRRo..
        ..oYYo..
        ...ooo..
        ....o...
      `,
    },
    skirt2: {
      at: [5, 11],
      grid: `
        .oYYYYo.
        .oRRRo..
        .oYYo...
        .ooo....
        o.......
      `,
    },
  },
});

/** Earth: a lopsided boulder with a moss cap, and a pebble that keeps rolling off its slope. */
const earth = variant(fire, {
  name: "element-earth",
  recolor: { "red.*": "clay.*", "gold.*": "grass.*" },
  palette: { "~": "clay.pale" },
  parts: {
    body: {
      at: [0, 2],
      grid: `
        .....ooo.......
        ....oRRRoo.....
        ...oRRRRrro....
        ..oRRRRrrrroo..
        ..oRRRrrrrrrdo.
        .oRRRrrrrrrrdo.
        .oRRrrrrrrrrddo
        oRRrrrrrrrrrddo
        oRrrrrrrrrrdddo
        oRrrrrrrrrrdddo
        orrrrrrrrrddddo
        oddddrrrrdddddo
        ooooooooooooooo
      `,
    },
    face: {
      at: [3, 8],
      grid: `
        **..**
        .*..*.
        ......
        ..**..
      `,
    },
    blink: {
      at: [3, 8],
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
        ..DDD..
        .DAAaD.
        DAaaaaD
        DgggggD
      `,
    },
    crown2: {
      at: [3, 1],
      grid: `
        ..DDD..
        .DaAAD.
        DaaaAAD
        DgggggD
      `,
    },
    skirt: {
      at: [11, 2],
      grid: `
        .oo.
        oRRo
        .oo.
      `,
    },
    skirt2: {
      at: [12, 1],
      grid: `
        .oo.
        oRRo
        .oo.
      `,
    },
  },
});

export default [fire, water, air, earth];
