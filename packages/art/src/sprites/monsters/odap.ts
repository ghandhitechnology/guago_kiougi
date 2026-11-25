import { sprite } from "../../format.ts";
import { form } from "../../forms.ts";

/**
 * 오답: a red-pen X that got up and walked off the answer sheet. Smug about being wrong. Its
 * idle is a pleased little squash and puff with the eyes shut, as if someone just agreed with it.
 */
const odap = sprite({
  name: "odap",
  size: [16, 16],
  palette: {
    ".": null,
    o: "red.deep",
    d: "red.dark",
    r: "red.mid",
    R: "red.light",
    P: "red.pale",
    w: "stone.bright",
    p: "stone.pale",
    "*": "ink.deep",
    "+": "stone.bright",
    "~": "stone.pale",
    "^": "red.light",
    "%": "red.dark",
  },
  lone: "*+~^%",
  parts: {
    smug: {
      at: [4, 7],
      grid: `
        oo....oo
        +*....+*
        ......o.
        .ooooo..
      `,
    },
    pleased: {
      at: [4, 7],
      grid: `
        .o....o.
        o.o..o.o
        ........
        .oooooo.
      `,
    },
    // Brows down, eyes on you: the face it wears while it comes at you.
    grim: {
      at: [4, 7],
      grid: `
        o......o
        .oo..oo.
        .+*..+*.
        ..oooo..
      `,
    },
    kick: {
      at: [0, 9],
      grid: `
        ~..
        ...
        .~.
      `,
    },
    hurt: {
      at: [4, 7],
      grid: `
        ++....++
        +*....*+
        ...oo...
        ...oo...
      `,
    },
    still: `
      ................
      ................
      ................
      ..ooo......ooo..
      .oRRro....oRrro.
      .oRrrro..oRrrdo.
      ..oRrrrooRrrdo..
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ..oRrrdoorrrdo..
      .oRrrdo..orrrdo.
      .orrdo....orrdo.
      .oddo......oddo.
      .ooo........ooo.
    `,
    sink: `
      ................
      ................
      ................
      ................
      .ooo........ooo.
      .oRRo......orro.
      .oRrro....orrdo.
      ..oRrroooorrdo..
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ..oRrrrrrrrrdo..
      .oRrrdooooorrdo.
      .orrdo....orrdo.
      .oddo......oddo.
      .ooo........ooo.
    `,
    puff: `
      ................
      ................
      ..ooo......ooo..
      .oRRro....oRrro.
      .oRrrro..oRrrdo.
      ..oRrrrooRrrdo..
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...orrrrrrrdo...
      ...oRrdoorrdo...
      ..oRrdo..ordo...
      .oRrdo....ordo..
      .oddo......oddo.
      .ooo........ooo.
    `,
    crouch: `
      ................
      ................
      ................
      ................
      ................
      ooo..........ooo
      oRRo........orro
      oRrroo....oorrro
      .oorrroooorrroo.
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ..oRrrrrrrrrdo..
      ooRrrrooooorrdoo
      oRrrroo....oordo
      oddoo........ooo
      ooo.............
    `,
    leap: `
      ..oooo....oooo..
      ..oRRo....oRro..
      ..oRrro..oRrdo..
      ...oRrrooRrdo...
      ....oRrrrrdo....
      ....oRrrrrdo....
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ....oRrrrrdo....
      ....oRrrrrdo....
      ....oRrddrdo....
      ....oRdoordo....
      ...oRdo..oddo...
      ...odo....odo...
      ...oo......oo...
    `,
    lean: `
      ...oooo....oooo.
      ...oRRo....oRro.
      ...oRrro..oRrdo.
      ....oRrrooRrdo..
      .....oRrrrrdo...
      .....oRrrrrdo...
      ....oRrrrrrrdo..
      ....oRrrrrrrdo..
      ...oRrrrrrrdo...
      ....oRrrrrdo....
      ....oRrrrrdo....
      ....oRrddrdo....
      ....oRdoordo....
      ...oRdo..oddo...
      ...odo....odo...
      ...oo......oo...
    `,
    recoil: `
      ................
      .oo.........oo..
      oRRo.......orro.
      oRrro.....orrdo.
      .oRrro...orrdo..
      ..oRrrooorrdo...
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...oRrrrrrrdo...
      ...orrrrrrrdo...
      ...orrrrrrrdo...
      ..oRrrdoorrrdo..
      .oRrrdo..orrrdo.
      .orrdo....orrdo.
      .oooo......oooo.
      ................
    `,
    pop: `
      ................
      .oo..........oo.
      oPPo........oPPo
      oPwPo......oPwPo
      .oPwPo....oPwPo.
      ..oPwPo..oPwPo..
      ...oPwPooPwPo...
      ....oPwwwwPo....
      ....oPwwwwPo....
      ...oPwPooPwPo...
      ..oPwPo..oPwPo..
      .oPwPo....oPwPo.
      oPwPo......oPwPo
      oPPo........oPPo
      .oo..........oo.
      ................
    `,
    burst: `
      oo............oo
      o^o..........o^o
      .oo....++....oo.
      ......+..+......
      .....+....+.....
      ....+......+....
      ................
      ...+........+...
      ...+........+...
      ................
      ....+......+....
      .....+....+.....
      .oo...+..+...oo.
      o^o....++....o^o
      oo............oo
      ................
    `,
    dust: `
      ^..............^
      ................
      ................
      ................
      ....~......~....
      ................
      ................
      .......%%.......
      .......%%.......
      ................
      ................
      ....~......~....
      ................
      ................
      ^..............^
      ................
    `,
  },
  frames: {
    idle0: ["still", "smug"],
    idle1: ["sink", ["smug", 0, 1]],
    idle2: ["puff", ["pleased", 0, -1]],
    hop0: ["crouch", ["grim", 0, 2], "kick"],
    hop1: ["lean", ["grim", 1, -2]],
    hop2: ["sink", ["grim", 0, 1]],
    hit: ["recoil", "hurt"],
    die0: ["pop"],
    die1: ["burst"],
    die2: ["dust"],
  },
  anim: {
    idle: {
      frames: ["idle0", "idle0", "idle0", "idle1", "idle2", "idle2", "idle2", "idle0"],
      fps: 6,
    },
    // Relentless: no hang time, three beats a hop, leaning into every one.
    move: { frames: ["hop0", "hop1", "hop2"], fps: 10, jump: 0.45 },
    hop: { frames: ["hop0", "hop1", "hop2"], fps: 10, jump: 0.45 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 12, loop: false, jump: 1 },
  },
});

/**
 * 연필 오답: an X someone wrote in pencil, tiny, grey and terrified of the eraser. They come in
 * packs and never stop moving: idle, each one trembles with its eyes darting about; on the move
 * it scurries low and fast. Read in a swarm by a clean outline and the pale graphite sheen.
 */
const PENCIL = { outline: "o", dark: "d", mid: "m", light: "L" } as const;
const at1 = (mask: string) => ({ at: [1, 0] as const, grid: form(mask, PENCIL) });

const pencil = sprite({
  name: "odap-pencil",
  size: [13, 11],
  palette: {
    ".": null,
    o: "ink.deep",
    d: "stone.dark",
    m: "stone.mid",
    L: "stone.light",
    "*": "ink.deep",
    "+": "stone.bright",
    "~": "stone.light",
    "'": "sea.pale",
  },
  lone: "*+~'",
  parts: {
    x: at1(`
      ...........
      ###.....###
      ####...####
      .####.####.
      ..#######..
      ...#####...
      ...#####...
      ..#######..
      .####.####.
      ####...####
      ###.....###
    `),
    // Scurrying: bounced up, the legs pinched in mid-stride.
    pinch: at1(`
      ...........
      ###.....###
      ####...####
      .####.####.
      ..#######..
      ...#####...
      ...#####...
      ...#####...
      ..###.###..
      ..##...##..
      ...........
    `),
    eyes: {
      at: [5, 5],
      grid: `
        *.*
      `,
    },
    left: {
      at: [4, 5],
      grid: `
        *.*
      `,
    },
    ahead: {
      at: [6, 5],
      grid: `
        *.*
      `,
    },
    shut: {
      at: [4, 5],
      grid: `
        +...+
      `,
    },
    sweat: { at: [10, 1], grid: "'" },
    dash: {
      at: [0, 4],
      grid: `
        ~..
        ...
        .~.
        ...
        ~..
      `,
    },
    pop: at1(`
      ...........
      ...........
      ...#...#...
      ..###.###..
      ...#####...
      ....###....
      ...#####...
      ..###.###..
      ...#...#...
      ...........
      ...........
    `),
    smudge: {
      at: [1, 2],
      grid: `
        ~.........~
        ...........
        ....~.~....
        ...........
        ~.........~
        ...........
        ...~...~...
      `,
    },
  },
  frames: {
    idle0: ["x", "eyes"],
    idle1: [
      ["x", 1, 0],
      ["left", 1, 0],
    ],
    idle2: ["x", "ahead", "sweat"],
    idle3: [
      ["x", -1, 0],
      ["eyes", -1, 0],
    ],
    move0: ["x", "dash", "ahead"],
    move1: [
      ["pinch", 0, -1],
      ["ahead", 0, -1],
    ],
    hit: [
      ["x", 1, 0],
      ["shut", 1, 0],
    ],
    die0: ["pop"],
    die1: ["smudge"],
  },
  anim: {
    idle: {
      frames: ["idle0", "idle1", "idle0", "idle3", "idle0", "idle2", "idle2", "idle1"],
      fps: 10,
    },
    move: { frames: ["move0", "move1"], fps: 12 },
    hop: { frames: ["move0", "move1"], fps: 12 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1"], fps: 12, loop: false, jump: 1 },
  },
});

export default [odap, pencil];
